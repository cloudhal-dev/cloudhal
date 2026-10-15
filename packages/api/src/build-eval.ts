/**
 * The Build model eval (RFC-0020 open question 7): the same briefs, run through the same build turn
 * as Studio's Build chat, on several models, measured on what makes Build feel reliable:
 *
 * - **finished**: the turn ended with `done` and at least one step on the page;
 * - **acceptance**: steps written as sent (after Cloudhal's repairs) / all steps the model sent;
 * - **repairs** and **refusals** per turn, and the **rounds** a turn needed;
 * - **first step** and **total** time, and tokens.
 *
 * Nothing is stored: each run builds an in-memory copy of a page (the store's checks still apply
 * through `patchPage`). Runs go one at a time so latency is comparable. Worker-safe.
 */
import type { Page } from "@cloudhal/core-contracts";
import type { Catalog } from "@cloudhal/core-ts/surfaces";
import type { AiTransport } from "./ai/client.ts";
import { DEFAULT_AI_MODEL } from "./ai/store.ts";
import { type BuildTurnEvent, runBuildTurn } from "./build-turn.ts";

/** Models compared by default: Workers AI text models that can follow a structured format. */
export const BUILD_EVAL_MODELS: readonly string[] = [
  DEFAULT_AI_MODEL,
  "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
];

export interface BuildEvalBrief {
  id: string;
  brief: string;
  /** Sections the page already has (an edit rather than a build from scratch). */
  start?: Page["sections"];
  /** For an edit: the section and component the person picked (click-to-scope). */
  scope?: { sectionId: string; componentId?: string };
}

const EXISTING: Page["sections"] = [
  {
    id: "sec_evalhero0001",
    kind: "surface",
    catalog: "blog@1",
    components: [
      {
        id: "root",
        component: "Band",
        props: { tone: "inverse", width: "wide" },
        children: ["title", "lede", "cta"],
      },
      { id: "title", component: "Heading", props: { text: "Sites agents build", level: 1 } },
      { id: "lede", component: "Text", props: { text: "Every change is a draft." } },
      {
        id: "cta",
        component: "Button",
        props: { label: "Start", href: "/start", variant: "primary" },
      },
    ],
  },
];

/** The briefs: a landing page, an interactive calculator, an FAQ, and two edits (one scoped). */
export const BUILD_EVAL_BRIEFS: readonly BuildEvalBrief[] = [
  {
    id: "landing",
    brief:
      "A landing page for a newsletter tool: a dark hero with a headline, a sentence and a sign-up button, three features with a heading and a sentence each, and a quote from a customer.",
  },
  {
    id: "pricing",
    brief:
      "A pricing section with tabs for monthly and yearly. Monthly shows $9, yearly $90 with 'two months free'. Add a slider for the number of seats from 1 to 50 that shows the monthly total.",
  },
  {
    id: "faq",
    brief:
      "A short FAQ with four questions about cancelling, invoices, data export and support, each opening to its answer.",
  },
  {
    id: "edit",
    brief:
      "Make the headline say 'Pages your agents build, you approve' and add a secondary button 'Read the docs' linking to /docs.",
    start: EXISTING,
  },
  {
    id: "scoped",
    brief: "Make it say 'Get started free'.",
    start: EXISTING,
    scope: { sectionId: "sec_evalhero0001", componentId: "cta" },
  },
];

export interface BuildEvalRun {
  model: string;
  brief: string;
  finished: boolean;
  steps: number;
  refused: number;
  /** The first few refusal reasons, to see why a model's steps fail. */
  samples: string[];
  repairs: number;
  rounds: number;
  /** Components on the page at the end (built or kept). */
  components: number;
  firstStepMs?: number | undefined;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string | undefined;
}

export interface BuildEvalSummary {
  model: string;
  runs: number;
  finished: number;
  /** Accepted steps / sent steps, 0–1. */
  acceptance: number;
  repairsPerTurn: number;
  refusalsPerTurn: number;
  roundsPerTurn: number;
  medianFirstStepMs?: number | undefined;
  medianTotalMs: number;
  outputTokensPerTurn: number;
  errors: number;
}

const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Refusal reasons kept per run. */
const SAMPLES = 5;

/** One brief on one model, in memory. */
export async function runBuildEvalOnce(input: {
  transport: AiTransport;
  model: string;
  brief: BuildEvalBrief;
  catalog: Catalog;
  siteId: string;
  now?: () => number;
  signal?: AbortSignal | undefined;
}): Promise<BuildEvalRun> {
  const now = input.now ?? Date.now;
  const started = now();
  const ts = new Date(started).toISOString();
  let page: Page = {
    schemaVersion: 1,
    id: "page_buildeval0001",
    siteId: input.siteId,
    path: "/eval",
    title: "Eval",
    locale: "en",
    status: "draft",
    sections: structuredClone(input.brief.start ?? []),
    rev: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  const run: BuildEvalRun = {
    model: input.model,
    brief: input.brief.id,
    finished: false,
    steps: 0,
    refused: 0,
    samples: [],
    repairs: 0,
    rounds: 0,
    components: 0,
    totalMs: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  const emit = (e: BuildTurnEvent) => {
    if (e.type === "round") run.rounds = e.round;
    else if (e.type === "step" && e.ok) {
      run.firstStepMs ??= now() - started;
      run.repairs += e.repairs.length;
    } else if (e.type === "step") {
      run.refused++;
      for (const issue of e.issues)
        if (run.samples.length < SAMPLES) run.samples.push(issue.slice(0, 200));
    } else if (e.type === "done") {
      run.steps = e.steps;
      run.finished = e.steps > 0;
      run.inputTokens = e.usage.inputTokens;
      run.outputTokens = e.usage.outputTokens;
    } else if (e.type === "error") run.error = e.code;
  };
  await runBuildTurn(input.brief.brief, {
    transport: input.transport,
    model: input.model,
    catalog: input.catalog,
    siteId: input.siteId,
    pageId: page.id,
    actor: { kind: "system", id: "sys_buildeval01" },
    locale: "en",
    ...(input.brief.scope ? { scope: input.brief.scope } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    load: async () => page,
    write: async (next) => {
      page = { ...next, rev: page.rev + 1 };
      return page;
    },
    snapshot: async () => undefined,
    emit,
  });
  run.totalMs = now() - started;
  run.components = page.sections.reduce(
    (n, s) => n + (s.kind === "surface" ? s.components.length : 0),
    0,
  );
  return run;
}

/** The runs per model, summarised and ranked: finished turns, then acceptance, then speed. */
export function summariseBuildEval(runs: readonly BuildEvalRun[]): BuildEvalSummary[] {
  const byModel = new Map<string, BuildEvalRun[]>();
  for (const r of runs) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  return [...byModel.entries()]
    .map(([model, rs]) => {
      const sent = rs.reduce((n, r) => n + r.steps + r.refused, 0);
      const accepted = rs.reduce((n, r) => n + r.steps, 0);
      const per = (f: (r: BuildEvalRun) => number) =>
        round2(rs.reduce((n, r) => n + f(r), 0) / rs.length);
      return {
        model,
        runs: rs.length,
        finished: rs.filter((r) => r.finished).length,
        acceptance: sent ? round2(accepted / sent) : 0,
        repairsPerTurn: per((r) => r.repairs),
        refusalsPerTurn: per((r) => r.refused),
        roundsPerTurn: per((r) => r.rounds),
        medianFirstStepMs: median(
          rs.flatMap((r) => (r.firstStepMs === undefined ? [] : [r.firstStepMs])),
        ),
        medianTotalMs: median(rs.map((r) => r.totalMs)) ?? 0,
        outputTokensPerTurn: per((r) => r.outputTokens),
        errors: rs.filter((r) => r.error).length,
      };
    })
    .sort(
      (a, b) =>
        b.finished / b.runs - a.finished / a.runs ||
        b.acceptance - a.acceptance ||
        a.medianTotalMs - b.medianTotalMs,
    );
}

/** A Markdown table of the summary (for the RFC and the CLI). */
export function buildEvalTable(summary: readonly BuildEvalSummary[]): string {
  const s = (ms: number | undefined) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`);
  return [
    "| Model | Finished | Acceptance | Repairs/turn | Refusals/turn | Rounds/turn | First step | Total | Output tokens/turn |",
    "|---|---|---|---|---|---|---|---|---|",
    ...summary.map(
      (m) =>
        `| \`${m.model}\` | ${m.finished}/${m.runs} | ${Math.round(m.acceptance * 100)}% | ${m.repairsPerTurn} | ${m.refusalsPerTurn} | ${m.roundsPerTurn} | ${s(m.medianFirstStepMs)} | ${s(m.medianTotalMs)} | ${Math.round(m.outputTokensPerTurn)} |`,
    ),
  ].join("\n");
}

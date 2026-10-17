/**
 * The Build model eval (RFC-0020 open question 7): the same briefs, run through the same build turn
 * as Studio's Build chat, on several models, measured on what makes Build feel reliable:
 *
 * - **finished**: the turn ended with `done` and at least one step on the page;
 * - **acceptance**: steps written as sent (after Cloudhal's repairs) / all steps the model sent;
 * - **repairs** and **refusals** per turn, and the **rounds** a turn needed;
 * - **first step** and **total** time, and tokens.
 *
 * With `design` (RFC-0021 21c), each result is also rendered in a browser: the automatic checks
 * that failed, and a vision model's rubric score (`DESIGN_RUBRIC`, 1–5). With `design.look`, the
 * model sees its own render once, as in Build chat, before it is scored.
 *
 * Nothing is stored: each run builds an in-memory copy of a page (the store's checks still apply
 * through `patchPage`). Runs go one at a time so latency is comparable. Worker-safe.
 */
import { renderPagePreview } from "@cloudhal/astro-renderer/preview";
import type { Page, Site } from "@cloudhal/core-contracts";
import type { BlockRegistry } from "@cloudhal/core-ts/blocks";
import { type Catalog, checkSurface, resolveValue } from "@cloudhal/core-ts/surfaces";
import type { PageRenderer } from "@cloudhal/mcp-server/render";
import type { AiTransport } from "./ai/client.ts";
import { DEFAULT_AI_MODEL } from "./ai/store.ts";
import { type BuildTurnEvent, runBuildTurn } from "./build-turn.ts";
import {
  acceptsImages,
  DESIGN_JUDGE_MODEL,
  type DesignCriterion,
  type DesignScore,
  htmlDataUrl,
  lookAt,
  scoreDesign,
} from "./design-pass.ts";
import { DESIGN_REFERENCES, type DesignReference, REFERENCE_BRIEF } from "./design-references.ts";

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

/**
 * RFC-0022 §6: tools — briefs that need computing, inputs, a chart or a table. Run with
 * `--briefs calories,loan,chart,compare`; the design pass fills sample inputs before it looks.
 */
export const TOOL_EVAL_BRIEFS: readonly BuildEvalBrief[] = [
  {
    id: "calories",
    brief:
      "A daily calorie calculator: the reader enters age, height in cm and weight in kg, picks female or male and an activity level (low, light, high), and sees the calories a day (Mifflin–St Jeor times the activity factor).",
  },
  {
    id: "loan",
    brief:
      "A loan calculator: amount, yearly interest rate in percent and years; show the monthly payment and the total paid. Monthly payment = amount × r ÷ (1 − (1 + r)^−n), with r the monthly rate and n the number of months.",
  },
  {
    id: "chart",
    brief:
      "A short section on our readership: a heading, one sentence, and a bar chart of readers for the last six months (Apr 1,200; May 1,450; Jun 1,700; Jul 1,650; Aug 2,100; Sep 2,600).",
  },
  {
    id: "compare",
    brief:
      "A comparison of three plans (Free $0, Pro $12, Team $30 a month) across price, seats (1, 5, 50), storage (1 GB, 50 GB, 1 TB) and support (community, email, priority), with Pro highlighted as recommended.",
  },
];

/**
 * RFC-0027 27e: carousels — when one is right, and the right variant. Run with
 * `--briefs offers,logos`; the store's rules (slide counts, aspect, autoplay) apply.
 */
export const CAROUSEL_EVAL_BRIEFS: readonly BuildEvalBrief[] = [
  {
    id: "offers",
    brief:
      "A bakery home page that opens with its three seasonal offers the reader can move between (spring tart, Easter bread, strawberry cake), each with a headline, a sentence and an order button, then opening hours and a short story of the bakery.",
  },
  {
    id: "logos",
    brief:
      "A section showing the eight cafés that serve our coffee, by name, in a row the reader can scroll sideways, under a heading and one sentence.",
  },
];

/** Every brief the eval knows, for `--briefs`. */
export const ALL_EVAL_BRIEFS: readonly BuildEvalBrief[] = [
  ...BUILD_EVAL_BRIEFS,
  ...TOOL_EVAL_BRIEFS,
  ...CAROUSEL_EVAL_BRIEFS,
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
  /** Which kinds, once each, a Carousel with its variant ("Carousel:hero"): what the model chose. */
  used?: string[] | undefined;
  /** Components the model left out of every parent's children, as Build reported them. */
  unlinked?: number | undefined;
  firstStepMs?: number | undefined;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string | undefined;
  /** RFC-0021 21c: the rendered result. */
  design?: BuildEvalDesign | undefined;
}

export interface BuildEvalDesign {
  /** Ids of the automatic checks that failed. */
  failed: string[];
  /** The judge's mean score, 1–5. */
  score?: number | undefined;
  scores?: Partial<Record<DesignCriterion, number>> | undefined;
  note?: string | undefined;
  /** With design.look: what the model saw, and what it did about it. */
  look?: BuildEvalLook | undefined;
  /**
   * RFC-0022 §6: for a page with inputs, whether its computed results show once sample values
   * are filled in (`results` computed values, `empty` of them still blank).
   */
  tool?: { inputs: number; results: number; empty: number } | undefined;
  error?: string | undefined;
}

/** What a model saw when it looked at its render during the turn (RFC-0021 21c). */
export interface BuildEvalLook {
  /** Ids of the checks that failed when it looked. */
  failed: string[];
  /** Screenshots it was shown (0: a text-only model, checks only). */
  images: number;
  /** It got a round to fix what it saw (images, or failed checks). */
  round: boolean;
  /** Steps it wrote in that round. */
  steps: number;
}

/** The design pass of a run: the browser, and the judge for the score. */
export interface BuildEvalDesignOptions {
  readonly renderer: PageRenderer;
  /** The site the page renders as (theme name, settings, design). */
  readonly site: Site;
  readonly blocks?: BlockRegistry | undefined;
  /** A vision model; default `DESIGN_JUDGE_MODEL`. `false`: checks only. */
  readonly judge?: string | false | undefined;
  /** The model sees its render once before it is scored, as in Build chat. */
  readonly look?: boolean | undefined;
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
  /** RFC-0021 21c, when the runs had a design pass. */
  checksFailedPerTurn?: number | undefined;
  medianDesignScore?: number | undefined;
  /** RFC-0022 §6: tool briefs whose results all showed with sample inputs / tool briefs built. */
  toolsWorking?: string | undefined;
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
  design?: BuildEvalDesignOptions | undefined;
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
  const design = input.design as BuildEvalDesignOptions;
  const urlOf = (p: Page) =>
    htmlDataUrl(renderPagePreview(design.site, p, {}, { blocks: design.blocks }).html);
  let look: BuildEvalLook | undefined;
  const emit = (e: BuildTurnEvent) => {
    if (e.type === "look") look = { failed: e.failed, images: e.images, round: false, steps: 0 };
    else if (e.type === "round" && look) look.round = true;
    if (e.type === "round") run.rounds = e.round;
    else if (e.type === "step" && e.ok) {
      run.firstStepMs ??= now() - started;
      if (look) look.steps++;
      run.repairs += e.repairs.length;
    } else if (e.type === "step") {
      run.refused++;
      for (const issue of e.issues)
        if (run.samples.length < SAMPLES) run.samples.push(issue.slice(0, 200));
    } else if (e.type === "unlinked") run.unlinked = (run.unlinked ?? 0) + e.components.length;
    else if (e.type === "done") {
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
    ...(input.design?.look
      ? {
          images: acceptsImages(input.model),
          look: (p: Page) => lookAt(design.renderer, urlOf(p)),
        }
      : {}),
    load: async () => page,
    write: async (next) => {
      page = { ...next, rev: page.rev + 1 };
      return page;
    },
    snapshot: async () => undefined,
    emit,
  });
  run.totalMs = now() - started;
  if (input.design && run.finished) run.design = await designPass(page);
  // A page with nothing a reader would see is not finished, whatever the model said.
  if (run.finished && visibleParts(page, input.catalog) === 0) run.finished = false;
  run.components = (page.sections ?? []).reduce(
    (n, s) => n + (s.kind === "surface" ? s.components.length : 0),
    0,
  );
  const used = new Set<string>();
  for (const s of page.sections ?? [])
    if (s.kind === "surface")
      for (const c of s.components) {
        const variant = c.component === "Carousel" ? (c.props?.variant ?? "rail") : undefined;
        used.add(variant ? `${c.component}:${String(variant)}` : c.component);
      }
  if (used.size) run.used = [...used].sort();
  return run;

  /** Renders the result, then asks the judge (RFC-0021 21c). */
  async function designPass(built: Page): Promise<BuildEvalDesign> {
    const out: BuildEvalDesign = { failed: [] };
    if (look) out.look = look;
    try {
      // RFC-0022 §6: fill empty inputs with sample values, so a tool is judged working.
      const sampled = withSampleInputs(built);
      const tool = toolResults(sampled.page, sampled.inputs);
      if (tool) out.tool = tool;
      const look = await lookAt(design.renderer, urlOf(sampled.page));
      out.failed = look.failed.map((c) => c.id);
      if (design.judge !== false) {
        const judged = await scoreDesign({
          transport: input.transport,
          model: design.judge ?? DESIGN_JUDGE_MODEL,
          brief: input.brief.brief,
          look,
          signal: input.signal,
        });
        out.score = judged.score;
        out.scores = judged.scores;
        if (judged.note) out.note = judged.note;
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }
    return out;
  }
}

/**
 * The page with each empty NumberField's data filled with a sample (the middle of min–max, else
 * min, else 10), and empty RadioGroups with their first option: a calculator then shows a result.
 */
export function withSampleInputs(page: Page): { page: Page; inputs: number } {
  let inputs = 0;
  const sections = (page.sections ?? []).map((section) => {
    if (section.kind !== "surface") return section;
    const data = structuredClone(section.data ?? {}) as Record<string, unknown>;
    for (const c of section.components) {
      const props = (c.props ?? {}) as Record<string, unknown>;
      const bound = props.value as { path?: unknown } | undefined;
      if (typeof bound?.path !== "string") continue;
      if (c.component !== "NumberField" && c.component !== "RadioGroup") continue;
      inputs++;
      const keys = bound.path.split("/").slice(1);
      let at: Record<string, unknown> = data;
      for (const k of keys.slice(0, -1)) {
        if (typeof at[k] !== "object" || at[k] === null) at[k] = {};
        at = at[k] as Record<string, unknown>;
      }
      const last = keys[keys.length - 1] as string;
      if (at[last] !== undefined && at[last] !== "") continue;
      if (c.component === "RadioGroup") {
        const first = Array.isArray(props.options)
          ? (props.options[0] as { value?: unknown })
          : undefined;
        if (first?.value !== undefined) at[last] = first.value;
        continue;
      }
      const lo = typeof props.min === "number" ? props.min : undefined;
      const hi = typeof props.max === "number" ? props.max : undefined;
      at[last] = lo !== undefined && hi !== undefined ? Math.round((lo + hi) / 2) : (lo ?? 10);
    }
    return { ...section, data };
  });
  return { page: { ...page, sections }, inputs };
}

/** For a page with inputs: its computed results (calls in Stat and Text) and how many are blank. */
function toolResults(
  page: Page,
  inputs: number,
): { inputs: number; results: number; empty: number } | undefined {
  if (inputs === 0) return undefined;
  let results = 0;
  let empty = 0;
  for (const section of page.sections ?? []) {
    if (section.kind !== "surface") continue;
    for (const c of section.components) {
      if (c.component !== "Stat" && c.component !== "Text") continue;
      const props = (c.props ?? {}) as Record<string, unknown>;
      for (const key of ["value", "text"]) {
        const v = props[key];
        if (typeof v !== "object" || v === null || !("call" in v)) continue;
        results++;
        const got = resolveValue(v, section.data ?? {}, { locale: "en" });
        if (got === "" || got === undefined || got === null) empty++;
      }
    }
  }
  return { inputs, results, empty };
}

/**
 * What a reader would see: non-surface sections, and surface components the root reaches (the
 * root itself aside).
 */
export function visibleParts(page: Page, catalog: Catalog): number {
  let n = 0;
  for (const section of page.sections ?? []) {
    if (section.kind !== "surface") {
      n++;
      continue;
    }
    const reached = section.components.length - checkSurface(section, catalog).unreachable.length;
    n += Math.max(0, reached - 1);
  }
  return n;
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
        ...(rs.some((r) => r.design)
          ? {
              checksFailedPerTurn: round2(
                rs.reduce((n, r) => n + (r.design?.failed.length ?? 0), 0) /
                  Math.max(1, rs.filter((r) => r.design).length),
              ),
              medianDesignScore: median(
                rs.flatMap((r) => (r.design?.score === undefined ? [] : [r.design.score])),
              ),
              ...(rs.some((r) => r.design?.tool)
                ? {
                    toolsWorking: `${rs.filter((r) => r.design?.tool && r.design.tool.results > 0 && r.design.tool.empty === 0).length}/${rs.filter((r) => r.design?.tool).length}`,
                  }
                : {}),
            }
          : {}),
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
  // RFC-0021 21c: two more columns when the runs had a design pass.
  const design = summary.some((m) => m.checksFailedPerTurn !== undefined);
  const tools = summary.some((m) => m.toolsWorking !== undefined);
  return [
    `| Model | Finished | Acceptance | Repairs/turn | Refusals/turn | Rounds/turn | First step | Total | Output tokens/turn |${design ? " Failed checks/turn | Design score |" : ""}${tools ? " Tools working |" : ""}`,
    `|---|---|---|---|---|---|---|---|---|${design ? "---|---|" : ""}${tools ? "---|" : ""}`,
    ...summary.map(
      (m) =>
        `| \`${m.model}\` | ${m.finished}/${m.runs} | ${Math.round(m.acceptance * 100)}% | ${m.repairsPerTurn} | ${m.refusalsPerTurn} | ${m.roundsPerTurn} | ${s(m.medianFirstStepMs)} | ${s(m.medianTotalMs)} | ${Math.round(m.outputTokensPerTurn)} |${design ? ` ${m.checksFailedPerTurn ?? "–"} | ${m.medianDesignScore ?? "–"} |` : ""}${tools ? ` ${m.toolsWorking ?? "–"} |` : ""}`,
    ),
  ].join("\n");
}

// ── the judge check (RFC-0021 21c) ───────────────────────────────────────────────────────────

/** One reference page as the judge scored it. */
export interface JudgeCheckRow {
  id: DesignReference["id"];
  expected: readonly [number, number];
  score?: number | undefined;
  scores?: DesignScore["scores"] | undefined;
  problems?: string[] | undefined;
  inRange: boolean;
  error?: string | undefined;
}

/**
 * Scores the reference pages (empty, bare, plain, strong) with the judge: a judge worth using
 * ranks them in that order, with room between them. Run it after changing the judge or its prompt.
 */
export async function judgeCheck(input: {
  transport: AiTransport;
  renderer: PageRenderer;
  site: Site;
  judge?: string | undefined;
  signal?: AbortSignal | undefined;
  onRow?: ((row: JudgeCheckRow) => void) | undefined;
}): Promise<{ rows: JudgeCheckRow[]; ordered: boolean }> {
  const rows: JudgeCheckRow[] = [];
  const ts = new Date(0).toISOString();
  for (const ref of DESIGN_REFERENCES) {
    const row: JudgeCheckRow = { id: ref.id, expected: ref.expected, inRange: false };
    try {
      const page: Page = {
        schemaVersion: 1,
        id: "page_reference01",
        siteId: input.site.id,
        path: "/reference",
        title: "Reference",
        locale: "en",
        status: "draft",
        sections: ref.sections,
        rev: 0,
        createdAt: ts,
        updatedAt: ts,
      };
      const look = await lookAt(
        input.renderer,
        htmlDataUrl(renderPagePreview(input.site, page, {}, {}).html),
      );
      const judged = await scoreDesign({
        transport: input.transport,
        model: input.judge ?? DESIGN_JUDGE_MODEL,
        brief: REFERENCE_BRIEF,
        look,
        signal: input.signal,
      });
      row.score = judged.score;
      row.scores = judged.scores;
      if (judged.problems) row.problems = judged.problems;
      row.inRange = judged.score >= ref.expected[0] && judged.score <= ref.expected[1];
    } catch (e) {
      row.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }
    rows.push(row);
    input.onRow?.(row);
  }
  const scored = rows.map((r) => r.score);
  const ordered = scored.every(
    (s, i) => s !== undefined && (i === 0 || s > (scored[i - 1] as number)),
  );
  return { rows, ordered };
}

/** A Markdown table of a judge check. */
export function judgeCheckTable(rows: readonly JudgeCheckRow[]): string {
  return [
    "| Reference | Expected | Score | In range |",
    "|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.expected[0]}–${r.expected[1]} | ${r.score ?? (r.error ? `error: ${r.error}` : "–")} | ${r.inRange ? "yes" : "no"} |`,
    ),
  ].join("\n");
}

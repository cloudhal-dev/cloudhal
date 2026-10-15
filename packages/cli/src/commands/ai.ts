/**
 * `cloudhal ai build-eval` (RFC-0020 open question 7): the Build model eval. The same briefs go
 * through Build chat's turn on each model, in memory (nothing is stored), and the summary ranks
 * the models by finished turns, accepted steps and speed. Locally it reaches Workers AI over REST
 * (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDHAL_AI_TOKEN`); with `--remote` it runs on the deployment's AI
 * binding (deployment token). Every run is a real model call on the account.
 */
import path from "node:path";
import {
  BUILD_EVAL_BRIEFS,
  BUILD_EVAL_MODELS,
  type BuildEvalRun,
  type BuildEvalSummary,
  buildEvalTable,
  type JudgeCheckRow,
  judgeCheck,
  judgeCheckTable,
  runBuildEvalOnce,
  summariseBuildEval,
} from "@cloudhal/api";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { readProjectConfig } from "../config.ts";
import { localRender } from "../render-chrome.ts";
import { localAiTransport } from "./studio.ts";
import { brief as briefText, deployment, type SyncOptions } from "./sync.ts";

export interface BuildEvalOptions extends SyncOptions {
  readonly remote?: boolean;
  readonly models?: readonly string[];
  readonly briefs?: readonly string[];
  /** RFC-0021 21c: render each result (checks, the judge's score; `look`: the model sees it first). */
  readonly design?: { readonly judge?: string | false; readonly look?: boolean } | undefined;
  /** Each run as it finishes. */
  readonly onRun?: (run: BuildEvalRun) => void;
  readonly env?: Record<string, string | undefined>;
}

export interface BuildEvalReport {
  readonly where: "local" | "remote";
  readonly runs: BuildEvalRun[];
  readonly summary: BuildEvalSummary[];
  readonly table: string;
}

export async function buildEval(options: BuildEvalOptions): Promise<BuildEvalReport> {
  const models = options.models?.length ? options.models : BUILD_EVAL_MODELS;
  const briefs = BUILD_EVAL_BRIEFS.filter(
    (b) => !options.briefs?.length || options.briefs.includes(b.id),
  );
  if (briefs.length === 0)
    throw new Error(`--briefs: choose from ${BUILD_EVAL_BRIEFS.map((b) => b.id).join(", ")}`);
  if (options.remote) {
    const { cfg, adminUrl, token, fetch: f } = await deployment(options);
    const runs: BuildEvalRun[] = [];
    // One request per run: a dropped connection loses that run only, and it is recorded as one.
    for (const model of models)
      for (const brief of briefs) {
        const one = await remoteRuns(
          f,
          new URL(`/api/admin/sites/${cfg.siteId}/ai/build-eval`, adminUrl),
          token,
          model,
          brief.id,
          options.design,
        ).catch((e: unknown): BuildEvalRun[] => [
          {
            model,
            brief: brief.id,
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
            error: e instanceof Error ? e.message.slice(0, 200) : "failed",
          },
        ]);
        for (const run of one) {
          runs.push(run);
          options.onRun?.(run);
        }
      }
    const summary = summariseBuildEval(runs);
    return { where: "remote", runs, summary, table: buildEvalTable(summary) };
  }
  const { transport } = localAiTransport(options.env ?? process.env);
  if (!transport)
    throw new Error(
      "set CLOUDFLARE_ACCOUNT_ID and CLOUDHAL_AI_TOKEN to reach Workers AI, or use --remote",
    );
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    const catalog = createCatalog({ name: site.theme.name, blocks: local.store.blocks });
    // RFC-0021 21c: the local Chrome renders each result.
    const render = options.design ? localRender(options.env ?? process.env) : undefined;
    if (options.design && !render)
      throw new Error("--design needs a local Chrome (set CHROME_PATH), or use --remote");
    const design =
      options.design && render
        ? { ...options.design, renderer: render.renderer, site, blocks: local.store.blocks }
        : undefined;
    const runs: BuildEvalRun[] = [];
    for (const model of models)
      for (const brief of briefs) {
        const run = await runBuildEvalOnce({
          transport,
          model,
          brief,
          catalog,
          siteId: site.id,
          ...(design ? { design } : {}),
        });
        runs.push(run);
        options.onRun?.(run);
      }
    const summary = summariseBuildEval(runs);
    return { where: "local", runs, summary, table: buildEvalTable(summary) };
  } finally {
    await local.close();
  }
}

/** One remote run (NDJSON: start, progress lines, the run, then a summary of one). */
async function remoteRuns(
  f: typeof fetch,
  url: URL,
  token: string,
  model: string,
  brief: string,
  design?: BuildEvalOptions["design"],
): Promise<BuildEvalRun[]> {
  const res = await f(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ models: [model], briefs: [brief], ...(design ? { design } : {}) }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    if (res.status === 404 && !text.includes("site not found"))
      throw new Error("the deployment has no build eval yet (deploy this version first)");
    throw new Error(`the deployment answered ${res.status}: ${briefText(text)}`);
  }
  const runs: BuildEvalRun[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        const msg = JSON.parse(line) as { type: string; run?: BuildEvalRun };
        if (msg.type === "run" && msg.run) runs.push(msg.run);
      }
      nl = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (runs.length === 0) throw new Error("the deployment ended the stream before the run");
  return runs;
}

/** What the model saw when it looked, and what it did. */
function lookText(l: NonNullable<NonNullable<BuildEvalRun["design"]>["look"]>): string {
  const saw = `looked (${l.images ? `${l.images} screenshots` : "checks only"}${l.failed.length ? `, failed ${l.failed.join(", ")}` : ", nothing failed"})`;
  if (!l.round) return `${saw}, no extra round`;
  return `${saw}, ${l.steps ? `fixed with ${l.steps} step(s)` : "kept the page"}`;
}

export function describeRun(r: BuildEvalRun): string {
  const time = `${(r.totalMs / 1000).toFixed(1)} s`;
  const d = r.design;
  const design = d
    ? `\n    design: ${d.score !== undefined ? `score ${d.score}` : "no score"}, ${d.failed.length ? `failed ${d.failed.join(", ")}` : "all checks passed"}${d.look ? `, ${lookText(d.look)}` : ""}${d.note ? ` — ${d.note}` : ""}${d.error ? ` (${d.error})` : ""}`
    : "";
  return `${r.model} · ${r.brief}: ${r.finished ? "finished" : "not finished"}, ${r.steps} step(s), ${r.refused} refused, ${r.repairs} repair(s), ${r.rounds} round(s), ${time}${r.error ? ` (${r.error})` : ""}${r.samples?.[0] ? `\n    e.g. ${r.samples[0]}` : ""}${design}`;
}

export interface JudgeCheckOptions extends SyncOptions {
  readonly remote?: boolean;
  /** The judge model (default Llama 4 Scout). */
  readonly judge?: string | undefined;
  readonly onRow?: (row: JudgeCheckRow) => void;
  readonly env?: Record<string, string | undefined>;
}

/**
 * `cloudhal ai judge-check` (RFC-0021 21c): the judge scores the reference pages (empty, bare,
 * plain, strong); it is worth using when it ranks them in that order.
 */
export async function judgeCheckCommand(
  options: JudgeCheckOptions,
): Promise<{ ordered: boolean; table: string }> {
  if (options.remote) {
    const { cfg, adminUrl, token, fetch: f } = await deployment(options);
    const res = await f(new URL(`/api/admin/sites/${cfg.siteId}/ai/judge-check`, adminUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(options.judge ? { judge: options.judge } : {}),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      if (res.status === 404 && !text.includes("site not found"))
        throw new Error("the deployment has no judge check yet (deploy this version first)");
      throw new Error(`the deployment answered ${res.status}: ${briefText(text)}`);
    }
    let result: { ordered: boolean; table: string } | undefined;
    for (const line of (await res.text()).split("\n")) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as {
        type: string;
        row?: JudgeCheckRow;
        ordered?: boolean;
        table?: string;
      };
      if (msg.type === "row" && msg.row) options.onRow?.(msg.row);
      if (msg.type === "result") result = { ordered: Boolean(msg.ordered), table: msg.table ?? "" };
    }
    if (!result) throw new Error("the deployment ended the stream before the result");
    return result;
  }
  const env = options.env ?? process.env;
  const { transport } = localAiTransport(env);
  if (!transport)
    throw new Error(
      "set CLOUDFLARE_ACCOUNT_ID and CLOUDHAL_AI_TOKEN to reach Workers AI, or use --remote",
    );
  const render = localRender(env);
  if (!render)
    throw new Error("the judge check needs a local Chrome (set CHROME_PATH), or use --remote");
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    const r = await judgeCheck({
      transport,
      renderer: render.renderer,
      site,
      judge: options.judge,
      onRow: options.onRow,
    });
    return { ordered: r.ordered, table: judgeCheckTable(r.rows) };
  } finally {
    await local.close();
  }
}

export function describeJudgeRow(r: JudgeCheckRow): string {
  return `${r.id}: ${r.score ?? "no score"} (expected ${r.expected[0]}–${r.expected[1]}${r.inRange ? "" : ", out of range"})${r.error ? ` — ${r.error}` : ""}${r.problems?.length ? `\n    ${r.problems.join("\n    ")}` : ""}`;
}

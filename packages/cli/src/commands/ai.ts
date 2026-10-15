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
  runBuildEvalOnce,
  summariseBuildEval,
} from "@cloudhal/api";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { readProjectConfig } from "../config.ts";
import { localAiTransport } from "./studio.ts";
import { brief as briefText, deployment, type SyncOptions } from "./sync.ts";

export interface BuildEvalOptions extends SyncOptions {
  readonly remote?: boolean;
  readonly models?: readonly string[];
  readonly briefs?: readonly string[];
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
    const res = await f(new URL(`/api/admin/sites/${cfg.siteId}/ai/build-eval`, adminUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ models, briefs: briefs.map((b) => b.id) }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      if (res.status === 404 && !text.includes("site not found"))
        throw new Error("the deployment has no build eval yet (deploy this version first)");
      throw new Error(`the deployment answered ${res.status}: ${briefText(text)}`);
    }
    const runs: BuildEvalRun[] = [];
    let summary: BuildEvalSummary[] = [];
    let table = "";
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
          const msg = JSON.parse(line) as
            | { type: "run"; run: BuildEvalRun }
            | { type: "summary"; summary: BuildEvalSummary[]; table: string };
          if (msg.type === "run") {
            runs.push(msg.run);
            options.onRun?.(msg.run);
          } else {
            summary = msg.summary;
            table = msg.table;
          }
        }
        nl = buffer.indexOf("\n");
      }
      if (done) break;
    }
    return { where: "remote", runs, summary, table };
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
    const runs: BuildEvalRun[] = [];
    for (const model of models)
      for (const brief of briefs) {
        const run = await runBuildEvalOnce({ transport, model, brief, catalog, siteId: site.id });
        runs.push(run);
        options.onRun?.(run);
      }
    const summary = summariseBuildEval(runs);
    return { where: "local", runs, summary, table: buildEvalTable(summary) };
  } finally {
    await local.close();
  }
}

export function describeRun(r: BuildEvalRun): string {
  const time = `${(r.totalMs / 1000).toFixed(1)} s`;
  return `${r.model} · ${r.brief}: ${r.finished ? "finished" : "not finished"}, ${r.steps} step(s), ${r.refused} refused, ${r.repairs} repair(s), ${r.rounds} round(s), ${time}${r.error ? ` (${r.error})` : ""}`;
}

/** Build eval and judge check streams (RFC-0020 open question 7, RFC-0021 21c). */

import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { type Context, Hono } from "hono";
import {
  ALL_EVAL_BRIEFS,
  BUILD_EVAL_BRIEFS,
  BUILD_EVAL_MODELS,
  type BuildEvalRun,
  buildEvalTable,
  judgeCheck,
  judgeCheckTable,
  runBuildEvalOnce,
  summariseBuildEval,
} from "../../build-eval.ts";
import type { Env } from "../../context.ts";
import { param } from "../../params.ts";
import type { AdminDeps } from "./shared.ts";
import { NO_STORE } from "./shared.ts";

/** Build eval and judge check. */
export function aiAdminRoutes(deps: AdminDeps): Hono<Env> {
  return new Hono<Env>()
    .post("/sites/:siteId/ai/build-eval", (c) => buildEval(c, deps))
    .post("/sites/:siteId/ai/judge-check", (c) => judgeCheckStream(c, deps));
}

/**
 * RFC-0020 open question 7: `cloudhal ai build-eval --remote` compares models on the build
 * turn, in memory (nothing is stored). Streams one NDJSON line per run, then the summary.
 */
async function buildEval(c: Context<Env>, { aiTransport, render }: AdminDeps): Promise<Response> {
  const store = c.get("store");
  const site = await store.getSite(param(c, "siteId"));
  if (!site) return c.json({ error: "not_found", message: "site not found" }, 404, NO_STORE);
  if (!aiTransport)
    return c.json(
      { error: "ai_unavailable", message: "this deployment cannot reach Workers AI" },
      503,
      NO_STORE,
    );
  const body = (await c.req.json().catch(() => ({}))) as {
    models?: unknown;
    briefs?: unknown;
    design?: { judge?: unknown; look?: unknown };
  };
  const list = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
  const models = (list(body.models) ?? [...BUILD_EVAL_MODELS]).slice(0, 12);
  const wanted = list(body.briefs);
  // RFC-0022 §6: named briefs may be tool briefs too; the default stays the build set.
  const briefs = wanted
    ? ALL_EVAL_BRIEFS.filter((b) => wanted.includes(b.id))
    : [...BUILD_EVAL_BRIEFS];
  if (models.length === 0 || briefs.length === 0)
    return c.json(
      { error: "invalid", message: "models and briefs: at least one each" },
      400,
      NO_STORE,
    );
  const catalog = createCatalog({ name: site.theme.name, blocks: store.blocks });
  // RFC-0021 21c: render each result in Browser Rendering, then the judge's score.
  if (body.design && !render)
    return c.json(
      { error: "render_unavailable", message: "this deployment has no browser (BROWSER)" },
      503,
      NO_STORE,
    );
  const judge = body.design?.judge;
  const design =
    body.design && render
      ? {
          renderer: render.renderer,
          site,
          blocks: store.blocks,
          ...(judge === false ? { judge: false as const } : {}),
          ...(typeof judge === "string" ? { judge: judge.slice(0, 120) } : {}),
          ...(body.design.look === true ? { look: true } : {}),
        }
      : undefined;
  const encoder = new TextEncoder();
  const signal = c.req.raw.signal;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // the operator went away; the runs stop at the next check
        }
      };
      const runs: BuildEvalRun[] = [];
      // Cloudflare closes a response that sends nothing for about 100 s, and one run can
      // take that long: a progress line every 15 s keeps the stream open.
      let current: { model: string; brief: string } | undefined;
      const beat = setInterval(() => {
        if (current) send({ type: "progress", ...current });
      }, 15_000);
      for (const model of models)
        for (const brief of briefs) {
          if (signal.aborted) break;
          current = { model, brief: brief.id };
          send({ type: "start", ...current });
          const run = await runBuildEvalOnce({
            transport: aiTransport,
            model,
            brief,
            catalog,
            siteId: site.id,
            signal,
            ...(design ? { design } : {}),
          }).catch(
            (e: unknown): BuildEvalRun => ({
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
            }),
          );
          runs.push(run);
          send({ type: "run", run });
        }
      clearInterval(beat);
      const summary = summariseBuildEval(runs);
      send({ type: "summary", summary, table: buildEvalTable(summary) });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}

/**
 * RFC-0021 21c: `cloudhal ai judge-check --remote` scores the reference pages with the judge.
 */
async function judgeCheckStream(
  c: Context<Env>,
  { aiTransport, render }: AdminDeps,
): Promise<Response> {
  const store = c.get("store");
  const site = await store.getSite(param(c, "siteId"));
  if (!site) return c.json({ error: "not_found", message: "site not found" }, 404, NO_STORE);
  if (!aiTransport || !render)
    return c.json(
      {
        error: !aiTransport ? "ai_unavailable" : "render_unavailable",
        message: "the judge check needs Workers AI and a browser (BROWSER)",
      },
      503,
      NO_STORE,
    );
  const body = (await c.req.json().catch(() => ({}))) as { judge?: unknown };
  const judge = typeof body.judge === "string" ? body.judge.slice(0, 120) : undefined;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // the operator went away
        }
      };
      const beat = setInterval(() => send({ type: "progress" }), 15_000);
      const result = await judgeCheck({
        transport: aiTransport,
        renderer: render.renderer,
        site,
        judge,
        signal: c.req.raw.signal,
        onRow: (row) => send({ type: "row", row }),
      });
      clearInterval(beat);
      send({ type: "result", ordered: result.ordered, table: judgeCheckTable(result.rows) });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}

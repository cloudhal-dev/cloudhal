/**
 * The probe Worker for the opt-in live suite (`CLOUDHAL_LIVE_CF=1`, test/live.test.ts). Deploy it to
 * the maintainer's account with the two bindings Cloudhal uses — no API token is involved:
 *
 *   // test/live/wrangler.jsonc (not committed; fill in your own names)
 *   {
 *     "name": "cloudhal-analytics-probe",
 *     "main": "probe-worker.ts",
 *     "compatibility_date": "2026-10-01",
 *     "analytics_engine_datasets": [{ "binding": "ANALYTICS", "dataset": "cloudhal_live_events" }],
 *     "analytics": { "binding": "ANALYTICS_SQL" }
 *   }
 *   wrangler deploy -c test/live/wrangler.jsonc
 *   wrangler secret put PROBE_SECRET -c test/live/wrangler.jsonc
 *
 * `POST /write {events}` writes stored events through `WaeWriter`; `POST /query {query}` runs one
 * statement through the Analytics SQL binding and returns its result, or the error's name, message
 * and `retryable`. Every request needs `x-probe-secret`.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { WaeWriter } from "../../src/wae/writer.ts";

interface Env {
  ANALYTICS: AnalyticsEngineDataset;
  ANALYTICS_SQL: AnalyticsSQLBinding;
  PROBE_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.PROBE_SECRET || request.headers.get("x-probe-secret") !== env.PROBE_SECRET)
      return new Response("forbidden", { status: 403 });
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("method", { status: 405 });
    if (url.pathname === "/write") {
      const { events } = (await request.json()) as { events: AnalyticsEvent[] };
      const writer = new WaeWriter(env.ANALYTICS);
      for (const e of events.slice(0, 200)) writer.write(e);
      return Response.json({ written: Math.min(events.length, 200) });
    }
    if (url.pathname === "/query") {
      const { query } = (await request.json()) as { query: string };
      try {
        return Response.json(await env.ANALYTICS_SQL.query({ query }));
      } catch (error) {
        const e = error as { name?: string; message?: string; retryable?: boolean };
        return Response.json(
          { error: { name: e.name, message: e.message, retryable: e.retryable === true } },
          { status: 500 },
        );
      }
    }
    return new Response("not found", { status: 404 });
  },
};

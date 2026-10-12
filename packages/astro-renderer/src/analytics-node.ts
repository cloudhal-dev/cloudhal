/**
 * Site analytics on Node (RFC-0006 §7.1 L3, §11): what the `cloudhal()` integration's analytics
 * middleware does for `cloudhal dev` (and, later, a Node self-host server). The same
 * `SiteAnalytics` as the Site Worker, writing raw events to the local SQLite store through
 * `SqlAnalytics`:
 *
 * - `POST /__cloudhal/e` answers `204` always; it records only when recording is on (`cloudhal dev`
 *   records nothing unless `analytics.dev` is set: it is the author's own traffic);
 * - while recording, HTML `200`s get the script tag and `/_cloudhal/*.js` is served from memory
 *   (the Site Worker build ships them as static assets instead);
 * - `render` events for redirects, 404, 410 and 5xx, as on the Worker.
 *
 * Beacons resolve against the **published** snapshot of the local store, so a page that is only a
 * draft in `cloudhal dev` is never counted.
 */
import { type AnalyticsDefaults, parseAnalyticsDefaults } from "@cloudhal/analytics";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import type { Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import {
  ANALYTICS_BEACON_PATH,
  deploymentDefaults,
  insertTag,
  SiteAnalytics,
} from "./analytics.ts";
import type { AnalyticsClient } from "./analytics-client.ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import type { GraphSource } from "./source.ts";

export interface NodeAnalyticsBackend {
  readonly open: () => Promise<SqlDriver>;
  readonly sql: () => SqlDriver;
  readonly site: () => Promise<Site | undefined>;
  readonly snapshot: (id: string) => Promise<GraphSource>;
}

export interface NodeAnalyticsOptions {
  readonly siteId: string;
  readonly backend: NodeAnalyticsBackend;
  /** The built scripts (dev serves them from memory); `null` = none. */
  readonly client: Pick<AnalyticsClient, "script" | "vitals"> | null;
  /** Deployment defaults; `undefined` = off. */
  readonly defaults: AnalyticsDefaults | undefined;
  /** Write events (`analytics.dev` in `cloudhal dev`). */
  readonly record: boolean;
  readonly now?: () => number;
  readonly onError?: (message: string, error?: unknown) => void;
}

/** Defaults and recording for `cloudhal dev`: the integration's options, else the environment. */
export function nodeAnalyticsSettings(
  config: Pick<CloudhalRendererConfig, "analytics">,
  env: Record<string, string | undefined> = process.env,
): { defaults: AnalyticsDefaults | undefined; record: boolean } {
  const o = config.analytics;
  const defaults = o
    ? o.enabled
      ? parseAnalyticsDefaults(o)
      : undefined
    : deploymentDefaults(env.CLOUDHAL_ANALYTICS, env.CLOUDHAL_ANALYTICS_DEFAULTS);
  const record = o?.dev ?? env.CLOUDHAL_ANALYTICS_DEV === "1";
  return { defaults, record };
}

const JS = { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" };

/** A request handler around the page pipeline (`next`). */
export function createNodeAnalytics(
  options: NodeAnalyticsOptions,
): (request: Request, next: () => Promise<Response>, clientIp?: string) => Promise<Response> {
  let analytics: Promise<SiteAnalytics> | undefined;
  const active = options.record && options.defaults !== undefined;
  const get = () => {
    analytics ??= (async () => {
      const sql = await options.backend.open();
      const writer = new SqlAnalytics(sql, {
        ...(options.onError ? { onError: options.onError } : {}),
      });
      return new SiteAnalytics({
        siteId: options.siteId,
        defaults: options.defaults,
        writer,
        sql: options.backend.sql,
        site: options.backend.site,
        snapshot: options.backend.snapshot,
        script: options.client?.script.path,
        // local servers answer on whatever host they are reached by
        acceptRequestHost: () => true,
        ...(options.now ? { now: options.now } : {}),
        ...(options.onError ? { onError: options.onError } : {}),
      });
    })();
    return analytics;
  };

  return async (request, next, clientIp) => {
    const url = new URL(request.url);
    if (url.pathname === ANALYTICS_BEACON_PATH) {
      if (!active)
        return new Response(null, {
          status: request.method === "POST" ? 204 : 405,
          headers: {
            "cache-control": "no-store",
            ...(request.method === "POST" ? {} : { allow: "POST" }),
          },
        });
      return (await get()).beacon(request, clientIp ? { clientIp } : {});
    }
    if (active && options.client) {
      for (const file of [options.client.script, options.client.vitals])
        if (url.pathname === file.path)
          return new Response(request.method === "HEAD" ? null : file.code, { headers: JS });
    }
    const started = Date.now();
    const response = await next();
    if (!active) return response;
    const a = await get();
    void a.render(request, response, Date.now() - started);
    if (
      response.status !== 200 ||
      !(response.headers.get("content-type") ?? "").includes("text/html")
    )
      return response;
    const tag = await a.tag();
    if (!tag) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(insertTag(await response.text(), tag), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * `POST /__cloudhal/e` (RFC-0006 §5.2), as a pure handler: the caller supplies the site's settings,
 * hosts, a path resolver over the published snapshot, a writer, and optionally the daily salt and
 * a rate limiter. It runs on the site Worker and in the Node middleware alike.
 *
 * Every outcome is `204 No Content` with `cache-control: no-store`, so the endpoint is no oracle
 * for which check passed; only another method gets `405`. `processBeacon` returns the outcome for
 * tests and logs.
 */
import { type AnalyticsEvent, isValid } from "@cloudhal/core-contracts";
import { buildPageviewEvent, buildVitalsEvent, type ResolvedNode } from "./events.ts";
import type { AnalyticsWriter } from "./model.ts";
import { hostOfUrl, normaliseBeaconPath, sameSiteHost } from "./paths.ts";
import type { EffectiveAnalyticsSettings } from "./settings.ts";
import { classifyUserAgent } from "./ua.ts";
import { hasPrivacySignal, visitorHash } from "./visitor.ts";

export const BEACON_MAX_BYTES = 2048;
export const BEACON_MAX_UA = 512;

export type BeaconDropReason =
  | "off"
  | "cross-site"
  | "no-origin"
  | "foreign-host"
  | "too-large"
  | "no-user-agent"
  | "bot"
  | "rate-limited"
  | "invalid-json"
  | "invalid-beacon"
  | "unknown-path"
  | "vitals-off"
  | "vitals-sampling"
  | "no-metrics"
  | "invalid-event"
  | "write-failed";

export type BeaconOutcome =
  | { readonly ok: true; readonly event: AnalyticsEvent }
  | { readonly ok: false; readonly reason: BeaconDropReason };

export interface BeaconContext {
  readonly siteId: string;
  /** Effective settings (memoise per isolate, ≤ 60 s). Throwing or `undefined` counts as off. */
  readonly settings: () =>
    | Promise<EffectiveAnalyticsSettings | undefined>
    | EffectiveAnalyticsSettings
    | undefined;
  /** Hostnames the site answers on: `Site.domains` plus the deployment's workers.dev host. */
  readonly hosts: readonly string[];
  /** Resolves a normalised route against the published snapshot; `undefined` = not published. */
  readonly resolvePath: (
    path: string,
  ) => Promise<ResolvedNode | undefined> | ResolvedNode | undefined;
  readonly writer: AnalyticsWriter;
  /** Today's salt (`YYYY-MM-DD` → hex); called only in unique-visitors mode. */
  readonly salt?: (day: string) => Promise<string>;
  /** Per-client allowance (e.g. `BeaconRateLimiter.allow`); `false` drops the beacon. */
  readonly rateLimit?: (ip: string, kind: "pageview" | "vitals") => Promise<boolean> | boolean;
  /**
   * The client's address as the **caller** knows it to be true; the handler never reads it from a
   * request header. On Cloudflare the Site Worker passes `CF-Connecting-IP` (set by Cloudflare's
   * edge, which overwrites what a client sends); on Node and in `cloudhal dev`, the socket
   * address. Absent: no visitor hash and no per-client limit key (the IP is "").
   */
  readonly clientIp?: string;
  /** Country when `request.cf.country` is absent. */
  readonly country?: string;
  readonly now?: () => Date;
  /** Bugs and write failures (never the beacon body or the IP). */
  readonly onError?: (message: string, error?: unknown) => void;
}

function drop(reason: BeaconDropReason): BeaconOutcome {
  return { ok: false, reason };
}

async function readCapped(request: Request, max: number): Promise<string | undefined> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Runs the checks of §5.2 in order and writes at most one event. Never throws. */
export async function processBeacon(request: Request, ctx: BeaconContext): Promise<BeaconOutcome> {
  try {
    return await process(request, ctx);
  } catch (error) {
    ctx.onError?.("analytics beacon failed", error);
    return drop("invalid-event");
  }
}

async function process(request: Request, ctx: BeaconContext): Promise<BeaconOutcome> {
  // 1. analytics on for the site (fail closed)
  let settings: EffectiveAnalyticsSettings | undefined;
  try {
    settings = await ctx.settings();
  } catch {
    settings = undefined;
  }
  if (!settings?.enabled) return drop("off");

  // 2. same origin
  const url = new URL(request.url);
  const h = request.headers;
  const fetchSite = h.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return drop("cross-site");
  if (fetchSite === null) {
    const origin = hostOfUrl(h.get("origin")) ?? hostOfUrl(h.get("referer"));
    if (!origin) return drop("no-origin");
    if (origin.host.toLowerCase() !== url.host.toLowerCase()) return drop("cross-site");
  }
  if (!sameSiteHost(url.host, ctx.hosts)) return drop("foreign-host");

  // 3. size
  const length = h.get("content-length");
  if (length !== null && !(Number(length) <= BEACON_MAX_BYTES)) return drop("too-large");

  // 4. agent
  const userAgent = h.get("user-agent");
  if (!userAgent?.trim()) return drop("no-user-agent");
  if (userAgent.length > BEACON_MAX_UA) return drop("bot");
  const ua = classifyUserAgent(userAgent, {
    mobile: h.get("sec-ch-ua-mobile"),
    platform: h.get("sec-ch-ua-platform"),
  });
  if (ua.device === "bot") return drop("bot");

  const body = await readCapped(request, BEACON_MAX_BYTES);
  if (body === undefined) return drop("too-large");

  // 6. schema (before the rate check, which is per beacon kind)
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return drop("invalid-json");
  }
  if (!isValid("analytics-beacon", parsed)) return drop("invalid-beacon");
  const beacon = parsed;

  // 5. rate
  // Only the caller's trusted address: a client-sent `CF-Connecting-IP` off Cloudflare must not
  // pick the rate-limit key or the hashed IP.
  const ip = ctx.clientIp?.trim() ?? "";
  if (ctx.rateLimit && !(await ctx.rateLimit(ip, beacon.kind))) return drop("rate-limited");

  // 7. route → published node
  const path = normaliseBeaconPath(beacon.path);
  if (!path) return drop("unknown-path");
  const node = await ctx.resolvePath(path);
  if (!node) return drop("unknown-path");

  const now = ctx.now?.() ?? new Date();
  const cf = (request as Request & { cf?: { country?: unknown } }).cf;
  const country = typeof cf?.country === "string" ? cf.country : ctx.country;

  let event: AnalyticsEvent | undefined;
  if (beacon.kind === "vitals") {
    // 8. vitals sampling must match the site's setting
    if (settings.vitalsOneIn === 0) return drop("vitals-off");
    if (beacon.sampleOneIn !== settings.vitalsOneIn) return drop("vitals-sampling");
    event = buildVitalsEvent({ siteId: ctx.siteId, now, beacon, path, node, ua, country });
    if (!event) return drop("no-metrics");
  } else {
    let visitor: string | undefined;
    const privacySignal = hasPrivacySignal(h);
    if (settings.uniqueVisitors && ctx.salt && ip && !privacySignal) {
      const salt = await ctx.salt(now.toISOString().slice(0, 10));
      visitor = await visitorHash(salt, ctx.siteId, ip, userAgent);
    }
    event = buildPageviewEvent({
      siteId: ctx.siteId,
      now,
      beacon,
      path,
      node,
      hosts: ctx.hosts,
      ua,
      country,
      visitor,
      privacySignal,
    });
    if (!event) {
      ctx.onError?.("analytics: built page view does not match the contract");
      return drop("invalid-event");
    }
  }

  // 9. write (never awaited, never fails the response)
  try {
    ctx.writer.write(event);
  } catch (error) {
    ctx.onError?.("analytics write failed", error);
    return drop("write-failed");
  }
  return { ok: true, event };
}

const NO_STORE = { "cache-control": "no-store" };

/** The endpoint: `204` for every outcome, `405` for another method. */
export async function handleBeacon(request: Request, ctx: BeaconContext): Promise<Response> {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } });
  await processBeacon(request, ctx);
  return new Response(null, { status: 204, headers: NO_STORE });
}

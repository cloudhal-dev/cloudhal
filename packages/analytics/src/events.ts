/**
 * Event builders (RFC-0006 §5.3–§5.4): turn a validated beacon or a Worker response into a stored
 * `AnalyticsEvent`. Nothing here is taken from the browser as-is: the node comes from route
 * resolution, the referrer is reduced to a host, UTM values are normalised, and device, browser
 * and OS families come from the user-agent classifier. Every built event is checked against the
 * stored contract; a failure is a bug and yields `undefined`.
 */
import {
  type AnalyticsEvent,
  type AnalyticsNodeKind,
  type AnalyticsPageviewBeacon,
  type AnalyticsPageviewEvent,
  type AnalyticsRenderEvent,
  type AnalyticsVitalsBeacon,
  type AnalyticsVitalsEvent,
  isValid,
} from "@cloudhal/core-contracts";
import { classifyChannel } from "./channels.ts";
import { COUNTRY_RE } from "./model.ts";
import {
  hostOfUrl,
  normaliseBeaconPath,
  normaliseHost,
  normaliseUtm,
  ROUTE_PATH_RE,
  sameSiteHost,
  toRedirectTarget,
  toRequestPath,
} from "./paths.ts";
import { type ClientHints, classifyUserAgent, type UaClass } from "./ua.ts";

/** What a path resolved to in the published snapshot. */
export interface ResolvedNode {
  readonly nodeId: string;
  readonly nodeKind: AnalyticsNodeKind;
  /** Locale of the node. */
  readonly locale?: string;
  /** Canonical route, when it differs from the normalised request path. */
  readonly path?: string;
}

export function normaliseCountry(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const c = value.trim().toUpperCase();
  return COUNTRY_RE.test(c) ? c : undefined;
}

function millis(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined;
  return Math.min(600_000, Math.max(0, Math.round(v)));
}

function stamp(now: Date): string {
  return now.toISOString();
}

function opt<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

export interface PageviewInput {
  readonly siteId: string;
  readonly now: Date;
  readonly beacon: AnalyticsPageviewBeacon;
  /** Normalised route the beacon named. */
  readonly path: string;
  readonly node: ResolvedNode;
  /** The site's own hostnames. */
  readonly hosts: readonly string[];
  readonly ua: UaClass;
  readonly country?: string | null | undefined;
  readonly visitor?: string | undefined;
}

export function buildPageviewEvent(input: PageviewInput): AnalyticsPageviewEvent | undefined {
  const { beacon, node } = input;
  const referrer = beacon.referrer?.trim() ?? "";
  const internal = referrer !== "" && sameSiteHost(referrer, input.hosts);
  const refHost = internal ? undefined : normaliseHost(referrer);
  const utmSource = normaliseUtm(beacon.utmSource);
  const utmMedium = normaliseUtm(beacon.utmMedium);
  const utmCampaign = normaliseUtm(beacon.utmCampaign);
  const channel = classifyChannel({ refHost, internal, utmMedium });
  const navType = beacon.navType ?? "navigate";
  const path = node.path && ROUTE_PATH_RE.test(node.path) ? node.path : input.path;
  const event: AnalyticsPageviewEvent = {
    schemaVersion: 1,
    kind: "pageview",
    siteId: input.siteId,
    timestamp: stamp(input.now),
    path,
    nodeId: node.nodeId,
    nodeKind: node.nodeKind,
    ...opt("refHost", refHost),
    channel,
    ...opt("utmSource", utmSource),
    ...opt("utmMedium", utmMedium),
    ...opt("utmCampaign", utmCampaign),
    ...opt("country", normaliseCountry(input.country)),
    device: input.ua.device,
    browser: input.ua.browser,
    os: input.ua.os,
    ...opt("visitor", input.visitor),
    navType,
    ...opt("locale", node.locale),
    entrance: channel !== "internal" && (navType === "navigate" || navType === "prerender"),
  };
  return isValid("analytics-event", event) ? event : undefined;
}

export interface VitalsInput {
  readonly siteId: string;
  readonly now: Date;
  readonly beacon: AnalyticsVitalsBeacon;
  readonly path: string;
  readonly node: ResolvedNode;
  readonly ua: UaClass;
  readonly country?: string | null | undefined;
}

export function buildVitalsEvent(input: VitalsInput): AnalyticsVitalsEvent | undefined {
  const { beacon, node } = input;
  const lcp = millis(beacon.lcp);
  const inp = millis(beacon.inp);
  const ttfb = millis(beacon.ttfb);
  const fcp = millis(beacon.fcp);
  const cls =
    beacon.cls !== undefined && Number.isFinite(beacon.cls)
      ? Math.round(Math.min(100, Math.max(0, beacon.cls)) * 10_000) / 10_000
      : undefined;
  if ([lcp, inp, cls, ttfb, fcp].every((v) => v === undefined)) return undefined;
  const path = node.path && ROUTE_PATH_RE.test(node.path) ? node.path : input.path;
  const event: AnalyticsVitalsEvent = {
    schemaVersion: 1,
    kind: "vitals",
    siteId: input.siteId,
    timestamp: stamp(input.now),
    path,
    nodeId: node.nodeId,
    nodeKind: node.nodeKind,
    ...opt("country", normaliseCountry(input.country)),
    device: input.ua.device,
    browser: input.ua.browser,
    ...opt("lcp", lcp),
    ...opt("inp", inp),
    ...opt("cls", cls),
    ...opt("ttfb", ttfb),
    ...opt("fcp", fcp),
    sampleOneIn: beacon.sampleOneIn,
  };
  return isValid("analytics-event", event) ? event : undefined;
}

export interface RenderInput {
  readonly siteId: string;
  readonly now: Date;
  /** The request URL (its pathname is stored as received, percent-encoded). */
  readonly url: string | URL;
  readonly status: number;
  /** The site's own hostnames (same-site referrers become `refPath`). */
  readonly hosts: readonly string[];
  readonly userAgent?: string | null;
  readonly hints?: ClientHints;
  readonly referer?: string | null;
  readonly node?: { readonly nodeId: string; readonly nodeKind: AnalyticsNodeKind };
  /** `Location` of a 3xx answer. */
  readonly location?: string | null;
  readonly renderMs?: number;
  /** From `RenderEventSampler` (omitted when 1). */
  readonly sampleOneIn?: number;
  readonly country?: string | null;
}

/** A server-side render event (§5.4); `undefined` when the request cannot be recorded. */
export function buildRenderEvent(input: RenderInput): AnalyticsRenderEvent | undefined {
  let url: URL;
  try {
    url = typeof input.url === "string" ? new URL(input.url) : input.url;
  } catch {
    return undefined;
  }
  const path = toRequestPath(url.pathname);
  if (!path || !Number.isInteger(input.status)) return undefined;
  const ua = classifyUserAgent(input.userAgent, input.hints);
  const ref = hostOfUrl(input.referer);
  const internal = ref ? sameSiteHost(ref.host, input.hosts) : false;
  const refPath = internal && ref ? normaliseBeaconPath(ref.pathname) : undefined;
  const refHost = ref && !internal ? normaliseHost(ref.hostname) : undefined;
  const redirectTo =
    input.status >= 300 && input.status < 400 ? toRedirectTarget(input.location) : undefined;
  const sampleOneIn =
    input.sampleOneIn !== undefined && input.sampleOneIn > 1 ? input.sampleOneIn : undefined;
  const event: AnalyticsRenderEvent = {
    schemaVersion: 1,
    kind: "render",
    siteId: input.siteId,
    timestamp: stamp(input.now),
    path,
    status: input.status,
    ...opt("nodeId", input.node?.nodeId),
    ...opt("nodeKind", input.node?.nodeKind),
    ...opt("redirectTo", redirectTo),
    ...opt("refHost", refHost),
    ...opt("refPath", refPath),
    ...opt("country", normaliseCountry(input.country)),
    device: ua.device,
    ...opt("crawler", ua.crawler?.name),
    ...opt("renderMs", millis(input.renderMs)),
    ...opt("sampleOneIn", sampleOneIn),
  };
  return isValid("analytics-event", event) ? event : undefined;
}

/** True for a stored event (cheap re-check for writers that receive events from elsewhere). */
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return isValid("analytics-event", value);
}

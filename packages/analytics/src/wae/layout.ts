/**
 * The fixed Workers Analytics Engine layout of an `AnalyticsEvent` (RFC-0006 §4). Slots never move;
 * new fields only append. `index1 = siteId`; readers always filter on `blob1` (the kind) first.
 *
 * Absent values: blobs are `""`. Absent vitals metrics and `renderMs` are `-1` (WAE reads unwritten
 * doubles as 0, which is a real measurement), so readers test `doubleN >= 0`. `double9`
 * (`sampleOneIn`) is written for vitals and render events (1 when absent).
 */
import type {
  AnalyticsEvent,
  AnalyticsPageviewEvent,
  AnalyticsRenderEvent,
  AnalyticsVitalsEvent,
} from "@cloudhal/core-contracts";

/** Structurally `AnalyticsEngineDataPoint` from `@cloudflare/workers-types`. */
export interface WaeDataPoint {
  indexes?: ((ArrayBuffer | string) | null)[];
  doubles?: number[];
  blobs?: ((ArrayBuffer | string) | null)[];
}

/** Structurally `AnalyticsEngineDataset` (the site Worker's `ANALYTICS` binding). */
export interface WaeDataset {
  writeDataPoint(event?: WaeDataPoint): void;
}

/** 1-based blob slots. */
export const BLOB = {
  kind: 1,
  schemaVersion: 2,
  path: 3,
  nodeId: 4,
  nodeKind: 5,
  refHost: 6,
  channel: 7,
  utmSource: 8,
  utmMedium: 9,
  utmCampaign: 10,
  country: 11,
  device: 12,
  browser: 13,
  os: 14,
  visitor: 15,
  navType: 16,
  locale: 17,
  crawler: 18,
  redirectTo: 19,
  refPath: 20,
} as const;

/** 1-based double slots. */
export const DOUBLE = {
  entrance: 1,
  status: 2,
  lcp: 3,
  inp: 4,
  /** CLS × 1000 */
  cls: 5,
  ttfb: 6,
  fcp: 7,
  renderMs: 8,
  sampleOneIn: 9,
} as const;

/** Written for absent metrics (and `renderMs`). */
export const ABSENT = -1;

function blobs(e: AnalyticsEvent): string[] {
  const out = new Array<string>(20).fill("");
  const r = e as unknown as Record<string, unknown>;
  for (const [name, slot] of Object.entries(BLOB)) {
    if (name === "schemaVersion") out[slot - 1] = String(e.schemaVersion);
    else if (typeof r[name] === "string") out[slot - 1] = r[name] as string;
  }
  return out;
}

const m = (v: number | undefined) => (v === undefined ? ABSENT : v);

/** CLS as stored in `double5`: × 1000, two decimals (avoids `0.1 * 1000 = 100.00000000000001`). */
export function clsSlot(cls: number | undefined): number {
  return cls === undefined ? ABSENT : Math.round(cls * 100_000) / 100;
}

/** The data point for one event. */
export function toDataPoint(e: AnalyticsEvent): {
  indexes: string[];
  blobs: string[];
  doubles: number[];
} {
  let doubles: number[];
  switch (e.kind) {
    case "pageview":
      doubles = [e.entrance ? 1 : 0];
      break;
    case "vitals":
      doubles = [0, 0, m(e.lcp), m(e.inp), clsSlot(e.cls), m(e.ttfb), m(e.fcp), 0, e.sampleOneIn];
      break;
    case "render":
      doubles = [0, e.status, 0, 0, 0, 0, 0, m(e.renderMs), e.sampleOneIn ?? 1];
      break;
  }
  return { indexes: [e.siteId], blobs: blobs(e), doubles };
}

function setIf(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined && value !== "") target[key] = value;
}

/**
 * The event a data point holds (fakes and the live suite read points back). `timestamp` comes
 * from WAE, not from the point.
 */
export function fromDataPoint(
  point: { indexes?: readonly unknown[]; blobs?: readonly unknown[]; doubles?: readonly number[] },
  timestamp: string,
): AnalyticsEvent {
  const b = (slot: number): string | undefined => {
    const v = point.blobs?.[slot - 1];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const d = (slot: number): number => point.doubles?.[slot - 1] ?? 0;
  const opt = (slot: number): number | undefined => (d(slot) >= 0 ? d(slot) : undefined);
  const kind = b(BLOB.kind);
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    kind,
    siteId: String(point.indexes?.[0] ?? ""),
    timestamp,
    path: b(BLOB.path),
  };
  setIf(base, "nodeId", b(BLOB.nodeId));
  setIf(base, "nodeKind", b(BLOB.nodeKind));
  setIf(base, "country", b(BLOB.country));
  base.device = b(BLOB.device);
  if (kind === "pageview") {
    setIf(base, "refHost", b(BLOB.refHost));
    base.channel = b(BLOB.channel);
    setIf(base, "utmSource", b(BLOB.utmSource));
    setIf(base, "utmMedium", b(BLOB.utmMedium));
    setIf(base, "utmCampaign", b(BLOB.utmCampaign));
    base.browser = b(BLOB.browser);
    base.os = b(BLOB.os);
    setIf(base, "visitor", b(BLOB.visitor));
    base.navType = b(BLOB.navType);
    setIf(base, "locale", b(BLOB.locale));
    base.entrance = d(DOUBLE.entrance) === 1;
    return base as unknown as AnalyticsPageviewEvent;
  }
  if (kind === "vitals") {
    setIf(base, "browser", b(BLOB.browser));
    for (const k of ["lcp", "inp", "ttfb", "fcp"] as const) {
      const v = opt(DOUBLE[k]);
      if (v !== undefined) base[k] = v;
    }
    const cls = opt(DOUBLE.cls);
    if (cls !== undefined) base.cls = cls / 1000;
    base.sampleOneIn = d(DOUBLE.sampleOneIn) || 1;
    return base as unknown as AnalyticsVitalsEvent;
  }
  base.status = d(DOUBLE.status);
  setIf(base, "redirectTo", b(BLOB.redirectTo));
  setIf(base, "refHost", b(BLOB.refHost));
  setIf(base, "refPath", b(BLOB.refPath));
  setIf(base, "crawler", b(BLOB.crawler));
  const renderMs = opt(DOUBLE.renderMs);
  if (renderMs !== undefined) base.renderMs = renderMs;
  const s = d(DOUBLE.sampleOneIn);
  if (s > 1) base.sampleOneIn = s;
  return base as unknown as AnalyticsRenderEvent;
}

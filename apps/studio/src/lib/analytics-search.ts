/**
 * The Analytics screen's URL (RFC-0006 §10.1): `?range=`, `?from=&to=`, `&compare=0`, `&filter=`.
 * Apart from `analytics.ts` because the router validates it: the router is in the entry chunk
 * every Studio page loads, so this file imports nothing beyond the range checks.
 */
import {
  type AnalyticsRangePreset,
  isAnalyticsRangePreset,
  isValidCustomRange,
} from "@cloudhal/ui";
import type { AnalyticsChannel, AnalyticsDevice } from "./api.ts";

/** `/sites/:id/analytics?range=30d` or `?from=2026-09-01&to=2026-10-01`, `&compare=0`, `&filter=…`. */
export interface AnalyticsSearch {
  range?: AnalyticsRangePreset;
  from?: string;
  to?: string;
  /** `0` turns the comparison with the previous period off (on by default). */
  compare?: "0";
  /** One of `node:<id>`, `channel:<channel>`, `country:<ISO2>`, `device:<device>`. */
  filter?: string;
}

/** The default range of the screen and the API (§9.2 implementation notes). */
export const DEFAULT_PRESET: AnalyticsRangePreset = "30d";

const CHANNELS: readonly AnalyticsChannel[] = [
  "direct",
  "internal",
  "search",
  "social",
  "ai",
  "email",
  "paid",
  "referral",
];
const DEVICES: readonly AnalyticsDevice[] = ["desktop", "mobile", "tablet", "bot", "unknown"];
const ID = /^[a-z]+_[A-Za-z0-9]{6,40}$/;

export type AnalyticsFilter =
  | { kind: "node"; value: string }
  | { kind: "channel"; value: AnalyticsChannel }
  | { kind: "country"; value: string }
  | { kind: "device"; value: AnalyticsDevice };

/** Reads a `filter` the API accepts (one of four kinds); anything else is no filter. */
export function parseAnalyticsFilter(raw: unknown): AnalyticsFilter | undefined {
  if (typeof raw !== "string") return undefined;
  const i = raw.indexOf(":");
  if (i < 1) return undefined;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if (kind === "node" && ID.test(value)) return { kind, value };
  if (kind === "channel" && (CHANNELS as readonly string[]).includes(value))
    return { kind, value: value as AnalyticsChannel };
  if (kind === "country" && /^[A-Z][A-Z0-9]$/.test(value)) return { kind, value };
  if (kind === "device" && (DEVICES as readonly string[]).includes(value))
    return { kind, value: value as AnalyticsDevice };
  return undefined;
}

export const filterParam = (f: AnalyticsFilter) => `${f.kind}:${f.value}`;

/** The router's `validateSearch`: keeps only what the screen understands. */
export function validateAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
  const out: AnalyticsSearch = {};
  const { from, to } = search;
  if (typeof from === "string" && typeof to === "string" && isValidCustomRange(from, to)) {
    out.from = from;
    out.to = to;
  } else if (isAnalyticsRangePreset(search.range)) {
    out.range = search.range;
  }
  if (search.compare === "0" || search.compare === 0) out.compare = "0";
  const filter = parseAnalyticsFilter(search.filter);
  if (filter) out.filter = filterParam(filter);
  return out;
}

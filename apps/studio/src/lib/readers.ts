/**
 * The editors' "Readers" card and the overview's "Last 7 days" card (RFC-0006 §10.1–§10.2,
 * DESIGN.md §2v): which state a card is in, the range it asks for, and the shapes the
 * `@cloudhal/ui/charts` blocks take. Pure, so the states are tested without a screen.
 */
import type {
  AnalyticsChannel,
  AnalyticsFeature,
  AnalyticsNodeStats,
  AnalyticsRangeQuery,
  AnalyticsSeries,
  AnalyticsTopRow,
} from "./api.ts";

/** The card's ranges: the header's segmented `Tabs` (7 days | 30 days | All time). */
export const READERS_RANGES = ["7d", "30d", "all"] as const;
export type ReadersRange = (typeof READERS_RANGES)[number];
/** The card opens on the last 30 days, the API's default range. */
export const DEFAULT_READERS_RANGE: ReadersRange = "30d";

/** The longest range the API answers (two years, RFC-0006 §9.2), in days. */
const MAX_DAYS = 731;
const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The query for a range. "All time" starts on the day the node was first published (or created)
 * and is cut to the two years the API answers; it is never compared with a previous period.
 */
export function readersQuery(
  range: ReadersRange,
  since: string | undefined,
  now: Date = new Date(),
): { query: Omit<AnalyticsRangeQuery, "filter">; compare: boolean } {
  if (range !== "all") return { query: { range }, compare: true };
  const today = Date.parse(`${isoDay(now.getTime())}T00:00:00Z`);
  const to = today + DAY_MS;
  const earliest = to - MAX_DAYS * DAY_MS;
  const start = since ? Date.parse(since) : Number.NaN;
  const from = Number.isFinite(start) ? Math.min(Math.max(start, earliest), today) : earliest;
  return { query: { from: isoDay(from), to: isoDay(to) }, compare: false };
}

/**
 * Whether analytics exist for this deployment: `off` when the server does not record them (or
 * is too old to say) — the cards are left out; `unreadable` when visits are recorded but Studio
 * cannot read them yet (`reader: "none"`, A1 fallback); `on` otherwise.
 */
export type AnalyticsAvailability = "off" | "unreadable" | "on";

export function analyticsAvailability(
  feature: AnalyticsFeature | undefined,
): AnalyticsAvailability {
  if (!feature?.enabled || feature.store === "none") return "off";
  if (feature.reader === "none") return "unreadable";
  return "on";
}

/**
 * Stats start with the first publish: an article that was never published has no readers to
 * count. Articles carry `publishedAt`; pages only their status, so an archived page counts as
 * having been published.
 */
export function everPublished(node: { status: string; publishedAt?: string | undefined }): boolean {
  return node.status === "published" || node.status === "archived" || !!node.publishedAt;
}

/** `[day start (UTC ms), page views]` for the bar chart. */
export function seriesPoints(series: AnalyticsSeries | undefined): [number, number][] {
  return (series?.points ?? []).map((p) => [Date.parse(p.t), p.pageviews]);
}

/** Every channel the server classifies, in the order the Analytics screen lists them. */
export const CHANNELS: readonly AnalyticsChannel[] = [
  "search",
  "social",
  "ai",
  "email",
  "paid",
  "referral",
  "internal",
  "direct",
];

const isChannel = (key: string): key is AnalyticsChannel =>
  (CHANNELS as readonly string[]).includes(key);

/**
 * Entrances by channel as `BreakdownMeters` rows (ranked by visits, which is what a channel
 * brings), named in the person's language. Unknown keys from a newer server keep their key.
 */
export function channelRows(
  rows: readonly AnalyticsTopRow[],
  label: (channel: AnalyticsChannel) => string,
): { id: string; label: string; value: number }[] {
  return rows
    .filter((r) => r.key !== "(other)" && r.visits > 0)
    .map((r) => ({ id: r.key, label: isChannel(r.key) ? label(r.key) : r.key, value: r.visits }))
    .sort((a, b) => b.value - a.value);
}

/** Nothing to show: no page view and no old address that brought anyone in the range. */
export function hasNoReaders(stats: AnalyticsNodeStats): boolean {
  return stats.summary.pageviews === 0 && stats.redirectHits === 0;
}

/**
 * The Analytics screen filtered to one node (RFC-0006 §10.2: `/analytics?filter=node:<id>`).
 * Ids are `[a-z]+_[A-Za-z0-9]+`, so they travel unescaped, like the API's own filter.
 */
export function analyticsHref(siteId: string, nodeId?: string): string {
  const base = `/sites/${encodeURIComponent(siteId)}/analytics`;
  return nodeId ? `${base}?filter=node:${encodeURIComponent(nodeId)}` : base;
}

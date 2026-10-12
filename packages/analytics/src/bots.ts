/**
 * The "possible bot traffic" signal (RFC-0006 §5.5 "Visible", §10.1): the visible check against
 * beacon inflation. Anyone can forge page-view beacons for published pages, so Cloudhal cannot
 * prevent inflation, only bound it (rate limits) and **show** it. This module looks for the shape a
 * flood leaves in the aggregates every store already keeps — no new event field, no per-visitor
 * data, no counter of dropped beacons (writing one per refused beacon would hand an attacker the
 * WAE write quota):
 *
 * 1. `hourly_spike` (the gate): the busiest hour of the period's last 7 days has at least
 *    `minPeakPageviews` page views and at least `watchMultiple` times the median hour of those 7
 *    days (RFC: "20 times the 7-day hourly median").
 * 2. `direct_entrances`: at least `directShare` of that hour's entrances are `direct` (no referrer),
 *    out of at least `minEntrances` entrances (RFC: "≥ 80 % direct entrances"). A forged beacon
 *    without a referrer is a direct entrance.
 * 3. `single_browser`: one browser family has at least `browserShare` of that hour's page views
 *    (a script replaying one user agent). Real crowds mix browsers.
 * 4. `single_page`: one page has at least `pageShare` of that hour's page views. Also true of a post
 *    going viral, so on its own it never raises the level.
 *
 * Levels: `likely` when the spike reaches `likelyMultiple` (the RFC's 20×) with mostly direct
 * entrances, or with one browser on one page; `watch` for a spike of at least `watchMultiple` with
 * mostly direct entrances or one browser; `none` otherwise — including a spike that looks organic
 * (referred visitors, mixed browsers), which the Traffic chart shows anyway. The minimum volumes keep
 * small sites quiet: a few dozen extra views never warn.
 *
 * Costs (live reads, budgeted like any other): one hourly series of 7 days, plus three top lists of
 * one hour (channels, pages, browsers) only when the gate passes. Every statement is an existing
 * shape of the query model, so the WAE dialect is the one already verified live.
 */
import { AnalyticsBudgetExceededError } from "./errors.ts";
import {
  type AnalyticsReader,
  type AnalyticsResult,
  addDays,
  isoInstant,
  parseRange,
  type Range,
  type SeriesPoint,
  type TopRow,
} from "./model.ts";

export type BotTrafficLevel = "none" | "watch" | "likely";
export type BotTrafficReasonCode =
  | "hourly_spike"
  | "direct_entrances"
  | "single_browser"
  | "single_page";

export interface BotTrafficReason {
  readonly code: BotTrafficReasonCode;
  /** One plain sentence (English) for agents and logs: numbers, an hour, an id or a browser family. */
  readonly detail: string;
  /** `hourly_spike`: times the median hour; the others: a share (0–1, three decimals). */
  readonly value: number;
  /** The threshold `value` was compared with. */
  readonly threshold: number;
  /** `single_page`: the node id; `single_browser`: the browser family. */
  readonly key?: string;
}

export interface BotTrafficSignal {
  readonly level: BotTrafficLevel;
  /** What raised the level; empty for `none`. */
  readonly reasons: readonly BotTrafficReason[];
  /** The busiest hour checked (bucket start, UTC); `null` when the hours checked had no page views. */
  readonly hour: string | null;
  /** Page views in that hour. */
  readonly pageviews: number;
  /** The median hour of the 7 days checked (the busiest hour left out). */
  readonly baseline: number;
  /** The hours checked: the last 7 days of the period, never past the current hour. */
  readonly window: Range | null;
  /** Part of the hours could not be read (live budget spent, no live reader): `none` may be wrong. */
  readonly partial?: true;
}

export interface BotTrafficThresholds {
  readonly windowDays: number;
  readonly minPeakPageviews: number;
  readonly watchMultiple: number;
  readonly likelyMultiple: number;
  readonly directShare: number;
  readonly minEntrances: number;
  readonly browserShare: number;
  readonly pageShare: number;
}

/** Conservative defaults; the RFC fixes 20× and 80 %, the rest is documented in its notes. */
export const BOT_TRAFFIC_THRESHOLDS: BotTrafficThresholds = {
  windowDays: 7,
  minPeakPageviews: 200,
  watchMultiple: 10,
  likelyMultiple: 20,
  directShare: 0.8,
  minEntrances: 50,
  browserShare: 0.95,
  pageShare: 0.9,
};

export const NO_BOT_TRAFFIC: BotTrafficSignal = {
  level: "none",
  reasons: [],
  hour: null,
  pageviews: 0,
  baseline: 0,
  window: null,
};

const HOUR_MS = 3_600_000;

/** Times the median hour (one decimal); a median below 1 counts as 1. */
export function spikeMultiple(pageviews: number, baseline: number): number {
  return Math.round((pageviews / Math.max(baseline, 1)) * 10) / 10;
}

const share = (part: number, whole: number) =>
  whole > 0 ? Math.round(Math.min(1, part / whole) * 1000) / 1000 : 0;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** The busiest hour at or after `from` (the earliest on a tie) and the median of every other hour. */
export function findPeakHour(
  points: readonly SeriesPoint[],
  from: Date,
): { peak: SeriesPoint; baseline: number } | null {
  let peak: SeriesPoint | undefined;
  for (const p of points)
    if (new Date(p.t).getTime() >= from.getTime() && (!peak || p.pageviews > peak.pageviews))
      peak = p;
  if (!peak || peak.pageviews <= 0) return null;
  const others = points.filter((p) => p !== peak).map((p) => p.pageviews);
  return { peak, baseline: median(others) };
}

/** What the busiest hour looked like (the top lists of that one hour). */
export interface PeakHourEvidence {
  readonly hour: string;
  readonly pageviews: number;
  readonly baseline: number;
  /** Entrances in the hour (all channels) and those without a referrer. */
  readonly visits: number;
  readonly directVisits: number;
  readonly topBrowser?: TopRow | undefined;
  readonly topNode?: TopRow | undefined;
}

/** The level and its reasons from the busiest hour (pure; the thresholds are explicit). */
export function classifyBotTraffic(
  e: PeakHourEvidence,
  t: BotTrafficThresholds = BOT_TRAFFIC_THRESHOLDS,
): Pick<BotTrafficSignal, "level" | "reasons"> {
  const multiple = spikeMultiple(e.pageviews, e.baseline);
  if (e.pageviews < t.minPeakPageviews || multiple < t.watchMultiple)
    return { level: "none", reasons: [] };
  const spike: BotTrafficReason = {
    code: "hourly_spike",
    detail: `${e.pageviews} page views in the hour from ${e.hour}, ${multiple} times the median hour of the last ${t.windowDays} days (${e.baseline})`,
    value: multiple,
    threshold: t.watchMultiple,
  };
  const directShare = share(e.directVisits, e.visits);
  const direct = e.visits >= t.minEntrances && directShare >= t.directShare;
  const browserShare = share(e.topBrowser?.pageviews ?? 0, e.pageviews);
  const browser = !!e.topBrowser && browserShare >= t.browserShare;
  const pageShare = share(e.topNode?.pageviews ?? 0, e.pageviews);
  const page = !!e.topNode && pageShare >= t.pageShare;

  const likely = multiple >= t.likelyMultiple && (direct || (browser && page));
  if (!likely && !direct && !browser) return { level: "none", reasons: [] };
  const reasons: BotTrafficReason[] = [spike];
  if (direct)
    reasons.push({
      code: "direct_entrances",
      detail: `${pct(directShare)} of the hour's ${e.visits} entrances came without a referrer`,
      value: directShare,
      threshold: t.directShare,
    });
  if (browser && e.topBrowser)
    reasons.push({
      code: "single_browser",
      detail: `${pct(browserShare)} of the hour's page views came from one browser family (${e.topBrowser.key})`,
      value: browserShare,
      threshold: t.browserShare,
      key: e.topBrowser.key,
    });
  if (page && e.topNode)
    reasons.push({
      code: "single_page",
      detail: `${pct(pageShare)} of the hour's page views were of one page (${e.topNode.key})`,
      value: pageShare,
      threshold: t.pageShare,
      key: e.topNode.key,
    });
  return { level: likely ? "likely" : "watch", reasons };
}

export interface AssessBotTrafficInput {
  readonly siteId: string;
  /** The period on screen; its last `windowDays` days are checked. */
  readonly range: Range;
  readonly now: Date;
  readonly thresholds?: BotTrafficThresholds;
}

/**
 * Runs the check through any reader (a raw store, or the composite read path): the hourly series
 * of the window, then — only when the gate passes — the busiest hour's channels, browsers and
 * pages. Returns the signal and every result read (for `source`/`estimated`/`partial`). A spent
 * live budget gives `none` with `partial`; other errors propagate.
 */
export async function assessBotTraffic(
  reader: AnalyticsReader,
  input: AssessBotTrafficInput,
): Promise<{ signal: BotTrafficSignal; results: AnalyticsResult[] }> {
  const t = input.thresholds ?? BOT_TRAFFIC_THRESHOLDS;
  const r = parseRange(input.range, Number.MAX_SAFE_INTEGER);
  const ceilHour = (d: Date) => new Date(Math.ceil(d.getTime() / HOUR_MS) * HOUR_MS);
  const end = new Date(Math.min(ceilHour(r.to).getTime(), ceilHour(input.now).getTime()));
  const checkFrom = new Date(Math.floor(r.from.getTime() / HOUR_MS) * HOUR_MS);
  if (end.getTime() <= checkFrom.getTime()) return { signal: NO_BOT_TRAFFIC, results: [] };
  const from = addDays(end, -t.windowDays);
  const window: Range = { from: isoInstant(from), to: isoInstant(end) };
  const { siteId } = input;
  const results: AnalyticsResult[] = [];
  const quiet = (partial: boolean): BotTrafficSignal => ({
    ...NO_BOT_TRAFFIC,
    window,
    ...(partial ? { partial: true as const } : {}),
  });
  try {
    const series = await reader.query({ kind: "series", siteId, range: window, interval: "hour" });
    results.push(series);
    const partial = series.partial === true;
    const found = findPeakHour(
      series.data.points,
      checkFrom.getTime() > from.getTime() ? checkFrom : from,
    );
    if (!found) return { signal: quiet(partial), results };
    const { peak, baseline } = found;
    const base: BotTrafficSignal = {
      level: "none",
      reasons: [],
      hour: peak.t,
      pageviews: peak.pageviews,
      baseline,
      window,
      ...(partial ? { partial: true as const } : {}),
    };
    if (
      peak.pageviews < t.minPeakPageviews ||
      spikeMultiple(peak.pageviews, baseline) < t.watchMultiple
    )
      return { signal: base, results };
    const hour: Range = {
      from: peak.t,
      to: isoInstant(new Date(new Date(peak.t).getTime() + HOUR_MS)),
    };
    const [channels, browsers, nodes] = await Promise.all([
      reader.query({ kind: "top", siteId, range: hour, dimension: "channel", limit: 10 }),
      reader.query({ kind: "top", siteId, range: hour, dimension: "browser", limit: 1 }),
      reader.query({ kind: "top", siteId, range: hour, dimension: "node", limit: 1 }),
    ]);
    results.push(channels, browsers, nodes);
    const rows = channels.data.rows;
    const verdict = classifyBotTraffic(
      {
        hour: peak.t,
        pageviews: peak.pageviews,
        baseline,
        visits: rows.reduce((n, row) => n + row.visits, 0),
        directVisits: rows.find((row) => row.key === "direct")?.visits ?? 0,
        topBrowser: browsers.data.rows[0],
        topNode: nodes.data.rows[0],
      },
      t,
    );
    const anyPartial = results.some((x) => x.partial === true);
    return {
      signal: { ...base, ...verdict, ...(anyPartial ? { partial: true as const } : {}) },
      results,
    };
  } catch (error) {
    if (error instanceof AnalyticsBudgetExceededError) return { signal: quiet(true), results };
    throw error;
  }
}

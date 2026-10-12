/**
 * Analytics reports shared by the REST routes (`packages/api/src/routes/analytics.ts`) and the MCP
 * tools (`analytics-tools.ts`), RFC-0006 §9: queries of the model through `AnalyticsService`, joined
 * to the **current** graph by node id (a renamed article shows its new title and path; a deleted
 * one reads as gone). Every string returned is graph data, an enum, a hostname, a UTM token or —
 * for render reports only — a percent-encoded requested path (§5.5, invariant A9).
 */
import type {
  AnalyticsResult,
  AnalyticsSource,
  Dimension,
  Filter,
  Range,
  RenderErrorRow,
  RenderRedirectRow,
  SummaryData,
  TopRow,
  VitalsData,
} from "@cloudhal/analytics";
import { ID_RE, parseRange, privacySignalShare } from "@cloudhal/analytics";
import { type AnalyticsService, previousRange } from "@cloudhal/analytics/service";
import { entryPath } from "@cloudhal/astro-renderer/routing";
import { archivePath } from "@cloudhal/astro-renderer/taxonomy";
import type { ContentEntry, Page, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { type SiteGraphStore, termName } from "@cloudhal/core-ts";

export type AnalyticsNodeKind = "page" | "entry" | "archive";

/** A node of analytics rows as the current graph knows it. */
export interface AnalyticsNode {
  readonly nodeId: string;
  /** From the id's prefix; `null` for an id of another kind. */
  readonly kind: AnalyticsNodeKind | null;
  /** `false`: the node no longer exists (its history stays under its id). */
  readonly exists: boolean;
  readonly title: string | null;
  /** Its current path (archives: the term's archive page). */
  readonly path: string | null;
  /** Publish status (pages, entries) or term status. */
  readonly status: string | null;
}

/** Where a combined answer came from (the REST envelope's `source`, `estimated`, `partial`). */
export interface AnalyticsMeta {
  readonly source: AnalyticsSource;
  readonly estimated: boolean;
  readonly partial?: boolean;
}

export function combineMeta(results: readonly AnalyticsResult[]): AnalyticsMeta {
  const sources = new Set(results.map((r) => r.source));
  const source: AnalyticsSource =
    sources.size === 1
      ? ([...sources][0] as AnalyticsSource)
      : sources.size === 0
        ? "live"
        : "mixed";
  const partial = results.some((r) => r.partial === true);
  return {
    source,
    estimated: results.some((r) => r.estimated),
    ...(partial ? { partial: true } : {}),
  };
}

const KIND_BY_PREFIX: Readonly<Record<string, AnalyticsNodeKind>> = {
  page: "page",
  entry: "entry",
  term: "archive",
};

export function nodeKindOf(id: string): AnalyticsNodeKind | null {
  return KIND_BY_PREFIX[id.slice(0, id.indexOf("_"))] ?? null;
}

/** Individual reads up to this many entries; beyond it one list read (D1 caps queries per call). */
const ENTRY_GETS = 20;

/** The current graph's view of analytics node ids, in a bounded number of reads. */
export async function analyticsNodes(
  store: SiteGraphStore,
  site: Site,
  ids: readonly string[],
): Promise<Map<string, AnalyticsNode>> {
  const unique = [...new Set(ids)].filter((id) => ID_RE.test(id));
  const byKind = (k: AnalyticsNodeKind) => unique.filter((id) => nodeKindOf(id) === k);
  const out = new Map<string, AnalyticsNode>();
  const gone = (nodeId: string): AnalyticsNode => ({
    nodeId,
    kind: nodeKindOf(nodeId),
    exists: false,
    title: null,
    path: null,
    status: null,
  });

  const pageIds = byKind("page");
  if (pageIds.length > 0) {
    const pages = new Map<string, Page>((await store.listPages(site.id)).map((p) => [p.id, p]));
    for (const id of pageIds) {
      const p = pages.get(id);
      out.set(
        id,
        p
          ? {
              nodeId: id,
              kind: "page",
              exists: true,
              title: p.title,
              path: p.path,
              status: p.status,
            }
          : gone(id),
      );
    }
  }

  const entryIds = byKind("entry");
  if (entryIds.length > 0) {
    let entries: Map<string, ContentEntry>;
    if (entryIds.length <= ENTRY_GETS) {
      const found = await Promise.all(entryIds.map((id) => store.getContentEntry(id)));
      entries = new Map(
        found.filter((e): e is ContentEntry => e?.siteId === site.id).map((e) => [e.id, e]),
      );
    } else {
      const wanted = new Set(entryIds);
      entries = new Map(
        (await store.listContentEntries(site.id))
          .filter((e) => wanted.has(e.id))
          .map((e) => [e.id, e]),
      );
    }
    for (const id of entryIds) {
      const e = entries.get(id);
      out.set(
        id,
        e
          ? {
              nodeId: id,
              kind: "entry",
              exists: true,
              title: e.title,
              path: entryPath(e),
              status: e.status,
            }
          : gone(id),
      );
    }
  }

  const termIds = byKind("archive");
  if (termIds.length > 0) {
    const [terms, taxonomies] = await Promise.all([
      store.listTerms(site.id),
      store.listTaxonomies(site.id),
    ]);
    const termById = new Map<string, Term>(terms.map((t) => [t.id, t]));
    const taxById = new Map<string, Taxonomy>(taxonomies.map((t) => [t.id, t]));
    for (const id of termIds) {
      const t = termById.get(id);
      const tax = t ? taxById.get(t.taxonomyId) : undefined;
      out.set(
        id,
        t
          ? {
              nodeId: id,
              kind: "archive",
              exists: true,
              title: termName(t, site.defaultLocale),
              path: tax?.archive.enabled ? archivePath(tax, t.slug) : null,
              status: t.status,
            }
          : gone(id),
      );
    }
  }

  for (const id of ids) if (!out.has(id)) out.set(id, gone(id));
  return out;
}

// ───────────────────────────── summary ─────────────────────────────

export interface SummaryReport extends SummaryData {
  /** Page views per visit; `null` without visits. */
  readonly viewsPerVisit: number | null;
  /**
   * **Estimated** cache-hit ratio, `1 − renders ÷ page views` (RFC-0006 §5.4), 0–1: only on
   * Cloudflare (`store: "wae"`), `null` without page views or a render count. Page views come from
   * the script (no-JS visitors are missed) and only a zone sees real cache statistics.
   */
  readonly cacheHitRatio: number | null;
  /**
   * Share of page views whose request carried GPC or DNT (0–1): counted but never hashed, so
   * unique visitors are a lower bound. `null` when unknown or without page views.
   */
  readonly privacySignalShare: number | null;
  /** The period of the same length just before, when asked for. */
  readonly previous?: SummaryData & { readonly range: Range };
  /** Relative change against `previous` (0.12 = +12 %); `null` where the previous value was 0. */
  readonly change?: {
    readonly pageviews: number | null;
    readonly visits: number | null;
    readonly visitors: number | null;
  };
}

const ratio = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0
    ? null
    : Math.round(((cur - prev) / prev) * 1000) / 1000;

export async function summaryReport(
  analytics: AnalyticsService,
  siteId: string,
  range: Range,
  options: { filter?: Filter | undefined; compare?: boolean | undefined } = {},
): Promise<{ data: SummaryReport; results: AnalyticsResult[] }> {
  const filter = options.filter ? { filter: options.filter } : {};
  const current = await analytics.query({ kind: "summary", siteId, range, ...filter });
  const cur = current.data;
  const base: SummaryReport = {
    ...cur,
    viewsPerVisit: cur.visits > 0 ? Math.round((cur.pageviews / cur.visits) * 100) / 100 : null,
    cacheHitRatio: analytics.cacheHitRatio(cur),
    privacySignalShare: privacySignalShare(cur),
  };
  if (!options.compare) return { data: base, results: [current] };
  const prevRange = previousRange(range);
  const previous = await analytics.query({ kind: "summary", siteId, range: prevRange, ...filter });
  const prev = previous.data;
  return {
    data: {
      ...base,
      previous: { ...prev, range: prevRange },
      change: {
        pageviews: ratio(cur.pageviews, prev.pageviews),
        visits: ratio(cur.visits, prev.visits),
        visitors: ratio(cur.visitors, prev.visitors),
      },
    },
    results: [current, previous],
  };
}

// ───────────────────────────── top lists ─────────────────────────────

export interface TopContentRow extends AnalyticsNode {
  readonly pageviews: number;
  readonly visits: number;
  /** Relative change of page views against the previous period, when asked for. */
  readonly change?: number | null;
}

/** Top content joined to the graph. `kind` and `channel` narrow it; `compare` adds the change. */
export async function topContentReport(
  analytics: AnalyticsService,
  store: SiteGraphStore,
  site: Site,
  range: Range,
  options: {
    limit: number;
    kind?: AnalyticsNodeKind | undefined;
    filter?: Filter | undefined;
    compare?: boolean | undefined;
  },
): Promise<{ rows: TopContentRow[]; results: AnalyticsResult[] }> {
  // A kind filter is applied after the join, so ask for more rows than shown.
  const ask = options.kind ? Math.min(100, options.limit * 4) : options.limit;
  const filter = options.filter ? { filter: options.filter } : {};
  const top = await analytics.query({
    kind: "top",
    siteId: site.id,
    range,
    dimension: "node",
    limit: ask,
    ...filter,
  });
  const results: AnalyticsResult[] = [top];
  let rows = top.data.rows.filter((r) => !options.kind || nodeKindOf(r.key) === options.kind);
  rows = rows.slice(0, options.limit);
  let before: Map<string, number> | undefined;
  if (options.compare && rows.length > 0) {
    const prev = await analytics.query({
      kind: "top",
      siteId: site.id,
      range: previousRange(range),
      dimension: "node",
      limit: Math.min(1000, ask * 4),
      ...filter,
    });
    results.push(prev);
    before = new Map(prev.data.rows.map((r) => [r.key, r.pageviews]));
  }
  const nodes = await analyticsNodes(
    store,
    site,
    rows.map((r) => r.key),
  );
  return {
    rows: rows.map((r) => ({
      ...(nodes.get(r.key) as AnalyticsNode),
      pageviews: r.pageviews,
      visits: r.visits,
      ...(before ? { change: ratio(r.pageviews, before.get(r.key) ?? 0) } : {}),
    })),
    results,
  };
}

/** A plain top list (no join): channels, referrers, countries, devices, … */
export async function topList(
  analytics: AnalyticsService,
  siteId: string,
  range: Range,
  dimension: Dimension,
  limit: number,
  filter?: Filter,
): Promise<AnalyticsResult & { data: { rows: readonly TopRow[] } }> {
  return analytics.query({
    kind: "top",
    siteId,
    range,
    dimension,
    limit,
    ...(filter ? { filter } : {}),
  });
}

// ───────────────────────────── one node ─────────────────────────────

export interface OldPath {
  /** The earlier path a slug change (or merge, retirement) left behind. */
  readonly from: string;
  readonly to: string;
  readonly status: number;
  readonly reason: string;
  /** Redirect hits on it in the range. */
  readonly hits: number;
}

export interface NodeReport {
  readonly node: AnalyticsNode;
  readonly summary: SummaryReport;
  readonly series: {
    interval: "hour" | "day";
    points: readonly { t: string; pageviews: number; visits: number }[];
  };
  /** Entrances (visits) and page views by channel. */
  readonly channels: readonly TopRow[];
  readonly referrers: readonly TopRow[];
  readonly countries: readonly TopRow[];
  readonly devices: readonly TopRow[];
  readonly vitals: VitalsData;
  /** Slug history: earlier paths of this node and the redirects they left, with hits. */
  readonly oldPaths: readonly OldPath[];
  /** Redirect hits that brought readers here in the range ("old addresses still bring readers"). */
  readonly redirectHits: number;
}

/** Hourly buckets for ranges of at most two days, daily otherwise (§10.1). */
export function seriesInterval(range: Range): "hour" | "day" {
  const r = parseRange(range, 731);
  return r.to.getTime() - r.from.getTime() <= 2 * 86_400_000 ? "hour" : "day";
}

export async function nodeReport(
  analytics: AnalyticsService,
  store: SiteGraphStore,
  site: Site,
  nodeId: string,
  range: Range,
  options: { compare?: boolean | undefined } = {},
): Promise<{ data: NodeReport; meta: AnalyticsMeta }> {
  const filter: Filter = { node: nodeId };
  const interval = seriesInterval(range);
  const [nodes, summary, series, channels, referrers, countries, devices, vitals, redirects] =
    await Promise.all([
      analyticsNodes(store, site, [nodeId]),
      summaryReport(analytics, site.id, range, { filter, compare: options.compare }),
      analytics.query({ kind: "series", siteId: site.id, range, interval, filter }),
      topList(analytics, site.id, range, "channel", 10, filter),
      topList(analytics, site.id, range, "refHost", 10, filter),
      topList(analytics, site.id, range, "country", 10, filter),
      topList(analytics, site.id, range, "device", 10, filter),
      analytics.query({ kind: "vitals", siteId: site.id, range, filter }),
      analytics.query({
        kind: "renders",
        siteId: site.id,
        range,
        statuses: "redirects",
        limit: 1000,
      }),
    ]);
  const redirectRows = redirects.data.rows as readonly RenderRedirectRow[];
  const history = (await store.listRedirects(site.id)).filter((r) => r.source?.id === nodeId);
  const hitsFrom = (path: string) =>
    redirectRows.filter((r) => r.path === path).reduce((n, r) => n + r.hits, 0);
  const oldPaths = history.map((r) => ({
    from: r.from,
    to: r.to,
    status: r.status,
    reason: r.reason,
    hits: hitsFrom(r.from),
  }));
  const froms = new Set(history.map((r) => r.from));
  const redirectHits = redirectRows
    .filter((r) => r.nodeId === nodeId || froms.has(r.path))
    .reduce((n, r) => n + r.hits, 0);
  return {
    data: {
      node: nodes.get(nodeId) as AnalyticsNode,
      summary: summary.data,
      series: series.data,
      channels: channels.data.rows,
      referrers: referrers.data.rows,
      countries: countries.data.rows,
      devices: devices.data.rows,
      vitals: vitals.data,
      oldPaths,
      redirectHits,
    },
    meta: combineMeta([
      ...summary.results,
      series,
      channels,
      referrers,
      countries,
      devices,
      vitals,
      redirects,
    ]),
  };
}

// ───────────────────────────── broken links ─────────────────────────────

export interface BrokenLink {
  /** Requested path as received: percent-encoded ASCII ≤ 256 characters, visitor-controlled. */
  readonly path: string;
  readonly status: number;
  readonly hits: number;
  /** Same-site pages that linked here (published paths). */
  readonly linkedFrom: readonly string[];
  readonly lastSeen: string | null;
  /** A redirect that now answers this path, or a published node with a similar slug. */
  readonly suggestedTarget: {
    path: string;
    nodeId?: string;
    reason: "redirect" | "similar";
  } | null;
}

function lastSegment(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    // keep it encoded
  }
  const parts = p
    .toLowerCase()
    .replace(/[?#].*$/, "")
    .split("/")
    .filter(Boolean);
  return parts.at(-1) ?? "";
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] as number;
}

/** 404 and 410 paths with hits, the pages linking to them, and a suggested target. */
export async function brokenLinksReport(
  analytics: AnalyticsService,
  store: SiteGraphStore,
  site: Site,
  range: Range,
  limit: number,
): Promise<{ rows: BrokenLink[]; meta: AnalyticsMeta }> {
  const errors = await analytics.query({
    kind: "renders",
    siteId: site.id,
    range,
    statuses: "errors",
    limit: 1000,
  });
  const groups = new Map<
    string,
    {
      path: string;
      status: number;
      hits: number;
      refs: Map<string, number>;
      lastSeen: string | null;
    }
  >();
  for (const r of errors.data.rows as readonly RenderErrorRow[]) {
    if (r.status !== 404 && r.status !== 410) continue;
    const key = `${r.status} ${r.path}`;
    const g = groups.get(key) ?? {
      path: r.path,
      status: r.status,
      hits: 0,
      refs: new Map<string, number>(),
      lastSeen: null,
    };
    g.hits += r.hits;
    if (r.refPath) g.refs.set(r.refPath, (g.refs.get(r.refPath) ?? 0) + r.hits);
    if (r.lastSeen && (!g.lastSeen || r.lastSeen > g.lastSeen)) g.lastSeen = r.lastSeen;
    groups.set(key, g);
  }
  const top = [...groups.values()]
    .sort((a, b) => b.hits - a.hits || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, limit);

  // Candidates for "similar slug": published pages and entries (two reads).
  let candidates: { path: string; nodeId: string; segment: string }[] | undefined;
  const loadCandidates = async () => {
    if (candidates) return candidates;
    const [pages, entries] = await Promise.all([
      store.listPages(site.id),
      store.listContentEntries(site.id, { status: ["published"] }),
    ]);
    candidates = [
      ...pages
        .filter((p) => p.status === "published")
        .map((p) => ({ path: p.path, nodeId: p.id, segment: lastSegment(p.path) })),
      ...entries.map((e) => ({ path: entryPath(e), nodeId: e.id, segment: e.slug })),
    ];
    return candidates;
  };

  const rows: BrokenLink[] = [];
  for (const g of top) {
    let suggestedTarget: BrokenLink["suggestedTarget"] = null;
    let decoded: string | undefined;
    try {
      decoded = decodeURIComponent(g.path).toLowerCase();
    } catch {
      decoded = undefined;
    }
    const match = decoded
      ? await store.redirectFor(site.id, decoded).catch(() => undefined)
      : undefined;
    if (match) suggestedTarget = { path: match.location, reason: "redirect" };
    else {
      const seg = lastSegment(g.path);
      if (seg.length >= 3) {
        let best: { path: string; nodeId: string; d: number } | undefined;
        for (const c of await loadCandidates()) {
          if (!c.segment) continue;
          const d =
            c.segment === seg
              ? 0
              : c.segment.includes(seg) || seg.includes(c.segment)
                ? 1
                : editDistance(seg, c.segment, 3);
          if (d <= 3 && (!best || d < best.d)) best = { path: c.path, nodeId: c.nodeId, d };
        }
        if (best) suggestedTarget = { path: best.path, nodeId: best.nodeId, reason: "similar" };
      }
    }
    rows.push({
      path: g.path,
      status: g.status,
      hits: g.hits,
      linkedFrom: [...g.refs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([p]) => p),
      lastSeen: g.lastSeen,
      suggestedTarget,
    });
  }
  return { rows, meta: combineMeta([errors]) };
}

/**
 * The built-in deterministic automations (RFC-0008 §11.1, rollout step 9): `broken-links`,
 * `stale-content`, `feed-check`, `weekly-digest` and `cleanup`, as the `BuiltinRunner` that
 * `runDue` steps.
 *
 * Every job runs in **bounded, resumable steps**: one step per tick, a fixed number of statements
 * (`BUILTIN_STEP_COST`, checked by `runDue` against the tick's budget before it starts, S17), a page
 * of nodes at most, and a JSON `position` the scheduler keeps in `automations.cursor`, so a large
 * site's sweep spans several ticks and survives a crash between them (the next tick continues the
 * same run from the position). Findings accumulate in the position up to 200 per run; counts stay
 * exact.
 *
 * What a job reads comes through `BuiltinSources` (the live snapshot, analytics' 404 rows, the
 * fetched feed): `@cloudhal/core-ts/automations` implements it over the graph's tables; tests pass
 * fakes. Built-ins run as the system actor and change no content (§11.1): their only writes are
 * the run row, the cursor and, for `cleanup`, the deletion of old schedule rows.
 *
 * Taint (§11.4, D10): a step that reads visitor-supplied text (analytics' 404 paths) or a fetched
 * document (the feed check) returns `taint`, and the run records `{ at, tool }`.
 */
import type { Automation, BuiltinAutomationJob } from "@cloudhal/core-contracts";
import {
  checkRss,
  checkSitemap,
  FEED_NEWEST,
  FEED_PATHS,
  type FeedDocumentKind,
  type FeedExpectations,
  type FetchedDocument,
} from "./feed-check.ts";
import {
  addFindings,
  type BuiltinFinding,
  bump,
  DEFAULT_STALE_AFTER_DAYS,
  DIGEST_ITEMS,
  type DigestFinding,
  digestSummary,
  type LinkFinding,
  MAX_FINDINGS_PER_RUN,
  type NotFoundFinding,
  STALE_DRAFT_DAYS,
  type StaleDraftFinding,
  type StaleEntryFinding,
  type WeeklyDigest,
} from "./findings.ts";
import { canonicalInstant, DAY_MS, instantMs } from "./instant.ts";
import type { ScheduleNotification } from "./notify.ts";
import type { BuiltinRunner, BuiltinStepResult } from "./scheduler.ts";

export type BuiltinJobName = BuiltinAutomationJob["builtin"];

/**
 * Statements one step of each job may take (the sources' reads and writes), declared up front for
 * the tick's budget check. The core-ts conformance suite measures every step against them on
 * SQLite and D1; the Workers Free tick (40) keeps the claim, the finish, the overview and the
 * heartbeat beside the largest step with room to spare.
 */
export const BUILTIN_STEP_COST: Readonly<Record<BuiltinJobName, number>> = {
  "broken-links": 6,
  "stale-content": 3,
  "feed-check": 4,
  "weekly-digest": 6,
  cleanup: 10,
};

/** Live nodes one `broken-links` step scans (§11.1: at most 200 nodes per tick on Free). */
export const LINK_PAGE_SIZE = 50;
/** Entries one `stale-content` step looks at (only route fields are read, not bodies). */
export const STALE_PAGE_SIZE = 200;
/** 404 rows the sweep asks analytics for. */
export const NOT_FOUND_LIMIT = 20;
/** Rows `cleanup` deletes per table and step. */
export const CLEANUP_LIMIT = 200;

// ───────────────────────────── what the jobs read ─────────────────────────────

export interface LinkScanPage {
  /** Live nodes scanned in this page. */
  readonly scanned: number;
  /** References checked. */
  readonly links: number;
  readonly findings: readonly LinkFinding[];
  /** Resume after this node id; undefined when the snapshot is done. */
  readonly next?: string;
}

export type NotFoundRow = Omit<NotFoundFinding, "code" | "severity" | "untrusted">;

export interface StalePage {
  readonly scanned: number;
  readonly stale: readonly StaleEntryFinding[];
  readonly next?: string;
}

export interface CleanupStep {
  /** `runs-deleted`, `releases-deleted`, `findings-trimmed`, `leases-cleared`, `stale-runs-closed`. */
  readonly counts: Readonly<Record<string, number>>;
  /** Something hit its per-step limit: another step follows. */
  readonly more: boolean;
}

/**
 * Where the built-in jobs read from. Each method's statements count against the step's
 * `BUILTIN_STEP_COST`; `undefined` from a snapshot read means the site has never been published.
 */
export interface BuiltinSources {
  /** A page of live pages, entries, terms and menus after `after`, with their references checked. */
  scanLinks(input: {
    siteId: string;
    after?: string;
    limit: number;
    now: Date;
  }): Promise<LinkScanPage | undefined>;
  /** The top 404 paths of the last week from analytics; undefined when analytics is off. */
  notFoundPaths?(input: {
    siteId: string;
    now: Date;
    limit: number;
  }): Promise<readonly NotFoundRow[] | undefined>;
  /** Live, published entries updated before `cutoff`, a page after `after`. */
  staleEntries(input: {
    siteId: string;
    cutoff: string;
    after?: string;
    limit: number;
    now: Date;
  }): Promise<StalePage | undefined>;
  /** What the feed and sitemap must and must not contain at `now`. */
  feedExpectations(input: {
    siteId: string;
    now: Date;
    newest: number;
  }): Promise<FeedExpectations | undefined>;
  /** Fetches the site's own document (`SITE` binding, local renderer); undefined: none reachable. */
  fetchDocument?(input: { siteId: string; path: string }): Promise<FetchedDocument | undefined>;
  /** The weekly digest's data (§11.1). */
  digest(input: { siteId: string; automationId: string; now: Date }): Promise<WeeklyDigest>;
  /** One bounded retention step (`schedules` tables of the site). */
  cleanup(input: { siteId: string; now: Date; limit: number }): Promise<CleanupStep>;
  /** Drafts untouched for `days` (reminders, at most `limit`). */
  staleDrafts(input: {
    siteId: string;
    now: Date;
    days: number;
    limit: number;
  }): Promise<{ readonly count: number; readonly drafts: readonly StaleDraftFinding[] }>;
}

// ───────────────────────────── the runner ─────────────────────────────

export interface BuiltinRunnerOptions {
  readonly linkPageSize?: number;
  readonly stalePageSize?: number;
}

/** The state a job keeps between steps (in `automations.cursor`). */
interface Progress {
  phase: string;
  after?: string;
  findings: BuiltinFinding[];
  counts: Record<string, number>;
}

const fresh = (phase: string): Progress => ({ phase, findings: [], counts: {} });

function progressOf(position: unknown, first: string): Progress {
  if (position && typeof position === "object" && "phase" in position) {
    const p = position as Partial<Progress>;
    return {
      phase: String(p.phase),
      ...(typeof p.after === "string" ? { after: p.after } : {}),
      findings: Array.isArray(p.findings) ? (p.findings as BuiltinFinding[]) : [],
      counts: p.counts && typeof p.counts === "object" ? { ...p.counts } : {},
    };
  }
  return fresh(first);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The notification of a finished run with findings (§14), for its owner. */
function findingsNotice(
  a: Automation,
  run: string,
  now: Date,
  kind: ScheduleNotification["kind"],
  summary: string,
  counts: Record<string, number>,
  extra: Partial<ScheduleNotification> = {},
): ScheduleNotification {
  return {
    id: `${kind}:${run}`,
    kind,
    siteId: a.siteId,
    automationId: a.id,
    automationName: a.name,
    runId: run,
    recipients: [a.owner.id],
    at: canonicalInstant(now),
    summary,
    counts,
    ...extra,
  };
}

/** Ends a run that found the site unpublished. */
const unpublished = (): BuiltinStepResult => ({
  done: true,
  outcome: "nothing-to-do",
  summary: "The site has not been published yet; there is nothing live to check.",
});

/** A step that continues from `progress`. */
const more = (p: Progress, extra: Partial<BuiltinStepResult> = {}): BuiltinStepResult => ({
  done: false,
  position: p,
  ...extra,
});

/**
 * The five built-in jobs as one `BuiltinRunner` (`cost` is the largest step; `costOf` the job's).
 * Steps throw only for source errors, which `runDue` records as a failed run.
 */
export function createBuiltinRunner(
  sources: BuiltinSources,
  options: BuiltinRunnerOptions = {},
): BuiltinRunner & { costOf(job: BuiltinAutomationJob): number } {
  const linkPage = options.linkPageSize ?? LINK_PAGE_SIZE;
  const stalePage = options.stalePageSize ?? STALE_PAGE_SIZE;

  async function brokenLinks(
    a: Automation,
    run: string,
    position: unknown,
    now: Date,
  ): Promise<BuiltinStepResult> {
    const p = progressOf(position, "links");
    if (p.phase === "links") {
      const page = await sources.scanLinks({
        siteId: a.siteId,
        ...(p.after ? { after: p.after } : {}),
        limit: linkPage,
        now,
      });
      if (!page) return unpublished();
      bump(p.counts, "nodes-scanned", page.scanned);
      bump(p.counts, "links-checked", page.links);
      for (const f of page.findings) bump(p.counts, f.code);
      addFindings(p.findings, page.findings);
      if (page.next) return more({ ...p, after: page.next });
      if (sources.notFoundPaths) {
        const { after: _done, ...rest } = p;
        return more({ ...rest, phase: "not-found" });
      }
      return finishLinks(a, run, p, now);
    }
    // The 404 paths are visitor-supplied: reading them taints the run (§11.4, `broken_links`).
    const rows = await sources.notFoundPaths?.({ siteId: a.siteId, now, limit: NOT_FOUND_LIMIT });
    const taint = rows ? { at: canonicalInstant(now), tool: "broken_links" } : undefined;
    const found: NotFoundFinding[] = (rows ?? []).map((r) => ({
      code: "not-found-path",
      severity: r.hits >= 10 ? "warning" : "info",
      ...r,
      untrusted: true,
    }));
    bump(p.counts, "not-found-path", found.length);
    addFindings(p.findings, found);
    return { ...finishLinks(a, run, p, now), ...(taint ? { taint } : {}) };
  }

  function finishLinks(a: Automation, run: string, p: Progress, now: Date): BuiltinStepResult {
    const broken =
      (p.counts["broken-internal-link"] ?? 0) +
      (p.counts["broken-media-reference"] ?? 0) +
      (p.counts["broken-menu-target"] ?? 0);
    const gated = p.counts["link-to-gated-content"] ?? 0;
    const notFound = p.counts["not-found-path"] ?? 0;
    const counts = { ...p.counts, "broken-links": broken };
    const summary = `Checked ${plural(p.counts["links-checked"] ?? 0, "reference")} in ${plural(p.counts["nodes-scanned"] ?? 0, "live node")}: ${plural(broken, "broken link")}, ${plural(gated, "link")} to gated content, ${plural(notFound, "top 404 path")}.`;
    const total = broken + gated + notFound;
    return {
      done: true,
      outcome: total > 0 ? "did-work" : "nothing-to-do",
      counts,
      summary,
      findings: p.findings,
      ...(total > 0
        ? { notify: [findingsNotice(a, run, now, "automation-findings", summary, counts)] }
        : {}),
    };
  }

  async function staleContent(
    a: Automation,
    job: BuiltinAutomationJob,
    run: string,
    position: unknown,
    now: Date,
  ): Promise<BuiltinStepResult> {
    const p = progressOf(position, "entries");
    const days = job.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
    const cutoff = canonicalInstant(instantMs(now) - days * DAY_MS);
    const page = await sources.staleEntries({
      siteId: a.siteId,
      cutoff,
      ...(p.after ? { after: p.after } : {}),
      limit: stalePage,
      now,
    });
    if (!page) return unpublished();
    bump(p.counts, "entries-scanned", page.scanned);
    bump(p.counts, "stale-entries", page.stale.length);
    // Keep the oldest 200 across pages (a review list starts with what is most out of date).
    p.findings = [...(p.findings as StaleEntryFinding[]), ...page.stale]
      .sort((x, y) =>
        x.updatedAt < y.updatedAt
          ? -1
          : x.updatedAt > y.updatedAt
            ? 1
            : x.nodeId < y.nodeId
              ? -1
              : 1,
      )
      .slice(0, MAX_FINDINGS_PER_RUN);
    if (page.next) return more({ ...p, after: page.next });
    const n = p.counts["stale-entries"] ?? 0;
    const summary = `${plural(n, "live entry", "live entries")} not updated for ${days} days (of ${p.counts["entries-scanned"] ?? 0}).`;
    return {
      done: true,
      outcome: n > 0 ? "did-work" : "nothing-to-do",
      counts: p.counts,
      summary,
      findings: p.findings,
      ...(n > 0
        ? { notify: [findingsNotice(a, run, now, "automation-findings", summary, p.counts)] }
        : {}),
    };
  }

  async function feedCheck(
    a: Automation,
    run: string,
    position: unknown,
    now: Date,
  ): Promise<BuiltinStepResult> {
    const p = progressOf(position, "rss");
    const kind = p.phase as FeedDocumentKind;
    const notServed: BuiltinStepResult = {
      done: true,
      outcome: "nothing-to-do",
      counts: { "documents-checked": 0 },
      summary:
        "This site is not served from here (no site Worker or local renderer for it); the feed and sitemap were not checked.",
    };
    if (!sources.fetchDocument) return notServed;
    const exp = await sources.feedExpectations({ siteId: a.siteId, now, newest: FEED_NEWEST });
    if (!exp) return unpublished();
    let doc: FetchedDocument | undefined;
    try {
      doc = await sources.fetchDocument({ siteId: a.siteId, path: FEED_PATHS[kind] });
      // Not served from here at all (another site of the deployment): nothing to check.
      if (!doc && kind === "rss") return notServed;
    } catch {
      doc = undefined; // a failed fetch is a finding (`feed-unreachable`)
    }
    // Fetched output is untrusted text (§11.4): the run is tainted once it has read a body.
    const taint = doc ? { at: canonicalInstant(now), tool: "feed_check" } : undefined;
    const found = kind === "rss" ? checkRss(doc, exp) : checkSitemap(doc, exp);
    bump(p.counts, "documents-checked");
    for (const f of found) bump(p.counts, f.code);
    addFindings(p.findings, found);
    if (kind === "rss") return more({ ...p, phase: "sitemap" }, taint ? { taint } : {});
    const errors = p.findings.filter((f) => f.severity === "error").length;
    const total = Object.entries(p.counts)
      .filter(([k]) => k.startsWith("feed-"))
      .reduce((n, [, v]) => n + v, 0);
    const leaked = p.counts["feed-gated-node"] ?? 0;
    const summary = `Checked the RSS feed and the sitemap: ${plural(total, "problem")}${leaked > 0 ? `, ${plural(leaked, "gated node")} exposed` : ""}.`;
    return {
      done: true,
      outcome: total > 0 ? "did-work" : "nothing-to-do",
      counts: { ...p.counts, "feed-problems": total, "feed-errors": errors },
      summary,
      findings: p.findings,
      ...(taint ? { taint } : {}),
      ...(total > 0
        ? { notify: [findingsNotice(a, run, now, "automation-findings", summary, p.counts)] }
        : {}),
    };
  }

  async function weeklyDigest(a: Automation, run: string, now: Date): Promise<BuiltinStepResult> {
    const d = await sources.digest({ siteId: a.siteId, automationId: a.id, now });
    const section = (
      code: DigestFinding["code"],
      s: { count: number; items: readonly DigestFinding["items"][number][] },
      severity: DigestFinding["severity"],
    ): DigestFinding => ({ code, severity, count: s.count, items: s.items.slice(0, DIGEST_ITEMS) });
    const findings: DigestFinding[] = [
      section("digest-published", d.published, "info"),
      section("digest-scheduled", d.scheduled, "info"),
      section("digest-attention", d.attention, d.attention.count > 0 ? "warning" : "info"),
      section("digest-open-findings", d.openFindings, "info"),
    ];
    const counts = {
      published: d.published.count,
      scheduled: d.scheduled.count,
      "needs-attention": d.attention.count,
      "open-findings": d.openFindings.count,
    };
    const summary = digestSummary(d);
    return {
      done: true,
      // A digest is work done whatever it says: it was produced and delivered.
      outcome: "did-work",
      counts,
      summary,
      findings,
      notify: [findingsNotice(a, run, now, "automation-digest", summary, counts, { digest: d })],
    };
  }

  async function cleanup(a: Automation, position: unknown, now: Date): Promise<BuiltinStepResult> {
    const p = progressOf(position, "retention");
    if (p.phase === "retention") {
      const step = await sources.cleanup({ siteId: a.siteId, now, limit: CLEANUP_LIMIT });
      for (const [k, v] of Object.entries(step.counts)) bump(p.counts, k, v);
      if (step.more) return more(p);
      return more({ ...p, phase: "drafts" });
    }
    const drafts = await sources.staleDrafts({
      siteId: a.siteId,
      now,
      days: STALE_DRAFT_DAYS,
      limit: MAX_FINDINGS_PER_RUN,
    });
    bump(p.counts, "stale-drafts", drafts.count);
    addFindings(p.findings, drafts.drafts);
    const deleted = (p.counts["runs-deleted"] ?? 0) + (p.counts["releases-deleted"] ?? 0);
    const tidied =
      deleted +
      (p.counts["findings-trimmed"] ?? 0) +
      (p.counts["leases-cleared"] ?? 0) +
      (p.counts["stale-runs-closed"] ?? 0);
    return {
      done: true,
      outcome: tidied + drafts.count > 0 ? "did-work" : "nothing-to-do",
      counts: p.counts,
      summary: `Deleted ${plural(p.counts["runs-deleted"] ?? 0, "old run")} and ${plural(p.counts["releases-deleted"] ?? 0, "old release")}; trimmed ${plural(p.counts["findings-trimmed"] ?? 0, "finding list")}; cleared ${plural(p.counts["leases-cleared"] ?? 0, "expired lease")}; closed ${plural(p.counts["stale-runs-closed"] ?? 0, "stale run")}; ${plural(drafts.count, "draft")} untouched for ${STALE_DRAFT_DAYS} days.`,
      findings: p.findings,
    };
  }

  return {
    cost: Math.max(...Object.values(BUILTIN_STEP_COST)),
    costOf: (job) => BUILTIN_STEP_COST[job.builtin],
    async step({ automation, job, run, position, now }) {
      switch (job.builtin) {
        case "broken-links":
          return brokenLinks(automation, run.id, position, now);
        case "stale-content":
          return staleContent(automation, job, run.id, position, now);
        case "feed-check":
          return feedCheck(automation, run.id, position, now);
        case "weekly-digest":
          return weeklyDigest(automation, run.id, now);
        case "cleanup":
          return cleanup(automation, position, now);
      }
    },
  };
}

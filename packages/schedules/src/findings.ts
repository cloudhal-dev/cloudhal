/**
 * Findings of the built-in jobs (RFC-0008 §4.5, §11.1): Studio-only JSON on the run row
 * (`schedule_runs.findings`), at most 200 per run, each with a stable `code`. They are not a
 * contract (no schema, no Rust mirror); the codes are, in the sense that Studio, the digest and
 * the counts key on them, so a code is never renamed — a new meaning gets a new code.
 *
 * Text that came from visitors or from a fetched document (404 paths, feed contents) is marked
 * `untrusted: true`: Studio renders it as plain text and agents receive it quoted (§11.4).
 */

/** At most this many findings are stored per run; `counts` stay exact (§4.5). */
export const MAX_FINDINGS_PER_RUN = 200;

/** `staleAfterDays` when the automation does not set one (§11.1). */
export const DEFAULT_STALE_AFTER_DAYS = 365;

/** How long runs (and with them their findings) are kept (§11.1 `cleanup`, §4.4). */
export const RUN_RETENTION_DAYS = 90;
/** How long terminal releases are kept (§5.2). */
export const RELEASE_RETENTION_DAYS = 400;
/** Drafts untouched this long get a reminder from `cleanup` (§11.1). */
export const STALE_DRAFT_DAYS = 90;

export type FindingSeverity = "error" | "warning" | "info";

/** Where in a node a reference was found: `body`, `coverImage`, `sections.<id>.body`, `items.<id>`… */
export type FindingField = string;

export const BROKEN_LINK_CODES = [
  /** An internal link in live content to a path nothing answers (page, entry, archive, redirect). */
  "broken-internal-link",
  /** `asset:<id>`, an image's `assetId` or a `/media/…` URL that is not a live asset. */
  "broken-media-reference",
  /** A live menu item whose page, entry or term is not live. */
  "broken-menu-target",
  /** A link to live content that is embargoed or expired right now (a 404 until its gate). */
  "link-to-gated-content",
  /** A top 404 path from analytics (visitor-supplied), with a redirect proposal when one fits. */
  "not-found-path",
] as const;

export const STALE_CONTENT_CODES = [
  /** A live, published entry not updated for `staleAfterDays`. */
  "stale-entry",
] as const;

export const FEED_CHECK_CODES = [
  /** The document could not be fetched or did not answer 200. */
  "feed-unreachable",
  /** Not well-formed XML, or not an RSS 2.0 channel / a sitemap `urlset`. */
  "feed-invalid",
  /** An RSS item without a title or a link, a sitemap URL without `loc`. */
  "feed-item-incomplete",
  /** A `pubDate` or `lastmod` in the future. */
  "feed-future-date",
  /** One of the newest published entries is missing. */
  "feed-missing-entry",
  /** The gate self-check (§7.2): an embargoed or expired node appears. Never expected. */
  "feed-gated-node",
  /** A `/media/…` URL in the feed that is not a live asset. */
  "feed-asset-not-live",
] as const;

export const DIGEST_CODES = [
  "digest-published",
  "digest-scheduled",
  "digest-attention",
  "digest-open-findings",
] as const;

export const CLEANUP_CODES = [
  /** A draft untouched for 90 days: a reminder, nothing is deleted (§11.1). */
  "stale-draft",
] as const;

export type BrokenLinkCode = (typeof BROKEN_LINK_CODES)[number];
export type FeedCheckCode = (typeof FEED_CHECK_CODES)[number];
export type DigestCode = (typeof DIGEST_CODES)[number];

export type FindingCode =
  | BrokenLinkCode
  | (typeof STALE_CONTENT_CODES)[number]
  | FeedCheckCode
  | DigestCode
  | (typeof CLEANUP_CODES)[number];

/** Every finding code, for Studio's word lists and tests. */
export const FINDING_CODES: readonly FindingCode[] = [
  ...BROKEN_LINK_CODES,
  ...STALE_CONTENT_CODES,
  ...FEED_CHECK_CODES,
  ...DIGEST_CODES,
  ...CLEANUP_CODES,
];

export type GateStateName = "embargoed" | "expired";

export type NodeKindName = "page" | "contentEntry" | "menu" | "term" | "taxonomy" | "redirect";

/** A reference in live content that resolves to nothing (or to gated content). */
export interface LinkFinding {
  readonly code:
    | "broken-internal-link"
    | "broken-media-reference"
    | "broken-menu-target"
    | "link-to-gated-content";
  readonly severity: FindingSeverity;
  /** The live node that holds the reference. */
  readonly nodeId: string;
  readonly nodeKind: NodeKindName;
  readonly field: FindingField;
  /** The reference as written (`/posts/x`, `asset:asset_…`, `/media/…`), or the menu target id. */
  readonly href: string;
  /** The node it points at, when known (gated content, a menu target). */
  readonly targetId?: string;
  readonly gate?: GateStateName;
}

/** A redirect a person can create with one click (RFC-0002), never created by the job. */
export interface RedirectProposal {
  readonly path: string;
  readonly nodeId?: string;
  readonly reason: "redirect" | "similar";
}

export interface NotFoundFinding {
  readonly code: "not-found-path";
  readonly severity: FindingSeverity;
  /** As requested: percent-encoded, visitor-controlled. */
  readonly path: string;
  readonly status: number;
  readonly hits: number;
  /** Same-site pages that linked here. */
  readonly linkedFrom: readonly string[];
  readonly lastSeen: string | null;
  readonly proposal?: RedirectProposal;
  readonly untrusted: true;
}

export interface StaleEntryFinding {
  readonly code: "stale-entry";
  readonly severity: FindingSeverity;
  readonly nodeId: string;
  readonly title: string;
  readonly path: string;
  readonly updatedAt: string;
  readonly ageDays: number;
}

export interface FeedFinding {
  readonly code: FeedCheckCode;
  readonly severity: FindingSeverity;
  readonly document: "rss" | "sitemap";
  /** Short plain-text detail (may quote the fetched document: untrusted). */
  readonly detail?: string;
  readonly nodeId?: string;
  readonly url?: string;
  readonly untrusted: true;
}

export interface DigestFinding {
  readonly code: DigestCode;
  readonly severity: FindingSeverity;
  readonly count: number;
  readonly items: readonly DigestItem[];
}

export interface StaleDraftFinding {
  readonly code: "stale-draft";
  readonly severity: FindingSeverity;
  readonly nodeId: string;
  readonly nodeKind: "page" | "contentEntry";
  readonly title: string;
  readonly updatedAt: string;
  readonly ageDays: number;
}

export type BuiltinFinding =
  | LinkFinding
  | NotFoundFinding
  | StaleEntryFinding
  | FeedFinding
  | DigestFinding
  | StaleDraftFinding;

// ───────────────────────────── the weekly digest ─────────────────────────────

/** One line of a digest section: a release, an entry, an automation's open findings. */
export interface DigestItem {
  /** `rel_…`, an entry or page id, or `aut_…`. */
  readonly id: string;
  readonly title: string;
  /** The instant it happened or will happen. */
  readonly at?: string;
  /** Release state, gate (`embargo`), or the automation's job. */
  readonly state?: string;
  /** Open findings of an automation's latest run, by name. */
  readonly counts?: Readonly<Record<string, number>>;
}

/** What the weekly digest reports (§11.1): templated, no language model. */
export interface WeeklyDigest {
  readonly siteId: string;
  /** The week reported: `[from, now)` back, `[now, to)` ahead. */
  readonly from: string;
  readonly now: string;
  readonly to: string;
  /** Entries first published in the week and releases that went live. */
  readonly published: { readonly count: number; readonly items: readonly DigestItem[] };
  /** Releases due next week (scheduled or waiting for approval) and embargoes that lift. */
  readonly scheduled: { readonly count: number; readonly items: readonly DigestItem[] };
  /** Releases missed, in conflict, failed or expired in the week, and nodes in two releases. */
  readonly attention: { readonly count: number; readonly items: readonly DigestItem[] };
  /** The latest findings of the site's other built-in automations. */
  readonly openFindings: { readonly count: number; readonly items: readonly DigestItem[] };
}

/** Items per digest section kept on the run (counts stay exact). */
export const DIGEST_ITEMS = 10;

// ───────────────────────────── helpers ─────────────────────────────

/** Appends findings up to the cap; returns how many were dropped. */
export function addFindings(
  into: BuiltinFinding[],
  more: readonly BuiltinFinding[],
  max = MAX_FINDINGS_PER_RUN,
): number {
  const room = Math.max(0, max - into.length);
  into.push(...more.slice(0, room));
  return Math.max(0, more.length - room);
}

/** Adds `n` to `counts[key]` (creating it), for exact counts beside capped findings. */
export function bump(counts: Record<string, number>, key: string, n = 1): void {
  if (n === 0 && key in counts) return;
  counts[key] = (counts[key] ?? 0) + n;
}

/** Counts of findings by code. */
export function countByCode(findings: readonly BuiltinFinding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) bump(out, f.code);
  return out;
}

/** The counts keys that total a run's open findings (one per kind, no double counting). */
export const OPEN_FINDING_KEYS = [
  "broken-links",
  "link-to-gated-content",
  "not-found-path",
  "stale-entries",
  "feed-problems",
  "stale-drafts",
] as const;

/** The open findings a built-in run's counts report, by the keys above (0 when none). */
export function openFindings(counts: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of OPEN_FINDING_KEYS) if ((counts[k] ?? 0) > 0) out[k] = counts[k] as number;
  return out;
}

/** The digest as a plain-text report (the run's `summary` and the notification's text). */
export function digestSummary(d: WeeklyDigest): string {
  const lines: string[] = [];
  const section = (title: string, s: { count: number; items: readonly DigestItem[] }) => {
    lines.push(`${title}: ${s.count}`);
    for (const i of s.items) {
      const when = i.at ? ` (${i.at.slice(0, 16).replace("T", " ")} UTC)` : "";
      const state = i.state ? ` [${i.state}]` : "";
      const counts = i.counts
        ? ` — ${Object.entries(i.counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ")}`
        : "";
      lines.push(`- ${i.title}${when}${state}${counts}`);
    }
    if (s.count > s.items.length) lines.push(`- and ${s.count - s.items.length} more`);
  };
  lines.push(`Week of ${d.from.slice(0, 10)} to ${d.now.slice(0, 10)}`);
  section("Published", d.published);
  section("Scheduled next week", d.scheduled);
  section("Needs attention", d.attention);
  section("Open findings", d.openFindings);
  return lines.join("\n");
}

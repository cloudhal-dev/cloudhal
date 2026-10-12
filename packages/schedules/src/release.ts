/**
 * The release model (RFC-0008 §5.2, §6, §8.6, §10.4, D4, D5, D15). Pure and Worker-safe: no
 * storage, no clock; callers pass node refs, items and `now`.
 *
 * **The `rl1:` hash (stable; changing it voids every stored approval):**
 *
 * ```
 * rl1   = "rl1:" + hex(SHA-256(utf8(lines.join("\n"))))
 * lines = ["site <siteId>"] + one line per item, sorted by node id (code-unit order):
 *         "<set|remove> <nodeId> <nodeKind> <targetRev>:<targetHash>|- <baseRev>:<baseHash>|-"
 * ```
 *
 * `-` stands for an absent target (a removal) or an absent base (a node that was not live). The
 * time is **not** in the hash (D4): a person who may approve the release moves it and keeps the
 * approval; the approval request's `args_hash` covers `{ releaseId, when }` instead
 * (`approvalArgs`). Any change to the items changes the hash.
 */
import type {
  NodeRef,
  Release,
  ReleaseApproval,
  ReleaseConflict,
  ReleaseItem,
  ReleaseNodeKind,
  ReleaseNodeVersion,
  ReleaseState,
  ReleaseWhen,
} from "@cloudhal/core-contracts";
import { ScheduleError } from "./errors.ts";
import { sha256Hex } from "./ids.ts";
import {
  assertTimeZone,
  canonicalInstant,
  DAY_MS,
  instantMs,
  latenessSeconds,
  MINUTE_MS,
  resolveLocalTime,
  UTC,
} from "./time.ts";

export const RELEASE_HASH_PREFIX = "rl1:";
export const MAX_RELEASE_ITEMS = 100;
export const MAX_OPEN_RELEASES_PER_SITE = 200;
/** A release runs late at most once and only within this many seconds of its time (owner decision 2). */
export const LATE_LIMIT_SECONDS = 3_600;
/** Transient errors retry inside the hour with this back-off, by attempt (§8.6). */
export const RETRY_BACKOFF_SECONDS: readonly number[] = [30, 60, 120, 300, 600];
/** How long a claim holds a release before another tick may recover it (§8.5). */
export const RELEASE_LEASE_MS = 10 * MINUTE_MS;
/** Lead time and horizons (§6.1, §10.5). */
export const MIN_LEAD_MS = MINUTE_MS;
export const MAX_HORIZON_DAYS = 366;
export const REQUEST_HORIZON_DAYS = 30;
/** At most this many new bodies per request on Workers Free (§6.1 step 4). */
export const MAX_NEW_BODIES_PER_REQUEST = 20;

/** Node kinds a release may remove (§6.1 step 3). */
export const REMOVABLE_NODE_KINDS: readonly ReleaseNodeKind[] = [
  "contentEntry",
  "page",
  "redirect",
];
export const RELEASE_NODE_KINDS: readonly ReleaseNodeKind[] = [
  "page",
  "contentEntry",
  "taxonomy",
  "term",
  "redirect",
  "menu",
  "asset",
];

/** States whose nodes are held and locked (§3, §6.2). */
export const HOLDING_STATES: readonly ReleaseState[] = [
  "awaiting_approval",
  "scheduled",
  "running",
];
/** States the scheduler never leaves on its own (kept for history; retention deletes them after 400 days). */
export const TERMINAL_RELEASE_STATES: readonly ReleaseState[] = [
  "published",
  "conflict",
  "missed",
  "expired",
  "failed",
  "canceled",
];

export function isHolding(state: ReleaseState): boolean {
  return HOLDING_STATES.includes(state);
}
export function isTerminalRelease(state: ReleaseState): boolean {
  return TERMINAL_RELEASE_STATES.includes(state);
}

/**
 * Allowed transitions (§5.2). Beyond the table: `running → canceled` and `running → expired` are the
 * scheduler's own (a vanished site or node, an approval lost at run time — §10.6; people cannot
 * cancel a running release, §8.5); `conflict → draft | awaiting_approval | scheduled` is "Re-pin"
 * (and approve); `missed | expired → running` is a person's "Publish now" (a manual run).
 */
export const RELEASE_TRANSITIONS: Readonly<Record<ReleaseState, readonly ReleaseState[]>> = {
  draft: ["awaiting_approval", "scheduled", "canceled"],
  awaiting_approval: ["scheduled", "draft", "expired", "canceled"],
  scheduled: [
    "scheduled",
    "awaiting_approval",
    "draft",
    "running",
    "missed",
    "expired",
    "canceled",
  ],
  running: ["published", "conflict", "failed", "missed", "expired", "canceled"],
  published: [],
  conflict: ["draft", "awaiting_approval", "scheduled", "canceled"],
  missed: ["running", "canceled"],
  expired: ["running", "canceled"],
  failed: [],
  canceled: [],
};

export function canTransitionRelease(from: ReleaseState, to: ReleaseState): boolean {
  return RELEASE_TRANSITIONS[from].includes(to);
}

export function assertReleaseTransition(from: ReleaseState, to: ReleaseState): void {
  if (!canTransitionRelease(from, to))
    throw new ScheduleError("invalid_transition", `a release cannot go from ${from} to ${to}`);
}

// ───────────────────────────── hash ─────────────────────────────

const version = (v: ReleaseNodeVersion | undefined) => (v ? `${v.rev}:${v.hash}` : "-");

/** One canonical item line (see the module comment). */
export function releaseItemLine(item: ReleaseItem): string {
  const target = item.kind === "set" ? item.target : undefined;
  return `${item.kind} ${item.nodeId} ${item.nodeKind} ${version(target)} ${version(item.base)}`;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The lines the `rl1:` hash digests, in order. */
export function releaseHashLines(siteId: string, items: readonly ReleaseItem[]): string[] {
  const sorted = [...items].sort((a, b) => byId(a.nodeId, b.nodeId));
  return [`site ${siteId}`, ...sorted.map(releaseItemLine)];
}

/** `rl1:<hex>` over the site id and the pinned items (time not included, D4). */
export async function releaseHash(siteId: string, items: readonly ReleaseItem[]): Promise<string> {
  return `${RELEASE_HASH_PREFIX}${await sha256Hex(releaseHashLines(siteId, items).join("\n"))}`;
}

/**
 * What an approval request's `args_hash` covers for release tools (§10.4): the release and its
 * `when`, canonical. The state binding (`state_hash`) is the release's `rl1:` hash.
 */
export function approvalArgs(releaseId: string, when: ReleaseWhen | undefined): string {
  if (!when) return JSON.stringify({ releaseId, when: null });
  if (when.kind === "on-approval")
    return JSON.stringify({ releaseId, when: { kind: "on-approval" } });
  return JSON.stringify({
    releaseId,
    when: {
      at: canonicalInstant(when.at),
      kind: "at",
      ...(when.localTime ? { localTime: when.localTime } : {}),
      timeZone: when.timeZone,
    },
  });
}

// ───────────────────────────── pin and closure ─────────────────────────────

/** A node version as the store knows it (a snapshot's `NodeRef`). */
export type NodeVersion = Pick<NodeRef, "id" | "kind" | "rev" | "hash">;

/** A pinned item plus what the run needs without reading bodies (§5.1 `release_items`). */
export interface PinnedItem {
  item: ReleaseItem;
  /** Ids the target body references (terms, assets, parents, menu targets); empty for removals. */
  deps: string[];
  /** An asset target's media blob, a GC root while held (RFC-0004). */
  blobSha?: string;
}

function refMap(
  refs: Iterable<NodeVersion> | ReadonlyMap<string, NodeVersion>,
): ReadonlyMap<string, NodeVersion> {
  if (refs instanceof Map) return refs as ReadonlyMap<string, NodeVersion>;
  return new Map([...(refs as Iterable<NodeVersion>)].map((r) => [r.id, r]));
}

const nodeVersion = (r: NodeVersion): ReleaseNodeVersion => ({ rev: r.rev, hash: r.hash });

export interface PinInput {
  siteId: string;
  /** Nodes whose current working-copy version goes live. */
  set?: readonly string[];
  /** Nodes taken out of the live snapshot (entries, pages, redirects). */
  remove?: readonly string[];
  /** The working copy's refs (`currentNodeRefs`). */
  working: Iterable<NodeVersion> | ReadonlyMap<string, NodeVersion>;
  /** The live snapshot's refs (absent when nothing is live yet). */
  live: Iterable<NodeVersion> | ReadonlyMap<string, NodeVersion>;
}

/**
 * Pins items (§6.1 step 1): each `set` pins the node's working-copy version as target and its live
 * version (if any) as base; each `remove` pins the live version as base. Refuses the site node, a
 * node that does not exist, a removal of a kind other than entry/page/redirect or of a node that
 * is not live, a node given twice, and an item whose target equals its base (`nothing_to_publish`).
 * Items come back sorted by node id.
 */
export function pinItems(input: PinInput): ReleaseItem[] {
  const working = refMap(input.working);
  const live = refMap(input.live);
  const seen = new Set<string>();
  const items: ReleaseItem[] = [];
  const once = (id: string) => {
    if (seen.has(id)) throw new ScheduleError("duplicate_item", `${id} is in the release twice`);
    seen.add(id);
  };
  for (const id of input.set ?? []) {
    once(id);
    const target = working.get(id);
    if (!target) throw new ScheduleError("node_not_found", `${id} does not exist`);
    if (target.kind === "site")
      throw new ScheduleError(
        "site_node_in_release",
        "site settings are published the ordinary way",
      );
    const base = live.get(id);
    if (base && base.rev === target.rev && base.hash === target.hash)
      throw new ScheduleError("nothing_to_publish", `${id} is already live in this version`);
    items.push({
      kind: "set",
      nodeId: id,
      nodeKind: target.kind,
      target: nodeVersion(target),
      ...(base ? { base: nodeVersion(base) } : {}),
    });
  }
  for (const id of input.remove ?? []) {
    once(id);
    const base = live.get(id);
    const known = base ?? working.get(id);
    if (!known) throw new ScheduleError("node_not_found", `${id} does not exist`);
    if (known.kind === "site")
      throw new ScheduleError(
        "site_node_in_release",
        "site settings are published the ordinary way",
      );
    if (!REMOVABLE_NODE_KINDS.includes(known.kind))
      throw new ScheduleError(
        "remove_not_allowed",
        `releases remove entries, pages and redirects only (${id} is a ${known.kind})`,
      );
    if (!base) throw new ScheduleError("nothing_to_publish", `${id} is not live`);
    items.push({ kind: "remove", nodeId: id, nodeKind: known.kind, base: nodeVersion(base) });
  }
  if (items.length > MAX_RELEASE_ITEMS)
    throw new ScheduleError("too_many_items", `at most ${MAX_RELEASE_ITEMS} items per release`);
  return items.sort((a, b) => byId(a.nodeId, b.nodeId));
}

/** Id prefixes of graph nodes a body may reference (`@cloudhal/core-ts` `ID_PREFIX`), never the site. */
const NODE_REF = /^(?:page|entry|tax|term|redir|menu|asset)_[A-Za-z0-9]{6,32}$/;

/**
 * The default dependency extractor: every string in a node body (at any depth) that is exactly a
 * node id of a releasable kind, except the node's own id and `siteId`. This covers term
 * assignments (`terms.*.ids`, `primary`), `parentId`/`taxonomyId`, `ImageRef.assetId` and
 * `coverImage`, menu targets (`pageId`, `entryId`, `termId`). Callers with exact knowledge of a
 * kind (core-ts) may pass their own `depsOf` to `dependencyClosure`.
 */
export function referencedNodeIds(body: unknown): string[] {
  const self =
    body && typeof body === "object" && "id" in body ? (body as { id: unknown }).id : undefined;
  const out = new Set<string>();
  const walk = (v: unknown, key: string | undefined) => {
    if (typeof v === "string") {
      if (key !== "siteId" && v !== self && NODE_REF.test(v)) out.add(v);
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(body, undefined);
  return [...out].sort(byId);
}

export interface ClosureInput {
  items: readonly ReleaseItem[];
  working: Iterable<NodeVersion> | ReadonlyMap<string, NodeVersion>;
  live: Iterable<NodeVersion> | ReadonlyMap<string, NodeVersion>;
  /** Ids a node version references; for most callers `referencedNodeIds(body)`. */
  depsOf: (ref: NodeVersion) => readonly string[] | Promise<readonly string[]>;
  /** An asset version's media blob (RFC-0004), recorded as a GC root while held. */
  blobOf?: (ref: NodeVersion) => string | undefined | Promise<string | undefined>;
}

export interface ClosureResult {
  /** The given items and the added ones, sorted by node id, each with its `deps`. */
  items: PinnedItem[];
  /** Ids added because a target needs them and they are not live (`closureAdded`, §6.1 step 2). */
  added: string[];
  /** Referenced ids that exist neither live nor in the working copy (the release would fail). */
  missing: string[];
}

/**
 * Dependency closure (§6.1 step 2): adds, transitively, every node a target references that is not
 * live, pinned at its working-copy version (no base). A referenced node that is live (in any
 * version) is satisfied. Records each target's outgoing ids so the run checks the composed snapshot
 * without reading bodies (§6.3 step 5).
 */
export async function dependencyClosure(input: ClosureInput): Promise<ClosureResult> {
  const working = refMap(input.working);
  const live = refMap(input.live);
  const byNode = new Map<string, PinnedItem>();
  const queue: ReleaseItem[] = [];
  for (const item of input.items) {
    byNode.set(item.nodeId, { item, deps: [] });
    queue.push(item);
  }
  const added: string[] = [];
  const missing = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift() as ReleaseItem;
    if (item.kind !== "set") continue;
    const ref: NodeVersion = { id: item.nodeId, kind: item.nodeKind, ...item.target };
    const deps = [...new Set(await input.depsOf(ref))].filter((d) => d !== item.nodeId).sort(byId);
    const pinned = byNode.get(item.nodeId) as PinnedItem;
    pinned.deps = deps;
    if (item.nodeKind === "asset" && input.blobOf) {
      const sha = await input.blobOf(ref);
      if (sha) pinned.blobSha = sha;
    }
    for (const dep of deps) {
      if (byNode.has(dep) || live.has(dep)) continue;
      const w = working.get(dep);
      if (!w || w.kind === "site") {
        missing.add(dep);
        continue;
      }
      const next: ReleaseItem = {
        kind: "set",
        nodeId: dep,
        nodeKind: w.kind,
        target: nodeVersion(w),
      };
      byNode.set(dep, { item: next, deps: [] });
      added.push(dep);
      queue.push(next);
    }
  }
  if (byNode.size > MAX_RELEASE_ITEMS)
    throw new ScheduleError(
      "too_many_items",
      `the release and what it needs come to ${byNode.size} items (at most ${MAX_RELEASE_ITEMS})`,
    );
  return {
    items: [...byNode.values()].sort((a, b) => byId(a.item.nodeId, b.item.nodeId)),
    added: added.sort(byId),
    missing: [...missing].sort(byId),
  };
}

// ───────────────────────────── apply at T ─────────────────────────────

/**
 * `nodes(S) = nodes(L) − ids + targets` (S1, §6.3 step 4): the live refs without every item's node,
 * plus each `set` item's target, sorted by id (code-unit order, as SQLite's `ORDER BY id`). The site
 * ref stays the live one.
 */
export function composeRelease(live: readonly NodeRef[], items: readonly ReleaseItem[]): NodeRef[] {
  const ids = new Set(items.map((i) => i.nodeId));
  const out: NodeRef[] = live.filter((n) => !ids.has(n.id));
  for (const item of items)
    if (item.kind === "set")
      out.push({
        id: item.nodeId,
        kind: item.nodeKind,
        rev: item.target.rev,
        hash: item.target.hash,
      });
  return out.sort((a, b) => byId(a.id, b.id));
}

const sameVersion = (a: ReleaseNodeVersion | undefined, b: ReleaseNodeVersion | undefined) =>
  a === undefined || b === undefined ? a === b : a.rev === b.rev && a.hash === b.hash;

/**
 * Conflicts (§6.4, S4): every item whose node's live version is not its pinned base (both absent
 * counts as equal). Empty when the release can be applied.
 */
export function releaseConflicts(
  live: readonly NodeRef[],
  items: readonly ReleaseItem[],
): ReleaseConflict[] {
  const byNode = new Map(live.map((n) => [n.id, n]));
  const out: ReleaseConflict[] = [];
  for (const item of [...items].sort((a, b) => byId(a.nodeId, b.nodeId))) {
    const found = byNode.get(item.nodeId);
    const foundVersion = found ? { rev: found.rev, hash: found.hash } : undefined;
    if (!sameVersion(item.base, foundVersion))
      out.push({
        nodeId: item.nodeId,
        ...(item.base ? { expected: item.base } : {}),
        ...(foundVersion ? { found: foundVersion } : {}),
      });
  }
  return out;
}

/** The first dependency of a `set` target missing from the composed snapshot (§6.3 step 5). */
export function missingDependency(
  composed: readonly NodeRef[],
  items: readonly Pick<PinnedItem, "item" | "deps">[],
): { nodeId: string; dependency: string } | undefined {
  const present = new Set(composed.map((n) => n.id));
  for (const { item, deps } of [...items].sort((a, b) => byId(a.item.nodeId, b.item.nodeId))) {
    if (item.kind !== "set") continue;
    for (const dep of deps) if (!present.has(dep)) return { nodeId: item.nodeId, dependency: dep };
  }
  return undefined;
}

export type ReleasePlan =
  | { kind: "conflict"; conflicts: ReleaseConflict[] }
  | { kind: "failed"; code: "dependency_missing"; message: string }
  | { kind: "apply"; nodes: NodeRef[]; added: number; changed: number; removed: number };

/**
 * Steps 3–5 of §6.3 as one pure function: conflicts first (nothing applied partially, S4), then the
 * composition, then the dependency check. `publishRelease` (core-ts) writes the snapshot it returns.
 */
export function planRelease(
  live: readonly NodeRef[],
  items: readonly Pick<PinnedItem, "item" | "deps">[],
): ReleasePlan {
  const plain = items.map((i) => i.item);
  const conflicts = releaseConflicts(live, plain);
  if (conflicts.length > 0) return { kind: "conflict", conflicts };
  const nodes = composeRelease(live, plain);
  const missing = missingDependency(nodes, items);
  if (missing)
    return {
      kind: "failed",
      code: "dependency_missing",
      message: `${missing.nodeId} needs ${missing.dependency}, which would not be live`,
    };
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const i of plain) {
    if (i.kind === "remove") removed++;
    else if (i.base) changed++;
    else added++;
  }
  return { kind: "apply", nodes, added, changed, removed };
}

// ───────────────────────────── time, approval and lateness at run time ─────────────────────────────

export type WhenInput =
  | { at: string | Date | number; timeZone?: string }
  | { localTime: string; timeZone?: string }
  | "on-approval";

/**
 * Builds a `ReleaseWhen` (§9.1): a wall-clock time is kept with its zone (the site's, D1: UTC when
 * absent) and resolved to `at`; an instant is a machine's absolute intent, kept with the zone for
 * display. Checks the lead time (≥ 1 minute) and horizon (≤ 366 days, or `horizonDays`).
 */
export function releaseWhen(
  input: WhenInput,
  options: { siteTimeZone?: string; now: string | Date | number; horizonDays?: number },
): ReleaseWhen {
  if (input === "on-approval") return { kind: "on-approval" };
  const timeZone = input.timeZone ?? options.siteTimeZone ?? UTC;
  assertTimeZone(timeZone);
  const when: ReleaseWhen =
    "localTime" in input
      ? {
          kind: "at",
          at: resolveLocalTime(input.localTime, timeZone).at,
          timeZone,
          localTime: input.localTime,
        }
      : { kind: "at", at: canonicalInstant(input.at), timeZone };
  const at = instantMs(when.at);
  const now = instantMs(options.now);
  if (at < now + MIN_LEAD_MS)
    throw new ScheduleError(
      "too_soon",
      "a release time must be at least a minute ahead (use Publish now or on-approval)",
    );
  const horizon = options.horizonDays ?? MAX_HORIZON_DAYS;
  if (at > now + horizon * DAY_MS)
    throw new ScheduleError("too_far", `a release time must be within ${horizon} days`);
  return when;
}

export type ExpiredReason =
  | "unapproved"
  | "approval_lost"
  | "auto_window_ended"
  | "creator_removed";
export type ApprovalVerdict = { ok: true } | { ok: false; reason: ExpiredReason };

/**
 * The approval checks that need no policy (§10.6): a release without an approval is `unapproved`
 * (D5); an `auto` approval past `windowEnds` is `auto_window_ended` (D9). Rights (the approver may
 * still publish it; the key and its creator still exist) are checked by the policy layer, which
 * `runDue` takes as `checkApproval`.
 */
export function baseApprovalVerdict(
  approval: ReleaseApproval | undefined,
  now: string | Date | number,
): ApprovalVerdict {
  if (!approval) return { ok: false, reason: "unapproved" };
  if (approval.kind === "auto" && instantMs(now) > instantMs(approval.windowEnds))
    return { ok: false, reason: "auto_window_ended" };
  return { ok: true };
}

/** `missed` when more than an hour late (owner decision 2, S8). */
export function isPastLateLimit(
  executeAt: string | Date | number,
  now: string | Date | number,
): boolean {
  return latenessSeconds(executeAt, now) > LATE_LIMIT_SECONDS;
}

/**
 * When a release that failed transiently on `attempt` (1-based) may try again: the back-off of
 * §8.6, or undefined when that would be more than an hour after its time (then it is `missed`).
 */
export function nextRetryAt(
  executeAt: string | Date | number,
  now: string | Date | number,
  attempt: number,
): string | undefined {
  const delay =
    RETRY_BACKOFF_SECONDS[Math.min(Math.max(attempt, 1), RETRY_BACKOFF_SECONDS.length) - 1] ?? 600;
  const at = instantMs(now) + delay * 1000;
  if (at - instantMs(executeAt) > LATE_LIMIT_SECONDS * 1000) return undefined;
  return canonicalInstant(at);
}

// ───────────────────────────── order and overlap (D15) ─────────────────────────────

export interface ReleaseOrderKey {
  id: string;
  executeAt: string;
}

/** Releases run one at a time per site, in `execute_at` order, ties by id (§6.5). */
export function orderReleases<T extends ReleaseOrderKey>(releases: readonly T[]): T[] {
  return [...releases].sort((a, b) => {
    const d = instantMs(a.executeAt) - instantMs(b.executeAt);
    return d !== 0 ? d : byId(a.id, b.id);
  });
}

/**
 * Nodes in more than one non-terminal release (D15: flagged, not refused), as node id → release
 * ids (sorted). Studio and `get_release` show these as `overlaps`.
 */
export function releaseOverlaps(
  releases: readonly Pick<Release, "id" | "state" | "items">[],
): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const r of releases) {
    if (isTerminalRelease(r.state)) continue;
    for (const item of r.items) {
      const list = by.get(item.nodeId) ?? [];
      list.push(r.id);
      by.set(item.nodeId, list);
    }
  }
  const out = new Map<string, string[]>();
  for (const [node, ids] of [...by].sort((a, b) => byId(a[0], b[0])))
    if (ids.length > 1) out.set(node, ids.sort(byId));
  return out;
}

/** Releases whose time falls in the same minute (Studio warns: "2 releases at 09:00", §6.5). */
export function sameMinute(a: string | Date | number, b: string | Date | number): boolean {
  return Math.floor(instantMs(a) / MINUTE_MS) === Math.floor(instantMs(b) / MINUTE_MS);
}

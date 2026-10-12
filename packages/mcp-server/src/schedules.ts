/**
 * Schedules for agents and the REST API (RFC-0008 §10–§14): the deployment's schedule store, its
 * ticker and core-ts's `ReleaseService` (pinning, scheduling, "Publish now"), "own" for releases, who may
 * approve one, the views and the calendar, release requests and their carry-out, automation runs
 * (the open run of an automation key, taint and budgets) and the scheduler's run-time re-check of
 * approvals (`createReleaseApprovalCheck`). Shared by the MCP schedule tools (`schedule-tools.ts`)
 * and `@cloudhal/api`'s schedule routes.
 */
import {
  type AgentMode,
  type Approval,
  type ApprovalCause,
  type ApprovalStore,
  autoReleaseWindowEnds,
  checkAutoRelease,
  clampMode,
  effectiveMode,
  holds,
  type OwnershipResolver,
  ownsEntry,
  type Principal,
  type ReleaseItemRisk,
  type Role,
  roleScopes,
} from "@cloudhal/agent-runtime";
import type {
  Actor,
  Automation,
  AutomationJob,
  ContentEntry,
  NodeRef,
  Page,
  Release,
  ReleaseApproval,
  ReleaseItem,
  ReleaseNodeKind,
  ReleaseWhen,
  ScheduleRun,
  Site,
} from "@cloudhal/core-contracts";
import { nodeHash, type SiteGraphStore, sha256Hex } from "@cloudhal/core-ts";
import {
  type ReleasePurger,
  ReleaseService,
  type SchedulerControl,
} from "@cloudhal/core-ts/releases";
import {
  type ApprovalVerdict,
  approvalArgs,
  canonicalInstant,
  type ExpiredReason,
  isTerminalRelease,
  occurrences,
  REQUEST_HORIZON_DAYS,
  type RunTaintState,
  releaseHash,
  type StoredReleaseItem,
  untrustedEffectiveScopes,
} from "@cloudhal/schedules";
import type { ReleaseRecord, SqlScheduleStore } from "@cloudhal/schedules/sql";

/** What a deployment provides for schedules (RFC-0008 §16). */
export interface SchedulesDeps {
  readonly store: SqlScheduleStore;
  /** `false` when the deployment turned schedules off. Default true. */
  readonly available?: boolean | undefined;
  /** `CLOUDHAL_AUTOMATIONS=off` → false: automations stop, releases and gates go on (§11.6). */
  readonly automationsEnabled?: boolean | undefined;
  /**
   * The deployment's ticker (`ApiDeps.scheduler`): its mode for `/api/instance` and
   * `/api/scheduler`, and `poke` when something becomes due sooner (a release scheduled, approved or
   * moved, a window opened; §8.3).
   */
  readonly scheduler?: SchedulerControl | undefined;
  /** "Publish now" purges the live site's cache like a tick does (absent: nothing is cached). */
  readonly purge?: ReleasePurger | undefined;
  /** New versions one call may pin (§6.1 step 4; Workers Free: 20, the default). */
  readonly maxNewBodies?: number | undefined;
}

/** True when the deployment serves schedules. */
export const schedulesAvailable = (deps: SchedulesDeps | undefined): deps is SchedulesDeps =>
  deps !== undefined && deps.available !== false;

/** core-ts's `ReleaseService` over this graph, with the deployment's ticker and purge. */
export function releaseService(
  deps: SchedulesDeps,
  graph: SiteGraphStore,
  now?: () => Date,
): ReleaseService {
  return new ReleaseService({
    graph,
    ...(now ? { now } : {}),
    ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
    ...(deps.purge ? { purge: deps.purge } : {}),
    ...(deps.maxNewBodies !== undefined ? { maxNewBodies: deps.maxNewBodies } : {}),
  });
}

/** Tells the ticker something is due at `at` (never throws, never awaited by callers' answers). */
export function poke(deps: SchedulesDeps, at: string | undefined): void {
  if (!at || !deps.scheduler) return;
  deps.scheduler.poke(at).catch(() => undefined);
}

/** The person approving on a local server without people (stdio, `bypass`, a confirmed elicitation). */
export const LOCAL_PERSON = Object.freeze({ id: "user_localdev01", name: "Local developer" });

/** Metadata keys on releases (Release.metadata, strings only). */
export const RELEASE_META = {
  /** The agent's note on a proposal (≤ 500, plain). */
  note: "cloudhal.note",
  /** A gate-only reduction (set_embargo on a live node): re-checked without the mode rule. */
  reduce: "cloudhal.reduce",
  /**
   * The mode the agent worked in when it scheduled a gate-only reduction with its key's (`auto`)
   * approval (`plan` … `auto`): such a release is not an `auto`-mode publish, so Studio labels it
   * by this mode ("Hidden by an agent in EDITS mode"), not as "Automatic".
   */
  mode: "cloudhal.mode",
  /** The tool or route that made the release. */
  source: "cloudhal.source",
} as const;

// ───────────────────────────── nodes and pinning (§6.1) ─────────────────────────────

/** A node of the working copy by kind and id (undefined when it is gone). */
export async function workingNode(
  graph: SiteGraphStore,
  kind: string,
  id: string,
): Promise<{ id: string; siteId?: string; rev: number } | undefined> {
  switch (kind) {
    case "page":
      return graph.getPage(id);
    case "contentEntry":
      return graph.getContentEntry(id);
    case "taxonomy":
      return graph.getTaxonomy(id);
    case "term":
      return graph.getTerm(id);
    case "redirect":
      return graph.getRedirect(id);
    case "menu":
      return graph.getMenu(id);
    case "asset":
      return graph.getAsset(id);
    case "site":
      return graph.getSite(id);
    default:
      return undefined;
  }
}

/** The live snapshot's node refs (empty when nothing is live yet). */
export async function liveRefs(graph: SiteGraphStore, site: Site): Promise<NodeRef[]> {
  if (!site.publishedSnapshotId) return [];
  return (await graph.getSnapshot(site.publishedSnapshotId))?.nodes ?? [];
}

/** A node version's body: the working copy when it is that version, else the snapshot blob. */
export async function nodeVersion<T = unknown>(
  graph: SiteGraphStore,
  ref: Pick<NodeRef, "id" | "kind" | "rev" | "hash">,
): Promise<T | undefined> {
  const working = await workingNode(graph, ref.kind, ref.id);
  if (working && (await nodeHash(working)) === ref.hash) return working as T;
  try {
    return (await graph.readSnapshotNode({ ...ref } as NodeRef)) as T;
  } catch {
    return undefined;
  }
}

/**
 * The `rl1:` a one-node request is bound to before any release exists (`schedule_unpublish`,
 * `lift_embargo`): the node's working and live versions, so any change voids the request.
 */
export async function nodeBinding(
  graph: SiteGraphStore,
  site: Site,
  nodeId: string,
): Promise<string> {
  const working = (await graph.currentNodeRefs(site.id)).find((r) => r.id === nodeId);
  if (!working || working.kind === "site") throw new Error(`node ${nodeId} not found`);
  const base = (await liveRefs(graph, site)).find((r) => r.id === nodeId);
  const item: ReleaseItem = {
    kind: "set",
    nodeId,
    nodeKind: working.kind as ReleaseNodeKind,
    target: { rev: working.rev, hash: working.hash },
    ...(base ? { base: { rev: base.rev, hash: base.hash } } : {}),
  };
  return releaseHash(site.id, [item]);
}

/** The items as the low-risk check sees them (§10.3). */
export function releaseRisk(items: readonly Pick<StoredReleaseItem, "item" | "deps">[]) {
  return items.map(
    (p): ReleaseItemRisk => ({
      kind: p.item.kind,
      nodeId: p.item.nodeId,
      nodeKind: p.item.nodeKind,
      live: p.item.base !== undefined,
      deps: p.deps,
    }),
  );
}

/** A release removes content or carries an expiry: canceling it keeps content up (§12 `cancel_schedule`). */
export async function removesContent(
  graph: SiteGraphStore,
  record: Pick<ReleaseRecord, "items">,
): Promise<boolean> {
  for (const p of record.items) {
    if (p.item.kind === "remove") return true;
    const body = (await nodeVersion<{ availability?: { until?: string } }>(graph, {
      id: p.item.nodeId,
      kind: p.item.nodeKind,
      ...p.item.target,
    })) as { availability?: { until?: string } } | undefined;
    if (body?.availability?.until) return true;
  }
  return false;
}

// ───────────────────────────── own and approval rights (§10.1, §10.6) ─────────────────────────────

/**
 * Whether every item is `person`'s own (RFC-0005 §4, `ownOnlyChangeSet`'s rule): entries whose
 * author is the person or one of their agents, plus new assets those entries use. Undefined when
 * own-only, else why not.
 */
export async function notOwnRelease(
  graph: SiteGraphStore,
  ownership: OwnershipResolver,
  person: string | undefined,
  items: readonly Pick<StoredReleaseItem, "item" | "deps">[],
): Promise<string | undefined> {
  if (!person) return "ownership cannot be established for this caller";
  const riding = new Set<string>();
  for (const p of items) {
    const i = p.item;
    if (i.nodeKind !== "contentEntry") continue;
    const ref = i.kind === "set" ? i.target : i.base;
    const entry = await nodeVersion<ContentEntry>(graph, {
      id: i.nodeId,
      kind: i.nodeKind,
      ...ref,
    });
    if (!entry || !(await ownsEntry(ownership, person, entry)))
      return `${i.nodeId} is not your article`;
    if (i.kind === "set") for (const d of p.deps) riding.add(d);
  }
  for (const p of items) {
    const i = p.item;
    if (i.nodeKind === "contentEntry") continue;
    if (i.nodeKind === "asset" && i.kind === "set" && !i.base && riding.has(i.nodeId)) continue;
    return `${i.nodeId} is a ${i.nodeKind}, not one of your articles`;
  }
  return undefined;
}

/**
 * May this principal approve these items now (§10.4, §10.6)? `releases:publish`, or
 * `releases:publish:own` with own-only items. Without a membership source a person may.
 */
export async function approvalProblem(
  graph: SiteGraphStore,
  ownership: OwnershipResolver,
  principal: Pick<Principal, "scopes" | "person" | "actor">,
  items: readonly Pick<StoredReleaseItem, "item" | "deps">[],
): Promise<string | undefined> {
  if (holds(principal.scopes, "releases:publish")) return undefined;
  if (!holds(principal.scopes, "releases:publish:own"))
    return "your role cannot approve releases; an Editor approves them";
  const why = await notOwnRelease(
    graph,
    ownership,
    principal.person?.id ?? principal.actor.id,
    items,
  );
  return why ? `your role approves only your own releases, but ${why}` : undefined;
}

/** A person's approval as the contract stores it (a staff person, never an agent). */
export function personApproval(
  principal: Pick<Principal, "actor" | "person">,
  at: string,
  extra: { executeAt?: string; approvalId?: string } = {},
): ReleaseApproval {
  const id = principal.person?.id ?? principal.actor.id;
  const by = /^user_[A-Za-z0-9]{6,32}$/.test(id)
    ? {
        id,
        ...((principal.person?.name ?? principal.actor.name)
          ? { name: (principal.person?.name ?? principal.actor.name ?? "").slice(0, 200) }
          : {}),
      }
    : { ...LOCAL_PERSON };
  return {
    kind: "person",
    by,
    at,
    ...(extra.executeAt ? { executeAt: extra.executeAt } : {}),
    ...(extra.approvalId ? { approvalId: extra.approvalId } : {}),
  };
}

/** When a scheduled release becomes due (`on-approval`: now). */
export function executeAtOf(when: ReleaseWhen | undefined, now: string): string | undefined {
  if (!when) return undefined;
  return when.kind === "at" ? canonicalInstant(when.at) : now;
}

export interface AutoVerdict {
  ok: boolean;
  /** Why not, in words (the agent reads it). */
  reason?: string;
  windowEnds: string;
  check: ReturnType<typeof checkAutoRelease>;
}

/**
 * The `auto` path of a release (§10.3, §10.7): the key's effective mode is `auto` (never inside a
 * tainted run — such calls never get here), the items are low risk, the key holds
 * `releases:publish` (own-only items with `:own`), and the release runs before the window ends.
 */
export async function autoReleaseVerdict(
  graph: SiteGraphStore,
  ownership: OwnershipResolver,
  principal: Principal,
  items: readonly Pick<StoredReleaseItem, "item" | "deps">[],
  executeAt: string,
  now: Date,
): Promise<AutoVerdict> {
  const windowEnds = autoReleaseWindowEnds(now, principal.elevation?.until);
  const check = checkAutoRelease(releaseRisk(items));
  const no = (reason: string): AutoVerdict => ({ ok: false, reason, windowEnds, check });
  if (effectiveMode(principal) !== "auto") return no("not in auto mode");
  if (!principal.keyId) return no("auto-mode releases need an API key");
  if (!check.lowRisk) return no(`not low risk: ${check.code}`);
  if (Date.parse(executeAt) > Date.parse(windowEnds))
    return {
      ...no("it would run after your autonomy ends (the elevation's end, or 24 hours)"),
      check: { ...check, lowRisk: false, code: "outside-window" },
    };
  const problem = await approvalProblem(graph, ownership, principal, items);
  if (problem) return no(problem);
  return { ok: true, windowEnds, check };
}

// ───────────────────────────── requests (§10.4, §10.5) ─────────────────────────────

/** How long an agent's release request may wait (§10.5): until the release's time, ≤ 30 days. */
export function requestExpiry(
  when: ReleaseWhen | undefined,
  now: Date,
  agent: boolean,
): { expiresAt?: string; problem?: string } {
  if (!when || when.kind === "on-approval") return {};
  const at = Date.parse(when.at);
  if (agent && at > now.getTime() + REQUEST_HORIZON_DAYS * 86_400_000)
    return {
      problem: `too_far_for_request: agents ask for releases at most ${REQUEST_HORIZON_DAYS} days ahead; propose a draft (propose_release) and a person schedules it`,
    };
  return { expiresAt: canonicalInstant(at) };
}

/** The `input` of a release request: what the carry-out reads back (and Studio shows). */
export interface ReleaseRequestInput {
  siteId: string;
  releaseId: string;
  when: ReleaseWhen | null;
  [key: string]: unknown;
}

/**
 * Moves a release to `awaiting_approval` and files one request bound to its `rl1:` hash and
 * `when` (§10.4): `args_hash` covers `approvalArgs(releaseId, when)`, the request expires at the
 * release's time. A release already awaiting approval keeps waiting under the new request (the old
 * one is closed). Returns the request.
 */
export async function requestRelease(input: {
  deps: SchedulesDeps;
  approvals: ApprovalStore;
  record: ReleaseRecord;
  when: ReleaseWhen;
  tool: string;
  actor: Actor;
  prompt: string;
  cause: ApprovalCause;
  mode?: AgentMode | undefined;
  runId?: string | undefined;
  now: Date;
  extra?: Record<string, unknown>;
}): Promise<{ release: Release; request: Approval }> {
  const { deps, approvals, record } = input;
  const r = record.release;
  const expiry = requestExpiry(input.when, input.now, input.actor.kind === "agent");
  if (expiry.problem) throw new ScheduleRequestError(expiry.problem);
  let current = r;
  if (current.state === "awaiting_approval" || current.state === "scheduled")
    await approvals.closeForRelease(r.siteId, r.id, input.actor, "the release changed");
  // A request replaces a request: back to a draft first (awaiting → awaiting is no transition).
  if (current.state === "awaiting_approval")
    current = await deps.store.transitionRelease(r.siteId, r.id, {
      expectedRev: current.rev,
      to: "draft",
      approval: null,
      when: input.when,
      requestId: null,
    });
  const requestInput: ReleaseRequestInput = {
    siteId: r.siteId,
    releaseId: r.id,
    when: input.when,
    ...(input.extra ?? {}),
  };
  const request = await approvals.request({
    siteId: r.siteId,
    tool: input.tool,
    argsHash: await sha256Hex(approvalArgs(r.id, input.when)),
    input: requestInput,
    actor: input.actor,
    prompt: input.prompt,
    stateHash: current.hash,
    mode: input.mode,
    cause: input.cause,
    releaseId: r.id,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(expiry.expiresAt ? { expiresAt: expiry.expiresAt } : {}),
  });
  const release = await deps.store.transitionRelease(r.siteId, r.id, {
    expectedRev: current.rev,
    to: "awaiting_approval",
    when: input.when,
    requestId: request.id,
    approval: null,
  });
  return { release, request };
}

/** A release request that cannot be filed (too far ahead for an agent). */
export class ScheduleRequestError extends Error {
  override readonly name = "ScheduleRequestError";
}

/** Whether a request's `when` is the release's current one (§10.4: the time is in `args_hash`). */
export function sameWhen(a: ReleaseWhen | null | undefined, b: ReleaseWhen | undefined): boolean {
  return approvalArgs("x", a ?? undefined) === approvalArgs("x", b);
}

// ───────────────────────────── views (§12) ─────────────────────────────

export type ApprovalState = "none" | "pending" | "approved" | "auto" | "denied" | "expired";

export function approvalState(r: Release): ApprovalState {
  if (r.state === "awaiting_approval") return "pending";
  if (r.state === "expired") return "expired";
  if (r.approval?.kind === "auto") return "auto";
  if (r.approval) return "approved";
  return "none";
}

export interface ReleaseItemView {
  nodeId: string;
  nodeKind: ReleaseNodeKind;
  kind: "set" | "remove";
  title: string | null;
  path: string | null;
  pinnedRev: number | null;
  liveRev: number | null;
  /** Added because a target uses it (§6.1 step 2). */
  closure: boolean;
  /** Other non-terminal releases with this node (D15). */
  overlaps: string[];
}

export interface ReleaseView extends Release {
  executeAt: string | null;
  approvalState: ApprovalState;
  view: {
    items: ReleaseItemView[];
    closureAdded: string[];
    /** Nodes held by this release (locked against edits, §6.2). */
    lockedNodes: string[];
    request?: {
      id: string;
      status: Approval["status"];
      actor: Actor;
      expiresAt: string;
      createdAt: string;
    };
  };
}

function titleOf(node: unknown): { title: string | null; path: string | null } {
  const n = node as {
    title?: string;
    path?: string;
    name?: unknown;
    key?: string;
    from?: string;
    to?: string;
    filename?: string;
    slug?: string;
    collection?: string;
  };
  if (!n) return { title: null, path: null };
  const name =
    typeof n.name === "string"
      ? n.name
      : n.name && typeof n.name === "object"
        ? (Object.values(n.name as Record<string, string>)[0] ?? null)
        : null;
  const title =
    n.title ?? name ?? n.key ?? (n.from ? `${n.from} → ${n.to}` : null) ?? n.filename ?? null;
  const path =
    n.path ?? (n.collection && n.slug ? `/${n.collection}/${n.slug}` : null) ?? n.from ?? null;
  return { title: title ? String(title).slice(0, 200) : null, path };
}

/** A release with its items' titles and paths, overlaps, locks and the request (§12 `get_release`). */
export async function releaseView(
  deps: SchedulesDeps,
  graph: SiteGraphStore,
  record: ReleaseRecord,
  approvals?: ApprovalStore,
): Promise<ReleaseView> {
  const r = record.release;
  const overlaps = await deps.store.overlaps(r.siteId);
  // What the dependency closure added (§6.1 step 2): new nodes another item's target references.
  const referenced = new Set(record.items.flatMap((p) => (p.item.kind === "set" ? p.deps : [])));
  const closure = new Set(
    record.items
      .filter((p) => p.item.kind === "set" && !p.item.base && referenced.has(p.item.nodeId))
      .map((p) => p.item.nodeId),
  );
  const items: ReleaseItemView[] = [];
  for (const p of record.items) {
    const i = p.item;
    const ref = i.kind === "set" ? i.target : i.base;
    const node = await nodeVersion(graph, { id: i.nodeId, kind: i.nodeKind, ...ref });
    items.push({
      nodeId: i.nodeId,
      nodeKind: i.nodeKind,
      kind: i.kind,
      ...titleOf(node),
      pinnedRev: i.kind === "set" ? i.target.rev : null,
      liveRev: i.base?.rev ?? null,
      closure: closure.has(i.nodeId),
      overlaps: (overlaps.get(i.nodeId) ?? []).filter((id) => id !== r.id),
    });
  }
  const request = record.requestId ? await approvals?.get(record.requestId) : undefined;
  return {
    ...r,
    executeAt: record.executeAt ?? null,
    approvalState: approvalState(r),
    view: {
      items,
      closureAdded: [...closure].sort(),
      lockedNodes: record.items.filter((p) => p.held).map((p) => p.item.nodeId),
      ...(request
        ? {
            request: {
              id: request.id,
              status: request.status,
              actor: request.actor,
              expiresAt: request.expiresAt,
              createdAt: request.createdAt,
            },
          }
        : {}),
    },
  };
}

export interface CalendarItem {
  /** `rel_…`, `gate:<nodeId>:from|until` or `occ:<automationId>:<at>`. */
  id: string;
  kind: "release" | "gate" | "automation";
  at: string;
  title: string;
  target: { nodeIds?: string[]; nodeId?: string; automationId?: string; releaseId?: string };
  origin: "person" | "agent";
  approval: ApprovalState;
  state: string;
  overlaps?: string[];
}

export interface CalendarQuery {
  from: string;
  to: string;
  types?: readonly ("release" | "gate" | "automation")[];
  states?: readonly string[];
  origin?: "person" | "agent";
  approval?: ApprovalState;
  q?: string;
  collection?: string;
  /** Items to skip (the cursor). */
  offset?: number;
  limit?: number;
}

/** At most 62 days per calendar query (§12). */
export const CALENDAR_MAX_DAYS = 62;
export const CALENDAR_MAX_ITEMS = 200;

/**
 * Calendar items (§4.5, §12): releases, gates and automation occurrences between `from` and `to`,
 * a view built from state (nothing stored). Sorted by time, then id.
 */
export async function calendarItems(
  deps: SchedulesDeps,
  graph: SiteGraphStore,
  siteId: string,
  query: CalendarQuery,
): Promise<{ items: CalendarItem[]; nextCursor?: string }> {
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  const types = new Set(query.types ?? ["release", "gate", "automation"]);
  const inRange = (at: string | undefined) => {
    if (!at) return false;
    const t = Date.parse(at);
    return t >= from && t < to;
  };
  const out: CalendarItem[] = [];
  if (types.has("release")) {
    const releases = await deps.store.listReleases(siteId, { limit: 200 });
    const overlaps = await deps.store.overlaps(siteId);
    for (const r of releases) {
      const at = r.when?.kind === "at" ? canonicalInstant(r.when.at) : undefined;
      const when = at ?? (r.state === "draft" ? undefined : r.updatedAt);
      if (!inRange(when)) continue;
      const nodeIds = r.items.map((i) => i.nodeId);
      const flagged = nodeIds.filter((n) => (overlaps.get(n) ?? []).length > 1);
      out.push({
        id: r.id,
        kind: "release",
        at: when as string,
        title: r.title ?? `${nodeIds.length} item(s)`,
        target: { releaseId: r.id, nodeIds },
        origin: r.createdBy.kind === "agent" ? "agent" : "person",
        approval: approvalState(r),
        state: r.state,
        ...(flagged.length > 0 ? { overlaps: flagged } : {}),
      });
    }
  }
  if (types.has("gate")) {
    const nodes: (ContentEntry | Page)[] = [
      ...(await graph.listContentEntries(siteId)),
      ...(await graph.listPages(siteId)),
    ];
    for (const n of nodes) {
      if (query.collection && (n as ContentEntry).collection !== query.collection) continue;
      for (const edge of ["from", "until"] as const) {
        const at = n.availability?.[edge];
        if (!at || !inRange(at)) continue;
        const author = (n as ContentEntry).author;
        out.push({
          id: `gate:${n.id}:${edge}`,
          kind: "gate",
          at: canonicalInstant(at),
          title: n.title,
          target: { nodeId: n.id },
          origin: author?.kind === "agent" ? "agent" : "person",
          approval: "none",
          state: edge === "from" ? "embargo" : "expiry",
        });
      }
    }
  }
  if (types.has("automation")) {
    for (const a of await deps.store.listAutomations(siteId)) {
      if (a.state !== "active") continue;
      const occ = occurrences(a.recurrence, {
        after: from - 1,
        before: to,
        limit: CALENDAR_MAX_ITEMS,
      });
      for (const o of occ)
        out.push({
          id: `occ:${a.id}:${o.at}`,
          kind: "automation",
          at: o.at,
          title: a.name,
          target: { automationId: a.id },
          origin: a.job.kind === "agent-task" ? "agent" : "person",
          approval: "none",
          state: "planned",
        });
    }
  }
  const q = query.q?.toLocaleLowerCase();
  const filtered = out
    .filter((i) => !query.states || query.states.includes(i.state))
    .filter((i) => !query.origin || i.origin === query.origin)
    .filter((i) => !query.approval || i.approval === query.approval)
    .filter((i) => !q || i.title.toLocaleLowerCase().includes(q))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : 1));
  const offset = query.offset ?? 0;
  const limit = Math.min(query.limit ?? CALENDAR_MAX_ITEMS, CALENDAR_MAX_ITEMS);
  const page = filtered.slice(offset, offset + limit);
  return {
    items: page,
    ...(offset + limit < filtered.length ? { nextCursor: String(offset + limit) } : {}),
  };
}

// ───────────────────────────── automation runs (§11.2–§11.5) ─────────────────────────────

/** Anomaly counters kept on the run's `counts` (§11.4 item 6). */
export const RUN_COUNTS = { reduce: "reduce-calls", refusals: "refusals" } as const;

/** An automation key's open run, as one call sees it. */
export interface RunContext {
  run: ScheduleRun;
  automation: Automation & { job: Extract<AutomationJob, { kind: "agent-task" }> };
  state: RunTaintState;
}

export function taintStateOf(run: ScheduleRun): RunTaintState {
  return {
    ...(run.taint ? { taint: run.taint } : {}),
    reduceCalls: run.counts?.[RUN_COUNTS.reduce] ?? 0,
    consecutiveRefusals: run.counts?.[RUN_COUNTS.refusals] ?? 0,
  };
}

/**
 * The principal an automation key works as inside its run (§11.2, §11.4): the mode is the key's,
 * capped by the automation's `modeCap` (never `bypass`); an automation that reads untrusted text
 * loses its write scopes on every call.
 */
export function runPrincipal(
  principal: Principal,
  automation: RunContext["automation"],
): Principal {
  const mode = clampMode(effectiveMode(principal) ?? "edits", automation.job.modeCap);
  return {
    ...principal,
    mode: mode === "bypass" ? "edits" : mode,
    local: false,
    scopes: automation.job.readsUntrustedText
      ? (untrustedEffectiveScopes(principal.scopes) as Principal["scopes"])
      : principal.scopes,
  };
}

export type RunResolution =
  | { kind: "none" }
  | { kind: "run"; run: RunContext; principal: Principal }
  | { kind: "outside"; message: string; automation?: Automation };

/**
 * Resolves an automation key's call (§11.2): its automation (active, its own key, schedules and
 * automations on) and its open run. `none` for other principals.
 */
export async function resolveRun(
  deps: SchedulesDeps | undefined,
  principal: Principal,
  now: Date,
): Promise<RunResolution> {
  if (!principal.automationId) return { kind: "none" };
  if (!schedulesAvailable(deps) || deps.automationsEnabled === false)
    return { kind: "outside", message: "automations are turned off on this deployment" };
  const automation = principal.keyId
    ? await deps.store.automationByKey(principal.keyId)
    : undefined;
  if (
    !automation ||
    automation.id !== principal.automationId ||
    automation.job.kind !== "agent-task"
  )
    return { kind: "outside", message: "this key's automation no longer exists" };
  if (automation.state !== "active")
    return {
      kind: "outside",
      message: `the automation is ${automation.state}${automation.pausedReason ? ` (${automation.pausedReason})` : ""}; a person resumes it in Studio`,
      automation,
    };
  const run = await deps.store.openAgentRun(automation.siteId, automation.id, now.toISOString());
  if (!run)
    return {
      kind: "outside",
      message: "this key works only inside an open run of its automation: call begin_run first",
      automation,
    };
  const ctx: RunContext = {
    run,
    automation: automation as RunContext["automation"],
    state: taintStateOf(run),
  };
  return { kind: "run", run: ctx, principal: runPrincipal(principal, ctx.automation) };
}

// ───────────────────────────── the scheduler's re-check (§10.6) ─────────────────────────────

/** Who is who now, for the re-check at run time. */
export interface ReleaseRightsSource {
  /** A staff person's current role by actor id (`user_…`); undefined when they left. */
  role(personId: string): Promise<Role | undefined>;
  /** An agent key's state now; undefined when it was revoked or its creator left. */
  key?(keyId: string): Promise<{ mode: AgentMode; creatorRole: Role } | undefined>;
}

/**
 * `checkApproval` for `runDue` / `createScheduler` (§10.6), after `baseApprovalVerdict`:
 * - a person's approval holds while the approver is still a member who could approve it now
 *   (`releases:publish`, or `:own` with own-only items), else `approval_lost`;
 * - an `auto` approval holds while the key exists, its creator is a member and its effective mode
 *   (for an automation's key: capped by the automation's current `modeCap`) is still `auto`
 *   (`creator_removed`, `auto_window_ended`); a gate-only reduction
 *   (`cloudhal.reduce`) skips the mode rule — any mode that may edit may hide;
 * - without a rights source (no membership: local, tests) every approval holds.
 */
export function createReleaseApprovalCheck(input: {
  graph: SiteGraphStore;
  store: SqlScheduleStore;
  ownership: OwnershipResolver;
  rights?: ReleaseRightsSource | undefined;
}): (release: Release, now: Date) => Promise<ApprovalVerdict> {
  const lost = (reason: ExpiredReason): ApprovalVerdict => ({ ok: false, reason });
  return async (release) => {
    const approval = release.approval;
    if (!approval) return lost("unapproved");
    const rights = input.rights;
    if (!rights) return { ok: true };
    if (approval.kind === "person") {
      if (approval.by.id === LOCAL_PERSON.id) return { ok: true };
      const role = await rights.role(approval.by.id);
      if (!role) return lost("approval_lost");
      const scopes = roleScopes(role);
      if (holds(scopes, "releases:publish")) return { ok: true };
      if (!holds(scopes, "releases:publish:own")) return lost("approval_lost");
      const rec = await input.store.getReleaseRecord(release.siteId, release.id);
      const why = await notOwnRelease(
        input.graph,
        input.ownership,
        approval.by.id,
        rec?.items ?? [],
      );
      return why ? lost("approval_lost") : { ok: true };
    }
    const key = rights.key ? await rights.key(approval.keyId) : undefined;
    if (!key) return lost("creator_removed");
    if (release.metadata?.[RELEASE_META.reduce] === "1") return { ok: true };
    // An automation's key works no higher than its automation's current modeCap (§11.3): lowering
    // the cap below `auto` also ends the `auto` releases its runs scheduled.
    const automation = await input.store.automationByKey(approval.keyId);
    const cap = automation?.job.kind === "agent-task" ? automation.job.modeCap : "auto";
    const mode = clampMode(
      clampMode(key.mode, key.creatorRole === "contributor" ? "edits" : "auto"),
      cap,
    );
    if (mode !== "auto") return lost("auto_window_ended");
    return { ok: true };
  };
}

/** Releases whose state a person may still change (not running, not finished). */
export function editable(r: Release): boolean {
  return r.state !== "running" && !isTerminalRelease(r.state);
}

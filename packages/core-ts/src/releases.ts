/**
 * @cloudhal/core-ts/releases — releases on the site graph and the scheduler's runtime (RFC-0008
 * §6, §8). What the policy, REST and MCP layers call; they decide who may do what, this module
 * does it:
 *
 * - `ReleaseService` — create (pin the working-copy versions, the dependency closure, target
 *   bodies written now, the purge plan), add or remove items, re-pin, schedule, move, unschedule,
 *   cancel, "Edit and re-approve" a held page or entry, and "Publish now" (a person's manual run).
 *   Every time change pokes the ticker (`SchedulerRuntime.poke`).
 * - `releaseExecutor` — the `ReleaseExecutor` seam of `runDue`, filled with
 *   `SiteGraphStore.publishRelease` and the stored purge plan, sent after the batch.
 * - `runScheduledTick` — one tick over a `TickMeter`: the graph, the schedule store, the
 *   executor and the system jobs share the metered driver, so a tick stays inside the platform's
 *   per-invocation query budget (S17). Every ticker calls it: the admin Worker's cron and
 *   `SchedulerClock` alarm, the request backstop, the Node timer, `cloudhal schedules run-due`.
 * - `schedulerHealthReport` — the heartbeat and the "scheduler stalled" signal (§8.7) for
 *   `/api/scheduler`, notifications and `cloudhal schedules status`.
 *
 * It imports `@cloudhal/schedules` (and `temporal-polyfill` with it), so it is a subpath outside
 * the package index: the site Worker never bundles it.
 */
import type {
  Actor,
  ContentEntry,
  NodeRef,
  Page,
  Release,
  ReleaseApproval,
  ReleaseItem,
  ReleaseState,
  Snapshot,
} from "@cloudhal/core-contracts";
import {
  type ApprovalVerdict,
  type BuiltinRunner,
  canonicalInstant,
  composeRelease,
  DAY_MS,
  dependencyClosure,
  instantMs,
  isTerminalRelease,
  MAX_NEW_BODIES_PER_REQUEST,
  type NodeVersion,
  newLeaseToken,
  overviewNextWake,
  type PinnedItem,
  pinItems,
  RELEASE_LEASE_MS,
  type ReleaseExecution,
  type ReleaseExecutor,
  referencedNodeIds,
  releaseWhen,
  runClaimedRelease,
  runDue,
  runId,
  ScheduleConflictError,
  ScheduleError,
  type SchedulerHealthState,
  type SystemJobDefinition,
  schedulerHealth,
  TICK_BUDGETS,
  type TickBudget,
  TickMeter,
  type TickReport,
  type TickTrigger,
  type WhenInput,
} from "@cloudhal/schedules";
import { type ReleaseRecord, SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { type CachePurgePlan, planCachePurge } from "./cache-purge.ts";
import { NotFoundError } from "./errors.ts";
import type { NodeHold } from "./holds.ts";
import type { ReleasePurge } from "./release-apply.ts";
import { SiteGraphStore, type SiteGraphStoreOptions } from "./store.ts";

export type { ReleasePurge } from "./release-apply.ts";

/**
 * Sends a release's stored purge plan after its batch committed (§6.3 "After the batch"): `tags`
 * or `everything` when it went out, `deferred` when the shared purge budget was empty and the tags
 * went into the purge queue, `failed` when nothing could be done, `none` when nothing is cached.
 */
export type ReleasePurger = (siteId: string, plan: CachePurgePlan) => Promise<ReleasePurge>;

/** Which ticker drives a deployment (`/api/instance` `features.schedules.scheduler`, §13). */
export type SchedulerMode = "cron" | "alarm" | "node" | "request";

/** The ticker as the API and MCP layers see it: its mode, and a way to wake it earlier. */
export interface SchedulerRuntime {
  readonly mode: SchedulerMode;
  /**
   * Something became due at `at` (a release was scheduled, approved or moved; an automation was
   * created or resumed): the alarm or the Node timer moves earlier when `at` is sooner (§8.3).
   * Cron ignores pokes (it wakes every minute anyway). Never throws.
   */
  poke(at: string): Promise<void>;
}

/**
 * What a deployment hands the API (`ApiDeps.scheduler`): the runtime, and for the operator's
 * `cloudhal schedules run-due --remote` a tick on demand.
 */
export interface SchedulerControl extends SchedulerRuntime {
  runDue?(trigger: TickTrigger): Promise<TickReport>;
}

export type { TickReport, TickTrigger } from "@cloudhal/schedules";

/** A runtime whose ticker needs no pokes (cron), or none at all (tests). */
export const CRON_RUNTIME: SchedulerRuntime = { mode: "cron", poke: async () => {} };

// ───────────────────────────── the executor ─────────────────────────────

/**
 * Statements one release execution takes, for `runDue`'s budget check: the stored purge plan (1),
 * the site, the live snapshot and the parent (3), the eight-statement batch, and the purge's own
 * bookkeeping after it (up to 4). A site that moved between the reads and the batch repeats the
 * reads and the batch once; that rare path may end the tick early (`more`), never mid-batch.
 */
export const RELEASE_EXECUTOR_COST = 16;

export interface ReleaseExecutorOptions {
  readonly graph: SiteGraphStore;
  readonly schedules: SqlScheduleStore;
  /** Absent where nothing is cached (Node): the outcome records `purge: "none"`. */
  readonly purge?: ReleasePurger | undefined;
  /**
   * Corrects the outcome's `purge` after a deferred or failed purge. Default: through `schedules`.
   * The tick passes one over a counting (never refusing) driver, so a committed release always
   * gets its purge.
   */
  readonly recordPurge?: ((releaseId: string, purge: ReleasePurge) => Promise<void>) | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

function isPurgePlan(v: unknown): v is CachePurgePlan {
  if (!v || typeof v !== "object") return false;
  const p = v as { mode?: unknown; tags?: unknown };
  return p.mode === "everything" || (p.mode === "tags" && Array.isArray(p.tags));
}

/** The `ReleaseExecutor` of `runDue`: `publishRelease`, then the stored purge plan. */
export function releaseExecutor(o: ReleaseExecutorOptions): ReleaseExecutor {
  const log = o.log ?? (() => {});
  const recordPurge =
    o.recordPurge ?? ((id: string, purge: ReleasePurge) => o.schedules.recordPurge(id, purge));
  return {
    cost: RELEASE_EXECUTOR_COST,
    async execute(input): Promise<ReleaseExecution> {
      const stored = await o.schedules.releasePurgePlan(input.release.id);
      const plan: CachePurgePlan = isPurgePlan(stored)
        ? stored
        : { mode: "everything", reason: "no purge plan was stored with the release" };
      const expected: ReleasePurge = !o.purge
        ? "none"
        : plan.mode === "everything"
          ? "everything"
          : plan.tags.length > 0
            ? "tags"
            : "none";
      const r = await o.graph.publishRelease({
        release: input.release,
        items: input.items,
        run: {
          id: input.run.id,
          leaseToken: input.run.leaseToken,
          recovering: input.run.recovering,
        },
        now: input.now,
        latenessSeconds: input.latenessSeconds,
        purge: expected,
      });
      switch (r.kind) {
        case "published": {
          let purge: ReleasePurge = expected;
          if (r.committed && o.purge && expected !== "none") {
            try {
              purge = await o.purge(input.release.siteId, plan);
            } catch (e) {
              purge = "failed";
              log(
                `schedules: purge after release ${input.release.id} failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            if (purge !== expected)
              await recordPurge(input.release.id, purge).catch((e) =>
                log(
                  `schedules: could not record the purge of ${input.release.id}: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
          }
          return {
            kind: "published",
            snapshotId: r.snapshotId,
            baseSnapshotId: r.baseSnapshotId,
            purge,
            committed: r.committed,
          };
        }
        case "conflict":
          return { kind: "conflict", conflicts: r.conflicts };
        case "failed":
          return { kind: "failed", code: r.code, message: r.message };
        case "canceled":
          return { kind: "canceled" };
        case "retry":
          return { kind: "retry", error: r.error };
      }
    },
  };
}

/** Rewrites a published release's `outcome.purge` (one statement). */
export async function recordPurgeOutcome(
  sql: SqlDriver,
  releaseId: string,
  purge: ReleasePurge,
): Promise<void> {
  await new SqlScheduleStore(sql).recordPurge(releaseId, purge);
}

// ───────────────────────────── the tick ─────────────────────────────

/** A built-in job runner until the job bodies arrive (rollout step 9): ends each run, did nothing. */
export const NOOP_BUILTIN_RUNNER: BuiltinRunner = {
  cost: 0,
  async step() {
    return {
      done: true,
      outcome: "nothing-to-do",
      summary: "This built-in job has no steps in this version yet; nothing was checked.",
    };
  },
};

export interface ScheduledTickOptions {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly now: Date;
  readonly trigger: TickTrigger;
  /** Default: Workers Free (`TICK_BUDGETS.free`). */
  readonly budget?: TickBudget | undefined;
  /** `minute` with cron (it wakes every minute anyway), `computed` for the alarm and Node timer. */
  readonly wake: "minute" | "computed";
  /**
   * The deployment's periodic jobs behind watermarks (§8.2). `counted` is the tick's driver that
   * counts without refusing: jobs bound their own work, and their statements still count against
   * what is left for the rest of the tick.
   */
  readonly systemJobs?:
    | ((ctx: { counted: SqlDriver; graph: SiteGraphStore }) => readonly SystemJobDefinition[])
    | undefined;
  /** Default `NOOP_BUILTIN_RUNNER` (the job bodies are rollout step 9). */
  readonly builtins?: BuiltinRunner | undefined;
  /** The policy re-checks at run time (§10.6); rollout step 7 fills it. */
  readonly checkApproval?:
    | ((release: Release, now: Date) => ApprovalVerdict | Promise<ApprovalVerdict>)
    | undefined;
  /** Sends a published release's purge plan; it gets the counting driver for its bookkeeping. */
  readonly purge?: ((ctx: { counted: SqlDriver }) => ReleasePurger) | undefined;
  /** `CLOUDHAL_AUTOMATIONS=off` → false. */
  readonly automationsEnabled?: boolean | undefined;
  readonly log?: ((line: string) => void) | undefined;
  /** Options of the tick's `SiteGraphStore` (gates, hooks); its `sql` and `blobs` are the tick's. */
  readonly graph?: Omit<SiteGraphStoreOptions, "sql" | "blobs"> | undefined;
  /** Monotonic-enough clock for the deadline (tests). */
  readonly clock?: (() => number) | undefined;
}

/** One tick (§8.1) with everything on one metered driver. Never throws for a single unit's error. */
export async function runScheduledTick(o: ScheduledTickOptions): Promise<TickReport> {
  const meter = new TickMeter(o.budget ?? TICK_BUDGETS.free, o.clock);
  const metered = meter.wrap(o.sql);
  const counted = meter.wrapCounting(o.sql);
  const graph = new SiteGraphStore({ ...o.graph, sql: metered, blobs: o.blobs });
  const schedules = new SqlScheduleStore(metered);
  const purge = o.purge?.({ counted });
  return runDue(o.now, {
    store: schedules,
    meter,
    trigger: o.trigger,
    budget: meter.budget,
    releases: releaseExecutor({
      graph,
      schedules,
      purge,
      recordPurge: (id, p) => recordPurgeOutcome(counted, id, p),
      log: o.log,
    }),
    builtins: o.builtins ?? NOOP_BUILTIN_RUNNER,
    ...(o.checkApproval ? { checkApproval: o.checkApproval } : {}),
    ...(o.systemJobs ? { systemJobs: o.systemJobs({ counted, graph }) } : {}),
    ...(o.automationsEnabled === false ? { automationsEnabled: false } : {}),
    wake: o.wake,
    ...(o.log ? { log: o.log } : {}),
  });
}

/** The next instant anything is due (one read), for the alarm and the Node timer. */
export async function schedulerNextWake(sql: SqlDriver, now: Date): Promise<Date | undefined> {
  const next = overviewNextWake(await new SqlScheduleStore(sql).overview(canonicalInstant(now)));
  return next ? new Date(next) : undefined;
}

// ───────────────────────────── health ─────────────────────────────

/** §8.7, for `/api/scheduler`, the `scheduler-stalled` notification and `cloudhal schedules status`. */
export interface SchedulerHealthReport {
  readonly mode: SchedulerMode;
  /** `running`, `late` (stalled with work due within 24 h), `stopped`, or `unknown` (never ticked). */
  readonly state: SchedulerHealthState;
  readonly healthy: boolean;
  readonly lastTickAt?: string;
  readonly lastTrigger?: TickTrigger;
  /** When the next tick (or heartbeat) is expected. */
  readonly nextWakeAt?: string;
  /** Lag of the oldest due item at the last tick, in seconds. */
  readonly lagSeconds?: number;
  /** The next scheduled release or automation run. */
  readonly nextDueAt?: string;
  readonly dueWithin24h: boolean;
}

/** The scheduler's health from the heartbeat and the next due work (one read). */
export async function schedulerHealthReport(
  sql: SqlDriver,
  options: { now: Date; mode: SchedulerMode },
): Promise<SchedulerHealthReport> {
  const now = canonicalInstant(options.now);
  const o = await new SqlScheduleStore(sql).overview(now);
  const due = [o.nextReleaseAt, o.nextAutomationAt]
    .filter((x): x is string => x !== undefined)
    .map(instantMs);
  const nextDue = due.length > 0 ? Math.min(...due) : undefined;
  const dueWithin24h = nextDue !== undefined && nextDue <= instantMs(now) + DAY_MS;
  const h = schedulerHealth(o.heartbeat, now, { dueWithin24h });
  return {
    mode: options.mode,
    state: h.state,
    healthy: h.healthy,
    ...(h.lastTickAt ? { lastTickAt: h.lastTickAt } : {}),
    ...(o.heartbeat ? { lastTrigger: o.heartbeat.trigger } : {}),
    ...(h.nextWakeAt ? { nextWakeAt: h.nextWakeAt } : {}),
    ...(o.heartbeat?.lagSeconds !== undefined ? { lagSeconds: o.heartbeat.lagSeconds } : {}),
    ...(nextDue !== undefined ? { nextDueAt: canonicalInstant(nextDue) } : {}),
    dueWithin24h,
  };
}

// ───────────────────────────── the service ─────────────────────────────

export interface ReleaseServiceOptions {
  readonly graph: SiteGraphStore;
  /** The database of `graph` (default `graph.sql`). */
  readonly sql?: SqlDriver | undefined;
  /** The clock for lead times and "Publish now" (default `Date.now`). */
  readonly now?: (() => Date) | undefined;
  /** The ticker, poked when a release's time is set or moved (default: cron, no pokes). */
  readonly scheduler?: SchedulerRuntime | undefined;
  /** "Publish now" purges like a tick does (absent: nothing cached). */
  readonly purge?: ReleasePurger | undefined;
  /** New bodies one call may write (§6.1 step 4; Workers Free: 20). `Infinity` on Node. */
  readonly maxNewBodies?: number | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

export interface PinRequest {
  /** Nodes whose current working-copy version goes live. */
  readonly set?: readonly string[] | undefined;
  /** Entries, pages and redirects taken out of the live site. */
  readonly remove?: readonly string[] | undefined;
}

export interface CreateReleaseRequest extends PinRequest {
  readonly siteId: string;
  readonly createdBy: Actor;
  readonly title?: string | undefined;
  /** An instant, a wall-clock time (in `timeZone`, else the site's zone), or `on-approval`. */
  readonly when?: WhenInput | undefined;
  readonly metadata?: Record<string, string> | undefined;
}

export interface PinnedRelease {
  readonly release: Release;
  /** Nodes added because a target needs them and they are not live (§6.1 step 2). */
  readonly closureAdded: string[];
  /** Referenced ids that exist nowhere (left out of the dependency check; the renderer skips them). */
  readonly missing: string[];
}

/** A release with what Studio and `get_release` show beside it (§12). */
export interface ReleaseDetail extends ReleaseRecord {
  /** Nodes of this release that are also in another open release (D15: flagged, not refused). */
  readonly overlaps: Record<string, string[]>;
  /** Nodes this release holds right now (locked against edits). */
  readonly lockedNodes: string[];
}

/** A person's approval (`ReleaseApproval` of kind `person`). */
export type PersonApproval = Extract<ReleaseApproval, { kind: "person" }>;

/** Releases on one site graph (§6.1–§6.6, §8.6 "Publish now"). */
export class ReleaseService {
  readonly graph: SiteGraphStore;
  readonly schedules: SqlScheduleStore;
  readonly #sql: SqlDriver;
  readonly #now: () => Date;
  readonly #scheduler: SchedulerRuntime;
  readonly #purge: ReleasePurger | undefined;
  readonly #maxNewBodies: number;
  readonly #log: (line: string) => void;

  constructor(o: ReleaseServiceOptions) {
    this.graph = o.graph;
    this.#sql = o.sql ?? o.graph.sql;
    this.#now = o.now ?? (() => new Date());
    this.schedules = new SqlScheduleStore(this.#sql, { now: this.#now });
    this.#scheduler = o.scheduler ?? CRON_RUNTIME;
    this.#purge = o.purge;
    this.#maxNewBodies = o.maxNewBodies ?? MAX_NEW_BODIES_PER_REQUEST;
    this.#log = o.log ?? (() => {});
  }

  async #site(siteId: string) {
    const site = await this.graph.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    return site;
  }

  async #record(siteId: string, id: string): Promise<ReleaseRecord> {
    const rec = await this.schedules.getReleaseRecord(siteId, id);
    if (!rec) throw new ScheduleError("not_found", `release ${id} not found`);
    return rec;
  }

  async #poke(at: string | undefined): Promise<void> {
    if (!at) return;
    try {
      await this.#scheduler.poke(at);
    } catch (e) {
      this.#log(`schedules: poke failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Pins items (§6.1): the working-copy version of each `set` node and the live version as its
   * base, the dependency closure, every target body written to the blob store now (the run reads
   * none), and the purge plan `L → L ⊕ items`. `lenient` (re-pins) drops nodes that are live in
   * their working version already instead of refusing them.
   */
  async #pin(
    siteId: string,
    request: PinRequest,
    lenient = false,
  ): Promise<{
    items: PinnedItem[];
    added: string[];
    missing: string[];
    purgePlan: CachePurgePlan;
  }> {
    const site = await this.#site(siteId);
    const working = await this.graph.currentNodeRefs(siteId);
    const live = site.publishedSnapshotId
      ? await this.graph.getSnapshot(site.publishedSnapshotId)
      : undefined;
    const liveRefs = live?.nodes ?? [];
    let set = [...(request.set ?? [])];
    if (lenient) {
      const w = new Map(working.map((n) => [n.id, n.hash]));
      const l = new Map(liveRefs.map((n) => [n.id, n.hash]));
      set = set.filter((id) => !w.has(id) || w.get(id) !== l.get(id));
    }
    const remove = [...(request.remove ?? [])];
    if (set.length + remove.length === 0)
      throw new ScheduleError("nothing_to_publish", "every node is live in its current version");
    const items = pinItems({ siteId, set, remove, working, live: liveRefs });
    const bodies = new Map<string, string>();
    const bodyOf = async (ref: NodeVersion): Promise<string> => {
      const hit = bodies.get(ref.hash);
      if (hit !== undefined) return hit;
      const row = await this.#sql.get<{ body: string }>(
        "SELECT body FROM nodes WHERE id = ? AND hash = ?",
        [ref.id, ref.hash],
      );
      if (!row)
        throw new ScheduleError(
          "node_not_found",
          `${ref.id} changed while the release was being pinned; try again`,
        );
      bodies.set(ref.hash, row.body);
      return row.body;
    };
    const closure = await dependencyClosure({
      items,
      working,
      live: liveRefs,
      depsOf: async (ref) => referencedNodeIds(JSON.parse(await bodyOf(ref))),
      blobOf: async (ref) => {
        const a = JSON.parse(await bodyOf(ref)) as { storage?: { kind?: string }; sha256?: string };
        return a.storage?.kind === "blob" ? a.sha256 : undefined;
      },
    });
    const missing = new Set(closure.missing);
    const pinned = closure.items.map((p) =>
      missing.size > 0 ? { ...p, deps: p.deps.filter((d) => !missing.has(d)) } : p,
    );
    // Step 4: target bodies now, as createSnapshot does (at most `maxNewBodies` new ones per call).
    let written = 0;
    for (const p of pinned) {
      if (p.item.kind !== "set") continue;
      const key = `nodes/${p.item.target.hash}.json`;
      if (await this.graph.blobs.head(key)) continue;
      if (++written > this.#maxNewBodies)
        throw new ScheduleError(
          "too_many_items",
          `at most ${this.#maxNewBodies} new versions per call: add the rest with addItems`,
        );
      const ref: NodeVersion = {
        id: p.item.nodeId,
        kind: p.item.nodeKind,
        ...p.item.target,
      };
      await this.graph.blobs.put(key, new TextEncoder().encode(await bodyOf(ref)), {
        contentType: "application/json",
      });
    }
    return {
      items: pinned,
      added: closure.added,
      missing: closure.missing,
      purgePlan: await this.#purgePlan(
        live,
        pinned.map((p) => p.item),
      ),
    };
  }

  /** Step 5: `planCachePurge(L → L ⊕ items)` over a virtual snapshot (bodies are in the blob store). */
  async #purgePlan(
    live: Snapshot | undefined,
    items: readonly ReleaseItem[],
  ): Promise<CachePurgePlan> {
    if (!live) return { mode: "everything", reason: "nothing is live yet" };
    const target: Snapshot = {
      ...live,
      id: "snap_releaseplan",
      nodes: composeRelease(live.nodes, items),
    };
    return planCachePurge(
      {
        getSnapshot: async (id) => (id === live.id ? live : id === target.id ? target : undefined),
        readSnapshotNode: (ref: NodeRef) => this.graph.readSnapshotNode(ref),
      },
      live.id,
      target.id,
    );
  }

  /** A new `draft` release of the working-copy versions of `set` (and removals). */
  async create(request: CreateReleaseRequest): Promise<PinnedRelease> {
    const site = await this.#site(request.siteId);
    const when = request.when
      ? releaseWhen(request.when, {
          ...(site.timeZone ? { siteTimeZone: site.timeZone } : {}),
          now: this.#now(),
        })
      : undefined;
    const pin = await this.#pin(request.siteId, request);
    const release = await this.schedules.createRelease({
      siteId: request.siteId,
      items: pin.items,
      createdBy: request.createdBy,
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(when ? { when } : {}),
      ...(request.metadata ? { metadata: request.metadata } : {}),
      purgePlan: pin.purgePlan,
    });
    return { release, closureAdded: pin.added, missing: pin.missing };
  }

  async get(siteId: string, id: string): Promise<ReleaseDetail> {
    const rec = await this.#record(siteId, id);
    const all = await this.schedules.overlaps(siteId);
    const mine = new Set(rec.release.items.map((i) => i.nodeId));
    const overlaps: Record<string, string[]> = {};
    for (const [nodeId, ids] of all)
      if (mine.has(nodeId) && ids.includes(id)) overlaps[nodeId] = ids.filter((x) => x !== id);
    return {
      ...rec,
      overlaps,
      lockedNodes: rec.items.filter((i) => i.held).map((i) => i.item.nodeId),
    };
  }

  list(
    siteId: string,
    options: { states?: readonly ReleaseState[]; limit?: number } = {},
  ): Promise<Release[]> {
    return this.schedules.listReleases(siteId, options);
  }

  /** Releases of a site that are not terminal (`cloudhal push` refuses while there are any). */
  openReleases(siteId: string): Promise<Release[]> {
    return this.schedules.listReleases(siteId, {
      states: ["draft", "awaiting_approval", "scheduled", "running"],
      limit: 200,
    });
  }

  /** Which releases hold a node right now (for `409 scheduled_locked` answers and Studio). */
  async holdsOf(siteId: string, nodeId: string): Promise<NodeHold[]> {
    return (await this.graph.heldNodes(siteId, [nodeId])).get(nodeId) ?? [];
  }

  /**
   * Re-pins the release's nodes to their current working-copy versions plus `add`, minus `drop`
   * (§6.1.6, §6.4 "re-pin"): a new `rl1:` hash, the approval voided — a `draft`/`conflict` becomes a
   * `draft`, an `awaiting_approval`/`scheduled` one waits for approval. With `approval` (a person
   * who may approve it, "Edit and re-approve") it is scheduled again in the same call.
   */
  async repin(
    siteId: string,
    id: string,
    input: {
      expectedRev: number;
      add?: PinRequest;
      drop?: readonly string[];
      approval?: PersonApproval;
    },
  ): Promise<PinnedRelease> {
    const rec = await this.#record(siteId, id);
    if (rec.release.rev !== input.expectedRev) throw new ScheduleConflictError("release", id);
    const drop = new Set(input.drop ?? []);
    const set = new Set<string>();
    const remove = new Set<string>();
    for (const i of rec.release.items) {
      if (drop.has(i.nodeId)) continue;
      (i.kind === "set" ? set : remove).add(i.nodeId);
    }
    for (const n of input.add?.set ?? []) set.add(n);
    for (const n of input.add?.remove ?? []) remove.add(n);
    const pin = await this.#pin(siteId, { set: [...set], remove: [...remove] }, true);
    let release = await this.schedules.repinRelease(siteId, id, {
      expectedRev: input.expectedRev,
      items: pin.items,
      purgePlan: pin.purgePlan,
    });
    if (input.approval && release.state === "awaiting_approval")
      release = await this.schedule(siteId, id, {
        expectedRev: release.rev,
        approval: input.approval,
      });
    return { release, closureAdded: pin.added, missing: pin.missing };
  }

  /** Adds items to a release (in chunks of at most `maxNewBodies` new versions, §6.1 step 4). */
  addItems(
    siteId: string,
    id: string,
    input: PinRequest & { expectedRev: number; approval?: PersonApproval },
  ): Promise<PinnedRelease> {
    return this.repin(siteId, id, {
      expectedRev: input.expectedRev,
      add: input,
      ...(input.approval ? { approval: input.approval } : {}),
    });
  }

  /**
   * "Unschedule and edit" one node (§6.2): the item leaves the release (a one-item release becomes a
   * draft); the node is unlocked once no other open release holds it.
   */
  async removeItem(
    siteId: string,
    id: string,
    nodeId: string,
    input: { expectedRev: number; approval?: PersonApproval },
  ): Promise<Release> {
    const rec = await this.#record(siteId, id);
    if (!rec.release.items.some((i) => i.nodeId === nodeId))
      throw new ScheduleError("node_not_found", `${nodeId} is not in release ${id}`);
    if (rec.release.items.length === 1) return this.unschedule(siteId, id, input);
    return (
      await this.repin(siteId, id, {
        expectedRev: input.expectedRev,
        drop: [nodeId],
        ...(input.approval ? { approval: input.approval } : {}),
      })
    ).release;
  }

  /**
   * Schedules a `draft` (or a release waiting for approval): with a person's (or an `auto`) approval
   * it is `scheduled`, held and locked; without one it waits for approval (`requestId`: the
   * approval request filed for it). `when` defaults to the release's own; `on-approval` runs at the
   * next tick once scheduled.
   */
  async schedule(
    siteId: string,
    id: string,
    input: {
      expectedRev: number;
      when?: WhenInput;
      approval?: ReleaseApproval;
      requestId?: string;
    },
  ): Promise<Release> {
    const site = await this.#site(siteId);
    const when = input.when
      ? releaseWhen(input.when, {
          ...(site.timeZone ? { siteTimeZone: site.timeZone } : {}),
          now: this.#now(),
        })
      : undefined;
    const release = await this.schedules.transitionRelease(siteId, id, {
      expectedRev: input.expectedRev,
      to: input.approval ? "scheduled" : "awaiting_approval",
      ...(when ? { when } : {}),
      ...(input.approval ? { approval: input.approval } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    });
    if (release.state === "scheduled")
      await this.#poke(release.when?.kind === "at" ? release.when.at : this.#now().toISOString());
    return release;
  }

  /**
   * Moves a scheduled release (D4): `keepApproval` for a person who may approve it (the approval
   * stands, the move is audited by the caller); otherwise (an agent's move) the approval is voided
   * and it waits for approval again (`requestId`).
   */
  async move(
    siteId: string,
    id: string,
    input: { expectedRev: number; when: WhenInput; keepApproval: boolean; requestId?: string },
  ): Promise<Release> {
    const site = await this.#site(siteId);
    const when = releaseWhen(input.when, {
      ...(site.timeZone ? { siteTimeZone: site.timeZone } : {}),
      now: this.#now(),
    });
    const rec = await this.#record(siteId, id);
    const keep = input.keepApproval && rec.release.state === "scheduled";
    const release = await this.schedules.transitionRelease(siteId, id, {
      expectedRev: input.expectedRev,
      to: keep ? "scheduled" : "awaiting_approval",
      when,
      ...(keep ? {} : { approval: null }),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    });
    if (release.state === "scheduled" && when.kind === "at") await this.#poke(when.at);
    return release;
  }

  /** Back to `draft` (D4/§5.2 "Unschedule"): the approval and the request are dropped, the nodes unlocked. */
  unschedule(siteId: string, id: string, input: { expectedRev: number }): Promise<Release> {
    return this.schedules.transitionRelease(siteId, id, {
      expectedRev: input.expectedRev,
      to: "draft",
      approval: null,
      requestId: null,
    });
  }

  /** Withdraws a release (`canceled`); a running one cannot be canceled (it finishes in seconds). */
  cancel(siteId: string, id: string, input: { expectedRev: number; by: Actor }): Promise<Release> {
    return this.schedules.cancelRelease(siteId, id, input);
  }

  /**
   * "Edit and re-approve" an entry held by this release (§6.2, people only): the edit goes
   * through, the item is re-pinned to it, and with `approval` (the editor may approve the release)
   * the release is scheduled again in the same act; otherwise it waits for approval ("Edit and
   * send for approval").
   */
  async editHeldEntry(
    siteId: string,
    releaseId: string,
    entry: ContentEntry,
    input: { approval?: PersonApproval } = {},
  ): Promise<{ entry: ContentEntry; release: PinnedRelease }> {
    const rec = await this.#record(siteId, releaseId);
    const saved = await this.graph.updateContentEntry(entry, { releaseEdit: releaseId });
    const release = await this.repin(siteId, releaseId, {
      expectedRev: rec.release.rev,
      ...(input.approval ? { approval: input.approval } : {}),
    });
    return { entry: saved, release };
  }

  /** "Edit and re-approve" a page held by this release (see `editHeldEntry`). */
  async editHeldPage(
    siteId: string,
    releaseId: string,
    page: Page,
    input: { approval?: PersonApproval } = {},
  ): Promise<{ page: Page; release: PinnedRelease }> {
    const rec = await this.#record(siteId, releaseId);
    const saved = await this.graph.updatePage(page, { releaseEdit: releaseId });
    const release = await this.repin(siteId, releaseId, {
      expectedRev: rec.release.rev,
      ...(input.approval ? { approval: input.approval } : {}),
    });
    return { page: saved, release };
  }

  /**
   * "Publish now" (§8.6, §13 `publish-now`): a person's manual run of a `scheduled`, `missed` or
   * `expired` release, now. The conflict check applies, the snapshot records the real time, the
   * person is the approver. The caller checks the person's rights (`releases:publish`).
   */
  async publishNow(
    siteId: string,
    id: string,
    input: { expectedRev: number; by: PersonApproval["by"] },
  ): Promise<{ release: Release; report: TickReport }> {
    const rec = await this.#record(siteId, id);
    if (isTerminalRelease(rec.release.state) && !["missed", "expired"].includes(rec.release.state))
      throw new ScheduleError(
        "invalid_transition",
        `a ${rec.release.state} release cannot be published now`,
      );
    const now = this.#now();
    const at = canonicalInstant(now);
    const token = newLeaseToken();
    const run = await runId(id, at);
    const claimed = await this.schedules.claimManualRun({
      siteId,
      releaseId: id,
      expectedRev: input.expectedRev,
      approval: { kind: "person", by: input.by, at, executeAt: at },
      runId: run,
      token,
      now: at,
      leaseUntil: canonicalInstant(instantMs(at) + RELEASE_LEASE_MS),
    });
    if (!claimed)
      throw new ScheduleError(
        "invalid_transition",
        `release ${id} changed, is not due for a manual run, or another release of the site is running`,
      );
    const current = await this.#record(siteId, id);
    const report = await runClaimedRelease(
      {
        store: this.schedules,
        trigger: "manual",
        releases: releaseExecutor({
          graph: this.graph,
          schedules: this.schedules,
          purge: this.#purge,
          log: this.#log,
        }),
        log: this.#log,
      },
      {
        release: current.release,
        items: current.items,
        executeAt: at,
        runId: run,
        token,
        now,
      },
    );
    return { release: (await this.#record(siteId, id)).release, report };
  }
}

// ───────────────────────────── operator views ─────────────────────────────

/**
 * The deployment's schedules level: what this code enforces (holds, locks, gates through the
 * renderer). `cloudhal deploy` refuses to deploy code with a lower level over a deployment that
 * has open releases or gated nodes (RFC-0008 Compatibility: older code ignores holds and gates),
 * unless `--force-downgrade`. Mirrored in this package's `package.json` (`cloudhal.schedulesLevel`)
 * so the CLI can read the level of the code it is about to deploy without loading it.
 */
export const SCHEDULES_ENGINE_LEVEL = 1;

/** A release in one line, for the operator (`cloudhal schedules status|list`, the push guard). */
export interface ReleaseSummary {
  readonly id: string;
  readonly state: ReleaseState;
  readonly title?: string;
  readonly executeAt?: string;
  readonly items: number;
}

export function releaseSummary(r: Release): ReleaseSummary {
  return {
    id: r.id,
    state: r.state,
    ...(r.title ? { title: r.title } : {}),
    ...(r.when?.kind === "at" ? { executeAt: r.when.at } : {}),
    items: r.items.length,
  };
}

/**
 * Pages and entries of a site (working copy) with a gate still ahead — an embargo or an expiry
 * after `now`. Older code would ignore them, so they block a downgrade like open releases do.
 */
export async function gatedNodeCount(sql: SqlDriver, siteId: string, now: Date): Promise<number> {
  const rows = await sql.all<{ a: string | null }>(
    `SELECT json_extract(body, '$.availability') AS a FROM nodes
     WHERE site_id = ? AND kind IN ('page', 'contentEntry') AND json_extract(body, '$.availability') IS NOT NULL`,
    [siteId],
  );
  const t = now.getTime();
  let n = 0;
  for (const r of rows) {
    try {
      const a = JSON.parse(String(r.a)) as { from?: string; until?: string };
      if ([a.from, a.until].some((x) => x !== undefined && !(Date.parse(x) <= t))) n++;
    } catch {
      n++; // an unreadable gate counts (fail closed)
    }
  }
  return n;
}

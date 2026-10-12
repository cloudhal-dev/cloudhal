/**
 * `publishRelease` (RFC-0008 §6.3): applies a claimed release on top of whatever is live, in one
 * guarded batch. Reads first — the site row, the live snapshot `L`, the site's latest snapshot (the
 * parent, so history stays linear and `L` remains an ancestor), and on a recovered run one lookup
 * for a snapshot the run already wrote — then:
 *
 * - **conflicts** (S4): every item's node must be live at its pinned base (both absent counts as
 *   equal), else nothing is written but the outcome;
 * - **compose** (S1): `nodes(S) = nodes(L) − ids + targets`, the site ref stays `L`'s;
 * - **dependencies**: every id a target references must be in `nodes(S)`;
 * - **one batch** (AGENTS.md rule 4): (1) the pointer flip, a CAS on the site's `rev` and `hash`
 *   and on the run's and the release's lease; every later statement is guarded on the site's new
 *   hash — (2) the `scheduled` snapshot, (3) the live assets' GC roots carried over, (4) the
 *   release's asset blobs rooted, (5–7) the run, the items and the release finished
 *   (`releaseFinishStatements`), (8) the audit row (actor the scheduler, on behalf of the
 *   approver). Eight statements at most.
 *
 * When the flip changes no row (an ordinary publish, a settings edit or a rollback moved the site
 * between the reads and the write), the reads and steps are repeated once; a second miss is a
 * transient error and the run stays claimed for a retry inside the hour.
 *
 * Temporal-free (imports `@cloudhal/schedules/engine` only), so the store's index keeps the site
 * Worker's bundle free of the time-zone library.
 */
import type {
  Actor,
  NodeRef,
  Release,
  ReleaseConflict,
  ReleaseFailedOutcome,
  ReleasePublishedOutcome,
  Site,
  Snapshot,
} from "@cloudhal/core-contracts";
import { assertValid } from "@cloudhal/core-contracts";
import {
  type PinnedItem,
  planRelease,
  releaseFinishStatements,
  SCHEDULER_ACTOR,
} from "@cloudhal/schedules/engine";
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import { canonicalJson, nodeHash } from "./hash.ts";
import { ID_PREFIX } from "./ids.ts";
import { casUpdateStatement } from "./node-sql.ts";

/** How the edge cache followed a published release (`ReleasePublishedOutcome.purge`). */
export type ReleasePurge = ReleasePublishedOutcome["purge"];

export interface PublishReleaseInput {
  readonly release: Release;
  /** The pinned items with what the run needs without reading bodies (`deps`, `blobSha`). */
  readonly items: readonly Pick<PinnedItem, "item" | "deps" | "blobSha">[];
  /** The claimed run: its id and the lease token every write is guarded on. */
  readonly run: { readonly id: string; readonly leaseToken: string; readonly recovering?: boolean };
  /** The tick's clock: the snapshot, the outcome and the audit row record it. */
  readonly now: Date;
  readonly latenessSeconds: number;
  /**
   * The outcome's `purge` as written in the batch: what the stored purge plan will do (`none`
   * where nothing is cached). The caller corrects it after the purge when the purge was deferred
   * or failed (§6.3 "After the batch").
   */
  readonly purge: ReleasePurge;
}

export type PublishReleaseResult =
  | {
      readonly kind: "published";
      readonly site: Site;
      readonly snapshotId: string;
      readonly baseSnapshotId: string;
      /** The pointer moved from (absent on a site never published before). */
      readonly from?: string;
      /** False when a recovered run found its snapshot already written (nothing new committed). */
      readonly committed: boolean;
    }
  | { readonly kind: "conflict"; readonly conflicts: ReleaseConflict[] }
  | {
      readonly kind: "failed";
      readonly code: ReleaseFailedOutcome["code"];
      readonly message: string;
    }
  /** The site no longer exists (§10.6: canceled by the system). */
  | { readonly kind: "canceled"; readonly message: string }
  /** The site moved twice between the reads and the batch: retry with back-off. */
  | { readonly kind: "retry"; readonly error: string };

export interface ReleaseApplyContext {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly newId: (prefix: string) => string;
  readonly getSnapshot: (id: string) => Promise<Snapshot | undefined>;
  readonly latestSnapshot: (siteId: string) => Promise<Snapshot | undefined>;
}

const byId = (a: NodeRef, b: NodeRef) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function diffSummary(before: readonly NodeRef[], after: readonly NodeRef[]) {
  const b = new Map(before.map((n) => [n.id, n.hash]));
  const a = new Map(after.map((n) => [n.id, n.hash]));
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const [id, hash] of a) {
    const prev = b.get(id);
    if (prev === undefined) added++;
    else if (prev !== hash) changed++;
  }
  for (const id of b.keys()) if (!a.has(id)) removed++;
  return { added, changed, removed };
}

/** Who the scheduler publishes for: the approver (S14). */
function approverOf(release: Release): Actor | undefined {
  const a = release.approval;
  if (!a) return undefined;
  return a.kind === "person" ? { kind: "human", ...a.by } : a.by;
}

/** The snapshot's label: the release title, else "Scheduled: <the first page or entry's title>". */
async function labelOf(
  ctx: ReleaseApplyContext,
  release: Release,
  items: PublishReleaseInput["items"],
): Promise<string> {
  if (release.title) return release.title.slice(0, 200);
  const first = items.find(
    (i) =>
      i.item.kind === "set" && (i.item.nodeKind === "contentEntry" || i.item.nodeKind === "page"),
  )?.item;
  if (first?.kind === "set") {
    try {
      const bytes = await ctx.blobs.get(`nodes/${first.target.hash}.json`);
      const title = bytes
        ? (JSON.parse(new TextDecoder().decode(bytes)) as { title?: unknown }).title
        : undefined;
      if (typeof title === "string" && title.trim())
        return `Scheduled: ${title.trim()}`.slice(0, 200);
    } catch {
      // the label is cosmetic
    }
  }
  return `Scheduled release ${release.id}`;
}

export async function publishRelease(
  ctx: ReleaseApplyContext,
  input: PublishReleaseInput,
): Promise<PublishReleaseResult> {
  const { release, items, run } = input;
  const siteId = release.siteId;
  const ts = input.now.toISOString();

  if (run.recovering) {
    // §6.3 Recovery: the effect may have happened under the lease that expired.
    const done = await ctx.sql.get<{ id: string }>(
      `SELECT id FROM snapshots WHERE site_id = ? AND json_extract(body, '$.metadata."cloudhal.run"') = ? LIMIT 1`,
      [siteId, run.id],
    );
    if (done) {
      const row = await ctx.sql.get<{ body: string }>(
        "SELECT body FROM nodes WHERE id = ? AND kind = 'site'",
        [siteId],
      );
      if (!row) return { kind: "canceled", message: `site ${siteId} no longer exists` };
      const snap = await ctx.getSnapshot(done.id);
      return {
        kind: "published",
        site: JSON.parse(row.body) as Site,
        snapshotId: done.id,
        baseSnapshotId: snap?.metadata?.["cloudhal.base"] || snap?.parentId || done.id,
        committed: false,
      };
    }
  }

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    // Reads: the site row, the live snapshot, the latest snapshot (the parent).
    const row = await ctx.sql.get<{ body: string; rev: number; hash: string }>(
      "SELECT body, rev, hash FROM nodes WHERE id = ? AND kind = 'site'",
      [siteId],
    );
    if (!row) return { kind: "canceled", message: `site ${siteId} no longer exists` };
    const site = JSON.parse(row.body) as Site;
    const live = site.publishedSnapshotId
      ? await ctx.getSnapshot(site.publishedSnapshotId)
      : undefined;
    if (site.publishedSnapshotId && !live)
      return {
        kind: "failed",
        code: "invalid_snapshot",
        message: `the live snapshot ${site.publishedSnapshotId} cannot be read`,
      };
    const parent = (await ctx.latestSnapshot(siteId)) ?? live;

    // Conflicts, composition and dependencies (§6.3 steps 3–5), pure.
    const plan = planRelease(live?.nodes ?? [], items);
    if (plan.kind === "conflict") return plan;
    if (plan.kind === "failed") return { kind: "failed", code: plan.code, message: plan.message };
    let nodes = plan.nodes;
    if (!live) {
      // A site that was never published: the new snapshot carries the current site node.
      const siteRef: NodeRef = { id: site.id, kind: "site", rev: site.rev, hash: row.hash };
      const key = `nodes/${row.hash}.json`;
      if (!(await ctx.blobs.head(key)))
        await ctx.blobs.put(key, new TextEncoder().encode(row.body), {
          contentType: "application/json",
        });
      nodes = [...nodes.filter((n) => n.kind !== "site"), siteRef].sort(byId);
    }

    // Step 6: the snapshot S and the site pointing at it.
    const snapshotId = ctx.newId(ID_PREFIX.snapshot);
    const approver = approverOf(release);
    const base = live?.id ?? parent?.id ?? snapshotId;
    const snapshot: Snapshot = {
      schemaVersion: 1,
      id: snapshotId,
      siteId,
      ...(parent ? { parentId: parent.id } : {}),
      siteRev: site.rev,
      reason: "scheduled",
      label: await labelOf(ctx, release, items),
      actor: { ...SCHEDULER_ACTOR },
      nodes,
      summary: diffSummary(live?.nodes ?? [], nodes),
      createdAt: ts,
      metadata: {
        "cloudhal.release": release.id,
        "cloudhal.releaseHash": release.hash,
        "cloudhal.run": run.id,
        ...(live ? { "cloudhal.base": live.id } : {}),
        ...(approver ? { "cloudhal.approvedBy": approver.id } : {}),
      },
    };
    const next: Site = {
      ...site,
      publishedSnapshotId: snapshotId,
      rev: site.rev + 1,
      updatedAt: ts,
    };
    try {
      assertValid("snapshot", snapshot);
      assertValid("site", next);
    } catch (e) {
      return {
        kind: "failed",
        code: "invalid_snapshot",
        message: e instanceof Error ? e.message.slice(0, 300) : String(e),
      };
    }
    const nextHash = await nodeHash(next);
    const guard: SqlStatement = {
      sql: "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)",
      params: [siteId, nextHash],
    };
    const outcome: ReleasePublishedOutcome = {
      kind: "published",
      runId: run.id,
      at: ts,
      snapshotId,
      baseSnapshotId: base,
      latenessSeconds: input.latenessSeconds,
      purge: input.purge,
    };
    const blobShas = [
      ...new Set(items.map((i) => i.blobSha).filter((s): s is string => typeof s === "string")),
    ];
    const statements: SqlStatement[] = [
      // 1. The pointer flip: CAS on the site and on our lease (the run's and the release's).
      await casUpdateStatement("site", next, site.rev, {
        sql: "hash = ? AND EXISTS (SELECT 1 FROM schedule_runs WHERE id = ? AND lease_token = ?) AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND lease_token = ? AND state = 'running')",
        params: [row.hash, run.id, run.leaseToken, release.id, run.leaseToken],
      }),
      // 2. The snapshot.
      {
        sql: `INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
        params: [
          snapshotId,
          siteId,
          snapshot.parentId ?? null,
          snapshot.siteRev,
          canonicalJson(snapshot),
          ts,
          ...(guard.params ?? []),
        ],
      },
      // 3. The live assets' GC roots carried over (RFC-0004; over-retention is safe).
      ...(live
        ? [
            {
              sql: `INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT ?, site_id, sha256 FROM snapshot_blobs WHERE snapshot_id = ? AND ${guard.sql}`,
              params: [snapshotId, live.id, ...(guard.params ?? [])],
            },
          ]
        : []),
      // 4. The release's own asset blobs.
      ...(blobShas.length > 0
        ? [
            {
              sql: `INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT ?, ?, value FROM json_each(?) WHERE ${guard.sql}`,
              params: [snapshotId, siteId, JSON.stringify(blobShas), ...(guard.params ?? [])],
            },
          ]
        : []),
      // 5–7. The run, the items and the release finished.
      ...releaseFinishStatements({
        releaseId: release.id,
        runId: run.id,
        token: run.leaseToken,
        now: ts,
        latenessSeconds: input.latenessSeconds,
        finish: { state: "published", outcome },
        guard,
      }),
      // 8. The audit row: the scheduler, on behalf of the approver, at the creator's request (S14).
      {
        sql: `INSERT INTO audit (at, actor_kind, actor_id, actor_name, site_id, tool, decision, reason, input, outcome, snapshot_id, run_id, release_id)
              SELECT ?, ?, ?, ?, ?, 'release.publish', 'allow', ?, ?, 'ok', ?, ?, ? WHERE ${guard.sql}`,
        params: [
          ts,
          SCHEDULER_ACTOR.kind,
          SCHEDULER_ACTOR.id,
          SCHEDULER_ACTOR.name,
          siteId,
          `published release ${release.id}${approver ? ` on behalf of ${approver.name ?? approver.id}` : ""} (${input.latenessSeconds} s late)`,
          JSON.stringify({
            releaseId: release.id,
            hash: release.hash,
            runId: run.id,
            baseSnapshotId: base,
            items: items.length,
            ...(approver ? { onBehalfOf: approver } : {}),
            requestedBy: release.createdBy,
          }),
          snapshotId,
          run.id,
          release.id,
          ...(guard.params ?? []),
        ],
      },
    ];
    const results = await ctx.sql.batch(statements);
    if ((results[0]?.changes ?? 0) === 1)
      return {
        kind: "published",
        site: next,
        snapshotId,
        baseSnapshotId: base,
        ...(live ? { from: live.id } : {}),
        committed: true,
      };
    lastError = `the site ${siteId} or the run's lease changed while the release was applied`;
  }
  return { kind: "retry", error: lastError };
}

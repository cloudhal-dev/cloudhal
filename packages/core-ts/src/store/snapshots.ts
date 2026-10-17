/** Snapshots: node refs with content hashes, bodies in the blob store, holds, asset blobs. */
import { assertValid, type NodeRef, type Snapshot } from "@cloudhal/core-contracts";
import { BLOB_CONCURRENCY, eachLimited } from "../concurrency.ts";
import { NotFoundError } from "../errors.ts";
import { canonicalJson } from "../hash.ts";
import { composeWithHolds, readHolds } from "../holds.ts";
import { ID_PREFIX } from "../ids.ts";
import type { Row } from "../node-sql.ts";
import type { StoreContext } from "./context.ts";
import type { SnapshotInput } from "./types.ts";
import { diffNodeRefs } from "./validation.ts";

export class SnapshotEngine {
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  async create(siteId: string, input: SnapshotInput): Promise<Snapshot> {
    const site = await this.#ctx.graph.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    let rows = await this.#ctx.sql.all<Row>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
      siteId,
    ]);
    // RFC-0008 §6.2 (S5): an ordinary publish keeps nodes held by a release at their live version
    // (or leaves them out when they are not live). History snapshots capture the whole working copy.
    let heldRefs: NodeRef[] = [];
    if (input.reason === "publish") {
      const held = new Set((await readHolds(this.#ctx.sql, siteId)).keys());
      if (held.size > 0) {
        const live = site.publishedSnapshotId
          ? await this.#ctx.graph.getSnapshot(site.publishedSnapshotId)
          : undefined;
        rows = rows.filter((r) => !held.has(r.id));
        heldRefs = (live?.nodes ?? []).filter((n) => held.has(n.id));
      }
    }
    // Node bodies are content-addressed and never deleted, so a hash the previous snapshot holds is
    // already stored: only new hashes are checked and written, a few at a time. (Every agent edit
    // snapshots; checking each node in turn cost one blob round trip per node of the site.)
    const parent = await this.#ctx.graph.latestSnapshot(siteId);
    const stored = new Set((parent?.nodes ?? []).map((n) => n.hash));
    const fresh = new Map<string, string>();
    for (const row of rows) if (!stored.has(row.hash)) fresh.set(row.hash, row.body);
    await eachLimited([...fresh], BLOB_CONCURRENCY, async ([hash, body]) => {
      const key = `nodes/${hash}.json`;
      if (!(await this.#ctx.blobs.head(key)))
        await this.#ctx.blobs.put(key, new TextEncoder().encode(body), {
          contentType: "application/json",
        });
    });
    const nodes: NodeRef[] = composeWithHolds(
      rows.map((r) => ({ id: r.id, kind: r.kind, rev: r.rev, hash: r.hash })),
      heldRefs,
      new Set(heldRefs.map((n) => n.id)),
    );
    const diff = diffNodeRefs(parent?.nodes ?? [], nodes);
    const snapshot: Snapshot = {
      schemaVersion: 1,
      id: this.#ctx.newId(ID_PREFIX.snapshot),
      siteId,
      ...(parent ? { parentId: parent.id } : {}),
      siteRev: site.rev,
      reason: input.reason,
      ...(input.label !== undefined ? { label: input.label } : {}),
      actor: input.actor,
      nodes,
      summary: {
        added: diff.added.length,
        changed: diff.changed.length,
        removed: diff.removed.length,
      },
      createdAt: this.#ctx.stamp(),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    };
    assertValid("snapshot", snapshot);
    // Snapshots record the content their blob assets need, in the same batch (RFC-0004 §4.4).
    const heldAssets = await Promise.all(
      heldRefs
        .filter((r) => r.kind === "asset")
        .map(async (r) => canonicalJson(await this.#ctx.graph.readSnapshotNode(r))),
    );
    const blobs = this.#ctx.assets.snapshotBlobsStatement(snapshot.id, siteId, [
      ...rows.filter((r) => r.kind === "asset").map((r) => r.body),
      ...heldAssets,
    ]);
    await this.#ctx.sql.batch([
      {
        sql: "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          snapshot.id,
          siteId,
          snapshot.parentId ?? null,
          snapshot.siteRev,
          canonicalJson(snapshot),
          snapshot.createdAt,
        ],
      },
      ...(blobs ? [blobs] : []),
    ]);
    // RFC-0010: a snapshot made to be published gets its bundle now, while the bodies are at hand,
    // so the site Worker's first render after the flip reads a few shards. A bundle is a cache:
    // failing to write it never fails the snapshot (the site Worker writes it on first render).
    if (input.reason === "publish") {
      const bodies = new Map(rows.map((r) => [r.hash, r.body]));
      await this.#ctx.graph.writeSnapshotBundle(snapshot, bodies).catch(() => {});
    }
    return snapshot;
  }
}

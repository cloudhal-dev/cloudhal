import { type Approval, describeOwnOnly, holds } from "@cloudhal/agent-runtime";
import type { ContentEntry, Menu, NodeRef, Site, Snapshot } from "@cloudhal/core-contracts";
import type { SiteGraphStore, SnapshotDiff } from "@cloudhal/core-ts";
import { menuDelta } from "@cloudhal/core-ts/menu";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, missingScope, notFound } from "../errors.ts";
import { fileRoleRequest, ownOnlySnapshot, personOf, publishesAnything } from "../own.ts";
import { param } from "../params.ts";

const REASONS = new Set<Snapshot["reason"]>([
  "manual",
  "agentMutation",
  "publish",
  "rollback",
  "scheduled",
  "import",
]);

/** How one entry's term assignments changed between two snapshots (RFC-0002 §6.4, §8). */
export interface AssignmentDelta {
  entryId: string;
  taxonomy: string;
  added: string[];
  removed: string[];
  /** Set when the primary term changed; `null` = none. */
  primary?: { from: string | null; to: string | null };
}

/** How one menu changed between two snapshots (RFC-0003 §6.3 counts, for the diff dialog). */
export interface MenuDiffSummary {
  menuId: string;
  key: string;
  change: "added" | "changed" | "removed";
  added: number;
  removed: number;
  moved: number;
  changed: number;
  /** Items before and after. */
  before: number;
  after: number;
}

/** Menu deltas of every menu node in a diff (read from the blobs; a site has a handful). */
async function menuDiffs(store: SiteGraphStore, diff: SnapshotDiff): Promise<MenuDiffSummary[]> {
  const pairs: [NodeRef | undefined, NodeRef | undefined, MenuDiffSummary["change"]][] = [
    ...diff.added.filter((n) => n.kind === "menu").map((n) => [undefined, n, "added"] as const),
    ...diff.changed
      .filter((c) => c.after.kind === "menu")
      .map((c) => [c.before, c.after, "changed"] as const),
    ...diff.removed.filter((n) => n.kind === "menu").map((n) => [n, undefined, "removed"] as const),
  ] as [NodeRef | undefined, NodeRef | undefined, MenuDiffSummary["change"]][];
  const out: MenuDiffSummary[] = [];
  for (const [before, after, change] of pairs) {
    const a = before ? await store.readSnapshotNode<Menu>(before) : undefined;
    const b = after ? await store.readSnapshotNode<Menu>(after) : undefined;
    const menu = (b ?? a) as Menu;
    const d = menuDelta(a, b ?? { items: [] });
    out.push({
      menuId: menu.id,
      key: menu.key,
      change,
      added: d.added.length,
      removed: d.removed.length,
      moved: d.moved.length,
      changed: d.changed.length,
      before: d.before,
      after: d.after,
    });
  }
  return out;
}

/** Entries whose bodies are compared; larger diffs list the first ones only. */
const ASSIGNMENT_DELTA_LIMIT = 200;

/** Term assignment changes of the added and changed entries in a diff (read from the blobs). */
async function assignmentDeltas(
  store: SiteGraphStore,
  diff: SnapshotDiff,
): Promise<AssignmentDelta[]> {
  const pairs: [NodeRef | undefined, NodeRef][] = [
    ...diff.changed.map((c) => [c.before, c.after] as [NodeRef, NodeRef]),
    ...diff.added.map((a) => [undefined, a] as [undefined, NodeRef]),
  ].filter(([, after]) => after.kind === "contentEntry");
  const out: AssignmentDelta[] = [];
  for (const [before, after] of pairs.slice(0, ASSIGNMENT_DELTA_LIMIT)) {
    const a = before ? await store.readSnapshotNode<ContentEntry>(before) : undefined;
    const b = await store.readSnapshotNode<ContentEntry>(after);
    const keys = new Set([...Object.keys(a?.terms ?? {}), ...Object.keys(b.terms ?? {})]);
    for (const key of [...keys].sort()) {
      const was = a?.terms?.[key];
      const now = b.terms?.[key];
      const added = (now?.ids ?? []).filter((id) => !was?.ids.includes(id));
      const removed = (was?.ids ?? []).filter((id) => !now?.ids.includes(id));
      const primaryChanged = (was?.primary ?? null) !== (now?.primary ?? null);
      if (!added.length && !removed.length && !primaryChanged) continue;
      out.push({
        entryId: after.id,
        taxonomy: key,
        added,
        removed,
        ...(primaryChanged
          ? { primary: { from: was?.primary ?? null, to: now?.primary ?? null } }
          : {}),
      });
    }
  }
  return out;
}

/**
 * Publishes `snapshotId` when the caller may (full `site:publish`, or an own-only change set for
 * `site:publish:own`, RFC-0005 I10); otherwise files a `role` request an Editor decides.
 */
async function publishOrRequest(
  c: Context<Env>,
  site: Site,
  snapshotId: string,
): Promise<{ site: Site } | { request: Approval; reason: string }> {
  const store = c.get("store");
  const principal = c.get("principal");
  if (!publishesAnything(principal)) {
    const check = await ownOnlySnapshot(c, site, snapshotId, personOf(c));
    if (!check.ownOnly) {
      const reason = describeOwnOnly(check);
      const request = await fileRoleRequest(c, site, { siteId: site.id, snapshotId }, reason);
      return { request, reason };
    }
  }
  return { site: await store.publish(site, snapshotId) };
}

function snapshotLimit(raw: string | undefined): number {
  if (raw === undefined) return 50;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw badRequest("limit must be 1–500");
  return n;
}

export const snapshots: Hono<Env> = new Hono<Env>()
  .get("/", async (c) =>
    c.json(
      await c.get("store").listSnapshots(param(c, "siteId"), snapshotLimit(c.req.query("limit"))),
    ),
  )
  .post("/", async (c) => {
    const store = c.get("store");
    const siteId = param(c, "siteId");
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
      label?: string;
      reason?: Snapshot["reason"];
      publish?: boolean;
    };
    // A snapshot made to go live is a publish: it keeps scheduled nodes at their live version
    // (RFC-0008 §6.2), so publishing it cannot release them early.
    const reason = body.reason ?? (body.publish ? "publish" : "manual");
    if (!REASONS.has(reason)) throw badRequest("invalid reason");
    const actor = c.get("actor") ?? { kind: "system" as const, id: "sys_api00000001" };
    const principal = c.get("principal");
    if (body.publish && principal && !holds(principal.scopes, "site:publish:own"))
      throw missingScope(
        "site:publish:own",
        "your role cannot publish; an Editor publishes your work",
      );
    const snap = await store.createSnapshot(siteId, {
      actor,
      reason,
      ...(body.label ? { label: body.label } : {}),
    });
    let site = await store.getSite(siteId);
    if (body.publish && site) {
      const outcome = await publishOrRequest(c, site, snap.id);
      if ("request" in outcome) return c.json({ snapshot: snap, site, ...outcome }, 202);
      site = outcome.site;
    }
    return c.json({ snapshot: snap, site }, 201);
  })
  .get("/:snapshotId", async (c) => {
    const snap = await c.get("store").getSnapshot(param(c, "snapshotId"));
    if (!snap || snap.siteId !== param(c, "siteId")) throw notFound("snapshot not found");
    return c.json(snap);
  })
  // One node as this snapshot holds it (RFC-0014 phase 2: Studio's body diffs). Read-only.
  .get("/:snapshotId/nodes/:nodeId", async (c) => {
    const store = c.get("store");
    const snap = await store.getSnapshot(param(c, "snapshotId"));
    if (!snap || snap.siteId !== param(c, "siteId")) throw notFound("snapshot not found");
    const ref = snap.nodes.find((n) => n.id === param(c, "nodeId"));
    if (!ref) throw notFound("node not in this snapshot");
    return c.json(await store.readSnapshotNode(ref));
  })
  .get("/:snapshotId/diff/:otherId", async (c) => {
    const store = c.get("store");
    const siteId = param(c, "siteId");
    for (const id of [param(c, "snapshotId"), param(c, "otherId")]) {
      const snap = await store.getSnapshot(id);
      if (!snap || snap.siteId !== siteId) throw notFound("snapshot not found");
    }
    const diff = await store.diffSnapshots(param(c, "snapshotId"), param(c, "otherId"));
    // `?assignments=1`: term changes of entries; `?menus=1`: menu deltas (RFC-0003 §8).
    return c.json({
      ...diff,
      ...(c.req.query("assignments") === "1"
        ? { assignments: await assignmentDeltas(store, diff) }
        : {}),
      ...(c.req.query("menus") === "1" ? { menus: await menuDiffs(store, diff) } : {}),
    });
  })
  .post("/:snapshotId/publish", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const snap = await store.getSnapshot(param(c, "snapshotId"));
    if (!snap || snap.siteId !== site.id) throw notFound("snapshot not found");
    const outcome = await publishOrRequest(c, site, snap.id);
    // 202: the publish waits for someone whose role allows it (cause `role`, RFC-0005 §6).
    if ("request" in outcome) return c.json(outcome, 202);
    return c.json(outcome.site);
  })
  .post("/:snapshotId/rollback", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const actor = c.get("actor") ?? { kind: "system" as const, id: "sys_api00000001" };
    try {
      return c.json(await store.rollback(site, param(c, "snapshotId"), actor));
    } catch (e) {
      if (e instanceof Error && /not an ancestor|no published snapshot/.test(e.message))
        throw badRequest(e.message);
      throw e;
    }
  });

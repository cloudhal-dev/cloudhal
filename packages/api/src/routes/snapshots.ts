import type { Snapshot } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

const REASONS = new Set<Snapshot["reason"]>([
  "manual",
  "agentMutation",
  "publish",
  "rollback",
  "scheduled",
  "import",
]);

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
    const reason = body.reason ?? "manual";
    if (!REASONS.has(reason)) throw badRequest("invalid reason");
    const actor = c.get("actor") ?? { kind: "system" as const, id: "sys_api00000001" };
    const snap = await store.createSnapshot(siteId, {
      actor,
      reason,
      ...(body.label ? { label: body.label } : {}),
    });
    let site = await store.getSite(siteId);
    if (body.publish && site) site = await store.publish(site, snap.id);
    return c.json({ snapshot: snap, site }, 201);
  })
  .get("/:snapshotId", async (c) => {
    const snap = await c.get("store").getSnapshot(param(c, "snapshotId"));
    if (!snap || snap.siteId !== param(c, "siteId")) throw notFound("snapshot not found");
    return c.json(snap);
  })
  .get("/:snapshotId/diff/:otherId", async (c) => {
    const store = c.get("store");
    const siteId = param(c, "siteId");
    for (const id of [param(c, "snapshotId"), param(c, "otherId")]) {
      const snap = await store.getSnapshot(id);
      if (!snap || snap.siteId !== siteId) throw notFound("snapshot not found");
    }
    return c.json(await store.diffSnapshots(param(c, "snapshotId"), param(c, "otherId")));
  })
  .post("/:snapshotId/publish", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json(await store.publish(site, param(c, "snapshotId")));
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

/**
 * Own limits on the REST side (RFC-0005 §4, I9, I10): which limit a person's entry writes run
 * under, whether a snapshot publish is own-only, and the `role` request an Author's wider publish
 * becomes. The MCP tools apply the same `agent-runtime` helpers.
 */
import {
  type Approval,
  holds,
  type OwnLimit,
  type OwnOnlyResult,
  ownOnlyChangeSet,
  type Principal,
} from "@cloudhal/agent-runtime";
import type { NodeRef, Site } from "@cloudhal/core-contracts";
import { canonicalJson, type SiteGraphStore, sha256Hex } from "@cloudhal/core-ts";
import type { Context } from "hono";
import type { Env } from "./context.ts";
import { apiError } from "./errors.ts";

/** The limit a principal's entry writes run under (undefined: full `content:write`). */
export function entryLimit(principal: Principal | undefined): OwnLimit | undefined {
  if (!principal || holds(principal.scopes, "content:write")) return undefined;
  if (holds(principal.scopes, "content:write:own")) return { level: "own", target: "entry" };
  return { level: "draft", target: "entry" };
}

/** True when the principal may publish anything (full `site:publish`, or no membership source). */
export function publishesAnything(principal: Principal | undefined): boolean {
  return !principal || holds(principal.scopes, "site:publish");
}

/** The person (actor id) behind a REST caller. */
export function personOf(c: Context<Env>): string | undefined {
  const p = c.get("principal");
  return p?.person?.id ?? p?.actor.id;
}

/** The binding of a snapshot-publish request: the live pointer and the target snapshot. */
export function snapshotPublishState(site: Site, snapshotId: string): string {
  return `live:${site.publishedSnapshotId ?? ""}>${snapshotId}`;
}

/**
 * Is publishing `snapshotId` (against what is live) own-only for `person`? Both sides are read from
 * snapshot blobs.
 */
export async function ownOnlySnapshot(
  c: Context<Env>,
  site: Site,
  snapshotId: string,
  person: string | undefined,
): Promise<OwnOnlyResult> {
  const store = c.get("store");
  const target = await store.getSnapshot(snapshotId);
  const live = site.publishedSnapshotId
    ? await store.getSnapshot(site.publishedSnapshotId)
    : undefined;
  const diff = diffRefs(live?.nodes ?? [], target?.nodes ?? []);
  const read = (ref: NodeRef) => store.readSnapshotNode(ref).catch(() => undefined);
  return ownOnlyChangeSet(diff, person, c.get("ownership"), { before: read, after: read });
}

/** Is publishing the current state own-only for `person` (MCP `publish` semantics)? */
export async function ownOnlyPending(
  store: SiteGraphStore,
  c: Context<Env>,
  siteId: string,
  person: string | undefined,
): Promise<OwnOnlyResult> {
  const diff = await store.pendingChanges(siteId);
  return ownOnlyChangeSet(diff, person, c.get("ownership"), {
    before: (ref) => store.readSnapshotNode(ref).catch(() => undefined),
    after: async (ref) =>
      ref.kind === "contentEntry"
        ? store.getContentEntry(ref.id)
        : ref.kind === "site"
          ? store.getSite(ref.id)
          : undefined,
  });
}

function diffRefs(before: readonly NodeRef[], after: readonly NodeRef[]) {
  const b = new Map(before.map((n) => [n.id, n]));
  const a = new Map(after.map((n) => [n.id, n]));
  return {
    added: after.filter((n) => !b.has(n.id)),
    removed: before.filter((n) => !a.has(n.id)),
    changed: after
      .filter((n) => b.has(n.id) && (b.get(n.id) as NodeRef).hash !== n.hash)
      .map((n) => ({ before: b.get(n.id) as NodeRef, after: n })),
  };
}

/**
 * Files a person's publish that their role cannot make alone as an approval request (cause
 * `role`, RFC-0005 §6). Someone who could make the call decides it; approving it publishes.
 */
export async function fileRoleRequest(
  c: Context<Env>,
  site: Site,
  input: { siteId: string; snapshotId: string },
  reason: string,
): Promise<Approval> {
  const approvals = c.get("approvals");
  const principal = c.get("principal");
  if (!approvals || !principal)
    throw apiError(
      403,
      "missing_scope",
      `${reason}; this server has no approvals, so ask an Editor to publish`,
      { scope: "site:publish" },
    );
  // One open request per person and snapshot: asking again returns it.
  const open = (
    await approvals.list({ siteId: site.id, actorId: principal.actor.id, status: "pending" })
  ).find(
    (a) =>
      a.status === "pending" &&
      a.tool === "publish" &&
      (a.input as { snapshotId?: unknown } | undefined)?.snapshotId === input.snapshotId,
  );
  if (open) return open;
  const request = await approvals.request({
    siteId: site.id,
    tool: "publish",
    argsHash: await sha256Hex(canonicalJson(input)),
    input,
    actor: principal.actor,
    prompt: `Publish snapshot ${input.snapshotId} of "${site.name}" (requested by ${principal.actor.name ?? principal.actor.id}: ${reason})`,
    stateHash: snapshotPublishState(site, input.snapshotId),
    cause: "role",
  });
  await c.get("audit")?.record({
    at: new Date().toISOString(),
    actor: principal.actor,
    siteId: site.id,
    tool: "publish",
    decision: "approval-required",
    reason,
    cause: "role",
    input,
    outcome: "pending",
  });
  return request;
}

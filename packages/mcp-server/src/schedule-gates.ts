/**
 * The gate helpers of the schedule tools (RFC-0008 §7.6, §10.8): the article or page a gate tool
 * names, the own-work check, the gate write (CAS on `rev`, then a snapshot) and whether a working
 * copy differs from the live version only in its gates. Split from `schedule-tools.ts` (size
 * ratchet).
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { canonicalJson } from "@cloudhal/core-ts";
import { ACTOR_OWNERSHIP, callerPerson, type ToolContext, ToolError } from "./common.ts";
import { liveRefs } from "./schedules.ts";

export type GatedNode = (ContentEntry | Page) & { kind: "contentEntry" | "page" };

export async function gatedNode(
  ctx: ToolContext,
  siteId: string,
  nodeId: string,
): Promise<GatedNode> {
  const entry = await ctx.store.getContentEntry(nodeId);
  if (entry && entry.siteId === siteId) return { ...entry, kind: "contentEntry" };
  const page = await ctx.store.getPage(nodeId);
  if (page && page.siteId === siteId) return { ...page, kind: "page" };
  throw new ToolError("not_found", `no article or page ${nodeId} on this site`);
}

export async function assertOwnNode(ctx: ToolContext, node: GatedNode): Promise<void> {
  if (ctx.limit?.target !== "release") return;
  const owned =
    node.kind === "contentEntry" &&
    (await (ctx.ownership ?? ACTOR_OWNERSHIP).personOf((node as ContentEntry).author)) ===
      callerPerson(ctx);
  if (!owned) throw new ToolError("denied", "your role schedules only your own articles");
}

/** Writes new gates on the working copy (CAS on `expectedRev`) and snapshots, like any edit. */
export async function writeGates(
  ctx: ToolContext,
  node: GatedNode,
  availability: ContentEntry["availability"],
  expectedRev: number,
): Promise<ContentEntry | Page> {
  if (node.rev !== expectedRev)
    throw new ToolError(
      "conflict",
      `${node.id} is at rev ${node.rev}, you sent ${expectedRev}; read it again`,
    );
  const { kind: _k, availability: _a, ...rest } = node;
  const next = { ...rest, ...(availability ? { availability } : {}) };
  const saved =
    node.kind === "contentEntry"
      ? await ctx.store.updateContentEntry(next as ContentEntry)
      : await ctx.store.updatePage(next as Page);
  await ctx.store.createSnapshot(node.siteId, {
    actor: ctx.principal.actor,
    reason: "agentMutation",
    label: `gates by ${ctx.principal.actor.name ?? ctx.principal.actor.id}`,
  });
  return saved;
}

/** True when the working copy differs from the live version only in its gates (a gate-only change). */
export async function gateOnly(
  ctx: ToolContext,
  site: Site,
  node: ContentEntry | Page,
): Promise<boolean> {
  const ref = (await liveRefs(ctx.store, site)).find((r) => r.id === node.id);
  if (!ref) return false;
  const live = (await ctx.store.readSnapshotNode(ref).catch(() => undefined)) as
    | (ContentEntry | Page)
    | undefined;
  if (!live) return false;
  const strip = (n: ContentEntry | Page) => {
    const { availability: _a, rev: _r, updatedAt: _u, ...rest } = n;
    return canonicalJson(rest);
  };
  return strip(live) === strip(node);
}

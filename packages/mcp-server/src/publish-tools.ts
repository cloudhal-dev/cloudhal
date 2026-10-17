/** Snapshot, diff, preview, publish and rollback tools (approval-gated publishing). */

import type { OwnOnlyResult } from "@cloudhal/agent-runtime";
import { ownOnlyChangeSet } from "@cloudhal/agent-runtime";
import { describeChanges } from "./changes.ts";
import {
  ACTOR_OWNERSHIP,
  callerPerson,
  id,
  mapError,
  obj,
  quote,
  requireSite,
  str,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import { SITE, SNAPSHOT } from "./content-shared.ts";
import { publishMenuLines } from "./menu-tools.ts";
import { previewDoc } from "./preview-doc.ts";
import { PREVIEW_UI_URI } from "./preview-view.ts";

const createSnapshotTool: ToolDefinition = {
  name: "create_snapshot",
  title: "Create snapshot",
  description: "Freeze the current state of the site as an immutable, labelled snapshot.",
  inputSchema: obj({ siteId: id, label: str("Short label, e.g. 'Before: retitle about page'") }, [
    "siteId",
  ]),
  outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:draft:own"],
  handler: async (a, ctx) => {
    await requireSite(ctx, a.siteId as string);
    return {
      snapshot: await ctx.store.createSnapshot(a.siteId as string, {
        actor: ctx.principal.actor,
        reason: "manual",
        ...(a.label ? { label: a.label as string } : {}),
      }),
    };
  },
};

const listSnapshotsTool: ToolDefinition = {
  name: "list_snapshots",
  title: "List snapshots",
  description: "Snapshots of a site, newest first, and which one is live.",
  inputSchema: obj(
    { siteId: id, limit: { type: "integer", minimum: 1, maximum: 200, default: 20 } },
    ["siteId"],
  ),
  outputSchema: obj(
    {
      snapshots: { type: "array", items: SNAPSHOT },
      publishedSnapshotId: { type: ["string", "null"] },
    },
    ["snapshots", "publishedSnapshotId"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["site:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    return {
      snapshots: await ctx.store.listSnapshots(site.id, (a.limit as number | undefined) ?? 20),
      publishedSnapshotId: site.publishedSnapshotId ?? null,
    };
  },
};

const diffSnapshotsTool: ToolDefinition = {
  name: "diff_snapshots",
  title: "Diff snapshots",
  description: "Added, changed and removed nodes between two snapshots.",
  inputSchema: obj({ siteId: id, fromSnapshotId: id, toSnapshotId: id }, [
    "siteId",
    "fromSnapshotId",
    "toSnapshotId",
  ]),
  outputSchema: obj(
    { added: { type: "array" }, removed: { type: "array" }, changed: { type: "array" } },
    ["added", "removed", "changed"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["site:read"],
  handler: async (a, ctx) => {
    try {
      for (const id of [a.fromSnapshotId as string, a.toSnapshotId as string]) {
        const snap = await ctx.store.getSnapshot(id);
        if (!snap || snap.siteId !== a.siteId)
          throw new ToolError("not_found", `snapshot ${id} not found`);
      }
      return await ctx.store.diffSnapshots(a.fromSnapshotId as string, a.toSnapshotId as string);
    } catch (e) {
      if (e instanceof ToolError) throw e;
      mapError(e);
    }
  },
};

const previewPageTool: ToolDefinition = {
  name: "preview_page",
  title: "Preview page",
  description:
    "Render a page (or an article by entryId) to HTML as the site would show it, plus a preview link (signed, to the deployed site, or the `cloudhal dev` URL). To see how it looks in a browser, with screenshots and automatic checks, use render_page.",
  inputSchema: obj({ siteId: id, pageId: id, entryId: id }, ["siteId"]),
  outputSchema: obj(
    {
      title: { type: "string" },
      path: { type: "string" },
      html: { type: "string" },
      url: { type: ["string", "null"] },
    },
    ["title", "path", "html", "url"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["preview:create"],
  // RFC-0020 §6: MCP Apps hosts show the rendered page in Cloudhal's View.
  ui: { resourceUri: PREVIEW_UI_URI },
  handler: (a, ctx) => previewDoc(a, ctx),
};

const publishTool: ToolDefinition = {
  name: "publish",
  title: "Publish site",
  description: "Snapshot the current state and make it live. Always asks for human approval.",
  inputSchema: obj({ siteId: id, label: str("Label for the published snapshot") }, ["siteId"]),
  outputSchema: obj({ site: SITE, snapshot: SNAPSHOT }, ["site", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["site:publish"],
  own: "changeset",
  requiresApproval: true,
  approvalPrompt: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    // What the person approves is what goes live: the current state against the live snapshot.
    const diff = await ctx.store.pendingChanges(site.id);
    const lines = [
      ...(await describeChanges(ctx, diff, site)),
      ...(await publishMenuLines(ctx, site)),
    ];
    const counts = `+${diff.added.length} added, ~${diff.changed.length} changed, −${diff.removed.length} removed`;
    return `Publish "${quote(site.name)}" to production (${counts} since the live version)?${lines.length ? `\n${lines.join("\n")}` : ""}`;
  },
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const snapshot = await ctx.store.createSnapshot(site.id, {
      actor: ctx.principal.actor,
      reason: "publish",
      ...(a.label ? { label: a.label as string } : {}),
    });
    try {
      return { site: await ctx.store.publish(site, snapshot.id), snapshot };
    } catch (e) {
      mapError(e);
    }
  },
};

const rollbackTool: ToolDefinition = {
  name: "rollback",
  title: "Roll back site",
  description:
    "Point production at an earlier snapshot (must be an ancestor of the live one). Always asks for human approval.",
  inputSchema: obj({ siteId: id, snapshotId: id }, ["siteId", "snapshotId"]),
  outputSchema: obj({ site: SITE, snapshot: SNAPSHOT }, ["site", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["site:rollback"],
  requiresApproval: true,
  approvalPrompt: async (a, ctx) => {
    const snap = await ctx.store.getSnapshot(a.snapshotId as string);
    return `Roll back to snapshot "${snap?.label ?? a.snapshotId}" (${snap?.createdAt ?? "unknown time"})? The current live version stays in history.`;
  },
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    try {
      return await ctx.store.rollback(site, a.snapshotId as string, ctx.principal.actor);
    } catch (e) {
      if (e instanceof Error && /not an ancestor|no published snapshot/.test(e.message))
        throw new ToolError("invalid", e.message);
      mapError(e);
    }
  },
};

/** create_snapshot … rollback, in `tools/list` order. */
export function publishTools(): ToolDefinition[] {
  return [
    createSnapshotTool,
    listSnapshotsTool,
    diffSnapshotsTool,
    previewPageTool,
    publishTool,
    rollbackTool,
  ];
}

/**
 * Is publishing the current state own-only for the caller (RFC-0005 §4, I10)? Every publicly
 * visible pending change must be an entry the caller's person owns.
 */
export async function ownOnlyPublish(ctx: ToolContext, siteId: string): Promise<OwnOnlyResult> {
  const store = ctx.store;
  return ownOnlyChangeSet(
    await store.pendingChanges(siteId),
    callerPerson(ctx),
    ctx.ownership ?? ACTOR_OWNERSHIP,
    {
      before: (ref) => store.readSnapshotNode(ref).catch(() => undefined),
      after: async (ref) =>
        ref.kind === "contentEntry"
          ? store.getContentEntry(ref.id)
          : ref.kind === "site"
            ? store.getSite(ref.id)
            : undefined,
    },
  );
}

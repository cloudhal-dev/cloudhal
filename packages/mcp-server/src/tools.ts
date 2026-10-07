/**
 * Cloudhal's semantic tool surface, defined independently of the MCP SDK so the same definitions
 * serve stdio, HTTP and tests. Each tool carries: JSON Schema input/output, honest annotations,
 * the scopes the policy engine checks, and a handler over `SiteGraphStore`.
 *
 * Mutations snapshot automatically (reason `agentMutation`, label = tool name) so every agent
 * change is diffable and reversible. `publish` and `rollback` are approval-gated.
 */

import type {
  AuditLog,
  Decision,
  PolicyEngine,
  Principal,
  Scope,
  ToolAnnotations,
  ToolPolicy,
} from "@cloudhal/agent-runtime";
import { renderEntryPreview, renderPagePreview } from "@cloudhal/astro-renderer/preview";
import type { ContentEntry, Page, Section, Site, Snapshot } from "@cloudhal/core-contracts";
import {
  ContentEntrySchema,
  PageSchema,
  SectionSchema,
  SiteSchema,
  SnapshotSchema,
} from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { ConflictError, mintPreviewToken, NotFoundError, previewUrl, primaryOrigin } from "@cloudhal/core-ts";

type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  scopes: Scope[];
  requiresApproval?: boolean;
  /** Human-readable question shown in the approval gate. */
  approvalPrompt?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  store: SiteGraphStore;
  principal: Principal;
  /** Base URL of a running `cloudhal dev` server, when known (preview links). */
  previewBaseUrl?: string | undefined;
  /** Shared preview secret: signed links to the deployed site (preferred over `previewBaseUrl`). */
  previewSecret?: string | undefined;
}

export class ToolError extends Error {
  override readonly name = "ToolError";
  readonly code: "not_found" | "conflict" | "invalid" | "denied" | "approval_required";
  constructor(code: ToolError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const id = { type: "string", pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$" };
const str = (desc: string, extra: JsonSchema = {}) => ({
  type: "string",
  description: desc,
  ...extra,
});
const obj = (
  properties: JsonSchema,
  required: string[] = [],
  extra: JsonSchema = {},
): JsonSchema => ({ type: "object", additionalProperties: false, properties, required, ...extra });
const strip = (schema: unknown): JsonSchema => {
  const { $schema: _s, $id: _i, ...rest } = schema as JsonSchema;
  return rest;
};
const SITE = strip(SiteSchema);
const PAGE = strip(PageSchema);
const ENTRY = strip(ContentEntrySchema);
const SNAPSHOT = strip(SnapshotSchema);
const SECTION = strip(SectionSchema);
type Seo = NonNullable<Page["seo"]>;

async function requireSite(ctx: ToolContext, siteId: string): Promise<Site> {
  const site = await ctx.store.getSite(siteId);
  if (!site) throw new ToolError("not_found", `site ${siteId} not found`);
  return site;
}

async function autoSnapshot(ctx: ToolContext, siteId: string, tool: string): Promise<Snapshot> {
  return ctx.store.createSnapshot(siteId, {
    actor: ctx.principal.actor,
    reason: "agentMutation",
    label: `${tool} by ${ctx.principal.actor.name ?? ctx.principal.actor.id}`,
  });
}

function mapError(e: unknown): never {
  if (e instanceof ConflictError) throw new ToolError("conflict", e.message);
  if (e instanceof NotFoundError) throw new ToolError("not_found", e.message);
  throw e;
}

/**
 * Contract schemas reference `#/$defs/...` relative to their own root. Once embedded inside a tool
 * schema those pointers must resolve from the tool schema's root instead, so nested `$defs` are
 * hoisted there (names are shared and identical across contracts).
 */
export function hoistDefs(schema: JsonSchema): JsonSchema {
  const defs: Record<string, unknown> = {};
  const walk = (node: unknown, isRoot: boolean): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, false));
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "$defs" && !isRoot) {
        for (const [name, def] of Object.entries(v as Record<string, unknown>))
          defs[name] = walk(def, false);
        continue;
      }
      out[k] = walk(v, false);
    }
    return out;
  };
  const root = walk(schema, true) as JsonSchema;
  const own = (root.$defs as Record<string, unknown> | undefined) ?? {};
  return Object.keys(defs).length || Object.keys(own).length
    ? { ...root, $defs: { ...defs, ...own } }
    : root;
}

/** All tools, in the deterministic order `tools/list` exposes them. */
export function defineTools(): ToolDefinition[] {
  return rawTools().map((t) => ({
    ...t,
    inputSchema: hoistDefs(t.inputSchema),
    outputSchema: hoistDefs(t.outputSchema),
  }));
}

function rawTools(): ToolDefinition[] {
  const sectionInput = {
    type: "array",
    items: SECTION,
    description: "Ordered sections; keep existing ids when editing.",
  };
  return [
    {
      name: "list_sites",
      title: "List sites",
      description: "Sites this principal can operate.",
      inputSchema: obj({}),
      outputSchema: obj({ sites: { type: "array", items: SITE } }, ["sites"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:read"],
      handler: async (_a, ctx) => ({ sites: await ctx.store.listSites() }),
    },
    {
      name: "get_site",
      title: "Get site",
      description: "A site with its page order, locales, theme and published snapshot.",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj({ site: SITE }, ["site"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:read"],
      handler: async (a, ctx) => ({ site: await requireSite(ctx, a.siteId as string) }),
    },
    {
      name: "list_pages",
      title: "List pages",
      description: "Pages of a site in navigation order (all statuses).",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj({ pages: { type: "array", items: PAGE } }, ["pages"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const order = new Map(site.pageIds.map((pid, i) => [pid, i]));
        const pages = (await ctx.store.listPages(site.id)).sort(
          (x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9),
        );
        return { pages };
      },
    },
    {
      name: "get_page",
      title: "Get page",
      description:
        "One page with its sections and current revision (send `rev` back when updating).",
      inputSchema: obj({ siteId: id, pageId: id }, ["siteId", "pageId"]),
      outputSchema: obj({ page: PAGE }, ["page"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const page = await ctx.store.getPage(a.pageId as string);
        if (!page || page.siteId !== a.siteId)
          throw new ToolError("not_found", `page ${a.pageId} not found`);
        return { page };
      },
    },
    {
      name: "create_page",
      title: "Create page",
      description:
        "Create a draft page and append it to the site's navigation. Snapshots the site afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          path: str("Absolute lower-case path, e.g. /about", {
            pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
          }),
          title: str("Page title"),
          locale: str("BCP 47 locale; defaults to the site's default locale"),
          sections: sectionInput,
          seo: PAGE.$defs ? ((PAGE.$defs as JsonSchema).Seo as JsonSchema) : { type: "object" },
        },
        ["siteId", "path", "title"],
      ),
      outputSchema: obj({ page: PAGE, site: SITE, snapshot: SNAPSHOT }, [
        "page",
        "site",
        "snapshot",
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        try {
          const result = await ctx.store.createPage(site, {
            siteId: site.id,
            path: a.path as string,
            title: a.title as string,
            locale: (a.locale as string | undefined) ?? site.defaultLocale,
            status: "draft",
            sections: (a.sections as Section[] | undefined) ?? [],
            ...(a.seo ? { seo: a.seo as Seo } : {}),
          });
          const snapshot = await autoSnapshot(ctx, site.id, "create_page");
          return { ...result, snapshot };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "update_page",
      title: "Update page",
      description:
        "Replace a page's title, path, sections or seo. Requires the current `rev` (optimistic locking). Status changes are not allowed here. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          pageId: id,
          rev: { type: "integer", minimum: 0 },
          title: str("New title"),
          path: str("New path"),
          sections: sectionInput,
          seo: { type: "object" },
        },
        ["siteId", "pageId", "rev"],
      ),
      outputSchema: obj({ page: PAGE, snapshot: SNAPSHOT }, ["page", "snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      handler: async (a, ctx) => {
        const page = await ctx.store.getPage(a.pageId as string);
        if (!page || page.siteId !== a.siteId)
          throw new ToolError("not_found", `page ${a.pageId} not found`);
        if (page.rev !== a.rev)
          throw new ToolError(
            "conflict",
            `page ${page.id} is at rev ${page.rev}, you sent ${a.rev}; reload and retry`,
          );
        const next: Page = {
          ...page,
          ...(a.title ? { title: a.title as string } : {}),
          ...(a.path ? { path: a.path as string } : {}),
          ...(a.sections ? { sections: a.sections as Section[] } : {}),
          ...(a.seo ? { seo: a.seo as Seo } : {}),
        };
        try {
          const saved = await ctx.store.updatePage(next);
          const snapshot = await autoSnapshot(ctx, page.siteId, "update_page");
          return { page: saved, snapshot };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "delete_page",
      title: "Delete page",
      description:
        "Delete a page and remove it from navigation. Destructive: requires approval. Snapshots afterwards.",
      inputSchema: obj({ siteId: id, pageId: id, rev: { type: "integer", minimum: 0 } }, [
        "siteId",
        "pageId",
        "rev",
      ]),
      outputSchema: obj({ site: SITE, snapshot: SNAPSHOT }, ["site", "snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      approvalPrompt: async (a, ctx) => {
        const page = await ctx.store.getPage(a.pageId as string);
        return `Delete page "${page?.title ?? a.pageId}" (${page?.path ?? ""})? This removes it from navigation; earlier snapshots keep a copy.`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const page = await ctx.store.getPage(a.pageId as string);
        if (!page || page.siteId !== site.id)
          throw new ToolError("not_found", `page ${a.pageId} not found`);
        try {
          const updated = await ctx.store.deletePage(site, { ...page, rev: a.rev as number });
          const snapshot = await autoSnapshot(ctx, site.id, "delete_page");
          return { site: updated, snapshot };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "list_entries",
      title: "List articles",
      description: "Content entries of a collection (default: posts), newest first.",
      inputSchema: obj({ siteId: id, collection: str("Collection slug", { default: "posts" }) }, [
        "siteId",
      ]),
      outputSchema: obj({ entries: { type: "array", items: ENTRY } }, ["entries"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        await requireSite(ctx, a.siteId as string);
        const entries = (
          await ctx.store.listContentEntries(
            a.siteId as string,
            (a.collection as string | undefined) ?? "posts",
          )
        ).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
        return { entries };
      },
    },
    {
      name: "get_entry",
      title: "Get article",
      description: "One content entry with its body and current revision.",
      inputSchema: obj({ siteId: id, entryId: id }, ["siteId", "entryId"]),
      outputSchema: obj({ entry: ENTRY }, ["entry"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const entry = await ctx.store.getContentEntry(a.entryId as string);
        if (!entry || entry.siteId !== a.siteId)
          throw new ToolError("not_found", `entry ${a.entryId} not found`);
        return { entry };
      },
    },
    {
      name: "create_entry",
      title: "Create article",
      description: "Create a draft content entry (markdown body). Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          collection: str("Collection slug", { default: "posts" }),
          slug: str("Lower-case hyphenated slug", { pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
          locale: str("BCP 47 locale; defaults to the site's default locale"),
          title: str("Title"),
          summary: str("One or two sentences"),
          body: str("Markdown body"),
          tags: { type: "array", items: { type: "string" } },
          fields: { type: "object", description: "Collection-specific fields" },
        },
        ["siteId", "slug", "title", "body"],
      ),
      outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT }, ["entry", "snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        try {
          const entry = await ctx.store.createContentEntry({
            siteId: site.id,
            collection: (a.collection as string | undefined) ?? "posts",
            slug: a.slug as string,
            locale: (a.locale as string | undefined) ?? site.defaultLocale,
            status: "draft",
            title: a.title as string,
            ...(a.summary ? { summary: a.summary as string } : {}),
            body: { format: "markdown", value: a.body as string },
            fields: (a.fields as Record<string, unknown> | undefined) ?? {},
            tags: (a.tags as string[] | undefined) ?? [],
            author: ctx.principal.actor,
          });
          const snapshot = await autoSnapshot(ctx, site.id, "create_entry");
          return { entry, snapshot };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "update_entry",
      title: "Update article",
      description:
        "Update title, summary, body, tags, slug or status (draft → review → published) of an entry. Requires the current `rev`. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          entryId: id,
          rev: { type: "integer", minimum: 0 },
          title: str("Title"),
          summary: str("Summary"),
          body: str("Markdown body"),
          slug: str("Slug"),
          tags: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["draft", "review", "published", "archived"] },
        },
        ["siteId", "entryId", "rev"],
      ),
      outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT }, ["entry", "snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      handler: async (a, ctx) => {
        const entry = await ctx.store.getContentEntry(a.entryId as string);
        if (!entry || entry.siteId !== a.siteId)
          throw new ToolError("not_found", `entry ${a.entryId} not found`);
        if (entry.rev !== a.rev)
          throw new ToolError(
            "conflict",
            `entry ${entry.id} is at rev ${entry.rev}, you sent ${a.rev}; reload and retry`,
          );
        const next: ContentEntry = {
          ...entry,
          ...(a.title ? { title: a.title as string } : {}),
          ...(a.summary !== undefined ? { summary: a.summary as string } : {}),
          ...(a.body !== undefined ? { body: { ...entry.body, value: a.body as string } } : {}),
          ...(a.slug ? { slug: a.slug as string } : {}),
          ...(a.tags ? { tags: a.tags as string[] } : {}),
          ...(a.status ? { status: a.status as ContentEntry["status"] } : {}),
          ...(a.status === "published" && !entry.publishedAt
            ? { publishedAt: new Date().toISOString() }
            : {}),
        };
        try {
          const saved = await ctx.store.updateContentEntry(next);
          const snapshot = await autoSnapshot(ctx, entry.siteId, "update_entry");
          return { entry: saved, snapshot };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "delete_entry",
      title: "Delete article",
      description: "Delete a content entry. Destructive: requires approval. Snapshots afterwards.",
      inputSchema: obj({ siteId: id, entryId: id, rev: { type: "integer", minimum: 0 } }, [
        "siteId",
        "entryId",
        "rev",
      ]),
      outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      approvalPrompt: async (a, ctx) =>
        `Delete article "${(await ctx.store.getContentEntry(a.entryId as string))?.title ?? a.entryId}"? Earlier snapshots keep a copy.`,
      handler: async (a, ctx) => {
        const entry = await ctx.store.getContentEntry(a.entryId as string);
        if (!entry || entry.siteId !== a.siteId)
          throw new ToolError("not_found", `entry ${a.entryId} not found`);
        try {
          await ctx.store.deleteContentEntry({ ...entry, rev: a.rev as number });
          return { snapshot: await autoSnapshot(ctx, entry.siteId, "delete_entry") };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "create_snapshot",
      title: "Create snapshot",
      description: "Freeze the current state of the site as an immutable, labelled snapshot.",
      inputSchema: obj(
        { siteId: id, label: str("Short label, e.g. 'Before: retitle about page'") },
        ["siteId"],
      ),
      outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
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
    },
    {
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
    },
    {
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
          return await ctx.store.diffSnapshots(
            a.fromSnapshotId as string,
            a.toSnapshotId as string,
          );
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "preview_page",
      title: "Preview page",
      description:
        "Render a page (or an article by entryId) to HTML as the site would show it, plus a dev-server URL when `cloudhal dev` is running.",
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
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        let doc: { title: string; path: string; html: string };
        if (a.entryId) {
          const entry = await ctx.store.getContentEntry(a.entryId as string);
          if (!entry || entry.siteId !== site.id)
            throw new ToolError("not_found", `entry ${a.entryId} not found`);
          doc = renderEntryPreview(site, entry);
        } else if (a.pageId) {
          const page = await ctx.store.getPage(a.pageId as string);
          if (!page || page.siteId !== site.id)
            throw new ToolError("not_found", `page ${a.pageId} not found`);
          const collections = [
            ...new Set(
              page.sections
                .filter((s) => s.kind === "contentList")
                .map((s) => (s as { collection: string }).collection),
            ),
          ];
          const entries = Object.fromEntries(
            await Promise.all(
              collections.map(async (c) => [c, await ctx.store.listContentEntries(site.id, c)]),
            ),
          );
          doc = renderPagePreview(site, page, entries);
        } else {
          throw new ToolError("invalid", "pass pageId or entryId");
        }
        // Prefer a signed link to the deployed site (drafts visible); fall back to `cloudhal dev`.
        if (ctx.previewSecret && primaryOrigin(site)) {
          const token = await mintPreviewToken(ctx.previewSecret, { site: site.id, target: "live" });
          return { ...doc, url: previewUrl(site, doc.path, token) ?? null };
        }
        return {
          ...doc,
          url: ctx.previewBaseUrl ? new URL(doc.path, ctx.previewBaseUrl).toString() : null,
        };
      },
    },
    {
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
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const latest = await ctx.store.latestSnapshot(site.id);
        const diff =
          latest && site.publishedSnapshotId
            ? await ctx.store.diffSnapshots(site.publishedSnapshotId, latest.id)
            : undefined;
        return `Publish "${site.name}" to production${diff ? ` (+${diff.added.length} added, ~${diff.changed.length} changed, −${diff.removed.length} removed since the live snapshot)` : ""}?`;
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
    },
    {
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
    },
  ];
}

export function toolPolicies(tools: ToolDefinition[]): ToolPolicy[] {
  return tools.map((t) => ({
    name: t.name,
    scopes: t.scopes,
    annotations: t.annotations,
    ...(t.requiresApproval ? { requiresApproval: true } : {}),
  }));
}

export interface CallResult {
  decision: Decision;
  /** Present when the call needs a human decision before running. */
  approvalPrompt?: string;
  result?: unknown;
}

/**
 * Policy → audit → handler. Transports call this; it is the only path a tool runs through.
 * `confirmed` is set by the transport once the human said yes (MRTR response or confirm token).
 */
export async function runTool(
  def: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: { policy: PolicyEngine; audit?: AuditLog | undefined; confirmed?: boolean | undefined },
): Promise<CallResult> {
  const started = Date.now();
  const decision = deps.policy.evaluate(ctx.principal, def.name, {
    confirmed: deps.confirmed ?? false,
  });
  const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
  const base = {
    at: new Date().toISOString(),
    actor: ctx.principal.actor,
    siteId,
    tool: def.name,
    skill: ctx.principal.skill?.name,
    input: args,
  };
  if (decision.kind === "deny") {
    await deps.audit?.record({
      ...base,
      decision: "deny",
      reason: decision.reason,
      outcome: "error",
    });
    return { decision };
  }
  if (decision.kind === "approval-required") {
    const approvalPrompt = def.approvalPrompt
      ? await def.approvalPrompt(args, ctx)
      : decision.reason;
    await deps.audit?.record({
      ...base,
      decision: "approval-required",
      reason: decision.reason,
      outcome: "pending",
    });
    return { decision, approvalPrompt };
  }
  try {
    const result = await def.handler(args, ctx);
    const snapshotId = (result as { snapshot?: { id?: string } } | undefined)?.snapshot?.id;
    await deps.audit?.record({
      ...base,
      decision: "allow",
      outcome: "ok",
      snapshotId,
      durationMs: Date.now() - started,
    });
    return { decision, result };
  } catch (e) {
    await deps.audit?.record({
      ...base,
      decision: "allow",
      outcome: "error",
      reason: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    });
    throw e;
  }
}

/** Article (content entry) tools: list, read, create, update, correct and delete. */

import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { CorrectionKind, EntryQuery } from "@cloudhal/core-ts";
import {
  autoSnapshot,
  entryLimitCheck,
  id,
  mapError,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import {
  COVER_INPUT,
  coverImage,
  ENTRY,
  entryMarkdown,
  mcpWriter,
  SNAPSHOT,
  unknownBlocks,
  unknownBlocksOf,
} from "./content-shared.ts";
import { entryTerms, reportDeltas } from "./entry-terms.ts";
import { menuHint, menuItemsHiddenBy } from "./menu-tools.ts";
import { assignmentDeltas, describeDeltas, TAGS_INPUT, TERMS_INPUT, termLookup } from "./terms.ts";

const listEntriesTool: ToolDefinition = {
  name: "list_entries",
  title: "List articles",
  description:
    'Content entries, newest first. `collection` defaults to posts (unless the filter names one). `filter` selects by terms (RFC-0002 grammar): clauses joined by "+" (AND), "[a,b]" = either, "-" = none of, "primary:category:x" = primary term, "category:x>*" = x or a sub-category, "collection:posts"; values are term slugs (old slugs work) or ids. Example: "category:news+tag:[ai,llm]+-tag:sponsored".',
  inputSchema: obj(
    {
      siteId: id,
      collection: str("Collection slug", { default: "posts", pattern: SLUG_PATTERN }),
      filter: str("Filter over term assignments, e.g. category:news+tag:ai", {
        minLength: 1,
        maxLength: 512,
      }),
      locale: str("Only entries in this BCP 47 locale"),
      status: {
        type: "array",
        description: "Only entries in these statuses",
        items: { type: "string", enum: ["draft", "review", "published", "archived"] },
        minItems: 1,
        uniqueItems: true,
      },
    },
    ["siteId"],
  ),
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
    const filter = a.filter as string | undefined;
    const collection =
      (a.collection as string | undefined) ??
      (filter && /(^|\+)-?collection:/.test(filter) ? undefined : "posts");
    const query: EntryQuery = {
      ...(collection !== undefined ? { collection } : {}),
      ...(filter !== undefined ? { filter } : {}),
      ...(a.locale !== undefined ? { locale: a.locale as string } : {}),
      ...(a.status !== undefined ? { status: a.status as ContentEntry["status"][] } : {}),
    };
    try {
      const entries = (await ctx.store.listContentEntries(a.siteId as string, query)).sort((x, y) =>
        y.updatedAt.localeCompare(x.updatedAt),
      );
      return { entries };
    } catch (e) {
      mapError(e);
    }
  },
};

const getEntryTool: ToolDefinition = {
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
};

const createEntryTool: ToolDefinition = {
  name: "create_entry",
  title: "Create article",
  description:
    "Create a draft content entry (markdown body), optionally filed under existing terms (`terms`; see list_taxonomies and list_terms). Snapshots afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      collection: str("Collection slug", { default: "posts", pattern: SLUG_PATTERN }),
      slug: str("Lower-case hyphenated slug", { pattern: SLUG_PATTERN, maxLength: 128 }),
      locale: str("BCP 47 locale; defaults to the site's default locale"),
      title: str("Title"),
      summary: str("One or two sentences"),
      body: str(
        "Markdown body. Media from the library: ![alt](asset:<assetId>) for images, [label](asset:<assetId>) for downloads.",
      ),
      terms: TERMS_INPUT,
      tags: TAGS_INPUT,
      coverImage: COVER_INPUT,
      fields: { type: "object", description: "Collection-specific fields" },
    },
    ["siteId", "slug", "title", "body"],
  ),
  outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT, hint: { type: "string" }, unknownBlocks }, [
    "entry",
    "snapshot",
  ]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  own: "entry",
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    await entryLimitCheck(ctx, "create", undefined, {
      author: ctx.principal.actor,
      status: "draft",
    });
    const { terms, tags } = await entryTerms(ctx, site, undefined, a);
    try {
      const entry = await ctx.store.createContentEntry(
        {
          siteId: site.id,
          collection: (a.collection as string | undefined) ?? "posts",
          slug: a.slug as string,
          locale: (a.locale as string | undefined) ?? site.defaultLocale,
          status: "draft",
          title: a.title as string,
          ...(a.summary ? { summary: a.summary as string } : {}),
          body: { format: "markdown", value: a.body as string },
          fields: (a.fields as Record<string, unknown> | undefined) ?? {},
          tags,
          ...(terms ? { terms } : {}),
          ...(a.coverImage ? { coverImage: coverImage(a.coverImage) } : {}),
          author: ctx.principal.actor,
        },
        { writer: mcpWriter(ctx) },
      );
      await reportDeltas(ctx, undefined, entry);
      const snapshot = await autoSnapshot(ctx, site.id, "create_entry");
      const hint = await menuHint(ctx, site.id, { kind: "contentEntry", id: entry.id });
      return {
        entry,
        snapshot,
        ...(hint ? { hint } : {}),
        ...unknownBlocksOf(ctx, { markdown: entryMarkdown(entry) }),
      };
    } catch (e) {
      mapError(e);
    }
  },
};

const updateEntryTool: ToolDefinition = {
  name: "update_entry",
  title: "Update article",
  description:
    "Update title, summary, body, slug, status (draft → review → published) or terms (`terms`: add, remove or set categories and tags by id, slug or name) of an entry. Review and published articles need a primary term in every required taxonomy. Requires the current `rev`. Changing a published article's slug leaves a redirect. Snapshots afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      entryId: id,
      rev: { type: "integer", minimum: 0 },
      title: str("Title"),
      summary: str("Summary"),
      body: str("Markdown body"),
      slug: str("Slug", { pattern: SLUG_PATTERN, maxLength: 128 }),
      terms: TERMS_INPUT,
      tags: TAGS_INPUT,
      coverImage: {
        ...COVER_INPUT,
        type: ["object", "null"],
        description: "Cover image; null removes it",
      },
      status: { type: "string", enum: ["draft", "review", "published", "archived"] },
    },
    ["siteId", "entryId", "rev"],
  ),
  outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT, unknownBlocks }, ["entry", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  own: "entry",
  // Own-limited callers (Authors, Contributors and their agents) only touch their own articles.
  precheck: async (a, ctx) => {
    if (!ctx.limit) return;
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== a.siteId) return;
    await entryLimitCheck(ctx, "update", entry, {
      author: entry.author,
      status: (a.status as ContentEntry["status"] | undefined) ?? entry.status,
    });
  },
  approvalPrompt: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== a.siteId) return `Update article ${a.entryId}?`;
    const site = await ctx.store.getSite(entry.siteId);
    const changes = [
      a.title ? `title → "${quote(a.title as string)}"` : "",
      a.summary !== undefined ? "summary" : "",
      a.body !== undefined ? "body" : "",
      a.slug && a.slug !== entry.slug
        ? `slug ${entry.slug} → ${a.slug as string}${entry.status === "published" || entry.publishedAt ? " (leaves a redirect)" : ""}`
        : "",
      a.status && a.status !== entry.status ? `status → ${a.status as string}` : "",
      a.coverImage !== undefined
        ? a.coverImage === null
          ? "remove cover image"
          : "cover image"
        : "",
    ].filter(Boolean);
    if (a.terms || a.tags) {
      try {
        const { terms } = await entryTerms(ctx, site as Site, entry, a);
        const d = await describeDeltas(
          assignmentDeltas(entry.terms, terms),
          termLookup(ctx),
          site?.defaultLocale,
        );
        if (d) changes.push(d);
      } catch {
        changes.push("terms");
      }
    }
    return `Update article "${quote(entry.title)}"${changes.length ? ` (${changes.join(", ")})` : ""}?`;
  },
  handler: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== a.siteId)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    if (a.body !== undefined && entry.body.format !== "markdown")
      throw new ToolError(
        "invalid",
        `entry ${entry.id} has an HTML body, which only a person can change in Studio; agents write markdown`,
      );
    if (entry.rev !== a.rev)
      throw new ToolError(
        "conflict",
        `entry ${entry.id} is at rev ${entry.rev}, you sent ${a.rev}; reload and retry`,
      );
    const site = await requireSite(ctx, entry.siteId);
    await entryLimitCheck(ctx, "update", entry, {
      author: entry.author,
      status: (a.status as ContentEntry["status"] | undefined) ?? entry.status,
    });
    const { terms, tags } = await entryTerms(ctx, site, entry, a);
    const { terms: _old, coverImage: oldCover, ...rest } = entry;
    const cover =
      a.coverImage === undefined
        ? oldCover
        : a.coverImage === null
          ? undefined
          : coverImage(a.coverImage);
    const next: ContentEntry = {
      ...rest,
      ...(cover ? { coverImage: cover } : {}),
      ...(a.title ? { title: a.title as string } : {}),
      ...(a.summary !== undefined ? { summary: a.summary as string } : {}),
      ...(a.body !== undefined ? { body: { ...entry.body, value: a.body as string } } : {}),
      ...(a.slug ? { slug: a.slug as string } : {}),
      tags,
      ...(terms ? { terms } : {}),
      ...(a.status ? { status: a.status as ContentEntry["status"] } : {}),
      ...(a.status === "published" && !entry.publishedAt
        ? { publishedAt: new Date().toISOString() }
        : {}),
    };
    try {
      const saved = await ctx.store.updateContentEntry(next, { writer: mcpWriter(ctx) });
      await reportDeltas(ctx, entry, saved);
      const snapshot = await autoSnapshot(ctx, entry.siteId, "update_entry");
      return {
        entry: saved,
        snapshot,
        ...unknownBlocksOf(ctx, { markdown: entryMarkdown(saved) }),
      };
    } catch (e) {
      mapError(e);
    }
  },
};

const addCorrectionTool: ToolDefinition = {
  name: "add_correction",
  title: "Add correction",
  description:
    "Append a correction, clarification or update notice to an article (RFC-0019 §2) when a published story changed in substance. Cloudhal sets its time. It goes live with the next publish, which then waits for a person in every mode. Once live, a notice cannot be removed or reworded by an agent. Snapshots afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      entryId: id,
      rev: { type: "integer", minimum: 0 },
      kind: {
        type: "string",
        enum: ["correction", "clarification", "update"],
        description:
          "correction: something was wrong; clarification: something was unclear; update: new facts since publication",
      },
      note: str("What changed, in one or two sentences of markdown", {
        minLength: 1,
        maxLength: 2000,
      }),
    },
    ["siteId", "entryId", "rev", "kind", "note"],
  ),
  outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT }, ["entry", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  own: "entry",
  precheck: async (a, ctx) => {
    if (!ctx.limit) return;
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (entry && entry.siteId === a.siteId)
      await entryLimitCheck(ctx, "update", entry, {
        author: entry.author,
        status: entry.status,
      });
  },
  approvalPrompt: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    return `Add a ${a.kind as string} to "${quote(entry?.title ?? (a.entryId as string))}": "${quote(a.note as string)}"?`;
  },
  handler: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== a.siteId)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    if (entry.rev !== a.rev)
      throw new ToolError(
        "conflict",
        `entry ${entry.id} is at rev ${entry.rev}, you sent ${a.rev}; reload and retry`,
      );
    await entryLimitCheck(ctx, "update", entry, { author: entry.author, status: entry.status });
    try {
      const saved = await ctx.store.addCorrection(
        entry,
        { kind: a.kind as CorrectionKind, note: a.note as string },
        { writer: mcpWriter(ctx) },
      );
      return {
        entry: saved,
        snapshot: await autoSnapshot(ctx, entry.siteId, "add_correction"),
      };
    } catch (e) {
      mapError(e);
    }
  },
};

const deleteEntryTool: ToolDefinition = {
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
  own: "entry",
  precheck: async (a, ctx) => {
    if (!ctx.limit) return;
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (entry && entry.siteId === a.siteId) await entryLimitCheck(ctx, "delete", entry);
  },
  approvalPrompt: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    const menus = entry
      ? await menuItemsHiddenBy(ctx, entry.siteId, { kind: "contentEntry", id: entry.id })
      : "";
    return `Delete article "${entry?.title ?? a.entryId}"? Earlier snapshots keep a copy.${menus}`;
  },
  handler: async (a, ctx) => {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== a.siteId)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    await entryLimitCheck(ctx, "delete", entry);
    try {
      await ctx.store.deleteContentEntry({ ...entry, rev: a.rev as number });
      return { snapshot: await autoSnapshot(ctx, entry.siteId, "delete_entry") };
    } catch (e) {
      mapError(e);
    }
  },
};

/** list_entries … delete_entry, in `tools/list` order. */
export function entryTools(): ToolDefinition[] {
  return [
    listEntriesTool,
    getEntryTool,
    createEntryTool,
    updateEntryTool,
    addCorrectionTool,
    deleteEntryTool,
  ];
}

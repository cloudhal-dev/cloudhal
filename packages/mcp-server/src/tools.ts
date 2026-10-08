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
  AutoCheck,
  Decision,
  OwnOnlyResult,
  PolicyEngine,
  ToolPolicy,
} from "@cloudhal/agent-runtime";
import {
  checkAutoPublish,
  describeAutoCheck,
  describeOwnOnly,
  effectiveMode,
  ownOnlyChangeSet,
} from "@cloudhal/agent-runtime";
import { renderEntryPreview, renderPagePreview } from "@cloudhal/astro-renderer/preview";
import type { Asset, ContentEntry, Page, Section, Site } from "@cloudhal/core-contracts";
import {
  ContentEntrySchema,
  PageSchema,
  SectionSchema,
  SiteSchema,
  SnapshotSchema,
} from "@cloudhal/core-contracts";
import type { EntryQuery, SnapshotDiff } from "@cloudhal/core-ts";
import { mintPreviewToken, previewUrl, primaryOrigin, termName } from "@cloudhal/core-ts";
import { assetRefsOf } from "@cloudhal/core-ts/media";
import { assetTools, describeAsset } from "./asset-tools.ts";
import {
  ACTOR_OWNERSHIP,
  autoSnapshot,
  callerPerson,
  entryLimitCheck,
  id,
  type JsonSchema,
  mapError,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  strip,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "./common.ts";
import { elevationTools } from "./elevation-tools.ts";
import {
  menuChangeSummary,
  menuHint,
  menuItemsHiddenBy,
  menuTools,
  publishMenuLines,
} from "./menu-tools.ts";
import { taxonomyTools } from "./taxonomy-tools.ts";
import {
  applyTermsInput,
  assignmentDeltas,
  auditDeltas,
  describeDeltas,
  TAGS_INPUT,
  TERMS_INPUT,
  type TermsInput,
  termLookup,
} from "./terms.ts";

export {
  type JsonSchema,
  type MediaToolOptions,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  type ToolErrorCode,
  toToolError,
} from "./common.ts";

const SITE = strip(SiteSchema);
const PAGE = strip(PageSchema);
const ENTRY = strip(ContentEntrySchema);
const SNAPSHOT = strip(SnapshotSchema);
const SECTION = strip(SectionSchema);
type Seo = NonNullable<Page["seo"]>;

/** An article's cover image by asset (RFC-0004): `{ assetId, alt? }`; the store fills in the rest. */
const COVER_INPUT: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assetId"],
  description:
    "Cover image from the media library (list_assets, upload_asset). alt overrides the file's own alt text for this article.",
  properties: { assetId: id, alt: str("Alt text for this use", { maxLength: 500 }) },
};

/** The media-library assets a page or article refers to, by id, so previews render them (RFC-0004). */
async function assetsOf(
  ctx: ToolContext,
  kind: "page" | "contentEntry",
  node: Page | ContentEntry,
): Promise<Map<string, Asset>> {
  const ids = [...new Set(assetRefsOf(kind, node).map((r) => r.assetId))];
  const found = await Promise.all(ids.map((id) => ctx.store.getAsset(id)));
  return new Map(
    found
      .filter((a): a is Asset => a !== undefined && a.siteId === node.siteId)
      .map((a) => [a.id, a]),
  );
}

function coverImage(input: unknown): NonNullable<ContentEntry["coverImage"]> {
  const c = input as { assetId: string; alt?: string };
  // `src` is written by the store from the asset (invariant 8).
  return { assetId: c.assetId, alt: c.alt ?? "", src: `asset:${c.assetId}` };
}

/** Agents write markdown only; raw HTML sections are for people in Studio (security review H3). */
function assertNoHtmlSections(sections: unknown): void {
  if (!Array.isArray(sections)) return;
  for (const s of sections as { kind?: string; format?: string; id?: string }[])
    if (s?.kind === "richText" && s.format !== "markdown")
      throw new ToolError(
        "invalid",
        `section ${s.id ?? ""} uses format "${s.format}"; agents may only write markdown sections`,
      );
}

const KIND_LABEL: Record<string, string> = {
  site: "site",
  page: "page",
  contentEntry: "article",
  taxonomy: "taxonomy",
  term: "term",
  redirect: "redirect",
  menu: "menu",
  asset: "media",
};

/**
 * One line per changed node for approval prompts, at most 8. Articles also show their assignment
 * deltas (RFC-0002 §6.4): `~ article "…" (+tag ai, −tag llms, primary category → News)`.
 */
async function describeChanges(
  ctx: ToolContext,
  diff: SnapshotDiff,
  site?: Site,
): Promise<string[]> {
  const locale = site?.defaultLocale;
  const lookup = termLookup(ctx);
  const title = async (ref: { id: string; kind: string }) => {
    switch (ref.kind) {
      case "page":
        return (await ctx.store.getPage(ref.id))?.title;
      case "contentEntry":
        return (await ctx.store.getContentEntry(ref.id))?.title;
      case "site":
        return "site settings";
      case "taxonomy": {
        const t = await ctx.store.getTaxonomy(ref.id);
        return t ? ((locale ? t.labels[locale]?.plural : undefined) ?? t.key) : undefined;
      }
      case "term": {
        const t = await ctx.store.getTerm(ref.id);
        return t ? termName(t, locale) : undefined;
      }
      case "redirect": {
        const r = await ctx.store.getRedirect(ref.id);
        return r ? `${r.from} → ${r.to}` : undefined;
      }
      case "menu":
        return (await ctx.store.getMenu(ref.id))?.key;
      default:
        return undefined;
    }
  };
  /** Media lines name the file, its type, size and the articles or pages using it (§6.2). */
  const assetLine = async (sign: string, ref: { id: string; kind: string }) => {
    const asset = await ctx.store.getAsset(ref.id);
    if (!asset) return undefined;
    const usage = (await ctx.store.assetUsage(asset.siteId, [asset.id])).get(asset.id);
    const first = usage?.refs[0];
    let user: string | undefined;
    if (first?.nodeKind === "contentEntry")
      user = (await ctx.store.getContentEntry(first.nodeId))?.title;
    else if (first?.nodeKind === "page") user = (await ctx.store.getPage(first.nodeId))?.title;
    const more = usage && usage.total > 1 ? ` and ${usage.total - 1} more` : "";
    return `${sign} ${describeAsset(asset, locale)}${user ? `, used by "${quote(user)}"${more}` : ""}${asset.status === "retired" ? " (retired)" : ""}`;
  };
  const deltas = async (
    ref: { id: string; kind: string },
    before?: SnapshotDiff["added"][number],
  ) => {
    if (ref.kind === "menu") return menuChangeSummary(ctx, ref, before);
    if (ref.kind !== "contentEntry") return "";
    const now = await ctx.store.getContentEntry(ref.id);
    if (!now) return "";
    const was = before ? await ctx.store.readSnapshotNode<ContentEntry>(before) : undefined;
    const text = await describeDeltas(assignmentDeltas(was?.terms, now.terms), lookup, locale);
    return text ? ` (${text})` : "";
  };
  const label = (kind: string) => KIND_LABEL[kind] ?? kind;
  const out: string[] = [];
  const groups: [
    string,
    { ref: SnapshotDiff["added"][number]; before?: SnapshotDiff["added"][number] }[],
  ][] = [
    ["+", diff.added.map((ref) => ({ ref }))],
    ["~", diff.changed.map((c) => ({ ref: c.after, before: c.before }))],
    ["−", diff.removed.map((ref) => ({ ref }))],
  ];
  for (const [sign, refs] of groups)
    for (const { ref, before } of refs) {
      if (out.length >= 8) {
        out.push(`… and ${diff.added.length + diff.changed.length + diff.removed.length - 8} more`);
        return out;
      }
      if (ref.kind === "asset" && sign !== "−") {
        const line = await assetLine(sign, ref);
        if (line) {
          out.push(line);
          continue;
        }
      }
      const t = sign === "−" ? undefined : await title(ref);
      const d = sign === "−" ? "" : await deltas(ref, before);
      out.push(`${sign} ${label(ref.kind)} ${t ? `"${quote(t)}"` : ref.id}${d}`);
    }
  return out;
}

/**
 * The `terms` (and deprecated `tags`) input of create_entry / update_entry → the entry's new
 * assignments and `tags`. `tags` is an alias for `terms.tag.add` on sites with a `tag` taxonomy; a
 * site that has not been migrated (no `tag` taxonomy) keeps plain tags.
 */
async function entryTerms(
  ctx: ToolContext,
  site: Site,
  entry: ContentEntry | undefined,
  a: Record<string, unknown>,
): Promise<{ terms: ContentEntry["terms"]; tags: string[] }> {
  const input: TermsInput = { ...((a.terms as TermsInput | undefined) ?? {}) };
  const aliased = a.tags as string[] | undefined;
  let tags = entry?.tags ?? [];
  if (aliased !== undefined) {
    if (await ctx.store.getTaxonomyByKey(site.id, "tag")) {
      if (aliased.length > 0) {
        const ops = input.tag ?? {};
        input.tag = { ...ops, add: [...(ops.add ?? []), ...aliased] };
      }
    } else tags = aliased;
  }
  const terms =
    Object.keys(input).length > 0
      ? await applyTermsInput(ctx, site, entry?.terms, input)
      : entry?.terms;
  return { terms, tags };
}

/** Assignment deltas of an entry write into the audit row (`input.effect.terms`). */
async function reportDeltas(
  ctx: ToolContext,
  before: ContentEntry | undefined,
  after: ContentEntry,
): Promise<void> {
  const deltas = assignmentDeltas(before?.terms, after.terms);
  if (deltas.length > 0 && ctx.report)
    ctx.report({ terms: await auditDeltas(deltas, termLookup(ctx)) });
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

/**
 * Inputs may name an image by asset alone (`{ assetId, alt? }`, RFC-0004 §2.2): the store writes
 * `src`, `width` and `height`. So an input ImageRef needs `src` or `assetId`, and `alt` may be left
 * out; stored documents keep the contract's strict shape.
 */
export function relaxImageRefs(schema: JsonSchema): JsonSchema {
  const defs = schema.$defs as Record<string, JsonSchema> | undefined;
  const ref = defs?.ImageRef;
  if (!ref) return schema;
  const { required: _r, ...rest } = ref;
  return {
    ...schema,
    $defs: {
      ...defs,
      ImageRef: { ...rest, anyOf: [{ required: ["src"] }, { required: ["assetId"] }] },
    },
  };
}

/** All tools, in the deterministic order `tools/list` exposes them. */
export function defineTools(): ToolDefinition[] {
  const raw = rawTools();
  // Taxonomy, term and redirect tools (RFC-0002 §6.2), then menu tools (RFC-0003 §6.1) and
  // media tools (RFC-0004 §6.2), follow the article tools.
  const at = raw.findIndex((t) => t.name === "delete_entry") + 1;
  return [
    ...raw.slice(0, at),
    ...taxonomyTools(),
    ...menuTools(),
    ...assetTools(),
    ...raw.slice(at),
    ...elevationTools(),
  ].map((t) => ({
    ...t,
    inputSchema: relaxImageRefs(hoistDefs(t.inputSchema)),
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
      outputSchema: obj({ page: PAGE, site: SITE, snapshot: SNAPSHOT, hint: { type: "string" } }, [
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
        assertNoHtmlSections(a.sections);
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
          const hint = await menuHint(ctx, site.id, { kind: "page", id: result.page.id });
          return { ...result, snapshot, ...(hint ? { hint } : {}) };
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
        assertNoHtmlSections(a.sections);
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
        const menus = page
          ? await menuItemsHiddenBy(ctx, page.siteId, { kind: "page", id: page.id })
          : "";
        return `Delete page "${page?.title ?? a.pageId}" (${page?.path ?? ""})? This removes it from navigation; earlier snapshots keep a copy.${menus}`;
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
          const entries = (await ctx.store.listContentEntries(a.siteId as string, query)).sort(
            (x, y) => y.updatedAt.localeCompare(x.updatedAt),
          );
          return { entries };
        } catch (e) {
          mapError(e);
        }
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
      outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT, hint: { type: "string" } }, [
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
            tags,
            ...(terms ? { terms } : {}),
            ...(a.coverImage ? { coverImage: coverImage(a.coverImage) } : {}),
            author: ctx.principal.actor,
          });
          await reportDeltas(ctx, undefined, entry);
          const snapshot = await autoSnapshot(ctx, site.id, "create_entry");
          const hint = await menuHint(ctx, site.id, { kind: "contentEntry", id: entry.id });
          return { entry, snapshot, ...(hint ? { hint } : {}) };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
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
      outputSchema: obj({ entry: ENTRY, snapshot: SNAPSHOT }, ["entry", "snapshot"]),
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
          const saved = await ctx.store.updateContentEntry(next);
          await reportDeltas(ctx, entry, saved);
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
          for (const id of [a.fromSnapshotId as string, a.toSnapshotId as string]) {
            const snap = await ctx.store.getSnapshot(id);
            if (!snap || snap.siteId !== a.siteId)
              throw new ToolError("not_found", `snapshot ${id} not found`);
          }
          return await ctx.store.diffSnapshots(
            a.fromSnapshotId as string,
            a.toSnapshotId as string,
          );
        } catch (e) {
          if (e instanceof ToolError) throw e;
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
          doc = renderEntryPreview(site, entry, {
            assets: await assetsOf(ctx, "contentEntry", entry),
          });
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
          doc = renderPagePreview(site, page, entries, {
            assets: await assetsOf(ctx, "page", page),
          });
        } else {
          throw new ToolError("invalid", "pass pageId or entryId");
        }
        // Prefer a signed link to the deployed site (drafts visible); fall back to `cloudhal dev`.
        if (ctx.previewSecret && primaryOrigin(site)) {
          const token = await mintPreviewToken(ctx.previewSecret, {
            site: site.id,
            target: "live",
          });
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
    ...(t.own ? { own: t.own } : {}),
  }));
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

export interface CallResult {
  decision: Decision;
  /** Set when `auto` mode let a low-risk publish through without a person (English, for the agent). */
  autoApproved?: string;
  /** The `auto`-mode check behind a publish, whichever way it went. */
  autoCheck?: AutoCheck;
  /** Present when the call needs a human decision before running. */
  approvalPrompt?: string;
  result?: unknown;
}

/**
 * Policy → audit → handler. Transports call this; it is the only path a tool runs through.
 * `confirmed` is set by the transport once the human said yes (MRTR response or confirm token);
 * `approved` once an out-of-band approval was redeemed — someone who could make the full call
 * decided it (RFC-0005 §6), so an own limit on a publish no longer applies.
 */
export async function runTool(
  def: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: {
    policy: PolicyEngine;
    audit?: AuditLog | undefined;
    confirmed?: boolean | undefined;
    approved?: boolean | undefined;
  },
): Promise<CallResult> {
  const started = Date.now();
  let decision = deps.policy.evaluate(ctx.principal, def.name, {
    confirmed: deps.confirmed ?? false,
  });
  const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
  const limit = decision.kind === "deny" ? undefined : decision.limit;
  ctx = { ...ctx, limit };
  // Own-only publish (I10): an Author's (or their agent's) publish that carries someone else's
  // work, or structure, waits for someone whose role allows it (cause `role`).
  if (limit?.target === "changeset" && !deps.approved && siteId && decision.kind !== "deny") {
    const check = await ownOnlyPublish(ctx, siteId).catch(() => undefined);
    if (!check?.ownOnly) {
      const why = check ? describeOwnOnly(check) : "the site could not be read";
      decision = {
        kind: "approval-required",
        reason: `your role publishes only your own work, but ${why}`,
        cause: "role",
        limit,
      };
    }
  }
  const audited = def.auditArgs ? def.auditArgs(args) : args;
  const base = {
    at: new Date().toISOString(),
    actor: ctx.principal.actor,
    siteId,
    tool: def.name,
    skill: ctx.principal.skill?.name,
    input: audited,
    mode: effectiveMode(ctx.principal),
    ...(ctx.principal.actor.kind === "agent" && ctx.principal.elevation
      ? { elevation: ctx.principal.elevation }
      : {}),
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
  if (def.precheck) {
    try {
      await def.precheck(args, ctx);
    } catch (raw) {
      const e = toToolError(raw);
      await deps.audit?.record({
        ...base,
        decision: "deny",
        reason: e instanceof Error ? e.message : String(e),
        outcome: "error",
      });
      throw e;
    }
  }
  // `auto` mode: a publish that only adds or edits a few articles goes live without a person.
  let autoCheck: AutoCheck | undefined;
  let autoNote: string | undefined;
  if (
    decision.kind === "approval-required" &&
    decision.autoApprove === "low-risk-publish" &&
    siteId
  ) {
    const pending = await ctx.store.pendingChanges(siteId);
    // New raster images used only by the articles in this publish ride along (RFC-0004 §6.3).
    autoCheck = checkAutoPublish(pending, {
      ridingAssets: await ctx.store.ridingAssets(siteId, pending),
    });
    if (autoCheck.lowRisk)
      autoNote = `auto mode: published without approval (${describeAutoCheck(autoCheck)})`;
    else
      decision = {
        ...decision,
        reason: `auto mode waits for a person: ${describeAutoCheck(autoCheck)}`,
      };
  }
  const checked = autoCheck ? { autoCheck } : {};
  if (decision.kind === "approval-required" && !autoNote) {
    const approvalPrompt = def.approvalPrompt
      ? await def.approvalPrompt(args, ctx)
      : decision.reason;
    await deps.audit?.record({
      ...base,
      decision: "approval-required",
      reason: decision.reason,
      cause: decision.cause,
      ...checked,
      outcome: "pending",
    });
    return { decision, approvalPrompt, ...checked };
  }
  // What the call did beyond its arguments (assignment deltas, a governance operation) goes into
  // the audit row's `input.effect` (RFC-0002 §6.4).
  let effect: Record<string, unknown> | undefined;
  const callCtx: ToolContext = {
    ...ctx,
    report: (e) => {
      effect = { ...effect, ...e };
    },
  };
  try {
    const result = await def.handler(args, callCtx);
    const snapshotId = (result as { snapshot?: { id?: string } } | undefined)?.snapshot?.id;
    await deps.audit?.record({
      ...base,
      ...(effect ? { input: { ...audited, effect } } : {}),
      decision: "allow",
      outcome: "ok",
      snapshotId,
      durationMs: Date.now() - started,
      ...(autoNote ? { reason: autoNote } : {}),
      ...checked,
    });
    return {
      decision: { kind: "allow" },
      result,
      ...(autoNote ? { autoApproved: autoNote } : {}),
      ...checked,
    };
  } catch (raw) {
    const e = toToolError(raw);
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

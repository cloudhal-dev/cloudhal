/**
 * RFC-0040 §5: the collection registry for agents. `list_collections` reads it; `create_collection`
 * and `update_collection` declare and name collections, and wait for a person who may change site
 * settings in every mode (a new collection widens what agents may write). `requireRegistered` is
 * the precheck of every tool that creates an entry: no entries in a collection nobody approved.
 */
import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  type CollectionInfo,
  collectionSettings,
  isRegistered,
  MAX_COLLECTIONS,
} from "@cloudhal/core-ts/collections";
import { collectionPermalink } from "@cloudhal/core-ts/permalinks";
import {
  describeFieldEdits,
  FIELD_DEFINITIONS_INPUT,
  fieldsView,
  withFields,
} from "./collection-fields.ts";
import {
  describeListings,
  LISTINGS_INPUT,
  listingsView,
  presetWarnings,
  withListings,
} from "./collection-listings.ts";
import {
  autoSnapshot,
  id,
  type JsonSchema,
  obj,
  requireSite,
  SLUG_PATTERN,
  str,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "./common.ts";
import { SITE, SNAPSHOT } from "./content-shared.ts";
import { PERMALINK_PATTERN } from "./permalink-tools.ts";
import { previewStructuredDataTool } from "./structured-data-tools.ts";

const ICONS = [
  "article",
  "calendar",
  "briefcase",
  "users",
  "images",
  "package",
  "book-open",
  "megaphone",
  "quotes",
  "question",
  "map-pin",
  "files",
];

/** Refuses a collection that is not in the site's registry (`collection_undeclared`). */
export async function requireRegistered(
  ctx: ToolContext,
  siteId: string,
  collection: string,
): Promise<void> {
  const registry = await ctx.store.listCollections(siteId);
  if (isRegistered(registry, collection)) return;
  throw new ToolError(
    "collection_undeclared",
    `collection "${collection}" does not exist on this site (it has: ${registry.map((c) => c.key).join(", ")}). Write into one of those, or call create_collection first; a person approves new collections`,
    { collection, collections: registry.map((c) => c.key) },
  );
}

const LABEL: JsonSchema = obj(
  {
    singular: str("One entry, e.g. Event", { minLength: 1, maxLength: 100 }),
    plural: str("The collection, e.g. Events", { minLength: 1, maxLength: 100 }),
    description: str("Optional, shown under the list's title", { maxLength: 1000 }),
  },
  ["singular", "plural"],
);

const SETTINGS_INPUT = {
  labels: {
    type: "object",
    description:
      "Names per locale (BCP 47 → {singular, plural, description?}); create_collection needs the site's default locale",
    additionalProperties: LABEL,
  },
  icon: str("Icon name", { enum: ICONS }),
  feed: { type: "boolean", description: "Entries appear in the site's RSS feeds (default true)" },
  sitemap: {
    type: "boolean",
    description: "Published entries appear in sitemap.xml (default true)",
  },
  sort: str("Default order where none is given (default newest)", {
    enum: ["newest", "oldest", "title"],
  }),
} satisfies Record<string, JsonSchema>;

/** The settings an agent's arguments describe (labels merge by locale onto `current`). */
function settingsOf(a: Record<string, unknown>, current: CollectionSettings): CollectionSettings {
  const next: CollectionSettings = { ...current };
  if (a.labels) next.labels = { ...current.labels, ...(a.labels as CollectionSettings["labels"]) };
  for (const k of ["icon", "feed", "sitemap", "sort"] as const)
    if (a[k] !== undefined) (next as Record<string, unknown>)[k] = a[k];
  if (typeof a.permalink === "string") next.permalink = a.permalink;
  const fielded = Array.isArray(a.fields)
    ? withFields(current, next, a.fields as FieldDefinition[])
    : next;
  return withListings(fielded, a);
}

function withCollection(site: Site, key: string, settings: CollectionSettings): Site {
  return { ...site, collections: { ...site.collections, [key]: settings } };
}

interface Plan {
  site: Site;
  next: Site;
  key: string;
  settings: CollectionSettings;
  existing: CollectionInfo | undefined;
}

async function planFor(
  a: Record<string, unknown>,
  ctx: ToolContext,
  mode: "create" | "update",
): Promise<Plan> {
  const site = await requireSite(ctx, a.siteId as string);
  const key = a.collection as string;
  const registry = await ctx.store.listCollections(site.id);
  const existing = registry.find((c) => c.key === key);
  if (mode === "create" && existing?.declared)
    throw new ToolError(
      "collection_exists",
      `collection "${key}" is already declared; change it with update_collection`,
    );
  if (mode === "update" && !existing)
    throw new ToolError(
      "collection_undeclared",
      `collection "${key}" does not exist; create it with create_collection`,
    );
  const settings = settingsOf(a, existing?.settings ?? {});
  if (mode === "create" && !settings.labels?.[site.defaultLocale])
    throw new ToolError(
      "invalid",
      `labels must name the collection in the site's default locale (${site.defaultLocale})`,
    );
  return { site, next: withCollection(site, key, settings), key, settings, existing };
}

async function check(p: Plan, ctx: ToolContext): Promise<void> {
  if (!p.existing?.declared && Object.keys(p.site.collections ?? {}).length >= MAX_COLLECTIONS)
    throw new ToolError("invalid", `a site has at most ${MAX_COLLECTIONS} collections`);
  try {
    await ctx.store.updateSite(p.next, { dryRun: true });
  } catch (e) {
    const err = toToolError(e);
    if (err instanceof ToolError && (err.code === "path_conflict" || err.code === "reserved_path"))
      throw new ToolError(
        err.code,
        `${err.message}. Choose another key or a permalink: list_collections shows the collections and their addresses, list_taxonomies the archive base paths`,
        { ...err.details },
      );
    throw err;
  }
}

/** What a person decides on. */
async function describe(p: Plan, mode: "create" | "update", ctx: ToolContext): Promise<string> {
  const label = p.settings.labels?.[p.site.defaultLocale];
  const name = label ? `"${label.plural}" (one: "${label.singular}")` : `"${p.key}"`;
  const s = collectionSettings({ collections: { [p.key]: p.settings } }, p.key);
  const where = collectionPermalink({ collections: { [p.key]: p.settings } }, p.key);
  const head =
    mode === "create"
      ? `Create the collection ${name} with key "${p.key}"? Its entries live at ${where}. Agents may write entries into it once it exists. The key cannot be renamed later.`
      : `Change the collection "${p.key}" to ${name}?`;
  const lines = [
    `  feed: ${s.feed ? "yes" : "no"} · sitemap: ${s.sitemap ? "yes" : "no"} · order: ${s.sort}${p.settings.icon ? ` · icon: ${p.settings.icon}` : ""}`,
  ];
  const other = Object.keys(p.settings.labels ?? {}).filter((l) => l !== p.site.defaultLocale);
  if (other.length) lines.push(`  also named in: ${other.join(", ")}`);
  const fields = describeFieldEdits(
    p.existing?.settings?.fields ?? [],
    p.settings.fields ?? [],
    p.site.defaultLocale,
  );
  if (fields) lines.push(fields);
  lines.push(...(await describeListings(ctx, p.next, p.key, p.existing?.settings)));
  return `${head}\n${lines.join("\n")}`;
}

const COLLECTION_OUT: JsonSchema = obj(
  {
    key: { type: "string" },
    declared: { type: "boolean" },
    settings: { type: "object" },
    counts: { type: "object" },
    permalink: { type: "string" },
    taxonomies: { type: "array", items: { type: "string" } },
    fields: { type: "array", items: { type: "object" } },
    fieldsSchema: { type: "object" },
    listFields: { type: "array", items: { type: "object" } },
    structuredData: { type: "object" },
  },
  ["key", "declared", "settings", "counts", "permalink", "taxonomies"],
);

const listCollectionsTool: ToolDefinition = {
  name: "list_collections",
  title: "List collections",
  description:
    "The site's collections (RFC-0040): declared ones, ones that already have entries, and posts. Each with its names per locale, icon, entry counts by status, its permalink template, feed/sitemap/sort settings (defaults filled in) and the taxonomies that apply. A collection with typed custom fields (RFC-0041) also has `fields` (the definitions) and `fieldsSchema`, the JSON Schema of an entry's `fields` with labels and help in `locale` (default: the site's default locale): read it before create_entry or update_entry with fields. RFC-0042: `listFields` names the fields list_entries and contentList sections may filter (`where`) and sort (`orderBy`) by, each with its operators (`ops`) and whether it sorts; settings.expiry is the collection's date-driven expiry; `structuredData` is the JSON-LD preset's type with every path it offers (required ones, defaults, the sources and vocabulary each takes) and its warnings. Entries may only be created in these collections; call create_collection for a new one.",
  inputSchema: obj(
    { siteId: id, locale: str("BCP 47 locale of field labels and help; default the site's") },
    ["siteId"],
  ),
  outputSchema: obj({ collections: { type: "array", items: COLLECTION_OUT } }, ["collections"]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const [registry, taxonomies] = await Promise.all([
      ctx.store.listCollections(site.id),
      ctx.store.listTaxonomies(site.id),
    ]);
    const locale = (a.locale as string | undefined) ?? site.defaultLocale;
    return {
      collections: registry.map((c) => ({
        ...c,
        ...fieldsView(site, c.key, locale),
        ...listingsView(site, c.key),
        settings: collectionSettings(site, c.key),
        permalink: collectionPermalink(site, c.key),
        taxonomies: taxonomies
          .filter((t) => !t.collections || t.collections.includes(c.key))
          .map((t) => t.key),
      })),
    };
  },
};

function writeTool(mode: "create" | "update"): ToolDefinition {
  const name = `${mode}_collection`;
  return {
    name,
    title: mode === "create" ? "Create collection" : "Update collection",
    description:
      mode === "create"
        ? "Declare a new collection (RFC-0040), e.g. events, team or jobs, with its names in the site's default locale (labels), an optional icon, permalink (/<prefix>/{slug}, default /<key>/{slug}), feed, sitemap and default sort. Its address may not overlap a page, archive, another collection, /search or a locale prefix. A person who may change site settings approves it in every mode; dryRun: true checks without asking. Then create_entry with this collection. Declaring a collection that already has entries names it."
        : "Change a collection's names (merged per locale), icon, feed, sitemap, default sort (RFC-0040) or its typed custom fields (`fields`, the whole list; RFC-0041), list fields, date-driven expiry and JSON-LD preset (`listFields`, `expiry`, `structuredData`; RFC-0042; null removes one). Field edits that keep every stored value are free here; renaming a key, changing a type, localization or multiple, and dropping a key or option still in use are refused (field_change_needs_operation) and go through rename_field, change_field_type, set_field_localized or remove_field. The permalink changes only through set_collection_permalink (it moves URLs). A person who may change site settings approves it; dryRun: true checks without asking.",
    inputSchema: obj(
      {
        siteId: id,
        collection: str("Collection key: lower-case letters, digits, hyphens; never renamed", {
          pattern: SLUG_PATTERN,
          maxLength: 64,
        }),
        ...SETTINGS_INPUT,
        ...(mode === "update" ? { fields: FIELD_DEFINITIONS_INPUT, ...LISTINGS_INPUT } : {}),
        ...(mode === "create"
          ? {
              permalink: str("Template, e.g. /etkinlik/{slug}; default /<key>/{slug}", {
                pattern: PERMALINK_PATTERN,
              }),
            }
          : {}),
        dryRun: {
          type: "boolean",
          description: "Check without asking anyone or changing anything",
        },
      },
      mode === "create" ? ["siteId", "collection", "labels"] : ["siteId", "collection"],
    ),
    outputSchema: obj(
      {
        prompt: { type: "string" },
        dryRun: { type: "boolean" },
        site: SITE,
        snapshot: SNAPSHOT,
        warnings: { type: "array", items: { type: "object" } },
      },
      ["prompt", "dryRun"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: mode === "update",
      openWorldHint: false,
    },
    scopes: ["site:write"],
    // Only someone who may change site settings in Studio decides it (as for permalinks).
    approverScopes: ["site:settings"],
    requiresApproval: true,
    classify: (a) => (a.dryRun === true ? "read" : "person"),
    precheck: async (a, ctx) => check(await planFor(a, ctx, mode), ctx),
    approvalPrompt: async (a, ctx) => describe(await planFor(a, ctx, mode), mode, ctx),
    handler: async (a, ctx) => {
      const p = await planFor(a, ctx, mode);
      const prompt = await describe(p, mode, ctx);
      const warnings = presetWarnings(p.next, p.key);
      const warned = warnings.length ? { warnings } : {};
      if (a.dryRun === true) {
        await check(p, ctx);
        return { prompt, dryRun: true, ...warned };
      }
      let site: Site;
      try {
        site = await ctx.store.updateSite(p.next);
      } catch (e) {
        throw toToolError(e);
      }
      const snapshot = await autoSnapshot(ctx, site.id, name);
      return { prompt, dryRun: false, site, snapshot, ...warned };
    },
  };
}

export function collectionTools(): ToolDefinition[] {
  return [listCollectionsTool, writeTool("create"), writeTool("update"), previewStructuredDataTool];
}

/**
 * RFC-0038 §5: `set_collection_permalink`, the one tool that changes where a collection's entries
 * live. It moves public URLs, so it waits for a person in every mode (`bypass` included), and the
 * person sees the old and new template, a few entries' old and new addresses and the redirect the
 * store writes. `dryRun` returns the same plan without asking anyone or changing anything.
 */
import type { ContentEntry, Redirect, Site } from "@cloudhal/core-contracts";
import { collectionPermalink, entryPath, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
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

/** The schema's v1 pattern (`site.schema.json` → `CollectionSettings.permalink`). */
export const PERMALINK_PATTERN = "^(/[a-z0-9]+(?:-[a-z0-9]+)*)+/\\{slug\\}$";
const EXAMPLES = 3;

/** What a call would do: templates, example URLs and redirects. */
export interface PermalinkPlan {
  collection: string;
  from: string;
  to: string;
  /** The new template is the default `/<collection>/{slug}` (the setting is removed). */
  isDefault: boolean;
  /** Entries in the collection, every status and locale. */
  entries: number;
  examples: { title: string; slug: string; status: string; from: string; to: string }[];
  redirects: { change: "add" | "repoint" | "remove"; from: string; to: string; note: string }[];
  /** Locales the prefix redirect is written for (the default locale and every other one). */
  locales: string[];
}

/** The site with `collection`'s permalink set (`null`: back to the default). */
function nextSite(site: Site, collection: string, permalink: string | null): Site {
  const { [collection]: current, ...others } = site.collections ?? {};
  const { permalink: _old, ...rest } = current ?? {};
  const settings = permalink ? { ...rest, permalink } : rest;
  const collections = Object.keys(settings).length ? { ...others, [collection]: settings } : others;
  const { collections: _drop, ...base } = site;
  return Object.keys(collections).length ? { ...base, collections } : (base as Site);
}

/** Published entries first, newest first; at most `EXAMPLES`, default locale preferred. */
function examples(site: Site, entries: ContentEntry[], next: Site): PermalinkPlan["examples"] {
  const rank = (e: ContentEntry) =>
    (e.status === "published" ? 0 : 2) + (e.locale === site.defaultLocale ? 0 : 1);
  return [...entries]
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, EXAMPLES)
    .map((e) => ({
      title: e.title,
      slug: e.slug,
      status: e.status,
      from: entryPath(site, e),
      to: entryPath(next, e),
    }));
}

/** Mirrors `RedirectPlan.move` (prefix match): repointed targets, dropped loops, the new one. */
function redirectPlan(existing: Redirect[], from: string, to: string): PermalinkPlan["redirects"] {
  const out: PermalinkPlan["redirects"] = [];
  for (const r of existing) {
    if (r.locale) continue;
    if (r.to !== from && !r.to.startsWith(`${from}/`)) continue;
    const target = `${to}${r.to.slice(from.length)}`;
    if (target === r.from)
      out.push({ change: "remove", from: r.from, to: r.to, note: "it would point to itself" });
    else out.push({ change: "repoint", from: r.from, to: target, note: `was ${r.to}` });
  }
  out.push({
    change: "add",
    from,
    to,
    note: `301, prefix: every ${from}/<slug> answers with ${to}/<slug>`,
  });
  return out;
}

async function plan(ctx: ToolContext, a: Record<string, unknown>): Promise<PermalinkPlan> {
  const site = await requireSite(ctx, a.siteId as string);
  const collection = a.collection as string;
  const permalink = (a.permalink ?? null) as string | null;
  const next = nextSite(site, collection, permalink);
  const from = collectionPermalink(site, collection);
  const to = collectionPermalink(next, collection);
  const entries = await ctx.store.listContentEntries(site.id, collection);
  return {
    collection,
    from,
    to,
    isDefault: !next.collections?.[collection]?.permalink,
    entries: entries.length,
    examples: examples(site, entries, next),
    redirects:
      from === to
        ? []
        : redirectPlan(
            await ctx.store.listRedirects(site.id),
            permalinkPrefix(from),
            permalinkPrefix(to),
          ),
    locales: [...new Set([site.defaultLocale, ...site.locales])],
  };
}

/** The approval text: what a person decides on. */
export function describePlan(p: PermalinkPlan): string {
  const head = `Move the public URLs of collection "${p.collection}" from ${p.from} to ${p.to}${p.isDefault ? " (the default)" : ""}? ${p.entries} entr${p.entries === 1 ? "y" : "ies"} move; old URLs keep working through a permanent redirect (301).`;
  const lines = [
    ...p.examples.map((e) => `  ${e.from} → ${e.to} (${e.status}: "${e.title}")`),
    ...p.redirects.map(
      (r) =>
        `${{ add: "+", repoint: "~", remove: "−" }[r.change]} redirect ${r.from} → ${r.to} (${r.note})`,
    ),
  ];
  if (p.locales.length > 1) lines.push(`  in every locale: ${p.locales.join(", ")}`);
  return lines.length ? `${head}\n${lines.join("\n")}` : head;
}

async function check(a: Record<string, unknown>, ctx: ToolContext): Promise<void> {
  const permalink = a.permalink ?? null;
  if (permalink !== null && !new RegExp(PERMALINK_PATTERN).test(String(permalink)))
    throw new ToolError(
      "invalid",
      `permalink must be one or more lower-case path segments followed by /{slug}, e.g. /blog/{slug} (got ${JSON.stringify(permalink)}); null goes back to /${a.collection}/{slug}`,
    );
  const site = await requireSite(ctx, a.siteId as string);
  const collection = a.collection as string;
  const next = nextSite(site, collection, permalink as string | null);
  if (collectionPermalink(site, collection) === collectionPermalink(next, collection))
    throw new ToolError(
      "invalid",
      `collection "${collection}" already uses ${collectionPermalink(site, collection)}; nothing to change`,
    );
  try {
    await ctx.store.updateSite(next, { dryRun: true });
  } catch (e) {
    throw withHint(e);
  }
}

function withHint(e: unknown): unknown {
  const err = toToolError(e);
  if (err instanceof ToolError && (err.code === "path_conflict" || err.code === "reserved_path"))
    return new ToolError(
      err.code,
      `${err.message}. Choose another prefix: get_site shows the collections, list_pages the pages and list_taxonomies the archive base paths`,
      { ...err.details },
    );
  return err;
}

const PLAN_OUT: JsonSchema = obj(
  {
    collection: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    isDefault: { type: "boolean" },
    entries: { type: "integer" },
    examples: { type: "array", items: { type: "object" } },
    redirects: { type: "array", items: { type: "object" } },
    locales: { type: "array", items: { type: "string" } },
  },
  ["collection", "from", "to", "isDefault", "entries", "examples", "redirects", "locales"],
);

export function permalinkTools(): ToolDefinition[] {
  return [
    {
      name: "set_collection_permalink",
      title: "Set collection permalink",
      description:
        'Move where a collection\'s entries live (RFC-0038): permalink "/blog/{slug}" puts collection "posts" at /blog/<slug>; null goes back to the default /<collection>/{slug}. The collection key never changes (filters and tools keep using it). Old URLs keep working: the store writes a permanent prefix redirect (301) in every locale. The template may not overlap a page, a taxonomy archive, another collection, /search or a locale prefix. get_site shows the current `collections`. It moves public URLs, so it always waits for a person, who sees the old and new URLs of a few entries and the redirect; call it with dryRun: true first to see that plan without asking anyone.',
      inputSchema: obj(
        {
          siteId: id,
          collection: str("Collection key (ContentEntry.collection), e.g. posts", {
            pattern: SLUG_PATTERN,
          }),
          permalink: {
            anyOf: [
              {
                type: "string",
                pattern: PERMALINK_PATTERN,
                description: "Fixed lower-case segments followed by /{slug}, e.g. /blog/{slug}",
              },
              { type: "null" },
            ],
            description: "The new template, or null for the default /<collection>/{slug}",
          },
          dryRun: {
            type: "boolean",
            description: "Return the plan (example URLs, redirects) without changing anything",
          },
        },
        ["siteId", "collection", "permalink"],
      ),
      outputSchema: obj(
        { plan: PLAN_OUT, dryRun: { type: "boolean" }, site: SITE, snapshot: SNAPSHOT },
        ["plan", "dryRun"],
      ),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:write"],
      // Only someone who may change site settings in Studio decides it (an Editor may not).
      approverScopes: ["site:settings"],
      requiresApproval: true,
      // Public URLs move: a person decides in every mode; a dry run changes nothing.
      classify: (a) => (a.dryRun === true ? "read" : "person"),
      precheck: check,
      approvalPrompt: async (a, ctx) => describePlan(await plan(ctx, a)),
      handler: async (a, ctx) => {
        const p = await plan(ctx, a);
        if (a.dryRun === true) return { plan: p, dryRun: true };
        const site = await requireSite(ctx, a.siteId as string);
        let updated: Site;
        try {
          updated = await ctx.store.updateSite(
            nextSite(site, a.collection as string, (a.permalink ?? null) as string | null),
          );
        } catch (e) {
          throw withHint(e);
        }
        const snapshot = await autoSnapshot(ctx, site.id, "set_collection_permalink");
        return { plan: p, dryRun: false, site: updated, snapshot };
      },
    },
  ];
}

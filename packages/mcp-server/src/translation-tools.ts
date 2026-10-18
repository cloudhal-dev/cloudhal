/**
 * RFC-0033 §6 / ADR-0035: translating pages and entries. The agent translates with its own model;
 * the server keeps the rules. `get_translation_source` hands over the source, the glossary terms
 * it uses and the current translation; `save_translation` writes a draft in the target locale,
 * linked to the source revision, with its provenance and the deterministic checks
 * (`checkTranslation`). Agents never review: only a person does, in Studio. A translation a person
 * wrote or reviewed is never overwritten here.
 */
import type { ContentEntry, Glossary, Page, Section, Translation } from "@cloudhal/core-contracts";
import { checkNames, checkTranslation, type TranslationGroup } from "@cloudhal/core-ts";
import {
  autoSnapshot,
  id,
  mapError,
  obj,
  requireSite,
  str,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import { ENTRY, mcpWriter, PAGE, SNAPSHOT, sectionInput } from "./content-shared.ts";

type Localized = Page | ContentEntry;

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** A page or entry of the site by id. */
async function nodeOf(ctx: ToolContext, siteId: string, nodeId: string): Promise<Localized> {
  const node = (await ctx.store.getPage(nodeId)) ?? (await ctx.store.getContentEntry(nodeId));
  if (!node || node.siteId !== siteId)
    throw new ToolError("not_found", `page or entry ${nodeId} not found`);
  return node;
}

/** The glossary entries a text uses (all of them for a short glossary). */
function glossaryFor(glossary: Glossary | undefined, text: string, locale: string) {
  const lower = text.toLocaleLowerCase();
  return (glossary?.entries ?? [])
    .filter((e) =>
      e.caseSensitive ? text.includes(e.term) : lower.includes(e.term.toLocaleLowerCase()),
    )
    .map((e) => ({
      term: e.term,
      ...(e.doNotTranslate ? { doNotTranslate: true } : {}),
      ...(e.translations?.[locale] ? { translation: e.translations[locale]?.text } : {}),
      ...(e.note ? { note: e.note } : {}),
    }));
}

const GROUP = {
  type: "object",
  properties: {
    group: { type: "string" },
    members: { type: "array", items: { type: "object" } },
  },
  required: ["group", "members"],
};

const listTranslationsTool: ToolDefinition = {
  name: "list_translations",
  title: "List translations",
  description:
    "Every language version of a page or entry (its translation group): locale, status, method (original, human, machine, machine-reviewed), whether it is stale (its source changed since) and reviewed.",
  inputSchema: obj({ siteId: id, nodeId: id }, ["siteId", "nodeId"]),
  outputSchema: obj({ group: GROUP }, ["group"]),
  annotations: READ,
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const node = await nodeOf(ctx, site.id, a.nodeId as string);
    const group: TranslationGroup = await ctx.store.translationGroup(
      site,
      node.translation?.group ?? node.id,
    );
    return { group };
  },
};

const getSourceTool: ToolDefinition = {
  name: "get_translation_source",
  title: "Get translation source",
  description:
    "What you need to translate a page or entry into `locale`: the source (translate its title, text, summary and SEO; keep section ids, kinds, links, numbers, images and bindings), the glossary terms it uses (doNotTranslate terms stay as written, given translations are used), and the current translation in that locale if there is one (with `stale` when the source changed since). Then call save_translation.",
  inputSchema: obj({ siteId: id, nodeId: id, locale: str("Target BCP 47 locale") }, [
    "siteId",
    "nodeId",
    "locale",
  ]),
  outputSchema: obj(
    {
      source: { type: "object" },
      glossary: { type: "array", items: { type: "object" } },
      existing: { type: "object" },
      stale: { type: "boolean" },
    },
    ["source", "glossary"],
  ),
  annotations: READ,
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const locale = a.locale as string;
    if (!site.locales.includes(locale))
      throw new ToolError("locale_not_enabled", `${locale} is not one of the site's locales`);
    const source = await nodeOf(ctx, site.id, a.nodeId as string);
    const group = await ctx.store.translationGroup(site, source.translation?.group ?? source.id);
    const member = group.members.find((m) => m.locale === locale && m.siteId === site.id);
    const existing = member ? await nodeOf(ctx, site.id, member.id) : undefined;
    const text = JSON.stringify("sections" in source ? source.sections : source.body.value);
    return {
      source,
      glossary: glossaryFor(
        await ctx.store.glossary.get(site.id),
        `${source.title} ${text}`,
        locale,
      ),
      ...(existing ? { existing, stale: member?.stale === true } : {}),
    };
  },
};

const saveTranslationTool: ToolDefinition = {
  name: "save_translation",
  title: "Save translation",
  description:
    "Save your translation of a page or entry into `locale` as a draft linked to the source's current revision, with your model as its provenance. Pages: send title, path and sections (same ids, kinds and order as the source; translated text). Entries: title, slug, body and summary. The checks (structure, links, numbers, glossary, length) run and are returned; a failed check keeps it from being published until fixed. A person reviews it in Studio before it goes live where the site asks for review. Refused for a translation a person wrote or reviewed. Snapshots afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      nodeId: { ...id, description: "The source page or entry" },
      locale: str("Target BCP 47 locale"),
      title: str("Translated title"),
      path: str("Pages: the translated page's path in its locale, e.g. /acerca"),
      slug: str("Entries: the translated entry's slug"),
      sections: sectionInput,
      body: str("Entries: the translated markdown body"),
      summary: str("Entries: the translated summary"),
      seo: { type: "object", description: "Pages: the translated SEO title and description" },
      engine: str("The model that translated, e.g. claude-opus-5-5"),
    },
    ["siteId", "nodeId", "locale", "title"],
  ),
  outputSchema: obj(
    {
      node: { oneOf: [PAGE, ENTRY] },
      checks: { type: "array", items: { type: "object" } },
      snapshot: SNAPSHOT,
    },
    ["node", "checks", "snapshot"],
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const locale = a.locale as string;
    let source = await nodeOf(ctx, site.id, a.nodeId as string);
    if (source.locale === locale)
      throw new ToolError("invalid", "the translation's locale differs from its source's");
    // The source becomes the group's original the first time it is translated (a new revision).
    if (!source.translation) source = await markOriginal(ctx, source);
    const group = await ctx.store.translationGroup(site, source.translation?.group ?? source.id);
    const self = group.members.find((m) => m.id === source.id);
    const member = group.members.find((m) => m.locale === locale && m.siteId === site.id);
    const existing = member ? await nodeOf(ctx, site.id, member.id) : undefined;
    const t = existing?.translation;
    if (t && (t.method === "human" || t.method === "original" || t.review))
      throw new ToolError(
        "denied",
        `${existing?.id} was written or reviewed by a person; ask them to update it (or propose changes)`,
      );
    const translation: Translation = {
      group: source.translation?.group ?? source.id,
      method: "machine",
      layout: t?.layout ?? "linked",
      source: { id: source.id, locale: source.locale, rev: source.rev, hash: self?.hash ?? "" },
      provenance: {
        engine:
          (a.engine as string | undefined) ?? ctx.principal.actor.name ?? ctx.principal.actor.id,
        at: (ctx.now?.() ?? new Date()).toISOString(),
      },
    };
    try {
      const draft = translatedNode({ a, site: site.id, locale, source, existing, translation });
      const checks = checkTranslation({
        source,
        draft,
        locale,
        glossary: await ctx.store.glossary.get(site.id),
      });
      const withChecks: Translation = {
        ...translation,
        provenance: {
          ...(translation.provenance as NonNullable<Translation["provenance"]>),
          checks: checkNames(checks),
        },
      };
      const node = await writeTranslation(
        ctx,
        site.id,
        { ...draft, translation: withChecks } as Localized,
        existing,
      );
      const snapshot = await autoSnapshot(ctx, site.id, "save_translation");
      return { node, checks, snapshot };
    } catch (e) {
      mapError(e);
    }
  },
};

/** The source gains `translation: { group: its id, method: "original" }`. */
async function markOriginal(ctx: ToolContext, source: Localized): Promise<Localized> {
  const translation: Translation = { group: source.id, method: "original" };
  try {
    if ("sections" in source)
      return await ctx.store.updatePage({ ...source, translation }, { writer: mcpWriter(ctx) });
    return await ctx.store.updateContentEntry(
      { ...source, translation },
      { writer: mcpWriter(ctx) },
    );
  } catch (e) {
    mapError(e);
  }
}

/** The draft node: a new translation, or the existing machine one with the new text. */
function translatedNode(input: {
  a: Record<string, unknown>;
  site: string;
  locale: string;
  source: Localized;
  existing: Localized | undefined;
  translation: Translation;
}): Localized {
  const { a, site, locale, source, existing, translation } = input;
  const common = {
    siteId: site,
    locale,
    status: "draft" as const,
    title: a.title as string,
    translation,
  };
  if ("sections" in source) {
    const base = (existing as Page | undefined) ?? { ...source, id: "", rev: 0 };
    return {
      ...base,
      ...common,
      path: (a.path as string | undefined) ?? base.path,
      ...(a.seo ? { seo: a.seo as Page["seo"] } : {}),
      sections: (a.sections as Section[] | undefined) ?? base.sections,
    } as Page;
  }
  const base = (existing as ContentEntry | undefined) ?? { ...source, id: "", rev: 0 };
  return {
    ...base,
    ...common,
    slug: (a.slug as string | undefined) ?? base.slug,
    body: { format: "markdown", value: (a.body as string | undefined) ?? base.body.value },
    ...(a.summary !== undefined ? { summary: a.summary as string } : {}),
  } as ContentEntry;
}

/** Creates the translation or updates the existing one (CAS on its `rev`). */
async function writeTranslation(
  ctx: ToolContext,
  siteId: string,
  node: Localized,
  existing: Localized | undefined,
): Promise<Localized> {
  const writer = { writer: mcpWriter(ctx) };
  if (existing && "sections" in node) return ctx.store.updatePage(node, writer);
  if (existing) return ctx.store.updateContentEntry(node as ContentEntry, writer);
  const { id: _id, rev: _rev, createdAt: _c, updatedAt: _u, schemaVersion: _s, ...fresh } = node;
  if ("sections" in node) {
    const site = await requireSite(ctx, siteId);
    return (await ctx.store.createPage(site, fresh as Page, writer)).page;
  }
  const { publishedAt: _p, corrections: _k, ...entry } = fresh as ContentEntry;
  return ctx.store.createContentEntry(
    { ...entry, author: ctx.principal.actor } as ContentEntry,
    writer,
  );
}

/** list_translations, get_translation_source, save_translation. */
export function translationTools(): ToolDefinition[] {
  return [listTranslationsTool, getSourceTool, saveTranslationTool];
}

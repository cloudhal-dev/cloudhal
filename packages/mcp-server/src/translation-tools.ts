/**
 * RFC-0033 §6 / ADR-0035: translating pages and entries. The agent translates with its own model;
 * the server keeps the rules. `get_translation_source` hands over the source, the glossary terms
 * it uses and the current translation; `save_translation` writes a draft in the target locale,
 * linked to the source revision, with its provenance and the deterministic checks
 * (`checkTranslation`). Agents never review: only a person does, in Studio. A translation a person
 * wrote or reviewed is never overwritten here. Typed fields follow RFC-0041 §5
 * (`translation-fields.ts`): only localized text is translated, shared values stay on the original.
 */
import { forSite, holds } from "@cloudhal/agent-runtime";
import type {
  ContentEntry,
  Glossary,
  Page,
  Section,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import {
  checkNames,
  checkTranslation,
  forEdition,
  linkedLayout,
  type TranslationGroup,
} from "@cloudhal/core-ts";
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
import {
  refuseSharedFields,
  TRANSLATED_FIELDS,
  translatedFields,
  translationSourceFields,
} from "./translation-fields.ts";

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
    "What you need to translate a page or entry into `locale`: the source (translate its title, text, summary and SEO; keep section ids, kinds, links, numbers, images and bindings), for an entry with typed fields the localized text and rich-text values to translate (`fields`) and the shared fields a translation reads from the original (`sharedFields`, never translated), the glossary terms it uses (doNotTranslate terms stay as written, given translations are used), and the current translation in that locale if there is one (with `stale` when the source changed since, and for a linked page whose source changed its layout, `layout`: the translation's sections on the new layout, with the `untranslated` ones to translate). Then call save_translation.",
  inputSchema: obj(
    {
      siteId: id,
      nodeId: id,
      locale: str("Target BCP 47 locale"),
      targetSiteId: {
        ...id,
        description:
          "A language edition: another site of the project the translation lives on (RFC-0034 §6); default siteId",
      },
    },
    ["siteId", "nodeId", "locale"],
  ),
  outputSchema: obj(
    {
      source: { type: "object" },
      glossary: { type: "array", items: { type: "object" } },
      fields: {
        type: "object",
        description:
          "Entries: the localized text and rich-text field values to translate, by key; send them translated as save_translation's `fields`",
      },
      sharedFields: {
        type: "array",
        items: { type: "string" },
        description:
          "Entries: keys of the fields that are not localized: every language version reads them from the original, so they are not translated",
      },
      existing: { type: "object" },
      stale: { type: "boolean" },
      layout: {
        type: "object",
        description:
          "A linked page translation rebuilt on the source's current layout: translate the sections named in `untranslated` and save these sections",
      },
    },
    ["source", "glossary"],
  ),
  annotations: READ,
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const target = await targetOf(ctx, site, a.targetSiteId);
    const locale = a.locale as string;
    if (!target.locales.includes(locale))
      throw new ToolError("locale_not_enabled", `${locale} is not one of the site's locales`);
    const source = await nodeOf(ctx, site.id, a.nodeId as string);
    const group = await ctx.store.translationGroup(site, source.translation?.group ?? source.id);
    const member = group.members.find((m) => m.locale === locale && m.siteId === target.id);
    const existing = member ? await nodeOf(ctx, target.id, member.id) : undefined;
    const typed = translationSourceFields(site, source);
    const text = JSON.stringify(
      "sections" in source ? source.sections : [source.body.value, typed.fields ?? {}],
    );
    // RFC-0033 §4a: a linked page translation follows the source's layout; nothing is written.
    const layout =
      existing &&
      "sections" in existing &&
      "sections" in source &&
      existing.translation?.layout !== "independent"
        ? linkedLayout(source, existing)
        : undefined;
    return {
      ...typed,
      glossary: glossaryFor(
        await ctx.store.glossary.get(site.id),
        `${source.title} ${text}`,
        locale,
      ),
      ...(existing ? { existing, stale: member?.stale === true } : {}),
      ...(layout?.changed ? { layout } : {}),
    };
  },
};

const saveTranslationTool: ToolDefinition = {
  name: "save_translation",
  title: "Save translation",
  description:
    "Save your translation of a page or entry into `locale` as a draft linked to the source's current revision, with your model as its provenance. Pages: send title, path and sections (same ids, kinds and order as the source; translated text). Entries: title, slug, body, summary and the translated `fields` (only the localized text and rich-text ones get_translation_source returns; shared fields are refused with field_not_localized). The checks (structure, links, numbers, glossary, length) run and are returned; a failed check keeps it from being published until fixed. A person reviews it in Studio before it goes live where the site asks for review. Refused for a translation a person wrote or reviewed. Snapshots afterwards.",
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
      fields: TRANSLATED_FIELDS,
      coverAlt: str(
        "Entries: the cover image's alt text in `locale`. Without it a new translation leaves the cover alt empty, so the image's own alt text in `locale` (update_asset) is shown",
        { maxLength: 500 },
      ),
      seo: { type: "object", description: "Pages: the translated SEO title and description" },
      engine: str("The model that translated, e.g. claude-opus-5-5"),
      targetSiteId: {
        ...id,
        description:
          "A language edition: another site of the project to save the translation on (RFC-0034 §6). Its images are copied there and its categories and tags become the edition's terms with the same slugs (create missing ones there first). Default siteId",
      },
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
  // RFC-0041 §5: a shared (non-localized) field value is refused before anything is written.
  precheck: async (a, ctx) => {
    if (a.fields === undefined) return;
    const site = await ctx.store.getSite(a.siteId as string);
    const source = await ctx.store.getContentEntry(a.nodeId as string);
    if (site && source?.siteId === site.id) refuseSharedFields(site, source, a.fields);
  },
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const target = await targetOf(ctx, site, a.targetSiteId);
    const cross = target.id !== site.id;
    const locale = a.locale as string;
    if (cross && !target.locales.includes(locale))
      throw new ToolError("locale_not_enabled", `${locale} is not one of the edition's locales`);
    let source = await nodeOf(ctx, site.id, a.nodeId as string);
    if (source.locale === locale)
      throw new ToolError("invalid", "the translation's locale differs from its source's");
    // The source becomes the group's original the first time it is translated (a new revision).
    if (!source.translation) source = await markOriginal(ctx, source);
    const group = await ctx.store.translationGroup(site, source.translation?.group ?? source.id);
    const self = group.members.find((m) => m.id === source.id);
    const member = group.members.find((m) => m.locale === locale && m.siteId === target.id);
    const existing = member ? await nodeOf(ctx, target.id, member.id) : undefined;
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
      source: {
        id: source.id,
        ...(cross ? { siteId: site.id } : {}),
        locale: source.locale,
        rev: source.rev,
        hash: self?.hash ?? "",
      },
      provenance: {
        engine:
          (a.engine as string | undefined) ?? ctx.principal.actor.name ?? ctx.principal.actor.id,
        at: (ctx.now?.() ?? new Date()).toISOString(),
      },
    };
    try {
      const fields =
        "sections" in source
          ? undefined
          : translatedFields({
              site,
              source,
              existing: existing as ContentEntry | undefined,
              given: a.fields as Record<string, unknown> | undefined,
              cross,
            });
      const made = translatedNode({
        a,
        site: target.id,
        locale,
        source,
        existing,
        translation,
        fields,
      });
      // RFC-0034 §6: on an edition, the images come along and the terms are the edition's.
      const draft = cross
        ? await forEdition(ctx.store, made, {
            fromSiteId: site.id,
            toSiteId: target.id,
            actor: ctx.principal.actor,
          })
        : made;
      const glossary = await ctx.store.glossary.get(target.id);
      const checks = checkTranslation({ source, draft, locale, glossary });
      const withChecks: Translation = {
        ...translation,
        provenance: {
          ...(translation.provenance as NonNullable<Translation["provenance"]>),
          checks: checkNames(checks),
          ...(glossary ? { glossaryRev: glossary.rev } : {}),
        },
      };
      const node = await writeTranslation(
        ctx,
        target.id,
        { ...draft, translation: withChecks } as Localized,
        existing,
      );
      const snapshot = await autoSnapshot(ctx, target.id, "save_translation");
      return { node, checks, snapshot };
    } catch (e) {
      mapError(e);
    }
  },
};

/**
 * The site a translation lives on: `siteId`'s own, or with `targetSiteId` another site of the same
 * project (a language edition, RFC-0034 §6) the caller may write to.
 */
async function targetOf(ctx: ToolContext, site: Site, targetSiteId: unknown): Promise<Site> {
  if (typeof targetSiteId !== "string" || targetSiteId === site.id) return site;
  const target = await ctx.store.getSite(targetSiteId);
  const scoped = target ? forSite(ctx.principal, target.id) : undefined;
  if (!target || target.projectId !== site.projectId || !scoped)
    throw new ToolError("not_found", `no site ${targetSiteId} in this site's project`);
  if (!holds(scoped.scopes, "content:write"))
    throw new ToolError("denied", "missing scope content:write on the edition");
  return target;
}

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
  /** Entries: the translation's typed field values (`translatedFields`). */
  fields?: Record<string, unknown> | undefined;
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
  const cover = translatedCover(base.coverImage, a.coverAlt as string | undefined, !existing);
  const { coverImage: _cover, ...rest } = base;
  return {
    ...rest,
    ...common,
    slug: (a.slug as string | undefined) ?? base.slug,
    body: { format: "markdown", value: (a.body as string | undefined) ?? base.body.value },
    ...(a.summary !== undefined ? { summary: a.summary as string } : {}),
    ...(cover ? { coverImage: cover } : {}),
    ...(input.fields ? { fields: input.fields } : {}),
  } as ContentEntry;
}

/**
 * The cover of a translated entry: the given alt text in its language, or — for a new translation
 * — no copy of the source's alt override, which is in the source's language.
 */
function translatedCover(
  cover: ContentEntry["coverImage"],
  alt: string | undefined,
  fresh: boolean,
): ContentEntry["coverImage"] {
  if (!cover) return undefined;
  if (alt !== undefined) return { ...cover, alt };
  // An empty alt falls back to the image's own alt text in the entry's language.
  return fresh ? { ...cover, alt: "" } : cover;
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

const listStaleTool: ToolDefinition = {
  name: "list_stale_translations",
  title: "List stale translations",
  description:
    "Translations whose source changed since they were made (or whose source is gone), optionally in one locale: the work queue for keeping languages in step. Re-translate each with get_translation_source and save_translation.",
  inputSchema: obj({ siteId: id, locale: str("Only this locale") }, ["siteId"]),
  outputSchema: obj({ stale: { type: "array", items: { type: "object" } } }, ["stale"]),
  annotations: READ,
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const nodes: Localized[] = [
      ...(await ctx.store.listPages(site.id)),
      ...(await ctx.store.listContentEntries(site.id)),
    ];
    const groups = [...new Set(nodes.flatMap((n) => (n.translation ? [n.translation.group] : [])))];
    const stale = [];
    for (const g of groups)
      for (const m of (await ctx.store.translationGroup(site, g)).members)
        if (
          (m.stale || m.sourceMissing) &&
          m.siteId === site.id &&
          (!a.locale || m.locale === a.locale)
        )
          stale.push({ ...m, group: g });
    return { stale };
  },
};

/** list_translations, list_stale_translations, get_translation_source, save_translation. */
export function translationTools(): ToolDefinition[] {
  return [listTranslationsTool, listStaleTool, getSourceTool, saveTranslationTool];
}

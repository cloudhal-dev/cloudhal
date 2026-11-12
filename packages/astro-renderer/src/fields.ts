/**
 * Typed custom fields for themes (RFC-0041 §9 / ADR-0043). `entry.fields` keeps meaning exactly
 * what is stored; this module gives themes the values a reader should see: resolved (§5: a
 * translation's empty localized field reads the original's, non-localized fields always come from
 * the translation group's original), labelled in the page's language and made safe to draw.
 *
 * - rich text: HTML from the body's markdown pipeline (raw HTML escaped, `safeHref` on every link,
 *   `asset:` references resolved), never stored HTML;
 * - URLs: through `safeHref`, dropped when unsafe;
 * - images: `<img>` attributes from `imageAttributes`, with the asset's alt in the page's language;
 * - everything else: `formatFieldValue` text, which themes print escaped;
 * - RFC-0045: references as cards of the targets this view shows (`references`, depth 1 by
 *   default, 2 at most, within a per-request budget), repeaters as their items' sub-fields
 *   (`items`). An unresolved target leaves nothing behind: no id, no title, no empty item.
 *
 * Worker-safe; the same function serves live and snapshot sources.
 */
import type { Asset, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  type ConversionEntries,
  type FormatFieldOptions,
  fieldHelp,
  fieldLabel,
  formatFieldValue,
  hasFieldValue,
  type ResolvedField,
  type ResolvedFields,
  referenceUses,
  resolveFields,
} from "@cloudhal/core-ts/fields";
import { renderMarkdown } from "./markdown.ts";
import {
  type ImageAttributes,
  imageAttributes,
  type MediaContext,
  type PlaceholderBudget,
  REFERENCE_BUDGET,
} from "./media.ts";
import { conversionsFor } from "./reference-conversions.ts";
import { type ReferencedEntry, referenceCards } from "./references.ts";
import { safeHref } from "./safe-urls.ts";

export {
  type FormatFieldOptions,
  fieldHelp,
  fieldLabel,
  formatFieldValue,
  optionLabel,
  type ResolvedField,
  type ResolvedFields,
  resolveFields,
} from "@cloudhal/core-ts/fields";
export type { ReferencedEntry } from "./references.ts";

/** An image field's picture: `<img>` attributes plus the asset it shows. */
export interface FieldImage extends ImageAttributes {
  assetId: string;
}

/** One field as a theme draws it. */
export interface RenderedField extends ResolvedField {
  key: string;
  /** The label in the page's language (then the site's default, then any, then the key). */
  label: string;
  help?: string;
  /** Nothing to show: no value, an unreadable one, an unsafe URL, a missing image or target. */
  empty: boolean;
  /** The value as plain text in the page's language ("" when empty). Print it escaped. */
  text: string;
  /** `richText`: sanitized HTML from the body's markdown pipeline. */
  html?: string;
  /** `url`: the link target, checked by `safeHref`. */
  href?: string;
  /** `image`: the picture. */
  image?: FieldImage;
  /** `date` (`YYYY-MM-DD`) and `datetime` (the UTC instant): for `<time datetime>`. */
  datetime?: string;
  /** RFC-0045 `reference`: the targets this view shows, in stored order (unresolved ones left out). */
  references?: ReferencedEntry[];
  /** RFC-0045 `repeater`: each item's sub-fields, rendered like fields (empty items left out). */
  items?: RenderedFields[];
}

/** Every defined field of an entry by key, in definition order (`{}` without definitions). */
export type RenderedFields = Record<string, RenderedField>;

export interface EntryFieldsOptions {
  /** The page's language (default: the entry's). Labels, formatting and image alt follow it. */
  locale?: string;
  /** The page's media context: assets for images and `asset:` links, transforms, placeholders. */
  media?: MediaContext;
  /** `datetime` values show in this zone (default: each value's own zone). */
  timeZone?: string;
  /** The words for yes/no fields (default: English). */
  words?: FormatFieldOptions["words"];
  /** `sizes` for image fields (default: the article column). */
  sizes?: string;
  /**
   * RFC-0045 §4: 1 (default) resolves references to cards; 2 adds each card's own fields, with
   * *their* references as cards without fields.
   */
  depth?: 1 | 2;
}

/** What `entryFields` needs from a source: the site, the original by id, assets by id. */
export interface FieldsSource {
  site(): Promise<Site>;
  entryById?(id: string): Promise<ContentEntry | undefined>;
  asset?(id: string): Promise<Asset | undefined>;
  /** RFC-0045 §4: the members of groups this view shows (absent: references resolve to nothing). */
  groupMembers?(groupIds: readonly string[]): Promise<Map<string, ContentEntry[]>>;
  /** RFC-0045 §7: the entry maps of a running text ↔ reference conversion in a collection. */
  conversionEntries?(collection: string): Promise<ConversionEntries | undefined>;
}

export interface RenderFieldsOptions extends EntryFieldsOptions {
  locale: string;
  defaultLocale: string;
  /** Assets by id (image fields; rich text's `asset:` links when `media.assets` is absent). */
  assets?: ReadonlyMap<string, Asset> | undefined;
  /** RFC-0045: resolved reference targets by value path (`fields/venue`, `fields/speakers/0/person`). */
  cards?: ReadonlyMap<string, ReferencedEntry> | undefined;
}

const SIZES = "(min-width: 48rem) 48rem, 100vw";
const CARD_SIZES = "(min-width: 48rem) 24rem, 50vw";

/** A translation in this site reads its group's original (RFC-0041 §5). */
function originalId(entry: ContentEntry): string | undefined {
  const t = entry.translation;
  return t && t.group !== entry.id && t.source?.siteId === undefined ? t.group : undefined;
}

function mediaOf(o: RenderFieldsOptions): MediaContext {
  return {
    ...o.media,
    locale: o.locale,
    defaultLocale: o.defaultLocale,
    assets: o.media?.assets ?? o.assets,
  };
}

function picture(
  asset: Asset,
  ref: ContentEntry["coverImage"],
  o: RenderFieldsOptions & { sizes: string },
): FieldImage {
  const ctx = mediaOf(o);
  const image = imageAttributes(asset, ref, {
    locale: o.locale,
    defaultLocale: o.defaultLocale,
    transform: ctx.transform ?? "none",
    sizes: o.sizes,
    ...(ctx.preview ? { preview: true } : {}),
    ...(ctx.budget ? { budget: ctx.budget } : {}),
  });
  return { ...image, assetId: asset.id };
}

function shape(field: ResolvedField, o: RenderFieldsOptions): Partial<RenderedField> {
  const { def, value } = field;
  const ctx = mediaOf(o);
  if (def.type === "richText" && typeof value === "string")
    return { html: renderMarkdown(value, ctx) };
  if (def.type === "url" && typeof value === "string") {
    const href = safeHref(value);
    return href ? { href, text: href } : { empty: true };
  }
  if (def.type === "image" && typeof value === "string") {
    const asset = ctx.assets?.get(value) ?? o.assets?.get(value);
    if (!asset?.mediaType.startsWith("image/")) return { empty: true };
    const image = picture(asset, undefined, { ...o, sizes: o.sizes ?? SIZES });
    return { image, text: image.alt };
  }
  if (def.type === "date" && typeof value === "string") return { datetime: value };
  if (def.type === "datetime" && typeof value === "object" && value !== null)
    return { datetime: (value as { at: string }).at };
  return {};
}

/** A reference: the cards this view resolved, in stored order; nothing of the unresolved ones. */
function referenceField(base: RenderedField, path: string, o: RenderFieldsOptions): RenderedField {
  const uses = referenceUses(base.def, base.value, path);
  const cards = uses.flatMap((u) => {
    const card = o.cards?.get(u.path);
    return card ? [card] : [];
  });
  if (cards.length === 0) return { ...base, value: undefined };
  const ids = cards.map((c) => c.groupId);
  return {
    ...base,
    value: Array.isArray(base.value) ? ids : ids[0],
    empty: false,
    text: cards.map((c) => c.title).join(", "),
    references: cards,
  };
}

/** A repeater sub-field read as a field (sub-fields take the repeater's localization). */
const subField = (sub: { key: string }, parent: FieldDefinition): FieldDefinition =>
  ({ ...sub, localized: parent.localized }) as FieldDefinition;

/** A repeater: each item's sub-fields rendered like fields; items with nothing to show left out. */
function repeaterField(base: RenderedField, path: string, o: RenderFieldsOptions): RenderedField {
  const def = base.def;
  if (def.type !== "repeater" || !Array.isArray(base.value)) return { ...base, value: undefined };
  const items: RenderedFields[] = [];
  const values: Record<string, unknown>[] = [];
  base.value.forEach((item: unknown, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return;
    const resolved: ResolvedFields = {};
    for (const sub of def.fields) {
      const value = Object.hasOwn(item, sub.key)
        ? (item as Record<string, unknown>)[sub.key]
        : undefined;
      resolved[sub.key] = { def: subField(sub, def), value, fromOriginal: base.fromOriginal };
    }
    const rendered = renderAt(resolved, o, `${path}/${i}`);
    if (!hasShownFields(rendered)) return;
    items.push(rendered);
    values.push(
      Object.fromEntries(
        Object.values(rendered).flatMap((f) => (f.empty ? [] : [[f.key, f.value]])),
      ),
    );
  });
  if (items.length === 0) return { ...base, value: undefined };
  const line = (item: RenderedFields) =>
    Object.values(item)
      .filter((f) => !f.empty && f.text !== "")
      .map((f) => f.text)
      .join(", ");
  return { ...base, value: values, empty: false, text: items.map(line).join("; "), items };
}

function renderOne(
  key: string,
  field: ResolvedField,
  o: RenderFieldsOptions,
  path: string,
): RenderedField {
  const help = fieldHelp(field.def, o.locale, o.defaultLocale);
  const base: RenderedField = {
    ...field,
    key,
    label: fieldLabel(field.def, o.locale, o.defaultLocale),
    ...(help ? { help } : {}),
    empty: true,
    text: "",
  };
  if (!hasFieldValue(field.value)) return base;
  if (field.def.type === "reference") return referenceField(base, path, o);
  if (field.def.type === "repeater") return repeaterField(base, path, o);
  const text = formatFieldValue(field.value, field.def, {
    locale: o.locale,
    defaultLocale: o.defaultLocale,
    timeZone: o.timeZone,
    words: o.words,
  });
  const shown: RenderedField = { ...base, empty: false, text, ...shape(field, o) };
  return shown.empty ? { ...base, value: undefined } : shown;
}

function renderAt(resolved: ResolvedFields, o: RenderFieldsOptions, at: string): RenderedFields {
  const out: RenderedFields = {};
  for (const [key, field] of Object.entries(resolved))
    out[key] = renderOne(key, field, o, `${at}/${key}`);
  return out;
}

/** Resolved fields made ready to draw (pure; `entryFields` loads what it needs and calls this). */
export function renderFields(resolved: ResolvedFields, o: RenderFieldsOptions): RenderedFields {
  return renderAt(resolved, o, "fields");
}

/** The assets image fields and repeater image sub-fields name, by id, that `media` lacks. */
async function loadAssets(
  source: FieldsSource,
  resolved: ResolvedFields,
  media: MediaContext | undefined,
): Promise<Map<string, Asset>> {
  const ids = new Set<string>();
  for (const field of Object.values(resolved)) {
    const { def, value } = field;
    if (def.type === "image" && typeof value === "string") ids.add(value);
    if (def.type !== "repeater" || !Array.isArray(value)) continue;
    const images = def.fields.filter((s) => s.type === "image").map((s) => s.key);
    for (const item of value as unknown[])
      for (const k of images) {
        const v = (item as Record<string, unknown> | null)?.[k];
        if (typeof v === "string") ids.add(v);
      }
  }
  const out = new Map<string, Asset>();
  for (const id of ids) {
    if (media?.assets?.has(id)) continue;
    const asset = source.asset ? await source.asset(id) : undefined;
    if (asset) out.set(id, asset);
  }
  return out;
}

/** The budget `entryFields` spends: the request's (`media.budget`), else one of its own. */
function budgetOf(media: MediaContext | undefined): PlaceholderBudget {
  return media?.budget ?? { left: 0, references: REFERENCE_BUDGET };
}

/**
 * An entry's typed fields as a theme draws them (RFC-0041 §9), from any source: loads the site,
 * the translation group's original when the entry is a translation in this site, and the assets
 * of image fields (from `media.assets` when given). RFC-0045: references resolve through the
 * source's `groupMembers` (one read per level), gated by the source's view.
 */
export async function entryFields(
  source: FieldsSource,
  entry: ContentEntry,
  options: EntryFieldsOptions = {},
): Promise<RenderedFields> {
  const site = await source.site();
  if (!site.collections?.[entry.collection]?.fields) return {};
  const id = originalId(entry);
  const original = id && source.entryById ? await source.entryById(id) : undefined;
  const entries = await conversionsFor(source, site, entry.collection);
  const resolved = resolveFields(site, entry, original, entries ? { entries } : undefined);
  const base: RenderFieldsOptions = {
    ...options,
    locale: options.locale ?? entry.locale,
    defaultLocale: site.defaultLocale,
  };
  const render = async (r: ResolvedFields, cards: ReadonlyMap<string, ReferencedEntry>) =>
    renderFields(r, { ...base, assets: await loadAssets(source, r, options.media), cards });
  const cards = await referenceCards(
    {
      source,
      site,
      locale: base.locale,
      depth: options.depth === 2 ? 2 : 1,
      budget: budgetOf(options.media),
      cover: async (member) => {
        const ref = member.coverImage;
        if (!ref?.assetId) return undefined;
        const asset =
          options.media?.assets?.get(ref.assetId) ??
          (source.asset ? await source.asset(ref.assetId) : undefined);
        if (!asset?.mediaType.startsWith("image/")) return undefined;
        return picture(asset, ref, { ...base, sizes: CARD_SIZES });
      },
      render,
    },
    resolved,
  );
  return render(resolved, cards);
}

/** True when at least one field has something to show (themes skip the whole list otherwise). */
export function hasShownFields(fields: RenderedFields): boolean {
  return Object.values(fields).some((f) => !f.empty);
}

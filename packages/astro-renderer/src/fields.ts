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
 * - everything else: `formatFieldValue` text, which themes print escaped.
 *
 * Worker-safe; the same function serves live and snapshot sources.
 */
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  type FormatFieldOptions,
  fieldHelp,
  fieldLabel,
  formatFieldValue,
  hasFieldValue,
  type ResolvedField,
  type ResolvedFields,
  resolveFields,
} from "@cloudhal/core-ts/fields";
import { renderMarkdown } from "./markdown.ts";
import { type ImageAttributes, imageAttributes, type MediaContext } from "./media.ts";
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
  /** Nothing to show: no value, an unreadable one, an unsafe URL or a missing image. */
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
}

/** What `entryFields` needs from a source: the site, the original by id, assets by id. */
export interface FieldsSource {
  site(): Promise<Site>;
  entryById?(id: string): Promise<ContentEntry | undefined>;
  asset?(id: string): Promise<Asset | undefined>;
}

export interface RenderFieldsOptions extends EntryFieldsOptions {
  locale: string;
  defaultLocale: string;
  /** Assets by id (image fields; rich text's `asset:` links when `media.assets` is absent). */
  assets?: ReadonlyMap<string, Asset> | undefined;
}

const SIZES = "(min-width: 48rem) 48rem, 100vw";

/** A translation in this site reads its group's original (RFC-0041 §5). */
function originalId(entry: ContentEntry): string | undefined {
  const t = entry.translation;
  return t && t.group !== entry.id && t.source?.siteId === undefined ? t.group : undefined;
}

function shape(field: ResolvedField, o: RenderFieldsOptions): Partial<RenderedField> {
  const { def, value } = field;
  const ctx: MediaContext = {
    ...o.media,
    locale: o.locale,
    defaultLocale: o.defaultLocale,
    assets: o.media?.assets ?? o.assets,
  };
  if (def.type === "richText" && typeof value === "string")
    return { html: renderMarkdown(value, ctx) };
  if (def.type === "url" && typeof value === "string") {
    const href = safeHref(value);
    return href ? { href, text: href } : { empty: true };
  }
  if (def.type === "image" && typeof value === "string") {
    const asset = ctx.assets?.get(value) ?? o.assets?.get(value);
    if (!asset?.mediaType.startsWith("image/")) return { empty: true };
    const image = imageAttributes(asset, undefined, {
      locale: o.locale,
      defaultLocale: o.defaultLocale,
      transform: ctx.transform ?? "none",
      sizes: o.sizes ?? SIZES,
      ...(ctx.preview ? { preview: true } : {}),
      ...(ctx.budget ? { budget: ctx.budget } : {}),
    });
    return { image: { ...image, assetId: asset.id }, text: image.alt };
  }
  if (def.type === "date" && typeof value === "string") return { datetime: value };
  if (def.type === "datetime" && typeof value === "object" && value !== null)
    return { datetime: (value as { at: string }).at };
  return {};
}

/** Resolved fields made ready to draw (pure; `entryFields` loads what it needs and calls this). */
export function renderFields(resolved: ResolvedFields, o: RenderFieldsOptions): RenderedFields {
  const out: RenderedFields = {};
  for (const [key, field] of Object.entries(resolved)) {
    const help = fieldHelp(field.def, o.locale, o.defaultLocale);
    const base: RenderedField = {
      ...field,
      key,
      label: fieldLabel(field.def, o.locale, o.defaultLocale),
      ...(help ? { help } : {}),
      empty: true,
      text: "",
    };
    if (!hasFieldValue(field.value)) {
      out[key] = base;
      continue;
    }
    const text = formatFieldValue(field.value, field.def, {
      locale: o.locale,
      defaultLocale: o.defaultLocale,
      timeZone: o.timeZone,
      words: o.words,
    });
    const extra = shape(field, o);
    const shown: RenderedField = { ...base, empty: false, text, ...extra };
    out[key] = shown.empty ? { ...base, value: undefined } : shown;
  }
  return out;
}

/**
 * An entry's typed fields as a theme draws them (RFC-0041 §9), from any source: loads the site,
 * the translation group's original when the entry is a translation in this site, and the assets
 * of image fields (from `media.assets` when given).
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
  const resolved = resolveFields(site, entry, original);
  const assets = new Map<string, Asset>();
  for (const field of Object.values(resolved)) {
    const v = field.value;
    if (field.def.type !== "image" || typeof v !== "string" || options.media?.assets?.has(v))
      continue;
    const asset = source.asset ? await source.asset(v) : undefined;
    if (asset) assets.set(v, asset);
  }
  return renderFields(resolved, {
    ...options,
    locale: options.locale ?? entry.locale,
    defaultLocale: site.defaultLocale,
    assets,
  });
}

/** True when at least one field has something to show (themes skip the whole list otherwise). */
export function hasShownFields(fields: RenderedFields): boolean {
  return Object.values(fields).some((f) => !f.empty);
}

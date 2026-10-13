import type { Asset, ContentEntry } from "@cloudhal/core-contracts";
import { ASSET_HREF, assetUrl, mediaPath } from "@cloudhal/core-ts/media";
import { Marked } from "marked";
import {
  assetAlt,
  assetCaption,
  downloadMeta,
  imageAttributes,
  imgHtml,
  isAttachment,
  type MediaContext,
} from "./media.ts";

export type { MediaContext } from "./media.ts";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Link targets markdown may produce. Everything else (javascript:, data:, vbscript:, …) is dropped.
 * The check runs on what a browser would parse (WHATWG URL): C0 controls and spaces trimmed at the
 * ends, tabs and newlines removed anywhere (`java\tscript:` is `javascript:`), and a backslash read
 * as a slash, so `/\host` and `\\host` are protocol-relative like `//host`.
 */
export function safeHref(href: string): string | undefined {
  const value = asParsed(href);
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || /^[/\\]{2}/.test(value)) return undefined;
  return value; // relative path, fragment or query
}

/** A URL as a browser reads it: no tabs or newlines, no C0 controls or spaces at either end. */
function asParsed(href: string): string {
  const value = href.replace(/[\t\n\r]/g, "");
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
}

/** Image sources: what `safeHref` allows (no mailto/tel) plus raster data: URLs. */
export function safeSrc(src: string): string | undefined {
  const value = src.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  const safe = safeHref(value);
  return safe && !/^(mailto|tel):/i.test(safe) ? safe : undefined;
}

/** The context of the markdown being rendered right now (`renderMarkdown` is synchronous). */
let current: MediaContext | undefined;

/**
 * `asset:<id>` (exactly; RFC-0004 §7.6 rule 1) resolved against the render's assets. Anything else
 * under the scheme, an unknown id or no context resolves to nothing and renders like an unsafe URL.
 */
function resolveAsset(href: string): Asset | undefined {
  const m = ASSET_HREF.exec(href.trim());
  if (!m) return undefined;
  const asset = current?.assets?.get(m[1] as string);
  if (!asset) current?.onMiss?.(m[1] as string);
  return asset;
}

function localeOf(): { locale: string; defaultLocale: string } {
  const defaultLocale = current?.defaultLocale ?? current?.locale ?? "en";
  return { locale: current?.locale ?? defaultLocale, defaultLocale };
}

/** A download link: the URL comes from validated parts only, the label is the markdown's (§7.6). */
function assetLink(asset: Asset, labelHtml: string, title?: string | null): string {
  const href = assetUrl(asset);
  const download = isAttachment(asset) ? " download" : "";
  const link = `<a href="${escapeHtml(href)}" type="${escapeHtml(asset.mediaType)}"${download}${title ? ` title="${escapeHtml(title)}"` : ""}>${labelHtml}</a>`;
  return asset.kind === "document" || asset.kind === "data" || asset.kind === "other"
    ? `${link} ${downloadMeta(asset)}`
    : link;
}

function assetEmbed(asset: Asset, text: string, title?: string | null): string {
  const { locale, defaultLocale } = localeOf();
  const alt = assetAlt(asset, text, locale, defaultLocale);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  switch (asset.kind) {
    case "image":
      return imgHtml(
        imageAttributes(
          asset,
          { alt: text },
          {
            locale,
            defaultLocale,
            transform: current?.transform ?? "none",
            sizes: "(min-width: 48rem) 48rem, 100vw",
            ...(current?.preview ? { preview: true } : {}),
          },
        ),
        titleAttr,
      );
    case "video":
    case "audio": {
      const src = escapeHtml(assetUrl(asset));
      const fallback = assetLink(asset, escapeHtml(alt || asset.slug));
      return `<${asset.kind} controls preload="metadata" src="${src}"${alt ? ` aria-label="${escapeHtml(alt)}"` : ""}${titleAttr}>${fallback}</${asset.kind}>`;
    }
    default:
      return assetLink(asset, escapeHtml(text || asset.slug), title);
  }
}

/**
 * Markdown is written by agents as well as people, so it is rendered as data, not markup: raw
 * HTML is escaped (no script/iframe/event handlers can reach the published site) and links and
 * images only keep safe URL schemes. `asset:<id>` links and images resolve to the site's media.
 */
const md = new Marked({ gfm: true, async: false });
md.use({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (/^\s*asset:/i.test(href)) {
        const asset = resolveAsset(href);
        return asset ? assetLink(asset, label, title) : label;
      }
      const safe = safeHref(href);
      if (!safe) return label;
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${label}</a>`;
    },
    image({ href, title, text }) {
      if (/^\s*asset:/i.test(href)) {
        const asset = resolveAsset(href);
        return asset ? assetEmbed(asset, text, title) : escapeHtml(text);
      }
      const safe = safeSrc(href);
      if (!safe) return escapeHtml(text);
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy">`;
    },
  },
});

/**
 * Renders markdown safely. With `ctx.assets`, `asset:<id>` references become images, players and
 * download links (RFC-0004 §7.6); without it they degrade to their text, like any unsafe URL.
 */
export function renderMarkdown(source: string, ctx?: MediaContext): string {
  const previous = current;
  current = ctx;
  try {
    return md.parse(source) as string;
  } finally {
    current = previous;
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Markdown as plain text (meta descriptions): rendered safely, then tags dropped and entities decoded. */
export function markdownText(source: string): string {
  return renderMarkdown(source)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,7});/g, (m, n: string) =>
      Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m,
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `markdown` bodies are rendered safely; `html` bodies are trusted as-is — only humans can store
 * them (the MCP tools always write markdown), and they do not resolve `asset:` (RFC-0004 §2.3).
 */
export function renderBody(
  body: { format: "markdown" | "html"; value: string },
  ctx?: MediaContext,
): string {
  return body.format === "markdown" ? renderMarkdown(body.value, ctx) : body.value;
}

/**
 * The cover image above the body: eager (it is the largest image above the fold), safe src only.
 * With its asset known, it gets the asset's size, alt fallback, placeholder, `srcset` when
 * transforming, and a caption with the credit (RFC-0004 §7.5, §7.7).
 */
function coverFigure(image: ContentEntry["coverImage"], ctx?: MediaContext): string {
  if (!image) return "";
  const asset = image.assetId ? ctx?.assets?.get(image.assetId) : undefined;
  if (asset) {
    const defaultLocale = ctx?.defaultLocale ?? ctx?.locale ?? "en";
    const locale = ctx?.locale ?? defaultLocale;
    const attrs = imageAttributes(asset, image, {
      locale,
      defaultLocale,
      transform: ctx?.transform ?? "none",
      sizes: "(min-width: 48rem) 48rem, 100vw",
      priority: true,
      ...(ctx?.preview ? { preview: true } : {}),
    });
    const caption = assetCaption(asset, locale, defaultLocale);
    return `<figure class="ch-cover">${imgHtml(attrs)}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
  }
  const src = safeSrc(image.src);
  if (!src) return "";
  const size =
    image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
  return `<figure class="ch-cover"><img src="${escapeHtml(src)}" alt="${escapeHtml(image.alt)}"${size} fetchpriority="high" decoding="async"></figure>`;
}

/**
 * An article: a header (title, summary, publication date) followed by the body. A leading `# H1`
 * that repeats the title is dropped so authors may write it either way.
 */
export function renderEntryArticle(
  entry: Pick<
    ContentEntry,
    "id" | "title" | "summary" | "body" | "publishedAt" | "createdAt" | "coverImage"
  >,
  locale = "en",
  ctx?: MediaContext,
): string {
  let body = entry.body;
  if (body.format === "markdown") {
    const m = body.value.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
    if (m && m[1]?.trim().toLowerCase() === entry.title.trim().toLowerCase())
      body = { ...body, value: body.value.slice(m[0].length) };
  }
  const when = entry.publishedAt ?? undefined;
  const date = when
    ? `<time datetime="${escapeHtml(when)}">${escapeHtml(new Date(when).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }))}</time>`
    : "";
  const summary = entry.summary ? `<p class="ch-summary">${escapeHtml(entry.summary)}</p>` : "";
  const media: MediaContext = { locale, ...ctx };
  return `<article class="ch-article" data-entry-id="${escapeHtml(entry.id)}"><header class="ch-article-header"><h1>${escapeHtml(entry.title)}</h1>${summary}${date}</header>${coverFigure(entry.coverImage, media)}<div class="ch-richtext">${renderBody(body, media)}</div></article>`;
}

/** The media path of an asset (re-exported for themes). */
export { mediaPath };

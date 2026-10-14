import type { Asset, ContentEntry } from "@cloudhal/core-contracts";
import { type BlockRegistry, createBlockRegistry } from "@cloudhal/core-ts/blocks";
import { type DirectiveToken, directiveExtension } from "@cloudhal/core-ts/body-blocks";
import { checkDirective, directiveProps } from "@cloudhal/core-ts/directives";
import { ASSET_HREF, assetUrl, mediaPath } from "@cloudhal/core-ts/media";
import { Marked } from "marked";
import { builtInBlockHtml, isBuiltInBlock, missingBlockHtml } from "./block-html.ts";
import {
  assetAlt,
  assetCaption,
  downloadMeta,
  imageAttributes,
  imgHtml,
  isAttachment,
  type MediaContext,
} from "./media.ts";
import { safeHref, safeSrc } from "./safe-urls.ts";
import { sanitizeHtml } from "./sanitize.ts";

export type { MediaContext } from "./media.ts";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export { safeHref, safeSrc };

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
const builtInTypes = createBlockRegistry();

/** A theme's blocks in the body being rendered right now (`renderBodyParts`). */
let themed: { registry: BlockRegistry; names: ReadonlySet<string>; slots: BlockSlot[] } | undefined;

/** Where a theme component goes in a body's HTML (`renderBodyParts`); escaped text never matches. */
const SLOT = (i: number) => `<!--ch-block-slot:${i}-->`;
const SLOT_RE = /<!--ch-block-slot:(\d+)-->/;

md.use({
  // Body directives (RFC-0015 §5): a built-in block renders like its component section; a
  // container's inner markdown goes through this same renderer. A type the theme renders with its
  // own component becomes a slot (`renderBodyParts`). Unknown types and props that do not fit
  // render nothing on the site and a labelled placeholder in previews.
  extensions: [
    {
      ...directiveExtension,
      renderer(token) {
        const { directive, tokens } = token as DirectiveToken;
        const registry = themed?.registry ?? current?.blocks ?? builtInTypes;
        const issues = checkDirective(registry, directive);
        const ctx = current;
        const valid = issues !== undefined && issues.length === 0;
        const props = directiveProps(registry.get(directive.name), directive.attrs);
        const contentHtml = directive.content !== undefined ? this.parser.parse(tokens) : undefined;
        if (valid && themed?.names.has(directive.name)) {
          themed.slots.push({
            type: directive.name,
            props,
            ...(directive.content !== undefined ? { content: directive.content } : {}),
            ...(contentHtml !== undefined ? { contentHtml } : {}),
          });
          return SLOT(themed.slots.length - 1);
        }
        const html =
          valid && isBuiltInBlock(directive.name)
            ? builtInBlockHtml(directive.name, props, {
                markdown: (source) => renderMarkdown(source, ctx),
                ...(contentHtml !== undefined ? { contentHtml } : {}),
              })
            : "";
        const attrs = `data-block-type="${escapeHtml(directive.name)}"`;
        if (html) return `<div class="ch-block" ${attrs}>${html}</div>`;
        if (!ctx?.preview) return "";
        return missingBlockHtml(
          "div",
          attrs,
          directive.name,
          issues === undefined
            ? "unknown block type"
            : valid
              ? "shown by the theme on the site"
              : "props do not fit the block type",
        );
      },
    },
  ],
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
 * `markdown` bodies are rendered as data; `html` bodies go through the allowlist sanitizer
 * (RFC-0012): any writer can store them — agent keys over REST, `cloudhal push`, every role — so
 * pages, previews, feeds and static builds never publish them as stored. Neither resolves
 * `asset:` inside HTML (RFC-0004 §2.3).
 */
export function renderBody(
  body: { format: "markdown" | "html"; value: string },
  ctx?: MediaContext,
): string {
  return body.format === "markdown" ? renderMarkdown(body.value, ctx) : sanitizeHtml(body.value);
}

/** A theme block in a body (RFC-0015 §5): its type, props and, for a container, its text. */
export interface BlockSlot {
  type: string;
  props: Record<string, unknown>;
  /** A container's inner markdown. */
  content?: string;
  /** The same, rendered by the safe renderer. */
  contentHtml?: string;
}

/** A body as HTML runs and the theme blocks between them, in order. */
export type BodyPart = { html: string } | { slot: BlockSlot };

/**
 * A body for a theme that renders some block types with its own components (`Body.astro`): the
 * HTML is cut where each such block goes. `registry` holds the theme's types (validation);
 * `components` names the types the theme renders. Without any, it is `renderBody` in one part.
 */
export function renderBodyParts(
  body: { format: "markdown" | "html"; value: string },
  ctx: MediaContext | undefined,
  blocks: { registry: BlockRegistry; components: ReadonlySet<string> } | undefined,
): BodyPart[] {
  if (body.format !== "markdown" || !blocks || !body.value.includes("::"))
    return [{ html: renderBody(body, ctx) }];
  const previous = themed;
  const slots: BlockSlot[] = [];
  themed = { registry: blocks.registry, names: blocks.components, slots };
  let html: string;
  try {
    html = renderMarkdown(body.value, ctx);
  } finally {
    themed = previous;
  }
  const parts: BodyPart[] = [];
  const pieces = html.split(SLOT_RE);
  pieces.forEach((piece, i) => {
    if (i % 2 === 0) {
      if (piece) parts.push({ html: piece });
    } else {
      const slot = slots[Number(piece)];
      if (slot) parts.push({ slot });
    }
  });
  return parts;
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

/** An article's pieces: the body to render (a leading H1 repeating the title dropped) and the HTML around it. */
export function entryArticleParts(
  entry: Pick<
    ContentEntry,
    "id" | "title" | "summary" | "body" | "publishedAt" | "createdAt" | "coverImage"
  >,
  locale = "en",
  ctx?: MediaContext,
): { body: ContentEntry["body"]; header: string; cover: string; media: MediaContext } {
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
  return {
    body,
    header: `<header class="ch-article-header"><h1>${escapeHtml(entry.title)}</h1>${summary}${date}</header>`,
    cover: coverFigure(entry.coverImage, media),
    media,
  };
}

/**
 * An article: a header (title, summary, publication date) followed by the body. A leading `# H1`
 * that repeats the title is dropped so authors may write it either way. Themes with their own
 * block components use `EntryArticle.astro`, which has the same markup.
 */
export function renderEntryArticle(
  entry: Pick<
    ContentEntry,
    "id" | "title" | "summary" | "body" | "publishedAt" | "createdAt" | "coverImage"
  >,
  locale = "en",
  ctx?: MediaContext,
): string {
  const { body, header, cover, media } = entryArticleParts(entry, locale, ctx);
  return `<article class="ch-article" data-entry-id="${escapeHtml(entry.id)}">${header}${cover}<div class="ch-richtext">${renderBody(body, media)}</div></article>`;
}

/** The media path of an asset (re-exported for themes). */
export { mediaPath };

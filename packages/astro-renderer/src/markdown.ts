import type { ContentEntry } from "@cloudhal/core-contracts";
import { Marked } from "marked";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Link targets markdown may produce. Everything else (javascript:, data:, vbscript:, …) is dropped. */
export function safeHref(href: string): string | undefined {
  const value = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return undefined;
  return value; // relative path, fragment or query
}

/** Image sources: what `safeHref` allows (no mailto/tel) plus raster data: URLs. */
export function safeSrc(src: string): string | undefined {
  const value = src.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  const safe = safeHref(value);
  return safe && !/^(mailto|tel):/i.test(safe) ? safe : undefined;
}

/**
 * Markdown is written by agents as well as people, so it is rendered as data, not markup: raw
 * HTML is escaped (no script/iframe/event handlers can reach the published site) and links and
 * images only keep safe URL schemes.
 */
const md = new Marked({ gfm: true, async: false });
md.use({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (!safe) return label;
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${label}</a>`;
    },
    image({ href, title, text }) {
      const safe = safeSrc(href);
      if (!safe) return escapeHtml(text);
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy">`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source) as string;
}

/**
 * `markdown` bodies are rendered safely; `html` bodies are trusted as-is — only humans can store
 * them (the MCP tools always write markdown).
 */
export function renderBody(body: { format: "markdown" | "html"; value: string }): string {
  return body.format === "markdown" ? renderMarkdown(body.value) : body.value;
}

/** The cover image above the body: eager (it is the largest image above the fold), safe src only. */
function coverFigure(image: ContentEntry["coverImage"]): string {
  const src = image ? safeSrc(image.src) : undefined;
  if (!image || !src) return "";
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
  return `<article class="ch-article" data-entry-id="${escapeHtml(entry.id)}"><header class="ch-article-header"><h1>${escapeHtml(entry.title)}</h1>${summary}${date}</header>${coverFigure(entry.coverImage)}<div class="ch-richtext">${renderBody(body)}</div></article>`;
}

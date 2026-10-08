import type { ContentEntry, Page, Section, Site } from "@cloudhal/core-contracts";
import { renderEntryArticle, renderMarkdown, safeHref, safeSrc } from "./markdown.ts";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Framework-free HTML for a page's sections — the same structure the Astro components emit
 * (`.ch-*` classes, `data-section-id`), so agents can preview a change without a build and the
 * markup matches what the site will render.
 */
export function renderSectionHtml(
  section: Section,
  entries: Record<string, ContentEntry[]> = {},
): string {
  switch (section.kind) {
    case "hero":
      return `<section class="ch-hero" data-section-id="${esc(section.id)}" data-kind="hero"><h1>${esc(section.heading)}</h1>${
        section.subheading ? `<p class="ch-hero__sub">${esc(section.subheading)}</p>` : ""
      }${section.image && safeSrc(section.image.src) ? `<img src="${esc(safeSrc(section.image.src) as string)}" alt="${esc(section.image.alt)}">` : ""}${
        section.cta && safeHref(section.cta.href)
          ? `<a class="ch-hero__cta" href="${esc(safeHref(section.cta.href) as string)}">${esc(section.cta.label)}</a>`
          : ""
      }</section>`;
    case "richText":
      return `<section class="ch-richtext" data-section-id="${esc(section.id)}" data-kind="richText">${section.format === "markdown" ? renderMarkdown(section.body) : section.body}</section>`;
    case "image":
      return `<figure class="ch-image" data-section-id="${esc(section.id)}" data-kind="image">${safeSrc(section.image.src) ? `<img src="${esc(safeSrc(section.image.src) as string)}" alt="${esc(section.image.alt)}">` : ""}${
        section.caption ? `<figcaption>${esc(section.caption)}</figcaption>` : ""
      }</figure>`;
    case "contentList": {
      const list = [...(entries[section.collection] ?? [])]
        .sort((a, b) =>
          section.sort === "title"
            ? a.title.localeCompare(b.title)
            : section.sort === "oldest"
              ? (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt)
              : (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt),
        )
        .slice(0, section.limit);
      const items = list
        .map(
          (e) =>
            `<li><a href="/${esc(e.collection)}/${esc(e.slug)}">${esc(e.title)}</a>${e.summary ? `<p>${esc(e.summary)}</p>` : ""}</li>`,
        )
        .join("");
      return `<section class="ch-contentlist" data-section-id="${esc(section.id)}" data-kind="contentList" data-collection="${esc(section.collection)}">${
        list.length === 0
          ? '<p class="ch-contentlist__empty">Nothing published yet.</p>'
          : `<ul>${items}</ul>`
      }</section>`;
    }
  }
}

export interface PreviewDocument {
  html: string;
  title: string;
  path: string;
}

/** Full HTML document for a page preview. */
export function renderPagePreview(
  site: Site,
  page: Page,
  entries: Record<string, ContentEntry[]> = {},
): PreviewDocument {
  const body = page.sections.map((s) => renderSectionHtml(s, entries)).join("\n");
  const title = page.seo?.title ?? page.title;
  return { title, path: page.path, html: document(site, title, page.seo?.description, body) };
}

/** Full HTML document for an article preview. */
export function renderEntryPreview(site: Site, entry: ContentEntry): PreviewDocument {
  const body = renderEntryArticle(entry, site.defaultLocale);
  return {
    title: entry.title,
    path: `/${entry.collection}/${entry.slug}`,
    html: document(site, entry.title, entry.summary, body),
  };
}

/**
 * Neutral reading styles so previews are legible without the site's theme (the theme only exists
 * in the Astro build). Inline because preview responses are CSP-sandboxed (`style-src 'unsafe-inline'`).
 */
const PREVIEW_CSS =
  ":root{color-scheme:light dark;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--bg:#fff}" +
  "@media (prefers-color-scheme:dark){:root{--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--bg:#0d1117}}" +
  "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,'Segoe UI',sans-serif}" +
  "header{padding:14px 24px;border-bottom:1px solid var(--line)}header a{color:var(--fg);font-weight:600;text-decoration:none}" +
  "main{max-width:720px;margin:0 auto;padding:32px 24px 64px}h1,h2,h3{line-height:1.25;margin:1.6em 0 .5em}h1{font-size:2rem;margin-top:.4em}" +
  "p,ul,ol{margin:0 0 1em}a{color:#0969da}img{max-width:100%;height:auto;border-radius:6px}" +
  "pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}pre{overflow:auto;padding:12px;border:1px solid var(--line);border-radius:6px}" +
  "blockquote{margin:0 0 1em;padding-left:1em;border-left:3px solid var(--line);color:var(--muted)}" +
  "section+section{margin-top:2.5rem}small,time,.muted{color:var(--muted)}" +
  ".ch-article-header{margin-bottom:2rem}.ch-article-header h1{margin-bottom:.3em}.ch-summary{font-size:1.15rem;color:var(--muted)}";

function document(
  site: Site,
  title: string,
  description: string | undefined,
  body: string,
): string {
  return `<!doctype html><html lang="${esc(site.defaultLocale)}"><head><meta charset="utf-8"><title>${esc(title)}</title>${
    description ? `<meta name="description" content="${esc(description)}">` : ""
  }<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Cloudhal preview"><style>${PREVIEW_CSS}</style></head><body><header><a href="/">${esc(site.name)}</a></header><main>${body}</main></body></html>`;
}

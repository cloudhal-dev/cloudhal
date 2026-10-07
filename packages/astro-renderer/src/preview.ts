import type { ContentEntry, Page, Section, Site } from "@cloudhal/core-contracts";
import { renderBody, renderMarkdown } from "./markdown.ts";

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
      }${section.image ? `<img src="${esc(section.image.src)}" alt="${esc(section.image.alt)}">` : ""}${
        section.cta
          ? `<a class="ch-hero__cta" href="${esc(section.cta.href)}">${esc(section.cta.label)}</a>`
          : ""
      }</section>`;
    case "richText":
      return `<section class="ch-richtext" data-section-id="${esc(section.id)}" data-kind="richText">${section.format === "markdown" ? renderMarkdown(section.body) : section.body}</section>`;
    case "image":
      return `<figure class="ch-image" data-section-id="${esc(section.id)}" data-kind="image"><img src="${esc(section.image.src)}" alt="${esc(section.image.alt)}">${
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
  const body = `<article class="ch-richtext" data-entry-id="${esc(entry.id)}">${renderBody(entry.body)}</article>`;
  return {
    title: entry.title,
    path: `/${entry.collection}/${entry.slug}`,
    html: document(site, entry.title, entry.summary, body),
  };
}

function document(
  site: Site,
  title: string,
  description: string | undefined,
  body: string,
): string {
  return `<!doctype html><html lang="${esc(site.defaultLocale)}"><head><meta charset="utf-8"><title>${esc(title)}</title>${
    description ? `<meta name="description" content="${esc(description)}">` : ""
  }<meta name="generator" content="Cloudhal preview"></head><body><header><a href="/">${esc(site.name)}</a></header><main>${body}</main></body></html>`;
}

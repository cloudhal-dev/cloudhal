import type {
  ContentEntry,
  ImageRef,
  Page,
  Section,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import {
  type ArchiveState,
  type ArchiveView,
  archiveState,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  pageCount,
  viewPagePath,
} from "./archive.ts";
import { renderComponentSection } from "./blocks.ts";
import { gateNotice } from "./gates.ts";
import { renderBody, renderEntryArticle, renderMarkdown, safeHref, safeSrc } from "./markdown.ts";
import { assetCaption, imageAttributes, imgHtml, type MediaContext } from "./media.ts";
import { entryPath } from "./routing.ts";
import { archiveHead, siteOrigin } from "./seo.ts";
import { pickEntries, renderSurface, surfaceSources } from "./surfaces.ts";
import {
  archiveFeedPath,
  archiveMembers,
  archivePath,
  publicTrail,
  shownTerm,
  taxonomyIndex,
} from "./taxonomy.ts";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function localeOf(media: MediaContext | undefined): { locale: string; defaultLocale: string } {
  const defaultLocale = media?.defaultLocale ?? media?.locale ?? "en";
  return { locale: media?.locale ?? defaultLocale, defaultLocale };
}

/** A section image: the asset from the media library when it resolves (RFC-0004 §7.5), else `src`. */
function sectionImage(image: ImageRef, media: MediaContext | undefined): string {
  const asset = image.assetId ? media?.assets?.get(image.assetId) : undefined;
  if (asset) {
    const { locale, defaultLocale } = localeOf(media);
    return imgHtml(
      imageAttributes(asset, image, {
        locale,
        defaultLocale,
        transform: "none",
        sizes: "(min-width: 48rem) 48rem, 100vw",
        preview: true,
      }),
    );
  }
  const src = safeSrc(image.src);
  return src ? `<img src="${esc(src)}" alt="${esc(image.alt)}">` : "";
}

/** The collections a page's sections list: content lists and surfaces' entry sources. */
export function previewCollections(sections: readonly Section[]): string[] {
  return [
    ...new Set(
      sections.flatMap((s) =>
        s.kind === "contentList"
          ? [s.collection]
          : s.kind === "surface"
            ? surfaceSources(s).map((q) => q.collection)
            : [],
      ),
    ),
  ];
}

/**
 * Framework-free HTML for a page's sections — the same structure the Astro components emit
 * (`.ch-*` classes, `data-section-id`), so agents can preview a change without a build and the
 * markup matches what the site will render.
 */
export function renderSectionHtml(
  section: Section,
  entries: Record<string, ContentEntry[]> = {},
  media?: MediaContext,
): string {
  switch (section.kind) {
    case "hero":
      return `<section class="ch-hero" data-section-id="${esc(section.id)}" data-kind="hero"><h1>${esc(section.heading)}</h1>${
        section.subheading ? `<p class="ch-hero__sub">${esc(section.subheading)}</p>` : ""
      }${section.image ? sectionImage(section.image, media) : ""}${
        section.cta && safeHref(section.cta.href)
          ? `<a class="ch-hero__cta" href="${esc(safeHref(section.cta.href) as string)}">${esc(section.cta.label)}</a>`
          : ""
      }</section>`;
    case "richText":
      return `<section class="ch-richtext" data-section-id="${esc(section.id)}" data-kind="richText">${renderBody({ format: section.format, value: section.body }, media)}</section>`;
    case "image": {
      // Like `Image.astro`: an asset's own caption and credit when the section has no caption.
      const asset = section.image.assetId ? media?.assets?.get(section.image.assetId) : undefined;
      const caption = asset
        ? assetCaption(
            asset,
            localeOf(media).locale,
            localeOf(media).defaultLocale,
            section.caption,
          )
        : section.caption;
      return `<figure class="ch-image" data-section-id="${esc(section.id)}" data-kind="image">${sectionImage(section.image, media)}${
        caption ? `<figcaption>${esc(caption)}</figcaption>` : ""
      }</figure>`;
    }
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
    // RFC-0015: previews show unknown or misfitting blocks as a labelled placeholder.
    case "component":
      return renderComponentSection(section, { ...(media ? { media } : {}), preview: true });
    // RFC-0020: a surface's entry sources come from the collections the caller loaded (the
    // filter is applied on the site; a preview shows the collection's newest).
    case "surface": {
      const sources = Object.fromEntries(
        surfaceSources(section).map((q) => [q.key, pickEntries(entries[q.collection] ?? [], q)]),
      );
      return renderSurface(section, { ...(media ? { media } : {}), sources, preview: true });
    }
  }
}

export interface PreviewDocument {
  html: string;
  title: string;
  path: string;
}

/** Words of the preview's gate notice (RFC-0008 §7.3), as the blog starter says them. */
const GATE_WORDS: Record<
  string,
  { embargoed: (when: string) => string; expired: (when: string) => string }
> = {
  en: {
    embargoed: (when) => `Embargoed until ${when}. Only previews show it until then.`,
    expired: (when) => `Expired on ${when}. Only previews show it now.`,
  },
  tr: {
    embargoed: (when) =>
      `${when} tarihine kadar ambargolu. O zamana kadar yalnızca önizlemede görünür.`,
    expired: (when) => `${when} tarihinde yayından kalktı. Artık yalnızca önizlemede görünür.`,
  },
};

/**
 * The notice a preview shows above a page or entry the public cannot see at `now` (embargoed or
 * expired, RFC-0008 §7.3); empty when its gates are open.
 */
export function gateNoticeHtml(
  site: Site,
  node: Pick<Page, "availability">,
  now: number,
  locale = site.defaultLocale,
): string {
  const notice = gateNotice(node, site, locale, now);
  if (!notice) return "";
  const words =
    GATE_WORDS[locale.split("-")[0] ?? locale] ??
    (GATE_WORDS.en as NonNullable<typeof GATE_WORDS.en>);
  return `<p class="ch-gate-notice" role="status" data-gate="${notice.state}" data-gate-at="${esc(notice.at)}">${esc(words[notice.state](notice.when))}</p>`;
}

/**
 * Full HTML document for a page preview. `now` (default: the caller's clock) decides whether the
 * page's gates are closed, which adds a notice.
 */
export function renderPagePreview(
  site: Site,
  page: Page,
  entries: Record<string, ContentEntry[]> = {},
  media?: MediaContext,
  now: number = Date.now(),
): PreviewDocument {
  const ctx = previewMedia(site, media);
  const body =
    gateNoticeHtml(site, page, now) +
    page.sections.map((s) => renderSectionHtml(s, entries, ctx)).join("\n");
  const title = page.seo?.title ?? page.title;
  return { title, path: page.path, html: document(site, title, page.seo?.description, body) };
}

/** Previews resolve `asset:` references and asset-backed images, never through transformations. */
function previewMedia(site: Site, media: MediaContext | undefined): MediaContext {
  return { locale: site.defaultLocale, defaultLocale: site.defaultLocale, ...media, preview: true };
}

/**
 * Full HTML document for an article preview (`media.assets`: the assets it refers to), with the
 * gate notice when the entry is embargoed or expired at `now`.
 */
export function renderEntryPreview(
  site: Site,
  entry: ContentEntry,
  media?: MediaContext,
  now: number = Date.now(),
): PreviewDocument {
  const body =
    gateNoticeHtml(site, entry, now) +
    renderEntryArticle(entry, site.defaultLocale, previewMedia(site, media));
  return {
    title: entry.title,
    path: `/${entry.collection}/${entry.slug}`,
    html: document(site, entry.title, entry.summary, body),
  };
}

export interface ArchivePreviewInput {
  readonly taxonomies: readonly Taxonomy[];
  /** The site's terms (any status), with the previewed one as it is being edited. */
  readonly terms: readonly Term[];
  readonly termId: string;
  /** The site's entries (any status): the archive lists the published ones in the default locale. */
  readonly entries: readonly ContentEntry[];
  /** Entries per page (the blog starter's `ARCHIVE_PAGE_SIZE`). */
  readonly perPage?: number;
}

/**
 * Why an archive answers the way it does (RFC-0002 §7, `archiveState`): `indexed`; `thin` (fewer
 * published entries than `minEntriesToIndex`) and `noindex` (the term's SEO asks for it) are a 200
 * with `noindex,follow`; `empty`, `proposed`, `internal` and `archiveOff` are a 404; `retired` a 410.
 */
export type ArchivePreviewReason =
  | "indexed"
  | "thin"
  | "noindex"
  | "empty"
  | "proposed"
  | "internal"
  | "retired"
  | "archiveOff";

export interface ArchivePreviewDocument extends PreviewDocument {
  /** What the public route answers for this term right now (with this draft). */
  readonly state: ArchiveState;
  readonly reason: ArchivePreviewReason;
  /** Published entries the archive lists (sub-categories included in hierarchical taxonomies). */
  readonly total: number;
  readonly minEntriesToIndex: number;
}

/** Visitor-facing words of the archive page, as the blog starter says them. */
const ARCHIVE_WORDS: Record<
  string,
  {
    home: string;
    breadcrumb: string;
    feed: string;
    posts: (n: number) => string;
    empty: string;
    newer: string;
    older: string;
    pageOf: (page: number, pages: number) => string;
  }
> = {
  en: {
    home: "Home",
    breadcrumb: "Breadcrumb",
    feed: "RSS feed",
    posts: (n) => (n === 1 ? "1 post" : `${n} posts`),
    empty: "Nothing published here yet.",
    newer: "← Newer",
    older: "Older →",
    pageOf: (page, pages) => `Page ${page} of ${pages}`,
  },
  tr: {
    home: "Ana sayfa",
    breadcrumb: "Sayfa yolu",
    feed: "RSS beslemesi",
    posts: (n) => `${n} yazı`,
    empty: "Burada henüz yayınlanmış bir şey yok.",
    newer: "← Daha yeni",
    older: "Daha eski →",
    pageOf: (page, pages) => `Sayfa ${page} / ${pages}`,
  },
};

function byNewest(a: ContentEntry, b: ContentEntry): number {
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
}

/**
 * A term's archive page (`<basePath>/<slug>`, page 1) as the blog starter renders it — breadcrumb,
 * the taxonomy's name, the term's name, post count and feed link, image and markdown intro, the
 * newest entries and pagination — with the `<head>` title and description of `archiveHead`. It
 * renders whatever the archive's state, so a person sees a proposed or empty term's page before it
 * goes public; `state` and `reason` say what the public route answers today (`archiveState`).
 */
export function renderArchivePreview(
  site: Site,
  input: ArchivePreviewInput,
): ArchivePreviewDocument {
  const locale = site.defaultLocale;
  const term = input.terms.find((t) => t.id === input.termId);
  const taxonomy = term ? input.taxonomies.find((t) => t.id === term.taxonomyId) : undefined;
  if (!term || !taxonomy) throw new Error(`term ${input.termId} or its taxonomy not found`);
  const index = taxonomyIndex(input.taxonomies, input.terms, locale);
  const published = input.entries
    .filter((e) => e.status === "published" && e.locale === locale)
    .sort(byNewest);
  // Membership is counted as the public route counts it: only for a public term.
  const members = archiveMembers(index, published).get(term.id) ?? [];
  const listed = term.status === "active" && term.visibility === "public" ? members : [];
  const state = archiveState(taxonomy, term, listed.length, locale);
  const reason: ArchivePreviewReason = !taxonomy.archive.enabled
    ? "archiveOff"
    : term.status === "retired"
      ? "retired"
      : term.status === "proposed"
        ? "proposed"
        : term.visibility === "internal"
          ? "internal"
          : listed.length === 0
            ? "empty"
            : state.status === 200 && state.indexable
              ? "indexed"
              : term.labels[locale]?.seo?.noindex
                ? "noindex"
                : "thin";

  const perPage = input.perPage ?? DEFAULT_ARCHIVE_PAGE_SIZE;
  const root = archivePath(taxonomy, term.slug);
  const shown = shownTerm(index, term) ?? {
    id: term.id,
    slug: term.slug,
    name: term.slug,
    taxonomy,
    term,
  };
  const view: ArchiveView = {
    taxonomy,
    term,
    shown,
    trail: publicTrail(index, term),
    locale,
    root,
    path: root,
    ...(taxonomy.feed ? { feedPath: archiveFeedPath(root) } : {}),
    page: 1,
    pages: pageCount(members.length, perPage),
    perPage,
    // A term that is not public yet lists what it will list once it is.
    total: members.length,
    entries: members.slice(0, perPage),
    indexable: state.status === 200 && state.indexable,
  };
  const head = archiveHead(site, view, siteOrigin(site, "https://preview.invalid"));
  const words =
    ARCHIVE_WORDS[locale.split("-")[0] ?? locale] ??
    (ARCHIVE_WORDS.en as NonNullable<typeof ARCHIVE_WORDS.en>);
  const label = term.labels[locale];
  const kind =
    taxonomy.labels[locale]?.singular ?? Object.values(taxonomy.labels)[0]?.singular ?? "";
  const imageSrc = term.image ? safeSrc(term.image.src) : undefined;
  const crumbs = [
    { name: words.home, href: "/" as string | undefined },
    ...view.trail.map((t) => ({ name: t.name, href: t.href })),
    { name: shown.name, href: undefined },
  ];
  const breadcrumb = `<nav aria-label="${esc(words.breadcrumb)}" class="ch-breadcrumbs"><ol>${crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<li><span aria-current="page">${esc(c.name)}</span></li>`
        : c.href
          ? `<li><a href="${esc(c.href)}">${esc(c.name)}</a></li>`
          : `<li><span>${esc(c.name)}</span></li>`,
    )
    .join("")}</ol></nav>`;
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  const list =
    view.entries.length === 0
      ? `<p class="ch-contentlist__empty muted">${esc(words.empty)}</p>`
      : `<ul class="ch-entrylist">${view.entries
          .map(
            (e) =>
              `<li><a href="${esc(entryPath(e))}">${esc(e.title)}</a>${e.summary ? `<p>${esc(e.summary)}</p>` : ""}${
                e.publishedAt
                  ? `<time datetime="${esc(e.publishedAt)}">${esc(date(e.publishedAt))}</time>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`;
  const pagination =
    view.pages > 1
      ? `<nav class="ch-pagination"><span></span><span>${esc(words.pageOf(1, view.pages))}</span><a href="${esc(viewPagePath(view, 2))}" rel="next">${esc(words.older)}</a></nav>`
      : "";
  const body = `<section class="ch-archive" data-term-id="${esc(term.id)}" data-taxonomy="${esc(taxonomy.key)}">${
    crumbs.length > 1 ? breadcrumb : ""
  }<header class="ch-archive-header">${kind ? `<p class="ch-archive-kind muted">${esc(kind)}</p>` : ""}<h1>${esc(shown.name)}</h1><p class="ch-archive-meta muted"><span>${esc(words.posts(view.total))}</span>${
    view.feedPath ? ` · <a href="${esc(view.feedPath)}">${esc(words.feed)}</a>` : ""
  }</p>${
    term.image && imageSrc
      ? `<img class="ch-archive-image" src="${esc(imageSrc)}" alt="${esc(term.image.alt)}"${term.image.width ? ` width="${term.image.width}"` : ""}${term.image.height ? ` height="${term.image.height}"` : ""}>`
      : ""
  }${label?.description ? `<div class="ch-richtext">${renderMarkdown(label.description)}</div>` : ""}</header>${list}${pagination}</section>`;
  return {
    title: head.title,
    path: root,
    html: document(
      site,
      head.title,
      head.description,
      body,
      view.indexable ? undefined : "noindex,follow",
    ),
    state,
    reason,
    total: listed.length,
    minEntriesToIndex: taxonomy.minEntriesToIndex,
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
  ".ch-skip{position:absolute;left:8px;top:-48px;padding:8px 12px;background:var(--bg);color:var(--fg)}.ch-skip:focus{top:8px}" +
  "footer{padding:14px 24px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}" +
  "main{max-width:720px;margin:0 auto;padding:32px 24px 64px}h1,h2,h3{line-height:1.25;margin:1.6em 0 .5em}h1{font-size:2rem;margin-top:.4em}" +
  "p,ul,ol{margin:0 0 1em}a{color:#0969da}img{max-width:100%;height:auto;border-radius:6px}" +
  "pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}pre{overflow:auto;padding:12px;border:1px solid var(--line);border-radius:6px}" +
  "blockquote{margin:0 0 1em;padding-left:1em;border-left:3px solid var(--line);color:var(--muted)}" +
  "section+section{margin-top:2.5rem}small,time,.muted{color:var(--muted)}" +
  ".ch-article-header{margin-bottom:2rem}.ch-article-header h1{margin-bottom:.3em}.ch-summary{font-size:1.15rem;color:var(--muted)}" +
  ".ch-breadcrumbs ol{display:flex;flex-wrap:wrap;gap:.4em;list-style:none;margin:0 0 1.5rem;padding:0;font-size:.9rem;color:var(--muted)}" +
  ".ch-breadcrumbs li+li::before{content:'›';margin-right:.4em}.ch-archive-kind{margin:0;font-size:.9rem}" +
  ".ch-archive-header h1{margin:.1em 0 .3em}.ch-archive-meta{margin-bottom:1.5rem}.ch-archive-image{margin-bottom:1.5rem}" +
  ".ch-entrylist{list-style:none;padding:0}.ch-entrylist li{padding:1rem 0;border-top:1px solid var(--line)}" +
  ".ch-entrylist li a{font-weight:600}.ch-entrylist p{margin:.3em 0}.ch-pagination{display:flex;justify-content:space-between;padding-top:1rem}" +
  ".ch-gate-notice{margin:0 0 1.5rem;padding:.6rem .9rem;border:1px solid var(--line);border-left:4px solid #bf8700;border-radius:6px}" +
  // Generated UI (RFC-0020): readable layout for the primitives, not the theme's look.
  ".ch-surface{display:block}.ch-stack{display:flex;flex-direction:column;gap:1rem}.ch-row{display:flex;flex-wrap:wrap;align-items:center;gap:1rem}" +
  ".ch-grid,.ch-columns{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}" +
  "[data-gap=none]{gap:0}[data-gap=s]{gap:.5rem}[data-gap=l]{gap:2rem}[data-gap=xl]{gap:3rem}" +
  ".ch-stack[data-align=center],.ch-row[data-align=center],[data-align=center]{text-align:center;align-items:center}.ch-row[data-justify=center]{justify-content:center}.ch-row[data-justify=between]{justify-content:space-between}" +
  ".ch-band{margin:0 -24px;padding:2.5rem 24px;border-radius:8px}.ch-card{display:flex;flex-direction:column;gap:.5rem;padding:1rem 1.2rem;border:1px solid var(--line);border-radius:8px;color:inherit;text-decoration:none}" +
  // RFC-0023 §4 surfaces, in the preview's two colors: soft ones a tint, loud ones inverted.
  ":is([data-surface=muted],[data-surface=mesh],[data-surface=dots],[data-surface=grid],[data-surface=noise],[data-tone=muted]){background:color-mix(in srgb,var(--fg) 5%,transparent)}" +
  "[data-surface=raised]{box-shadow:0 4px 16px -6px color-mix(in srgb,var(--fg) 25%,transparent)}" +
  ":is([data-surface=brand],[data-surface=inverse],[data-surface=accent],[data-surface=gradient],[data-tone=brand],[data-tone=inverse]){background:var(--fg);color:var(--bg)}" +
  // RFC-0024 §3: scroll stories read as a column in previews; progress bars are left out.
  ".ch-scrolly{display:grid;gap:1rem}.ch-step{padding:.8rem 1rem;border-left:3px solid var(--line)}.ch-progress{display:none}" +
  ".ch-heading{margin:0}.ch-text p:last-child,.ch-markdown p:last-child{margin-bottom:0}.ch-text[data-size=l]{font-size:1.2rem}.ch-text[data-size=s]{font-size:.9rem}.ch-text[data-muted=yes]{color:var(--muted)}" +
  ".ch-button{display:inline-block;width:fit-content;padding:.5rem 1rem;border-radius:6px;border:1px solid var(--line);color:inherit;text-decoration:none;font-weight:500}.ch-button--primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}" +
  ":is([data-surface=brand],[data-surface=inverse],[data-surface=accent],[data-surface=gradient],[data-tone=brand],[data-tone=inverse]) .ch-button--primary{background:var(--bg);color:var(--fg)}" +
  ".ch-badge{display:inline-block;width:fit-content;padding:.1rem .6rem;border-radius:999px;border:1px solid var(--line);font-size:.8rem}" +
  ".ch-stat{display:flex;flex-direction:column}.ch-stat__value{font-size:2rem;font-weight:700;line-height:1.2}.ch-stat__detail{color:var(--muted);font-size:.9rem}" +
  ".ch-quote figcaption{color:var(--muted);font-size:.9rem}.ch-divider{border:0;border-top:1px solid var(--line);width:100%}.ch-spacer{height:2rem}" +
  ".ch-tabs{display:flex;flex-wrap:wrap;gap:.25rem}.ch-tabs__radio{position:absolute;opacity:0}.ch-tabs__tab{padding:.4rem .9rem;border-bottom:2px solid transparent;cursor:pointer;color:var(--muted)}" +
  ".ch-tabs__radio:checked+.ch-tabs__tab{border-color:currentColor;color:var(--fg)}.ch-tabs__panels{width:100%;border-top:1px solid var(--line);padding-top:1rem}.ch-tabs__panel{display:none}" +
  ".ch-tabs__radio:nth-of-type(1):checked~.ch-tabs__panels>.ch-tabs__panel:nth-child(1),.ch-tabs__radio:nth-of-type(2):checked~.ch-tabs__panels>.ch-tabs__panel:nth-child(2)," +
  ".ch-tabs__radio:nth-of-type(3):checked~.ch-tabs__panels>.ch-tabs__panel:nth-child(3),.ch-tabs__radio:nth-of-type(4):checked~.ch-tabs__panels>.ch-tabs__panel:nth-child(4){display:block}" +
  ".ch-accordion{border-top:1px solid var(--line)}.ch-disclosure{border-bottom:1px solid var(--line);padding:.6rem 0}.ch-disclosure summary{cursor:pointer;font-weight:500}" +
  ".ch-node{display:contents}.ch-node[hidden]{display:none}button.ch-button{cursor:pointer;font:inherit}" +
  ".ch-toggle{display:inline-flex;gap:.25rem;padding:.25rem;border:1px solid var(--line);border-radius:8px}.ch-toggle__option input{position:absolute;opacity:0}" +
  ".ch-toggle__option span{display:block;padding:.3rem .8rem;border-radius:6px;cursor:pointer;color:var(--muted)}.ch-toggle__option input:checked+span{background:var(--fg);color:var(--bg)}" +
  ".ch-field{display:grid;align-content:start;gap:.35rem}.ch-field__label{font-weight:500;font-size:.9rem}.ch-select{max-width:20rem;padding:.4rem;border:1px solid var(--line);border-radius:6px;font:inherit}" +
  ".ch-slider{display:flex;align-items:center;gap:.75rem}.ch-slider input{flex:1;max-width:24rem}.ch-slider__value{font-weight:600;min-width:3rem}" +
  // RFC-0022 §4: tables (cards below 480 px).
  ".ch-table{width:100%;border-collapse:collapse;font-size:.9rem}.ch-table caption{text-align:left;font-weight:600;padding-bottom:.5rem}.ch-table th,.ch-table td{border-bottom:1px solid var(--line);padding:.4rem .6rem;text-align:left}.ch-table [data-align=end]{text-align:right}.ch-table[data-striped=yes] tbody tr:nth-child(even){background:color-mix(in srgb,var(--fg) 4%,transparent)}.ch-table tr[data-highlight=yes]{background:color-mix(in srgb,var(--fg) 8%,transparent)}" +
  "@media (max-width:480px){.ch-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.ch-table caption{display:block;width:100%}.ch-table,.ch-table tbody,.ch-table tr,.ch-table td{display:block;width:100%}.ch-table tr{margin-bottom:.75rem;border:1px solid var(--line);border-radius:8px;padding:.25rem .75rem}.ch-table td{display:flex;justify-content:space-between;gap:1rem;text-align:right}.ch-table td::before{content:attr(data-label);font-weight:500;color:var(--muted);text-align:left}}" +
  // RFC-0022 §3: charts.
  ":root{--ch-chart-1:#18181b;--ch-chart-2:#2563eb;--ch-chart-3:#d97706;--ch-chart-4:#059669;--ch-chart-5:#db2777;--ch-chart-6:#7c3aed}.ch-chart{margin:0;display:grid;gap:.75rem}.ch-chart__title{font-weight:600}.ch-chart__svg{display:block;width:100%;height:auto}.ch-chart__grid{stroke:var(--line)}.ch-chart__tick{fill:var(--muted);font-size:12px}.ch-chart__total{fill:currentColor;font-size:22px;font-weight:600}" +
  ".ch-chart__legend{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin:0;padding:0;list-style:none;font-size:.9rem}.ch-chart__legend li{display:flex;align-items:center;gap:.4rem}.ch-chart__swatch{display:inline-block;width:.75rem;height:.75rem;border-radius:2px}.ch-chart__caption,.ch-chart__empty,.ch-chart__data summary{color:var(--muted);font-size:.9rem}.ch-chart__data table{width:100%;border-collapse:collapse;font-size:.9rem}.ch-chart__data th,.ch-chart__data td{border-bottom:1px solid var(--line);padding:.25rem .5rem;text-align:left}" +
  // RFC-0022 §2: local inputs.
  ".ch-input-wrap{display:flex;align-items:center;gap:.5rem;max-width:20rem}.ch-input{width:100%;max-width:20rem;padding:.4rem .6rem;border:1px solid var(--line);border-radius:6px;font:inherit}.ch-input[aria-invalid=true]{border-color:#b91c1c}.ch-input__unit,.ch-field__help,.ch-noscript{color:var(--muted);font-size:.9rem}" +
  ".ch-check,.ch-radio__option{display:flex;align-items:center;gap:.5rem;width:fit-content;cursor:pointer}.ch-radio{display:grid;gap:.35rem;border:0;margin:0;padding:0;min-width:0}.ch-radio__options{display:flex;flex-direction:column;gap:.35rem}" +
  ".ch-radio[data-variant=buttons] .ch-radio__options{display:inline-flex;flex-direction:row;flex-wrap:wrap;gap:.25rem;padding:.25rem;border:1px solid var(--line);border-radius:8px;width:fit-content}.ch-radio[data-variant=buttons] input{position:absolute;opacity:0}.ch-radio[data-variant=buttons] .ch-radio__option span{display:block;padding:.3rem .8rem;border-radius:6px;color:var(--muted)}.ch-radio[data-variant=buttons] input:checked+span{background:var(--fg);color:var(--bg)}" +
  ".ch-block--missing{padding:.6rem .9rem;border:1px dashed var(--line);border-radius:6px;color:var(--muted);font-size:.9rem}";

/**
 * The same policy `previewResponse` (packages/api) sends as a header, repeated in the document so
 * it also holds where the document is shown without that response (an iframe's `srcdoc`).
 */
const PREVIEW_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

function document(
  site: Site,
  title: string,
  description: string | undefined,
  body: string,
  robots?: string,
): string {
  return `<!doctype html><html lang="${esc(site.defaultLocale)}"><head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="${PREVIEW_CSP}"><title>${esc(title)}</title>${
    description ? `<meta name="description" content="${esc(description)}">` : ""
  }${robots ? `<meta name="robots" content="${esc(robots)}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Cloudhal preview"><style>${PREVIEW_CSS}</style></head><body><a class="ch-skip" href="#main">${esc(site.defaultLocale.startsWith("tr") ? "İçeriğe geç" : "Skip to content")}</a><header><a href="/">${esc(site.name)}</a></header><main id="main">${body}</main><footer>${esc(site.name)}</footer></body></html>`;
}

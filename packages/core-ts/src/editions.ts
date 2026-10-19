/**
 * RFC-0034 §6: a language edition of a site — a new site in the same project that starts from the
 * source's structure instead of a blank starter.
 *
 * Copied:
 * - the site's theme (name and settings), design, header and footer, time zone;
 * - the pages in the source's default language, as drafts in the edition's language, still in the
 *   source's words (a person or an agent translates them), each joined to the source's translation
 *   group (`source.siteId`, layout `linked`), so `hreflang` spans both sites and staleness shows;
 * - the menus, their page items pointing at the copies (labels carried over under the new language
 *   as a starting point; items linking articles or categories are left out);
 * - the default taxonomies (categories, tags, authors), empty.
 *
 * Not copied: articles, terms, media, comments, analytics, members and keys. A page the edition
 * cannot hold as it is (it refers to media or categories of the source) is left out and reported,
 * as are a header or footer that do. Nothing is published.
 */
import type { Menu, Page, Site } from "@cloudhal/core-contracts";
import { nodeHash } from "./hash.ts";
import type { SiteGraphStore } from "./store.ts";

export interface EditionInput {
  readonly fromSiteId: string;
  readonly name: string;
  readonly slug: string;
  readonly locale: string;
}

export interface EditionReport {
  readonly site: Site;
  readonly pages: number;
  readonly menus: number;
  /** What was left out, and why (paths for pages, keys for menus, `chrome` for header/footer). */
  readonly skipped: readonly { readonly what: string; readonly reason: string }[];
}

type MenuItem = Menu["items"][number];

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Page items re-pointed at the copies; anything else (articles, categories, gone pages) dropped. */
function remapItems(
  items: readonly MenuItem[],
  pages: ReadonlyMap<string, string>,
  from: string,
  to: string,
): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    const children =
      "children" in item && item.children ? remapItems(item.children, pages, from, to) : undefined;
    const labels = item.labels?.[from] ? { [to]: item.labels[from] } : undefined;
    if (item.kind === "page") {
      const pageId = pages.get(item.pageId);
      if (!pageId) continue;
      const { labels: _l, children: _c, ...rest } = item as MenuItem & { children?: unknown };
      out.push({
        ...rest,
        pageId,
        ...(labels ? { labels } : {}),
        ...(children ? { children } : {}),
      } as MenuItem);
    } else if (item.kind === "url" || item.kind === "group" || item.kind === "collection") {
      // these need a label; one without a label in the source language is left out
      if (!labels || (item.kind === "group" && !children?.length)) continue;
      out.push({ ...item, labels, ...(children ? { children } : {}) } as MenuItem);
    }
  }
  return out;
}

export async function createEdition(
  store: SiteGraphStore,
  input: EditionInput,
): Promise<EditionReport> {
  const from = await store.getSite(input.fromSiteId);
  if (!from) throw new Error(`unknown site ${input.fromSiteId}`);
  const skipped: { what: string; reason: string }[] = [];
  // A bare site in the source's project: the source's settings, the default taxonomies.
  const project = await store.getProject(from.projectId);
  if (!project) throw new Error(`the project of ${from.id} is missing`);
  const base = {
    projectId: from.projectId,
    name: input.name,
    slug: input.slug,
    defaultLocale: input.locale,
    locales: [input.locale] as [string],
    domains: [] as Site["domains"],
    pageIds: [] as string[],
    theme: from.theme,
    ...(from.design ? { design: from.design } : {}),
    ...(from.timeZone ? { timeZone: from.timeZone } : {}),
  };
  let site: Site;
  try {
    site = await store.createSite({ ...base, ...(from.chrome ? { chrome: from.chrome } : {}) });
  } catch (e) {
    if (!from.chrome) throw e;
    skipped.push({ what: "chrome", reason: reasonOf(e) });
    site = await store.createSite(base);
  }
  await store.updateProject({ ...project, siteIds: [...project.siteIds, site.id] });
  await store.createDefaultTaxonomies(site);
  await store.createAuthorTaxonomy(site);
  const copies = new Map<string, string>();
  const sourcePages = (await store.listPages(from.id)).filter(
    (p) => p.locale === from.defaultLocale,
  );
  for (const src of sourcePages) {
    const hash = await nodeHash(src);
    const copy: Omit<Page, "id" | "schemaVersion" | "rev" | "createdAt" | "updatedAt"> = {
      siteId: site.id,
      path: src.path,
      title: src.title,
      locale: input.locale,
      status: "draft",
      sections: src.sections,
      ...(src.seo ? { seo: src.seo } : {}),
      ...(src.chrome ? { chrome: src.chrome } : {}),
      ...(src.motion ? { motion: src.motion } : {}),
      translation: {
        group: src.translation?.group ?? src.id,
        method: "human",
        layout: "linked",
        source: { id: src.id, siteId: from.id, locale: src.locale, rev: src.rev, hash },
      },
    };
    try {
      site = (await store.getSite(site.id)) as Site;
      const made = await store.createPage(site, copy as never);
      site = made.site;
      copies.set(src.id, made.page.id);
    } catch (e) {
      skipped.push({ what: src.path, reason: reasonOf(e) });
    }
  }
  let menus = 0;
  for (const menu of await store.listMenus(from.id)) {
    const items = remapItems(menu.items, copies, from.defaultLocale, input.locale);
    try {
      await store.createMenu({ siteId: site.id, key: menu.key, maxDepth: menu.maxDepth, items });
      menus++;
    } catch (e) {
      skipped.push({ what: `menu ${menu.key}`, reason: reasonOf(e) });
    }
  }
  return { site: (await store.getSite(site.id)) as Site, pages: copies.size, menus, skipped };
}

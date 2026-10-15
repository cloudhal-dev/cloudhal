import type { Actor, Site, Taxonomy } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "./store.ts";

export interface SeedOptions {
  readonly name: string;
  readonly slug: string;
  readonly locale?: string;
  readonly owner?: Actor;
}

/**
 * Creates a project, a site, a home page with a hero + content list, an about page, the default
 * taxonomies (`category` required, `tag`; RFC-0002 §1) with a "News" category and a "Cloudhal" tag,
 * an empty `author` taxonomy (RFC-0019 §1),
 * and a first post filed under both. Returns the site (after the page append).
 */
export async function seedStarterSite(store: SiteGraphStore, options: SeedOptions): Promise<Site> {
  const locale = options.locale ?? "en";
  const owner = options.owner ?? { kind: "system" as const, id: "sys_cloudhalinit" };
  const project = await store.createProject({
    name: options.name,
    slug: options.slug,
    ownerId: owner.id,
    siteIds: [],
  });
  let site = await store.createSite({
    projectId: project.id,
    name: options.name,
    slug: options.slug,
    defaultLocale: locale,
    locales: [locale],
    domains: [],
    pageIds: [],
    theme: { name: "blog" },
  });
  await store.updateProject({ ...project, siteIds: [site.id] });
  ({ site } = await store.createPage(site, {
    siteId: site.id,
    path: "/",
    title: options.name,
    locale,
    status: "published",
    sections: [
      {
        id: "sec_home000hero",
        kind: "hero",
        heading: options.name,
        subheading: "A Cloudhal site. Edit this page with the agent or in Studio.",
      },
      {
        id: "sec_home000posts",
        kind: "contentList",
        collection: "posts",
        limit: 10,
        sort: "newest",
      },
    ],
    seo: { title: options.name, description: `${options.name} — built with Cloudhal` },
  }));
  ({ site } = await store.createPage(site, {
    siteId: site.id,
    path: "/about",
    title: "About",
    locale,
    status: "published",
    sections: [
      {
        id: "sec_about00text",
        kind: "richText",
        format: "markdown",
        body: `## About ${options.name}\n\nThis site is operated by agents under human approval. Every change is a snapshot you can preview, publish and roll back.`,
      },
    ],
  }));
  const [category, tag] = (await store.createDefaultTaxonomies(site)) as [Taxonomy, Taxonomy];
  // RFC-0019 §1: every new site has an (empty) author taxonomy for bylines.
  await store.createAuthorTaxonomy(site);
  const news = await store.createTerm({
    siteId: site.id,
    taxonomyId: category.id,
    slug: "news",
    status: "active",
    visibility: "public",
    labels: { [locale]: { name: locale.split("-")[0] === "tr" ? "Haberler" : "News" } },
    position: 0,
  });
  const cloudhal = await store.createTerm({
    siteId: site.id,
    taxonomyId: tag.id,
    slug: "cloudhal",
    status: "active",
    visibility: "public",
    labels: { [locale]: { name: "Cloudhal" } },
  });
  await store.createContentEntry({
    siteId: site.id,
    collection: "posts",
    slug: "hello-world",
    locale,
    status: "published",
    title: "Hello, world",
    summary: "The first post on this Cloudhal site.",
    body: {
      format: "markdown",
      value:
        "# Hello, world\n\nThis post was seeded by `cloudhal init`. Ask the agent to write the next one.",
    },
    fields: {},
    tags: [],
    terms: {
      category: { ids: [news.id], primary: news.id },
      tag: { ids: [cloudhal.id] },
    },
    author: owner,
    publishedAt: new Date().toISOString(),
  });
  return site;
}

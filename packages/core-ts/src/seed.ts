import type { Actor, Site } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "./store.ts";

export interface SeedOptions {
  readonly name: string;
  readonly slug: string;
  readonly locale?: string;
  readonly owner?: Actor;
}

/** Creates a project, a site and a home page with a hero + content list. Returns the site (after the page append). */
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
    tags: ["cloudhal"],
    author: owner,
    publishedAt: new Date().toISOString(),
  });
  return site;
}

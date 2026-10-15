/** RFC-0019 §1: bylines are `author` terms — the article view, JSON-LD and the author's page. */
import type { ContentEntry, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { archiveHead, entryHead } from "../src/seo.ts";
import { entryTaxonomy, taxonomyIndex } from "../src/taxonomy.ts";

const ts = "2026-10-15T09:00:00.000Z";
const site = {
  schemaVersion: 1,
  id: "site_bylines01",
  projectId: "proj_bylines01",
  name: "Newsroom",
  slug: "newsroom",
  defaultLocale: "en",
  locales: ["en"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  rev: 1,
  createdAt: ts,
  updatedAt: ts,
} as unknown as Site;
const author: Taxonomy = {
  schemaVersion: 1,
  id: "tax_author0001",
  siteId: site.id,
  key: "author",
  labels: { en: { singular: "Author", plural: "Authors" } },
  hierarchical: false,
  allowNewTerms: "none",
  required: false,
  maxPerEntry: 5,
  archive: { enabled: true, basePath: "/author" },
  feed: true,
  minEntriesToIndex: 1,
  rev: 0,
  createdAt: ts,
  updatedAt: ts,
};
const person = (id: string, slug: string, name: string, extra: Partial<Term> = {}): Term => ({
  schemaVersion: 1,
  id,
  siteId: site.id,
  taxonomyId: author.id,
  slug,
  status: "active",
  visibility: "public",
  labels: { en: { name, role: "Reporter" } },
  rev: 0,
  createdAt: ts,
  updatedAt: ts,
  ...extra,
});
const ayse = person("term_ayse00001", "ayse-yilmaz", "Ayşe Yılmaz", {
  links: [
    { label: "Mastodon", href: "https://mastodon.social/@ayse", external: true },
    { label: "Bad", href: "javascript:alert(1)" },
  ],
});
const can = person("term_can000001", "can-demir", "Can Demir");
const index = taxonomyIndex([author], [ayse, can], "en");
const entry = {
  schemaVersion: 1,
  id: "ent_story00001",
  siteId: site.id,
  collection: "posts",
  slug: "story",
  locale: "en",
  status: "published",
  title: "A story",
  body: { format: "markdown", value: "Body" },
  fields: {},
  tags: [],
  terms: { author: { ids: [can.id, ayse.id], primary: ayse.id } },
  author: { kind: "agent", id: "agent_writer001", name: "Writer bot" },
  publishedAt: ts,
  rev: 1,
  createdAt: ts,
  updatedAt: ts,
} as unknown as ContentEntry;

describe("bylines", () => {
  it("lists the byline's authors, primary first, linked to their pages", () => {
    const t = entryTaxonomy(index, entry);
    expect(t.authors.map((a) => [a.name, a.href])).toEqual([
      ["Ayşe Yılmaz", "/author/ayse-yilmaz"],
      ["Can Demir", "/author/can-demir"],
    ]);
  });

  it("credits the byline's people in JSON-LD, not the agent that wrote the data", () => {
    const meta = entryHead(site, entry, "https://news.example", entryTaxonomy(index, entry));
    const article = (meta.jsonLd as Record<string, unknown>[])[0] as { author: unknown };
    expect(article.author).toEqual([
      {
        "@type": "Person",
        name: "Ayşe Yılmaz",
        jobTitle: "Reporter",
        url: "https://news.example/author/ayse-yilmaz",
        sameAs: ["https://mastodon.social/@ayse"],
      },
      {
        "@type": "Person",
        name: "Can Demir",
        jobTitle: "Reporter",
        url: "https://news.example/author/can-demir",
      },
    ]);
    const noByline = entryHead(site, { ...entry, terms: {} }, "https://news.example");
    expect(
      ((noByline.jsonLd as Record<string, unknown>[])[0] as { author: unknown }).author,
    ).toMatchObject({
      "@type": "Organization",
    });
  });

  it("marks an author's archive as their profile page", () => {
    const meta = archiveHead(
      site,
      {
        taxonomy: author,
        term: ayse,
        shown: entryTaxonomy(index, entry).authors[0],
        trail: [],
        entries: [entry],
        page: 1,
        pages: 1,
        perPage: 20,
        total: 1,
        path: "/author/ayse-yilmaz",
        root: "/author/ayse-yilmaz",
        locale: "en",
        indexable: true,
      } as never,
      "https://news.example",
    );
    const page = (meta.jsonLd as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(page["@type"]).toEqual(["CollectionPage", "ProfilePage"]);
    expect(page.mainEntity).toMatchObject({ "@type": "Person", name: "Ayşe Yılmaz" });
    expect(page.hasPart).toMatchObject({ "@type": "ItemList", numberOfItems: 1 });
  });
});

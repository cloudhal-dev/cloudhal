import type { ContentEntry, Redirect, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { vi } from "vitest";
import type { TermListItem } from "../src/lib/api.ts";

/** Shared fixtures for the taxonomy screens (RFC-0002): a site with categories, tags and posts. */
export const SITE: Site = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Demo",
  slug: "demo",
  defaultLocale: "en",
  locales: ["en"],
  domains: [{ hostname: "example.com", primary: true }],
  pageIds: ["page_1"],
  theme: { name: "blog" },
  rev: 1,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
};

const stamp = { createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-01T08:00:00Z" };

export const CATEGORY: Taxonomy = {
  schemaVersion: 1,
  id: "tax_category01",
  siteId: "site_1",
  key: "category",
  labels: { en: { singular: "Category", plural: "Categories" } },
  hierarchical: true,
  allowNewTerms: "none",
  required: true,
  maxPerEntry: 3,
  archive: { enabled: true, basePath: "/category" },
  feed: true,
  minEntriesToIndex: 3,
  rev: 0,
  ...stamp,
};

export const TAG: Taxonomy = {
  ...CATEGORY,
  id: "tax_tag0000001",
  key: "tag",
  labels: { en: { singular: "Tag", plural: "Tags" } },
  hierarchical: false,
  allowNewTerms: "propose",
  required: false,
  maxPerEntry: 3,
  archive: { enabled: true, basePath: "/tag" },
};

export function term(
  id: string,
  tax: Taxonomy,
  slug: string,
  name: string,
  extra: Partial<Term> = {},
): Term {
  return {
    schemaVersion: 1,
    id,
    siteId: "site_1",
    taxonomyId: tax.id,
    slug,
    status: "active",
    visibility: "public",
    labels: { en: { name } },
    rev: 2,
    ...stamp,
    ...extra,
  };
}

export const NEWS = term("term_news0001", CATEGORY, "news", "News", { position: 0 });
export const LOCAL = term("term_local001", CATEGORY, "local", "Local news", {
  parentId: "term_news0001",
});
export const TECH = term("term_tech0001", CATEGORY, "technology", "Technology", { position: 1 });
export const JS = term("term_js000001", TAG, "javascript", "JavaScript", {
  labels: { en: { name: "JavaScript", altNames: ["JS"] } },
});
export const LLM = term("term_llm00001", TAG, "llm", "LLM");
export const LLMS = term("term_llms0001", TAG, "llms", "LLMs", {
  status: "proposed",
  proposedBy: { kind: "agent", id: "agent_desk001", name: "Desk" },
});
export const OLD = term("term_old00001", TAG, "old", "Old", {
  status: "retired",
  mergedInto: "term_llm00001",
});

export const ITEMS: TermListItem[] = [
  { term: NEWS, usage: { total: 4, published: 4, lastUsedAt: "2026-10-07T08:00:00Z" } },
  { term: LOCAL, usage: { total: 1, published: 1, lastUsedAt: "2026-10-07T08:00:00Z" } },
  { term: TECH, usage: { total: 0, published: 0 } },
  { term: JS, usage: { total: 2, published: 2, lastUsedAt: "2026-10-07T08:00:00Z" } },
  { term: LLM, usage: { total: 3, published: 1, lastUsedAt: "2026-10-07T08:00:00Z" } },
  { term: LLMS, usage: { total: 1, published: 0, lastUsedAt: "2026-10-07T08:00:00Z" } },
  { term: OLD, usage: { total: 0, published: 0 } },
];

export function entry(patch: Partial<ContentEntry> = {}): ContentEntry {
  return {
    schemaVersion: 1,
    id: "entry_1",
    siteId: "site_1",
    collection: "posts",
    slug: "hello-world",
    locale: "en",
    status: "draft",
    title: "Hello world",
    body: { format: "markdown", value: "Body" },
    fields: {},
    tags: [],
    author: { kind: "human", id: "user_1", name: "Halil" },
    rev: 3,
    createdAt: "2026-10-08T08:00:00Z",
    updatedAt: "2026-10-08T08:00:00Z",
    ...patch,
  };
}

export function redirect(patch: Partial<Redirect> = {}): Redirect {
  return {
    schemaVersion: 1,
    id: "redir_1",
    siteId: "site_1",
    from: "/tag/js",
    to: "/tag/javascript",
    status: 301,
    match: "prefix",
    reason: "slug-change",
    source: { kind: "term", id: "term_js000001" },
    rev: 0,
    ...stamp,
    ...patch,
  };
}

export interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

/**
 * A fetch stub: GETs answer from `routes` (exact URL, 404 otherwise), writes go to `write`
 * (default: echo the body back). Every call is recorded with its parsed body.
 */
export function serve(
  routes: Record<string, unknown>,
  write: (call: Call) => { status?: number; body: unknown } | undefined = () => undefined,
) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    const call = { url, method, body };
    calls.push(call);
    if (method !== "GET") {
      const answer = write(call);
      if (answer) return Response.json(answer.body, { status: answer.status ?? 200 });
      if (method === "PUT") return Response.json({ ...body, rev: Number(body?.rev ?? 0) + 1 });
      return Response.json(body ?? {});
    }
    const hit = routes[url];
    return Response.json(hit ?? { error: "not_found", message: url }, {
      status: hit === undefined ? 404 : 200,
    });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

/** The GET routes every taxonomy screen reads. */
export function taxonomyRoutes(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "/api/sites/site_1": SITE,
    "/api/sites/site_1/taxonomies": [CATEGORY, TAG],
    "/api/sites/site_1/terms": { items: ITEMS },
    "/api/sites/site_1/entries?collection=posts": [],
    "/api/sites/site_1/entries": [],
    "/api/sites/site_1/pages": [],
    "/api/sites/site_1/redirects": [],
    ...extra,
  };
}

/**
 * One hygiene report (RFC-0002 §6.2): the MCP tool `taxonomy_report` and Studio's "Vocabulary
 * health" card must report the same findings for the same site. Studio computes the report in the
 * browser with core-ts `taxonomyReport` over what the REST API returns (taxonomies, terms with
 * usage, every entry); MCP calls the same function over the store. This test builds one fixture
 * that triggers every finding kind and compares the two, finding by finding.
 */
import type { ContentEntry, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import {
  SiteGraphStore,
  seedStarterSite,
  type TaxonomyReport,
  taxonomyReport,
} from "@cloudhal/core-ts";
import { createCloudhalMcpServer } from "@cloudhal/mcp-server";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const owner = { kind: "human" as const, id: "user_parity00001", name: "Owner" };
const agent = { kind: "agent" as const, id: "agent_parity0001", name: "Tagger" };

/** A finding as both surfaces can express it: kind + the term ids (or the entry count). */
type Key = string;

/** Studio's card, minus React: the same input it builds from the REST responses. */
function studioFindings(
  taxonomies: Taxonomy[],
  items: { term: Term; usage: { total: number; published: number } }[],
  entries: ContentEntry[],
  locale: string,
): Key[] {
  const out: Key[] = [];
  for (const tax of taxonomies) {
    const own = items.filter((i) => i.term.taxonomyId === tax.id);
    const r: TaxonomyReport = taxonomyReport({
      taxonomy: tax,
      terms: own.map((i) => i.term),
      usage: new Map(own.map((i) => [i.term.id, i.usage])),
      entries,
      locale,
    });
    const each = (kind: string, ids: readonly string[]) => {
      for (const id of ids) out.push(`${tax.key}:${kind}:${id}`);
    };
    each("proposed", r.proposed);
    each("empty-category", r.emptyCategories);
    each("oversized-category", r.oversizedCategories);
    each("unused", r.unused);
    each("single-use", r.singleUse);
    each("no-intro", r.noIntro);
    for (const d of r.nearDuplicates)
      out.push(
        `${tax.key}:${d.reason === "synonym" ? "synonym-collision" : "near-duplicate"}:${d.source}+${d.target}`,
      );
    if (r.missingPrimary.length) out.push(`${tax.key}:missing-primary:${r.missingPrimary.length}`);
    if (r.unfiled.length) out.push(`${tax.key}:unfiled:${r.unfiled.length}`);
  }
  return out.sort();
}

describe("taxonomy hygiene: MCP taxonomy_report and Studio's health card agree", () => {
  let store: SiteGraphStore;
  let site: Site;

  beforeAll(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Parity", slug: "parity" });
    const tax = async (key: string) => (await store.getTaxonomyByKey(site.id, key)) as Taxonomy;
    const region = await store.createTaxonomy({
      siteId: site.id,
      key: "region",
      labels: { en: { singular: "Region", plural: "Regions" } },
      hierarchical: true,
      allowNewTerms: "propose",
      required: false,
      archive: { enabled: true, basePath: "/region" },
      feed: false,
      minEntriesToIndex: 2,
    });
    const t: Record<string, Term> = {};
    for (const term of await store.listTerms(site.id)) t[term.slug] = term;
    const add = async (
      taxonomy: Taxonomy,
      slug: string,
      name: string,
      extra: Partial<Pick<Term, "parentId" | "status">> & { altNames?: [string, ...string[]] } = {},
    ) => {
      t[slug] = await store.createTerm({
        siteId: site.id,
        taxonomyId: taxonomy.id,
        slug,
        status: extra.status ?? "active",
        visibility: "public",
        labels: { en: { name, ...(extra.altNames ? { altNames: extra.altNames } : {}) } },
        ...(extra.parentId ? { parentId: extra.parentId } : {}),
        ...(extra.status === "proposed" ? { proposedBy: agent } : {}),
      });
    };
    const category = await tax("category");
    const tag = await tax("tag");
    await add(category, "sports", "Sports");
    await add(category, "football", "Football", { parentId: t.sports?.id as string });
    await add(tag, "javascript", "JavaScript", { altNames: ["JS"] });
    await add(tag, "js", "JS-lang", { status: "proposed" });
    await add(tag, "llm", "LLM");
    await add(tag, "llms", "LLMs");
    await add(tag, "kubernetes", "Kubernetes");
    await add(tag, "kubernetis", "Kubernetis");
    await add(tag, "unused-tag", "Never used");
    await add(region, "europe", "Europe");
    await add(region, "turkey", "Turkey", { parentId: t.europe?.id as string });
    await add(region, "asia", "Asia");

    const news = t.news?.id as string;
    const write = (
      slug: string,
      terms: ContentEntry["terms"] | undefined,
      status: ContentEntry["status"] = "published",
    ) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status,
        title: slug,
        body: { format: "markdown", value: "Body." },
        fields: {},
        tags: [],
        ...(terms ? { terms } : {}),
        author: owner,
      });
    for (let i = 0; i < 22; i++)
      await write(`n${i}`, {
        category: { ids: [news], primary: news },
        ...(i < 3 ? { tag: { ids: [t.kubernetis?.id as string] } } : {}),
        ...(i < 2 ? { region: { ids: [t.turkey?.id as string] } } : {}),
      });
    await write("single", {
      category: { ids: [news], primary: news },
      tag: {
        ids: [t.javascript?.id as string, t.llm?.id as string, t.kubernetes?.id as string],
      },
    });
    await write("draft-without-category", undefined, "draft");
  });

  it("reports the same findings, kind by kind and term by term", async () => {
    // MCP: an agent key asks for the report.
    const server = createCloudhalMcpServer({
      store,
      principal: { actor: agent, scopes: ["content:read", "site:read"] },
      stateKey: "parity-test-state-key-0123456789abcdef",
    });
    const client = new Client({ name: "parity", version: "1" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const res = await client.callTool({ name: "taxonomy_report", arguments: { siteId: site.id } });
    expect(res.isError, JSON.stringify(res.content)).not.toBe(true);
    const out = res.structuredContent as {
      findings: { kind: string; taxonomy: string; terms: { termId: string }[]; detail: string }[];
      counts: Record<string, number>;
    };
    const mcp = out.findings
      .map((f) =>
        f.kind === "missing-primary" || f.kind === "unfiled"
          ? `${f.taxonomy}:${f.kind}:${Number(f.detail.match(/^(\d+) article/)?.[1])}`
          : `${f.taxonomy}:${f.kind}:${f.terms.map((x) => x.termId).join("+")}`,
      )
      .sort();

    // Studio: the REST responses its screens read, then the card's computation.
    const app = createApi({ store, resolveActor: async () => owner });
    const get = async <T>(path: string) => (await (await app.request(path)).json()) as T;
    const base = `/api/sites/${site.id}`;
    const studio = studioFindings(
      await get<Taxonomy[]>(`${base}/taxonomies`),
      (
        await get<{ items: { term: Term; usage: { total: number; published: number } }[] }>(
          `${base}/terms`,
        )
      ).items,
      await get<ContentEntry[]>(`${base}/entries`),
      (await get<Site>(base)).defaultLocale,
    );

    expect(mcp).toEqual(studio);
    // The fixture really exercises every kind, on more than one taxonomy.
    const kinds = new Set(mcp.map((k) => k.split(":").slice(0, 2).join(":")));
    expect([...kinds].sort()).toEqual(
      [
        "category:empty-category",
        "category:missing-primary",
        "category:no-intro",
        "category:oversized-category",
        "region:empty-category",
        "region:no-intro",
        "region:unfiled",
        "tag:near-duplicate",
        "tag:no-intro",
        "tag:proposed",
        "tag:single-use",
        "tag:synonym-collision",
        "tag:unused",
      ].sort(),
    );
    expect(Object.values(out.counts).reduce((a, b) => a + b, 0)).toBe(mcp.length);
  });
});

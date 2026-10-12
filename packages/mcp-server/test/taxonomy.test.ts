/**
 * RFC-0002 over MCP: term assignment by id/slug/name/synonym, the vocabulary tools, proposals under
 * each `allowNewTerms`, approval-gated governance with exactly one snapshot, prompts with assignment
 * deltas, the `auto`-mode structure rule, filters, redirects and the hygiene report.
 */
import { type AgentMode, ApprovalStore, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type { ContentEntry, Site, Term } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createCloudhalMcpServer } from "../src/server.ts";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_taxonomy01", name: "Tagger" };
const owner = { kind: "human" as const, id: "user_owner000001", name: "Owner" };
const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const policy = new PolicyEngine(toolPolicies(tools));

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  approvals: ApprovalStore;
  site: Site;
  /** Terms by slug, created by a person. */
  t: Record<string, Term>;
}

async function world(): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Tax Site", slug: "tax" });
  const t: Record<string, Term> = {};
  for (const term of await store.listTerms(site.id)) t[term.slug] = term;
  const add = async (
    key: string,
    slug: string,
    name: string,
    extra: { altNames?: [string, ...string[]]; parentId?: string } = {},
  ) => {
    const tax = await store.getTaxonomyByKey(site.id, key);
    t[slug] = await store.createTerm({
      siteId: site.id,
      taxonomyId: tax?.id as string,
      slug,
      status: "active",
      visibility: "public",
      labels: { en: { name, ...(extra.altNames ? { altNames: extra.altNames } : {}) } },
      ...(extra.parentId ? { parentId: extra.parentId } : {}),
    });
  };
  await add("category", "sports", "Sports");
  await add("category", "football", "Football", { parentId: t.sports?.id as string });
  await add("tag", "javascript", "JavaScript", { altNames: ["JS"] });
  await add("tag", "machine-learning", "Machine learning");
  await add("tag", "llm", "LLM");
  await add("tag", "llms", "LLMs");
  await add("tag", "go-lang", "Go");
  await add("tag", "go-game", "Go");
  return {
    store,
    audit: new AuditLog(sql),
    approvals: new ApprovalStore(sql),
    site,
    t,
  };
}

/** An article written by a person, filed under `terms`. */
async function article(
  w: World,
  slug: string,
  terms: Record<string, { ids: string[]; primary?: string }> | undefined,
  status: ContentEntry["status"] = "published",
): Promise<ContentEntry> {
  return w.store.createContentEntry({
    siteId: w.site.id,
    collection: "posts",
    slug,
    locale: "en",
    status,
    title: slug,
    body: { format: "markdown", value: "Body." },
    fields: {},
    tags: [],
    ...(terms ? { terms: terms as NonNullable<ContentEntry["terms"]> } : {}),
    author: owner,
  });
}

/** Tools called directly (no transport), as `principal`. */
function direct(w: World, principal: ToolContext["principal"]) {
  const ctx: ToolContext = { store: w.store, principal };
  return (name: string, args: Record<string, unknown>, confirmed = false) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, {
      policy,
      audit: w.audit,
      confirmed,
    });
}

/** A real MCP client for an agent key with out-of-band approvals. */
async function mcp(w: World, mode: AgentMode = "edits") {
  const server = createCloudhalMcpServer({
    store: w.store,
    audit: w.audit,
    approvals: w.approvals,
    principal: { actor: agent, scopes: ["*"], mode },
    stateKey: "taxonomy-test-state-key-0123456789abcdef",
  });
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      text: (r.content as { text?: string }[])[0]?.text ?? "",
      out: r.structuredContent as Record<string, unknown> & Record<string, never>,
    };
  };
  /** Ask, let a person approve in Studio, call again with the approval. */
  const approved = async (name: string, args: Record<string, unknown>) => {
    const ask = await call(name, args);
    expect(ask.text).toMatch(/^approval pending:/);
    const approvalId = ask.text.match(/approvalId: (appr_\w+)/)?.[1] as string;
    await w.approvals.decide(approvalId, "approved", owner);
    const done = await call(name, { ...args, approvalId });
    expect(done.isError, done.text).toBe(false);
    return { prompt: ask.text, ...done };
  };
  return { client, call, approved };
}

/** Publishes the current state as a person would. */
async function publishAsPerson(w: World): Promise<void> {
  const snap = await w.store.createSnapshot(w.site.id, { actor: owner, reason: "publish" });
  await w.store.publish((await w.store.getSite(w.site.id)) as Site, snap.id);
}

describe("RFC-0002 over MCP", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("assigns terms by id, slug, name and synonym, and refuses what it cannot resolve", async () => {
    const run = direct(w, { actor: agent, scopes: ["*"] });
    const { t } = w;
    const created = await run("create_entry", {
      siteId: w.site.id,
      slug: "filed",
      title: "Filed",
      body: "Body.",
      terms: {
        category: { primary: "News" }, // by name
        tag: { add: [t.cloudhal?.id, "machine-learning", "js"] }, // id, slug, synonym
      },
    });
    const entry = (created.result as { entry: ContentEntry }).entry;
    expect(entry.terms).toEqual({
      category: { ids: [t.news?.id], primary: t.news?.id },
      tag: { ids: [t.cloudhal?.id, t["machine-learning"]?.id, t.javascript?.id] },
    });

    // add/remove/set/primary on update; the primary is added for you
    const updated = await run("update_entry", {
      siteId: w.site.id,
      entryId: entry.id,
      rev: entry.rev,
      terms: {
        category: { primary: "sports" },
        tag: { remove: ["Cloudhal", "JavaScript"], add: ["LLMs"] },
      },
    });
    expect((updated.result as { entry: ContentEntry }).entry.terms).toEqual({
      category: { ids: [t.news?.id, t.sports?.id], primary: t.sports?.id },
      tag: { ids: [t["machine-learning"]?.id, t.llms?.id] },
    });
    const rev = (updated.result as { entry: ContentEntry }).entry.rev;
    const edit = (terms: unknown) =>
      run("update_entry", { siteId: w.site.id, entryId: entry.id, rev, terms });

    // unknown: suggestions, and what to do next depends on allowNewTerms
    await expect(edit({ tag: { add: ["machine-lerning"] } })).rejects.toMatchObject({
      code: "unknown_term",
      message: expect.stringMatching(
        /tag "machine-lerning" matches no term \(did you mean machine-learning.*propose_term/,
      ),
    });
    await expect(edit({ category: { add: ["Politics"] } })).rejects.toMatchObject({
      code: "unknown_term",
      message: expect.stringContaining("only a person adds a category"),
    });
    // ambiguous: two tags are both called "Go"
    await expect(edit({ tag: { add: ["Go"] } })).rejects.toMatchObject({
      code: "ambiguous_term",
      message: expect.stringMatching(
        /matches several terms: go-(game|lang) .*go-(game|lang) .*pass the term id/,
      ),
    });
    await expect(edit({ series: { add: ["x"] } })).rejects.toMatchObject({
      code: "unknown_taxonomy",
      message: expect.stringContaining("it has: category, tag"),
    });
    // limits come from the taxonomy (category: 3 per entry)
    await w.store.createTerm({
      siteId: w.site.id,
      taxonomyId: (await w.store.getTaxonomyByKey(w.site.id, "category"))?.id as string,
      slug: "culture",
      status: "active",
      visibility: "public",
      labels: { en: { name: "Culture" } },
    });
    await expect(
      edit({ category: { set: ["news", "sports", "football", "culture"] } }),
    ).rejects.toMatchObject({ code: "too_many_terms", message: /maxPerEntry/ });
    // removing the primary of a required taxonomy from a published article is refused
    await run("update_entry", {
      siteId: w.site.id,
      entryId: entry.id,
      rev,
      status: "published",
    });
    const live = (await w.store.getContentEntry(entry.id)) as ContentEntry;
    await expect(
      run("update_entry", {
        siteId: w.site.id,
        entryId: entry.id,
        rev: live.rev,
        terms: { category: { remove: ["sports", "news"] } },
      }),
    ).rejects.toMatchObject({
      code: "required_term",
      message: expect.stringContaining("set terms.category.primary"),
    });
  });

  it("validates `terms` against the tool's input schema (slug keys, limits)", async () => {
    const { call } = await mcp(w);
    const bad = await call("create_entry", {
      siteId: w.site.id,
      slug: "x",
      title: "x",
      body: "x",
      terms: { "Not A Key": { add: ["news"] } },
    });
    expect(bad.isError).toBe(true);
    const tooMany = await call("create_entry", {
      siteId: w.site.id,
      slug: "y",
      title: "y",
      body: "y",
      terms: { tag: { add: Array.from({ length: 51 }, (_, i) => `t${i}`) } },
    });
    expect(tooMany.isError).toBe(true);
    const badSlug = await call("create_entry", {
      siteId: w.site.id,
      slug: "Bad Slug",
      title: "z",
      body: "z",
    });
    expect(badSlug.isError).toBe(true);
  });

  it("lists taxonomies and terms with usage, and resolves inputs without creating anything", async () => {
    const { call } = await mcp(w);
    await article(w, "ml-1", {
      category: { ids: [w.t.news?.id as string], primary: w.t.news?.id as string },
      tag: { ids: [w.t.javascript?.id as string] },
    });
    const taxonomies = (await call("list_taxonomies", { siteId: w.site.id })).out
      .taxonomies as unknown as { key: string; required: boolean; allowNewTerms: string }[];
    expect(taxonomies.map((x) => [x.key, x.required, x.allowNewTerms])).toEqual([
      ["category", true, "none"],
      ["tag", false, "propose"],
    ]);
    const listed = await call("list_terms", { siteId: w.site.id, taxonomy: "tag", query: "java" });
    expect(listed.isError, listed.text).toBe(false);
    expect(listed.out.terms).toEqual([
      expect.objectContaining({
        slug: "javascript",
        labels: { en: { name: "JavaScript", altNames: ["JS"] } },
        usage: expect.objectContaining({ total: 1, published: 1 }),
      }),
    ]);
    const kids = await call("list_terms", {
      siteId: w.site.id,
      taxonomy: "category",
      parentId: w.t.sports?.id,
    });
    expect((kids.out.terms as unknown as Term[]).map((x) => x.slug)).toEqual(["football"]);
    const page = await call("list_terms", { siteId: w.site.id, taxonomy: "tag", limit: 2 });
    expect(page.out.nextCursor).toBe("2");

    const resolved = await call("resolve_terms", {
      siteId: w.site.id,
      taxonomy: "tag",
      inputs: ["JS", "llms", "Machine Learnings", "pythn"],
    });
    expect(resolved.out.results).toEqual([
      {
        input: "JS",
        matched: true,
        termId: w.t.javascript?.id,
        via: "altName",
        slug: "javascript",
        name: "JavaScript",
      },
      {
        input: "llms",
        matched: true,
        termId: w.t.llms?.id,
        via: "slug",
        slug: "llms",
        name: "LLMs",
      },
      expect.objectContaining({ input: "Machine Learnings", matched: true, via: "plural" }),
      { input: "pythn", matched: false, reason: "none", suggestions: [] },
    ]);
    expect(await w.store.listTerms(w.site.id, { taxonomy: "tag" })).toHaveLength(7);
  });

  it("propose_term honours allowNewTerms: none → ask a person, propose → proposed, free → active", async () => {
    const { call } = await mcp(w);
    const snapshots = async () => (await w.store.listSnapshots(w.site.id)).length;

    // categories are people-only; an existing one is simply returned
    const denied = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "category",
      name: "Politics",
      reason: "Election coverage",
    });
    expect(denied.text).toMatch(/^denied: only people add terms .*ask a person to add "Politics"/);
    expect((await w.audit.list({ siteId: w.site.id }))[0]).toMatchObject({
      tool: "propose_term",
      decision: "deny",
    });
    const news = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "category",
      name: "news",
      reason: "x".repeat(5),
    });
    expect(news.out).toMatchObject({ existing: true, via: "slug", term: { id: w.t.news?.id } });

    // tags: proposed, private, with who and why
    const before = await snapshots();
    const rust = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "Rust",
      altNames: ["rust-lang"],
      reason: "Several drafts cover Rust",
    });
    expect(rust.out).toMatchObject({
      existing: false,
      term: {
        slug: "rust",
        status: "proposed",
        visibility: "public",
        proposedBy: agent,
        labels: { en: { name: "Rust", altNames: ["rust-lang"] } },
        metadata: { "cloudhal.reason": "Several drafts cover Rust" },
      },
    });
    expect(await snapshots()).toBe(before + 1);
    // idempotent: the same name (or a synonym) returns it, nothing new
    const again = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "rust-lang",
      reason: "again",
    });
    expect(again.out).toMatchObject({ existing: true, via: "altName", term: { slug: "rust" } });
    expect(await snapshots()).toBe(before + 1);

    // free: active
    const tag = await w.store.getTaxonomyByKey(w.site.id, "tag");
    await w.store.updateTaxonomy({ ...(tag as NonNullable<typeof tag>), allowNewTerms: "free" });
    const zig = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "Zig",
      reason: "New language",
    });
    expect(zig.out).toMatchObject({ existing: false, term: { slug: "zig", status: "active" } });
  });

  it("governance waits for a person, lists articles and redirects, and takes exactly one snapshot", async () => {
    const { call, approved } = await mcp(w);
    const { t } = w;
    const cat = { ids: [t.news?.id as string], primary: t.news?.id as string };
    await article(w, "a1", { category: cat, tag: { ids: [t.llm?.id as string] } });
    await article(w, "a2", { category: cat, tag: { ids: [t.llms?.id as string] } });
    await article(w, "a3", {
      category: cat,
      tag: { ids: [t.llms?.id as string, t.llm?.id as string] },
    });
    const snapshots = async () => (await w.store.listSnapshots(w.site.id)).length;
    const before = await snapshots();

    const merged = await approved("merge_terms", {
      siteId: w.site.id,
      sourceIds: [t.llms?.id],
      targetId: t.llm?.id,
    });
    expect(merged.prompt).toContain(
      'Merge tag "LLMs" (llms) into tag "LLM" (llm)? 2 articles re-filed under it',
    );
    expect(merged.prompt).toContain("+ redirect /tag/llms → /tag/llm (301");
    const op = merged.out.operation as unknown as {
      opId: string;
      entries: number;
      redirects: { from: string; to: string; reason: string }[];
    };
    expect(op.entries).toBe(2);
    expect(op.redirects).toEqual([
      expect.objectContaining({ from: "/tag/llms", to: "/tag/llm", reason: "merge" }),
    ]);
    expect(await snapshots()).toBe(before + 1);
    const snap = (await w.store.listSnapshots(w.site.id, 1))[0];
    expect(snap).toMatchObject({
      reason: "agentMutation",
      label: "merge_terms by Tagger",
      metadata: { "cloudhal.opId": op.opId },
    });
    const row = (await w.audit.list({ siteId: w.site.id })).find(
      (r) => r.tool === "merge_terms" && r.decision === "allow",
    );
    expect(row?.input).toMatchObject({
      effect: {
        operation: { opId: op.opId, entries: 2, terms: 2, redirects: ["/tag/llms → /tag/llm"] },
      },
    });

    // a rename moves the archive (and re-points the merge redirect: no chains)
    const renamed = await approved("rename_term", {
      siteId: w.site.id,
      termId: t.llm?.id,
      slug: "large-language-models",
    });
    expect(renamed.prompt).toContain("No article changes; redirects:");
    expect(renamed.prompt).toContain(
      "~ redirect /tag/llms → /tag/large-language-models (was /tag/llm)",
    );
    expect(renamed.prompt).toContain("+ redirect /tag/llm → /tag/large-language-models");
    expect(await snapshots()).toBe(before + 2);

    // retire with a redirect: removed from articles
    const retired = await approved("retire_term", {
      siteId: w.site.id,
      termId: t["machine-learning"]?.id,
      redirectToId: t.llm?.id,
    });
    expect(retired.prompt).toMatch(
      /Retire tag "Machine learning" \(machine-learning\)\? It is removed from 0 articles/,
    );
    expect(await snapshots()).toBe(before + 3);

    // structure tools need a person even in edits mode, and site:write
    const plain = createCloudhalMcpServer({
      store: w.store,
      principal: { actor: agent, scopes: ["site:read", "content:read", "content:write"] },
      stateKey: "taxonomy-test-state-key-0123456789abcdef",
    });
    const c = new Client({ name: "t", version: "1" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await plain.connect(st);
    await c.connect(ct);
    const noScope = await c.callTool({
      name: "set_term_visibility",
      arguments: {
        siteId: w.site.id,
        termId: t.go_lang?.id ?? t["go-lang"]?.id,
        visibility: "internal",
      },
    });
    expect((noScope.content as { text: string }[])[0]?.text).toMatch(/missing scope site:write/);

    // an agent never approves its own proposal, and never reclaims slugs
    const proposed = await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "Agents",
      reason: "Agent stories",
    });
    const pending = (await w.approvals.list({ siteId: w.site.id, status: "pending" })).length;
    const own = await call("review_term", {
      siteId: w.site.id,
      termId: (proposed.out.term as unknown as Term).id,
      decision: "approve",
    });
    expect(own.text).toMatch(/^denied: an agent cannot approve a term it proposed/);
    const reclaim = await call("rename_term", {
      siteId: w.site.id,
      termId: t.javascript?.id,
      slug: "llms",
      reclaim: true,
    });
    expect(reclaim.text).toMatch(/^denied: reclaiming a slug .* people only/);
    expect((await w.approvals.list({ siteId: w.site.id, status: "pending" })).length).toBe(pending);
    // …but may ask a person to reject or merge it
    const merge = await approved("review_term", {
      siteId: w.site.id,
      termId: (proposed.out.term as unknown as Term).id,
      decision: "merge",
      mergeIntoId: t.javascript?.id,
    });
    expect(merge.prompt).toMatch(
      /^approval pending: Review proposed by Tagger \("Agent stories"\): Merge tag "Agents"/,
    );
  });

  it("people run the same structural tools; refusals carry stable codes", async () => {
    const run = direct(w, { actor: owner, scopes: ["*"] });
    const { t } = w;
    const ask = await run("set_term_parent", {
      siteId: w.site.id,
      termId: t.football?.id,
      parentId: null,
    });
    expect(ask.approvalPrompt).toBe(
      'Move category "Football" (football) from "Sports" to the top level? No URLs change.',
    );
    const moved = await run(
      "set_term_parent",
      { siteId: w.site.id, termId: t.football?.id, parentId: null },
      true,
    );
    expect((moved.result as { operation: { terms: Term[] } }).operation.terms[0]?.parentId).toBe(
      undefined,
    );
    const hidden = await run(
      "set_term_visibility",
      { siteId: w.site.id, termId: t["go-game"]?.id, visibility: "internal" },
      true,
    );
    expect((hidden.result as { operation: { terms: Term[] } }).operation.terms[0]?.visibility).toBe(
      "internal",
    );
    // a person may also reclaim; a cycle is refused with its own code
    await run(
      "set_term_parent",
      { siteId: w.site.id, termId: t.sports?.id, parentId: t.football?.id },
      true,
    );
    await expect(
      run(
        "set_term_parent",
        { siteId: w.site.id, termId: t.football?.id, parentId: t.sports?.id },
        true,
      ),
    ).rejects.toMatchObject({ code: "cycle" });

    // text edits: names, synonyms, intro
    const js = (await w.store.getTerm(t.javascript?.id as string)) as Term;
    const edited = await run("update_term", {
      siteId: w.site.id,
      termId: js.id,
      rev: js.rev,
      labels: { en: { altNames: ["JS", "ECMAScript"], description: "All about **JavaScript**." } },
    });
    expect((edited.result as { term: Term }).term.labels.en).toEqual({
      name: "JavaScript",
      altNames: ["JS", "ECMAScript"],
      description: "All about **JavaScript**.",
    });
    await expect(
      run("update_term", {
        siteId: w.site.id,
        termId: js.id,
        rev: js.rev + 1,
        labels: { en: { altNames: ["LLM"] } },
      }),
    ).rejects.toMatchObject({ code: "invalid_labels" });

    // a new taxonomy, then its archive moves (prompt shows the redirect)
    const created = await run(
      "create_taxonomy",
      {
        siteId: w.site.id,
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "propose",
        required: false,
        archive: { enabled: true, basePath: "/series" },
        feed: true,
        minEntriesToIndex: 3,
      },
      true,
    );
    const series = (created.result as { taxonomy: { id: string; rev: number } }).taxonomy;
    const move = await run("update_taxonomy", {
      siteId: w.site.id,
      taxonomyId: series.id,
      rev: series.rev,
      archive: { enabled: true, basePath: "/sequels" },
    });
    expect(move.approvalPrompt).toContain(
      'Update taxonomy "series" (archive: /series → /sequels)?',
    );
    expect(move.approvalPrompt).toContain("+ redirect /series → /sequels");
    await expect(
      run(
        "create_taxonomy",
        {
          siteId: w.site.id,
          key: "status",
          labels: { en: { singular: "S", plural: "S" } },
          hierarchical: false,
          allowNewTerms: "none",
          required: false,
          archive: { enabled: false, basePath: "/status" },
          feed: false,
          minEntriesToIndex: 3,
        },
        true,
      ),
    ).rejects.toMatchObject({ code: "reserved_key" });
  });

  it("publish prompts show assignment deltas per article", async () => {
    const run = direct(w, { actor: owner, scopes: ["*"] });
    await run("publish", { siteId: w.site.id }, true);
    const hello = (await w.store.listContentEntries(w.site.id, "posts"))[0] as ContentEntry;
    await run("update_entry", {
      siteId: w.site.id,
      entryId: hello.id,
      rev: hello.rev,
      terms: { category: { primary: "Sports" }, tag: { add: ["llm"], remove: ["cloudhal"] } },
    });
    const prompt = (await run("publish", { siteId: w.site.id })).approvalPrompt as string;
    expect(prompt).toContain(
      '~ article "Hello, world" (+category sports, primary category → Sports, +tag llm, −tag cloudhal)',
    );

    // in manual mode the update itself is described the same way
    const manual = direct(w, { actor: agent, scopes: ["*"], mode: "manual" });
    const now = (await w.store.getContentEntry(hello.id)) as ContentEntry;
    const ask = await manual("update_entry", {
      siteId: w.site.id,
      entryId: hello.id,
      rev: now.rev,
      title: "Hello again",
      terms: { tag: { set: ["JS"] } },
    });
    expect(ask.approvalPrompt).toBe(
      'Update article "Hello, world" (title → "Hello again", +tag javascript, −tag llm)?',
    );
  });

  it("auto mode never auto-publishes a term change; assignment-only edits stay article changes", async () => {
    const { call } = await mcp(w, "auto");
    await publishAsPerson(w);
    const hello = (await w.store.listContentEntries(w.site.id, "posts"))[0] as ContentEntry;
    const filed = await call("update_entry", {
      siteId: w.site.id,
      entryId: hello.id,
      rev: hello.rev,
      terms: { tag: { add: ["JavaScript"] } },
    });
    expect(filed.isError, filed.text).toBe(false);
    const low = await call("publish", { siteId: w.site.id });
    expect(low.isError, low.text).toBe(false);

    await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "Deno",
      reason: "New runtime",
    });
    const waits = await call("publish", { siteId: w.site.id });
    expect(waits.text).toMatch(
      /^approval pending: Publish "Tax Site" to production .*\n\+ term "Deno"/,
    );
    const [approval] = await w.approvals.list({ siteId: w.site.id, status: "pending" });
    expect(approval).toMatchObject({
      tool: "publish",
      autoCheck: { code: "structure", lowRisk: false },
    });
  });

  it("list_entries filters by terms (RFC-0002 §5) with actionable errors", async () => {
    const { call } = await mcp(w);
    const { t } = w;
    const cat = (id: string) => ({ ids: [id], primary: id });
    await article(w, "f1", {
      category: cat(t.news?.id as string),
      tag: { ids: [t.llm?.id as string] },
    });
    await article(w, "f2", {
      category: cat(t.football?.id as string),
      tag: { ids: [t.llm?.id as string] },
    });
    await article(w, "f3", { category: cat(t.sports?.id as string) }, "draft");
    const slugs = async (args: Record<string, unknown>) => {
      const r = await call("list_entries", { siteId: w.site.id, ...args });
      expect(r.isError, r.text).toBe(false);
      return (r.out.entries as unknown as ContentEntry[]).map((e) => e.slug).sort();
    };
    expect(await slugs({ filter: "tag:llm" })).toEqual(["f1", "f2"]);
    expect(await slugs({ filter: "category:sports>*" })).toEqual(["f2", "f3"]);
    expect(await slugs({ filter: "category:sports>*", status: ["published"] })).toEqual(["f2"]);
    expect(await slugs({ filter: "tag:llm+-primary:category:news" })).toEqual(["f2"]);
    expect(await slugs({ filter: "collection:posts+tag:[llm,cloudhal]" })).toEqual([
      "f1",
      "f2",
      "hello-world",
    ]);
    const unknown = await call("list_entries", { siteId: w.site.id, filter: "tag:llmz" });
    expect(unknown.text).toMatch(/^unknown_term: unknown term "tag:llmz" \(did you mean llm/);
    const syntax = await call("list_entries", { siteId: w.site.id, filter: "tag:" });
    expect(syntax.text).toMatch(/^invalid_filter: .*grammar/);
    const flat = await call("list_entries", { siteId: w.site.id, filter: "tag:llm>*" });
    expect(flat.text).toMatch(/^invalid_filter: "tag" is a flat taxonomy/);
  });

  it("redirect tools: agents redirect to site paths only, behind a person", async () => {
    const { call, approved } = await mcp(w);
    const external = await call("create_redirect", {
      siteId: w.site.id,
      from: "/old",
      to: "https://evil.example/landing",
    });
    expect(external.text).toMatch(/^denied: agents may only redirect to a path on this site/);
    expect(await w.approvals.list({ siteId: w.site.id, status: "pending" })).toHaveLength(0);
    const protocolRelative = await call("create_redirect", {
      siteId: w.site.id,
      from: "/old",
      to: "//evil.example",
    });
    expect(protocolRelative.isError).toBe(true);

    const made = await approved("create_redirect", {
      siteId: w.site.id,
      from: "/old",
      to: "/about",
      note: "Old about page",
    });
    expect(made.prompt).toContain('Create a 301 redirect /old → /about (exact): "Old about page"?');
    const redirect = made.out.redirect as unknown as { id: string; reason: string };
    expect(redirect.reason).toBe("manual");
    const listed = await call("list_redirects", { siteId: w.site.id });
    expect((listed.out.redirects as unknown as { from: string }[]).map((r) => r.from)).toEqual([
      "/old",
    ]);
    const served = await call("create_redirect", { siteId: w.site.id, from: "/about", to: "/" });
    expect(served.text).toMatch(/^approval pending/);

    const removed = await approved("delete_redirect", {
      siteId: w.site.id,
      redirectId: redirect.id,
    });
    expect(removed.prompt).toContain("Delete the redirect /old → /about (manual)?");
    expect(await w.store.listRedirects(w.site.id)).toHaveLength(0);
  });

  it("taxonomy_report finds sprawl: duplicates, single-use, empty and oversized categories, backlog", async () => {
    const { call } = await mcp(w);
    const { t } = w;
    const news = { ids: [t.news?.id as string], primary: t.news?.id as string };
    for (let i = 0; i < 20; i++) await article(w, `n${i}`, { category: news });
    await article(w, "single", { category: news, tag: { ids: [t.javascript?.id as string] } });
    await article(w, "uncategorised", undefined, "draft");
    await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "A-I",
      reason: "AI stories",
    });
    await call("propose_term", {
      siteId: w.site.id,
      taxonomy: "tag",
      name: "AI",
      slug: "ai-tag",
      reason: "AI again",
    });

    const r = await call("taxonomy_report", { siteId: w.site.id });
    expect(r.isError, r.text).toBe(false);
    const findings = r.out.findings as unknown as {
      kind: string;
      taxonomy: string;
      terms: { slug: string }[];
      detail: string;
    }[];
    const of = (kind: string) =>
      findings.filter((f) => f.kind === kind).map((f) => f.terms.map((x) => x.slug).join("+"));
    // source (merge away) first, the term to keep second
    expect(of("near-duplicate")).toEqual(expect.arrayContaining(["llms+llm", "ai-tag+a-i"]));
    expect(of("single-use")).toContain("javascript");
    expect(of("unused")).toContain("machine-learning");
    expect(of("empty-category")).toEqual(expect.arrayContaining(["sports", "football"]));
    expect(of("oversized-category")).toEqual(["news"]);
    expect(of("proposed")).toEqual(["a-i", "ai-tag"]);
    expect(of("no-intro")).toContain("news");
    expect(findings.find((f) => f.kind === "missing-primary")).toMatchObject({
      taxonomy: "category",
      detail: expect.stringMatching(/^1 article without a primary category/),
    });
    expect((r.out.counts as unknown as Record<string, number>).proposed).toBe(2);
    const tagsOnly = await call("taxonomy_report", { siteId: w.site.id, taxonomy: "tag" });
    expect(
      (tagsOnly.out.findings as unknown as { taxonomy: string }[]).every(
        (f) => f.taxonomy === "tag",
      ),
    ).toBe(true);
  });
});

describe("an agent on a new starter site", () => {
  it("files its article under a category (required) and publishes it with a person's approval", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Fresh", slug: "fresh" });
    expect((await store.getTaxonomyByKey(site.id, "category"))?.required).toBe(true);
    const prompts: string[] = [];
    const server = createCloudhalMcpServer({
      store,
      principal: { actor: agent, scopes: ["*"] },
      stateKey: "taxonomy-test-state-key-0123456789abcdef",
    });
    const client = new Client(
      { name: "t", version: "1" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler("elicitation/create", async (req) => {
      prompts.push(req.params.message);
      return { action: "accept", content: { confirm: true } };
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    expect(client.getInstructions()).toContain("list_taxonomies");
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await client.callTool({ name, arguments: args });
      return {
        isError: r.isError === true,
        text: (r.content as { text?: string }[])[0]?.text ?? "",
        out: r.structuredContent as Record<string, unknown>,
      };
    };

    const created = await call("create_entry", {
      siteId: site.id,
      slug: "agents-and-taxonomies",
      title: "Agents and taxonomies",
      summary: "How an agent files its work.",
      body: "An agent reuses the vocabulary.",
    });
    const entry = created.out.entry as ContentEntry;
    // without a category it cannot be published…
    const refused = await call("update_entry", {
      siteId: site.id,
      entryId: entry.id,
      rev: entry.rev,
      status: "published",
    });
    expect(refused.text).toMatch(
      /^required_term: .*call list_terms\(taxonomy: "category"\) and set terms.category.primary/,
    );
    // …so it looks the vocabulary up and files it
    const cats = await call("list_terms", { siteId: site.id, taxonomy: "category" });
    const news = (cats.out.terms as Term[])[0] as Term;
    const published = await call("update_entry", {
      siteId: site.id,
      entryId: entry.id,
      rev: entry.rev,
      status: "published",
      terms: { category: { primary: news.id }, tag: { add: ["Cloudhal"] } },
    });
    expect(published.isError, published.text).toBe(false);
    const done = await call("publish", { siteId: site.id, label: "First agent article" });
    expect(done.isError, done.text).toBe(false);
    expect(prompts[0]).toContain(
      '+ article "Agents and taxonomies" (+category news, primary category → News, +tag cloudhal)',
    );
    const live = await store.getSite(site.id);
    const snap = await store.getSnapshot(live?.publishedSnapshotId as string);
    expect(snap?.nodes.some((n) => n.id === entry.id)).toBe(true);
  });
});

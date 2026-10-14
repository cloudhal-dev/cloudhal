/**
 * RFC-0014 §3 / ADR-0028: the store keeps a block index on markdown bodies. Ids survive edits,
 * inserts and moves; provenance changes only with a block's content; clients cannot write it.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import {
  type BlockWriter,
  indexMarkdown,
  SiteGraphStore,
  seedStarterSite,
  sha256Hex,
  virtualIds,
} from "../src/index.ts";

const PERSON: BlockWriter = { actor: { kind: "human", id: "user_index00001" }, via: "studio" };
const AGENT: BlockWriter = { actor: { kind: "agent", id: "agent_index0001" }, via: "mcp" };

async function setup() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Index", slug: "index" });
  return { store, site };
}

async function article(store: SiteGraphStore, siteId: string, value: string, writer = PERSON) {
  return store.createContentEntry(
    {
      siteId,
      collection: "posts",
      slug: "indexed",
      locale: "en",
      status: "draft",
      title: "Indexed",
      body: { format: "markdown", value },
      fields: {},
      tags: [],
      author: writer.actor,
    },
    { writer },
  );
}

describe("body block index", () => {
  it("gives unindexed bodies stable content-derived ids, equal blocks told apart", async () => {
    const [a, b, c] = await Promise.all(["Same.", "Same.", "Other."].map((t) => sha256Hex(t)));
    const ids = virtualIds([a as string, b as string, c as string]).map((x) => x.id);
    expect(ids[0]).toMatch(/^blk_v[0-9a-f]{18}$/);
    expect(ids[1]).toBe(`${ids[0]}1`);
    expect(new Set(ids).size).toBe(3);
    expect(virtualIds([a as string]).map((x) => x.id)).toEqual([ids[0]]);
  });

  it("indexes a new markdown body with hashes and the writer", async () => {
    const { store, site } = await setup();
    const entry = await article(store, site.id, "# Title\n\nFirst.\n\nSecond.\n");
    expect(entry.body.profile).toBe(1);
    const blocks = entry.body.blocks ?? [];
    expect(blocks).toHaveLength(3);
    expect(blocks[1]?.hash).toBe(await sha256Hex("First."));
    for (const b of blocks) {
      expect(b.id).toMatch(/^blk_[0-9A-Za-z]{8,24}$/);
      expect(b.by).toEqual(PERSON.actor);
      expect(b.via).toBe("studio");
      expect(b.at).toBe(entry.updatedAt);
    }
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });

  it("keeps ids across edits, inserts and moves; provenance follows content", async () => {
    const { store, site } = await setup();
    const first = await article(store, site.id, "# Title\n\nFirst.\n\nSecond.\n");
    const [title, one, two] = first.body.blocks ?? [];
    // An agent edits the second paragraph and adds one at the top.
    const edited = await store.updateContentEntry(
      {
        ...first,
        body: { format: "markdown", value: "Lead.\n\n# Title\n\nFirst.\n\nSecond, edited.\n" },
      },
      { writer: AGENT },
    );
    const blocks = edited.body.blocks ?? [];
    expect(blocks.map((b) => b.id)).toEqual([expect.any(String), title?.id, one?.id, two?.id]);
    expect(blocks[0]?.id).not.toBe(title?.id);
    expect(blocks[1]).toEqual(title); // untouched: same provenance
    expect(blocks[2]).toEqual(one);
    expect(blocks[3]?.by).toEqual(AGENT.actor); // edited: same id, new author
    expect(blocks[3]?.via).toBe("mcp");
    expect(blocks[3]?.hash).toBe(await sha256Hex("Second, edited."));
    // A move keeps every id.
    const moved = await store.updateContentEntry(
      {
        ...edited,
        body: { format: "markdown", value: "# Title\n\nFirst.\n\nSecond, edited.\n\nLead.\n" },
      },
      { writer: PERSON },
    );
    expect(new Set(moved.body.blocks?.map((b) => b.id))).toEqual(new Set(blocks.map((b) => b.id)));
  });

  it("ignores an index the client sends, even a malformed one", async () => {
    const { store, site } = await setup();
    const entry = await article(store, site.id, "One.\n");
    const forged = {
      ...entry,
      body: {
        ...entry.body,
        blocks: [{ id: "not-a-block", hash: "nope", by: AGENT.actor, via: "mcp" }],
      },
    } as unknown as ContentEntry;
    const saved = await store.updateContentEntry(forged, { writer: PERSON });
    expect(saved.body.blocks).toEqual(entry.body.blocks);
  });

  it("gives HTML bodies no index", async () => {
    const { store, site } = await setup();
    const entry = await article(store, site.id, "One.\n");
    const html = await store.updateContentEntry({
      ...entry,
      body: { format: "html", value: "<p>One.</p>" },
    });
    expect(html.body.profile).toBeUndefined();
    expect(html.body.blocks).toBeUndefined();
  });

  it("indexes a page's markdown rich-text sections", async () => {
    const { store, site } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/") as Page;
    const section = {
      id: "sec_index000001",
      kind: "richText",
      format: "markdown",
      body: "## Hi\n\nThere.",
    } as Page["sections"][number];
    const saved = await store.updatePage(
      { ...home, sections: [...home.sections, section] },
      { writer: PERSON },
    );
    const indexed = saved.sections.find((s) => s.id === section.id);
    if (indexed?.kind !== "richText") throw new Error("missing section");
    expect(indexed.profile).toBe(1);
    expect(indexed.blocks?.map((b) => b.via)).toEqual(["studio", "studio"]);
  });

  it("leaves blocks written before the index without provenance until they change", async () => {
    let n = 0;
    const index = await indexMarkdown({
      markdown: "Kept.\n\nChanged now.\n",
      previousMarkdown: "Kept.\n\nChanged.\n",
      writer: AGENT,
      at: "2026-10-14T10:00:00.000Z",
      newId: () => `blk_TEST${String(++n).padStart(8, "0")}`,
    });
    expect(index.blocks?.[0]?.by).toBeUndefined();
    expect(index.blocks?.[1]?.by).toEqual(AGENT.actor);
    // Unindexed blocks have content-derived ids, kept by the first indexing write; the edited
    // block took the id of the one it replaced.
    const before = virtualIds([await sha256Hex("Kept."), await sha256Hex("Changed.")]);
    expect(index.blocks?.map((b) => b.id)).toEqual(before.map((b) => b.id));
    expect(n).toBe(0);
  });
});

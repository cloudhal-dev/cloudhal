/** RFC-0014 §5: proposals change nothing until a person accepts them, and never overwrite. */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { currentBlocks, ProposalError, SiteGraphStore, seedStarterSite } from "../src/index.ts";

const agent = { kind: "agent" as const, id: "agent_proposal01", name: "Writer" };
const person = { kind: "human" as const, id: "user_proposal001", name: "Editor" };

async function setup() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Proposals", slug: "proposals" });
  const entry = await store.createContentEntry(
    {
      siteId: site.id,
      collection: "posts",
      slug: "proposed",
      locale: "en",
      status: "draft",
      title: "Proposed",
      body: { format: "markdown", value: "# Title\n\nFirst.\n\nSecond.\n" },
      fields: {},
      tags: [],
      author: person,
    },
    { writer: { actor: person, via: "studio" } },
  );
  const blocks = await currentBlocks(entry.body.value, entry.body.blocks);
  return { store, site, entry, blocks };
}

describe("body proposals", () => {
  it("files operations without writing, then applies them as the agent on acceptance", async () => {
    const { store, site, entry, blocks } = await setup();
    const proposal = await store.proposals.create({
      siteId: site.id,
      nodeId: entry.id,
      ops: [
        { op: "replace", block: blocks[1]?.id as string, markdown: "First, better." },
        { op: "delete", block: blocks[2]?.id as string },
      ],
      actor: agent,
      note: "Tighter opening.",
    });
    expect(proposal).toMatchObject({
      status: "open",
      baseRev: entry.rev,
      note: "Tighter opening.",
    });
    expect(proposal.id).toMatch(/^prop_/);
    expect((await store.getContentEntry(entry.id))?.rev).toBe(entry.rev); // nothing written
    const preview = await store.proposals.preview(proposal);
    expect(preview.proposed).toBe("# Title\n\nFirst, better.\n");
    expect(await store.proposals.list(site.id, { nodeId: entry.id })).toHaveLength(1);

    const accepted = await store.proposals.accept(proposal.id, person);
    expect(accepted).toMatchObject({ status: "accepted", decidedBy: person, acceptedOps: [0, 1] });
    const saved = (await store.getContentEntry(entry.id)) as ContentEntry;
    expect(saved.body.value).toBe("# Title\n\nFirst, better.\n");
    expect(accepted.resultRev).toBe(saved.rev);
    const edited = saved.body.blocks?.[1];
    expect(edited?.by).toEqual(agent);
    expect(edited?.via).toBe("proposal");
    expect(saved.body.blocks?.[0]?.by).toEqual(person);
    expect(await store.proposals.list(site.id)).toEqual([]); // no longer open
    await expect(store.proposals.accept(proposal.id, person)).rejects.toMatchObject({
      code: "not_open",
    });
  });

  it("accepts some operations, and rejects", async () => {
    const { store, site, entry, blocks } = await setup();
    const ops = [
      { op: "replaceText" as const, block: blocks[1]?.id as string, find: "First", replace: "1st" },
      { op: "insert" as const, after: null, markdown: "Lead." },
    ];
    const one = await store.proposals.create({
      siteId: site.id,
      nodeId: entry.id,
      ops,
      actor: agent,
    });
    const partial = await store.proposals.accept(one.id, person, [1]);
    expect(partial).toMatchObject({ status: "partial", acceptedOps: [1] });
    expect((await store.getContentEntry(entry.id))?.body.value).toBe(
      "Lead.\n\n# Title\n\nFirst.\n\nSecond.\n",
    );
    const two = await store.proposals.create({
      siteId: site.id,
      nodeId: entry.id,
      ops,
      actor: agent,
    });
    expect(await store.proposals.reject(two.id, person)).toMatchObject({ status: "rejected" });
    await expect(store.proposals.accept(two.id, person, [9])).rejects.toBeInstanceOf(ProposalError);
  });

  it("goes stale instead of overwriting a block someone changed", async () => {
    const { store, site, entry, blocks } = await setup();
    const proposal = await store.proposals.create({
      siteId: site.id,
      nodeId: entry.id,
      ops: [{ op: "replace", block: blocks[1]?.id as string, markdown: "Agent's version." }],
      actor: agent,
    });
    await store.updateContentEntry(
      { ...entry, body: { ...entry.body, value: "# Title\n\nFirst, by a person.\n\nSecond.\n" } },
      { writer: { actor: person, via: "studio" } },
    );
    expect((await store.proposals.preview(proposal)).problem).toContain("changed");
    await expect(store.proposals.accept(proposal.id, person)).rejects.toMatchObject({
      code: "stale",
    });
    expect((await store.proposals.get(proposal.id))?.status).toBe("stale");
    expect((await store.getContentEntry(entry.id))?.body.value).toContain("First, by a person.");
  });

  it("refuses operations that do not apply when filed", async () => {
    const { store, site, entry } = await setup();
    await expect(
      store.proposals.create({
        siteId: site.id,
        nodeId: entry.id,
        ops: [{ op: "delete", block: "blk_missing00001" }],
        actor: agent,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("works on a page's rich-text section", async () => {
    const { store, site } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/") as Page;
    const section = {
      id: "sec_proposal0001",
      kind: "richText",
      format: "markdown",
      body: "Hello.",
    } as Page["sections"][number];
    const page = await store.updatePage({ ...home, sections: [...home.sections, section] });
    const target = await store.proposals.target(site.id, page.id, section.id);
    const [block] = await currentBlocks(target.markdown, target.blocks);
    const proposal = await store.proposals.create({
      siteId: site.id,
      nodeId: page.id,
      sectionId: section.id,
      ops: [{ op: "replace", block: block?.id as string, markdown: "Hello, world." }],
      actor: agent,
    });
    await store.proposals.accept(proposal.id, person);
    const saved = (await store.getPage(page.id)) as Page;
    expect(saved.sections.find((s) => s.id === section.id)).toMatchObject({
      body: "Hello, world.",
    });
  });
});

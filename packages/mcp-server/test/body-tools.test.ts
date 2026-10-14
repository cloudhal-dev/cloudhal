/** RFC-0014 §4: agents read and edit bodies by block. */
import { AuditLog, defaultScopes, PolicyEngine, scopesForMode } from "@cloudhal/agent-runtime";
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_bodytools1", name: "Body Agent" };
const person = { kind: "human" as const, id: "user_bodytools01", name: "Editor" };

interface Block {
  id: string;
  hash: string;
  type: string;
  markdown: string;
  by?: { id: string };
  via?: string;
}

describe("body tools", () => {
  let ctx: ToolContext;
  let store: SiteGraphStore;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let siteId: string;
  let entry: ContentEntry;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    siteId = (await seedStarterSite(store, { name: "Body Site", slug: "body" })).id;
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = { store, principal: { actor: agent, scopes: defaultScopes(agent) } };
    entry = await store.createContentEntry(
      {
        siteId,
        collection: "posts",
        slug: "blocks",
        locale: "en",
        status: "draft",
        title: "Blocks",
        body: { format: "markdown", value: "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n" },
        fields: {},
        tags: [],
        author: person,
      },
      { writer: { actor: person, via: "studio" } },
    );
  });

  const call = (name: string, args: Record<string, unknown>) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, audit, confirmed: false });
  const read = async () =>
    (await call("get_body", { siteId, entryId: entry.id })).result as {
      rev: number;
      markdown: string;
      blocks: Block[];
    };

  it("reads a body as blocks with their authors", async () => {
    const body = await read();
    expect(body.rev).toBe(entry.rev);
    expect(body.blocks.map((b) => [b.type, b.markdown])).toEqual([
      ["heading", "# Title"],
      ["paragraph", "First paragraph."],
      ["paragraph", "Second paragraph."],
    ]);
    expect(body.blocks[0]?.by?.id).toBe(person.id);
    expect(body.blocks[0]?.id).toBe(entry.body.blocks?.[0]?.id);
  });

  it("edits one block, keeps the others and their authors, and snapshots", async () => {
    const body = await read();
    const [, one, two] = body.blocks;
    const res = await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops: [
        { op: "replaceText", block: two?.id, find: "Second", replace: "2nd" },
        { op: "insert", after: one?.id, markdown: "Inserted." },
      ],
    });
    const out = res.result as {
      rev: number;
      changed: string[];
      added: string[];
      removed: string[];
      words: { added: number; removed: number };
      snapshot: { id: string };
    };
    expect(out.changed).toEqual([two?.id]);
    expect(out.added).toHaveLength(1);
    expect(out.removed).toEqual([]);
    expect(out.snapshot.id).toMatch(/^snap_/);
    const saved = (await store.getContentEntry(entry.id)) as ContentEntry;
    expect(saved.body.value).toBe("# Title\n\nFirst paragraph.\n\nInserted.\n\n2nd paragraph.\n");
    const blocks = saved.body.blocks ?? [];
    expect(blocks[1]?.by).toEqual(person); // untouched
    expect(blocks[3]?.id).toBe(two?.id);
    expect(blocks[3]?.by).toEqual(agent);
    expect(blocks[3]?.via).toBe("mcp");
  });

  it("rebases a stale rev only when the named blocks are unchanged", async () => {
    const body = await read();
    const [title, one, two] = body.blocks;
    // Someone else edits the title in between.
    await store.updateContentEntry(
      {
        ...entry,
        body: { ...entry.body, value: "# New title\n\nFirst paragraph.\n\nSecond paragraph.\n" },
      },
      { writer: { actor: person, via: "studio" } },
    );
    // Without ifHash the server cannot tell: conflict.
    await expect(
      call("edit_body", {
        siteId,
        entryId: entry.id,
        rev: body.rev,
        ops: [{ op: "delete", block: two?.id }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // With the hash it read, the edit lands on the newer body.
    await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops: [{ op: "delete", block: two?.id, ifHash: two?.hash }],
    });
    expect((await store.getContentEntry(entry.id))?.body.value).toBe(
      "# New title\n\nFirst paragraph.\n",
    );
    // A block someone changed is a conflict.
    const fresh = await read();
    await expect(
      call("edit_body", {
        siteId,
        entryId: entry.id,
        rev: fresh.rev,
        ops: [{ op: "replace", block: title?.id, ifHash: title?.hash, markdown: "# X" }],
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/conflict|not_found/) });
    expect(one).toBeDefined();
  });

  it("edits a page's rich-text section and refuses other sections", async () => {
    const home = (await store.listPages(siteId)).find((p) => p.path === "/") as Page;
    const section = {
      id: "sec_bodytool0001",
      kind: "richText",
      format: "markdown",
      body: "Hello there.",
    } as Page["sections"][number];
    const page = await store.updatePage({ ...home, sections: [...home.sections, section] });
    const got = (await call("get_body", { siteId, pageId: page.id, sectionId: section.id }))
      .result as { rev: number; blocks: Block[] };
    await call("edit_body", {
      siteId,
      pageId: page.id,
      sectionId: section.id,
      rev: got.rev,
      ops: [{ op: "replace", block: got.blocks[0]?.id, markdown: "Hello, world." }],
    });
    const saved = (await store.getPage(page.id)) as Page;
    expect(saved.sections.find((s) => s.id === section.id)).toMatchObject({
      body: "Hello, world.",
    });
    const hero = page.sections.find((s) => s.kind === "hero");
    if (hero)
      await expect(
        call("get_body", { siteId, pageId: page.id, sectionId: hero.id }),
      ).rejects.toMatchObject({ code: "invalid" });
  });

  it("files a proposal instead of writing, in plan mode too", async () => {
    const body = await read();
    const planner: ToolContext = {
      ...ctx,
      principal: { actor: agent, scopes: scopesForMode("plan"), mode: "plan" },
    };
    const callAs = (c: ToolContext, args: Record<string, unknown>) =>
      runTool(byName.edit_body as (typeof tools)[number], args, c, { policy, audit });
    const ops = [
      { op: "replaceText", block: body.blocks[1]?.id, find: "First", replace: "Opening" },
    ];
    // a plan key may not write…
    const denied = await callAs(planner, { siteId, entryId: entry.id, rev: body.rev, ops });
    expect(denied).toMatchObject({ decision: { kind: "deny", code: "missing_scope" } });
    // …but may propose.
    const res = await callAs(planner, {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops,
      mode: "propose",
      note: "A stronger opening.",
    });
    const { proposal } = res.result as { proposal: { id: string; status: string } };
    expect(proposal.status).toBe("open");
    expect((await store.getContentEntry(entry.id))?.rev).toBe(entry.rev);
    const stored = await store.proposals.get(proposal.id);
    expect(stored).toMatchObject({ actor: agent, note: "A stronger opening.", nodeId: entry.id });
    await store.proposals.accept(proposal.id, person);
    expect((await store.getContentEntry(entry.id))?.body.value).toContain("Opening paragraph.");
  });

  it("diffs a node between its live version and its draft", async () => {
    const snap = await store.createSnapshot(siteId, { actor: person, reason: "manual" });
    await store.publish(
      (await store.getSite(siteId)) as NonNullable<Awaited<ReturnType<typeof store.getSite>>>,
      snap.id,
    );
    const body = await read();
    await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops: [{ op: "replaceText", block: body.blocks[1]?.id, find: "First", replace: "Opening" }],
    });
    const diff = (await call("diff_node", { siteId, nodeId: entry.id })).result as {
      from: string;
      to: string;
      fields: string[];
      bodies: { field: string; counts: { changed: number } }[];
    };
    expect(diff.from).toBe(snap.id);
    expect(diff.to).toBe("draft");
    expect(diff.fields).toContain("body");
    expect(diff.bodies[0]).toMatchObject({ field: "body", counts: { changed: 1 } });
  });

  it("lists block types and inserts, reads and changes typed blocks for the agent (RFC-0015)", async () => {
    const types = (await call("list_block_types", { siteId, where: "body" })).result as {
      types: { name: string; content: string }[];
    };
    expect(types.types.map((t) => t.name)).toEqual(["callout", "button", "embed"]);
    expect(types.types[0]?.content).toBe("markdown");

    const body = await read();
    const [, one] = body.blocks;
    await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops: [
        {
          op: "insertBlock",
          after: one?.id,
          type: "callout",
          props: { tone: "warning", title: 'Say "hi"' },
          markdown: "Back up **first**.",
        },
        { op: "insertBlock", after: null, type: "button", props: { label: "Go", href: "/go" } },
      ],
    });
    let saved = (await store.getContentEntry(entry.id)) as ContentEntry;
    expect(saved.body.value).toBe(
      '::button{label="Go" href="/go"}\n\n# Title\n\nFirst paragraph.\n\n:::callout{tone="warning" title="Say \\"hi\\""}\nBack up **first**.\n:::\n\nSecond paragraph.\n',
    );

    const after = await read();
    const callout = after.blocks.find((b) => b.type === "directive:callout") as Block & {
      props: Record<string, unknown>;
    };
    expect(callout.props).toEqual({ tone: "warning", title: 'Say "hi"' });
    await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: after.rev,
      ops: [{ op: "setProps", block: callout.id, props: { tone: "success", title: null } }],
    });
    saved = (await store.getContentEntry(entry.id)) as ContentEntry;
    expect(saved.body.value).toContain(':::callout{tone="success"}\nBack up **first**.\n:::');

    // Props that do not fit, unknown types and syntax mistakes are refused before anything is written.
    const now = await read();
    for (const op of [
      {
        op: "insertBlock",
        after: null,
        type: "button",
        props: { label: "Go", href: "javascript:x" },
      },
      { op: "insertBlock", after: null, type: "pricing-table", props: {} },
      {
        op: "insertBlock",
        after: null,
        type: "button",
        props: { label: "Go", href: "/" },
        markdown: "x",
      },
      { op: "setProps", block: now.blocks[1]?.id, props: { tone: "info" } },
    ])
      await expect(
        call("edit_body", { siteId, entryId: entry.id, rev: now.rev, ops: [op] }),
      ).rejects.toMatchObject({ code: "invalid" });
  });

  it("reports block types the site does not know, and keeps them", async () => {
    const body = await read();
    const res = await call("edit_body", {
      siteId,
      entryId: entry.id,
      rev: body.rev,
      ops: [{ op: "insert", after: null, markdown: '::pricing-table{plan="pro"}' }],
    });
    expect((res.result as { unknownBlocks?: string[] }).unknownBlocks).toEqual(["pricing-table"]);
  });

  it("reads and changes the theme's design settings, checked against its schema (RFC-0017)", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const s2 = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      themeSettings: {
        type: "object",
        additionalProperties: false,
        properties: {
          brand: { type: "string", format: "color", default: "#18181b" },
          surface: { type: "string", format: "color", default: "#ffffff" },
        },
        "x-contrast": [["brand", "surface", 3]],
      },
    });
    const site2 = (await seedStarterSite(s2, { name: "Look", slug: "look" })).id;
    const ctx2: ToolContext = {
      store: s2,
      principal: { actor: agent, scopes: ["*"], mode: "edits" },
    };
    const run = (name: string, args: Record<string, unknown>) =>
      runTool(byName[name] as (typeof tools)[number], args, ctx2, {
        policy,
        audit,
        confirmed: true,
      });
    const got = (await run("get_theme_settings", { siteId: site2 })).result as {
      schema: { properties: Record<string, unknown> };
      values: Record<string, unknown>;
      rev: number;
    };
    expect(Object.keys(got.schema.properties)).toEqual(["brand", "surface"]);
    expect(got.values).toEqual({});
    await expect(
      run("set_theme_settings", { siteId: site2, rev: got.rev, values: { brand: "#f4f4f5" } }),
    ).rejects.toMatchObject({ code: "invalid_props" });
    const set = (
      await run("set_theme_settings", { siteId: site2, rev: got.rev, values: { brand: "#1d4ed8" } })
    ).result as { values: Record<string, unknown> };
    expect(set.values).toEqual({ brand: "#1d4ed8" });
    expect(byName.set_theme_settings?.requiresApproval).toBe(true);
  });
});

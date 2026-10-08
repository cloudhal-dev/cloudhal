/** The newsroom is published the way any agent would do it: MCP tools, snapshots, human approval. */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { createCloudhalMcpServer } from "@cloudhal/mcp-server";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { parsePost, runEditorAgent } from "../scripts/editor-agent.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function setup(answer: "accept" | "decline") {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Starter", slug: "newsroom" });
  const audit = new AuditLog(sql);
  const server = createCloudhalMcpServer({
    store,
    audit,
    principal: {
      actor: { kind: "agent", id: "agent_newsroom01", name: "Newsroom editor" },
      scopes: ["*"],
    },
    stateKey: "newsroom-test-key-at-least-thirty-two-bytes",
  });
  const prompts: string[] = [];
  const client = new Client(
    { name: "t", version: "1" },
    { capabilities: { elicitation: { form: {} } } },
  );
  client.setRequestHandler("elicitation/create", async (req) => {
    prompts.push(req.params.message);
    return answer === "accept"
      ? { action: "accept", content: { confirm: true } }
      : { action: "decline" };
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  return { store, site, audit, client, prompts };
}

const run = (client: Client, publish = true) =>
  runEditorAgent({
    client,
    postsDir: path.join(ROOT, "content/posts"),
    siteFile: path.join(ROOT, "content/site.md"),
    publish,
    log: () => {},
  });

describe("newsroom editor agent", () => {
  it("parses every post in content/", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const files = (await readdir(path.join(ROOT, "content/posts"))).filter((f) =>
      f.endsWith(".md"),
    );
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const f of files) {
      const post = parsePost(await readFile(path.join(ROOT, "content/posts", f), "utf8"));
      expect(`${post.slug}.md`).toBe(f);
      expect(post.body.length).toBeGreaterThan(200);
    }
  });

  it("writes the newsroom through MCP and publishes only after approval", async () => {
    const { store, site, audit, client, prompts } = await setup("accept");
    const r = await run(client);
    const slugs = (await readdir(path.join(ROOT, "content/posts")))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(r.created.sort()).toEqual(slugs);
    expect(r.published).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/^Publish "Starter" to production/);

    const live = await store.getSite(site.id);
    expect(live?.publishedSnapshotId).toBeDefined();
    const posts = await store.listContentEntries(site.id, "posts");
    expect(
      posts
        .filter((p) => p.status === "published")
        .map((p) => p.slug)
        .sort(),
    ).toEqual(slugs);
    expect(posts.find((p) => p.slug === "hello-world")?.status).toBe("archived");
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    expect(home?.title).toBe("Cloudhal Newsroom");
    // every mutation snapshotted, and the agent is the recorded author
    const snaps = await store.listSnapshots(site.id, 100);
    expect(snaps.filter((s) => s.reason === "agentMutation").length).toBeGreaterThanOrEqual(11);
    expect(posts.find((p) => p.slug === "studio-on-kumo")?.author.id).toBe("agent_newsroom01");
    expect(
      (await audit.list({ siteId: site.id, limit: 200 })).some(
        (a) => a.tool === "publish" && a.outcome === "ok",
      ),
    ).toBe(true);

    // re-running with nothing new changes nothing and does not ask to publish again
    const snapshotsBefore = (await store.listSnapshots(site.id, 200)).length;
    const again = await run(client);
    expect(again).toMatchObject({
      created: [],
      updated: [],
      archived: [],
      homeUpdated: false,
      published: false,
    });
    expect(prompts).toHaveLength(1);
    expect((await store.listSnapshots(site.id, 200)).length).toBe(snapshotsBefore);
  });

  it("never archives content a person wrote", async () => {
    const { store, site, client } = await setup("decline");
    const mine = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "my-draft",
      locale: "en",
      status: "draft",
      title: "My draft",
      body: { format: "markdown", value: "" },
      fields: {},
      tags: [],
      author: { kind: "human", id: "user_owner000001" },
    });
    const r = await run(client, false);
    expect(r.archived).toEqual(["hello-world"]);
    expect((await store.getContentEntry(mine.id))?.status).toBe("draft");
  });

  it("does not publish when the person declines", async () => {
    const { store, site, client } = await setup("decline");
    const r = await run(client);
    expect(r.published).toBe(false);
    expect((await store.getSite(site.id))?.publishedSnapshotId).toBeUndefined();
  });
});

describe("newsroom editor agent with Studio approvals", () => {
  it("waits for a person and publishes once approved", async () => {
    const { ApprovalStore } = await import("@cloudhal/agent-runtime");
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Starter", slug: "newsroom" });
    const approvals = new ApprovalStore(sql);
    const server = createCloudhalMcpServer({
      store,
      approvals,
      principal: {
        actor: { kind: "agent", id: "agent_newsroom01", name: "Newsroom editor" },
        scopes: ["*"],
      },
      stateKey: "newsroom-test-key-at-least-thirty-two-bytes",
    });
    const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    // a person approves the first pending request shortly after it appears
    const approver = setInterval(async () => {
      const [pending] = await approvals.list({ siteId: site.id, status: "pending" });
      if (pending)
        await approvals.decide(pending.id, "approved", { kind: "human", id: "user_owner000001" });
    }, 20);
    try {
      const r = await runEditorAgent({
        client,
        postsDir: path.join(ROOT, "content/posts"),
        siteFile: path.join(ROOT, "content/site.md"),
        publish: true,
        approvalPollMs: 25,
        approvalWaitMs: 5000,
        log: () => {},
      });
      expect(r.published).toBe(true);
      expect((await store.getSite(site.id))?.publishedSnapshotId).toBeDefined();
      expect((await approvals.list({ siteId: site.id }))[0]?.status).toBe("consumed");
    } finally {
      clearInterval(approver);
    }
  });
});

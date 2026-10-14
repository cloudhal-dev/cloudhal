/** Endpoints the Studio's activity feed and live preview pane use. */
import { AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const human = { kind: "human" as const, id: "user_studio00001", name: "Halil" };
const agent = { kind: "agent" as const, id: "agent_studio0001", name: "Newsroom bot" };

async function setup(withAudit = true) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Studio Site", slug: "studio" });
  const audit = new AuditLog(sql);
  const app = createApi({
    store,
    resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
    ...(withAudit ? { audit } : {}),
  });
  const get = (path: string) => app.request(path, { headers: { "x-test-user": "1" } });
  return { store, site, audit, app, get };
}

describe("activity", () => {
  it("lists audit rows newest first with actor names and cursor paging", async () => {
    const { site, audit, get, app } = await setup();
    for (let i = 0; i < 3; i++)
      await audit.record({
        at: new Date(Date.UTC(2026, 9, 8, 10, i)).toISOString(),
        actor: i === 2 ? human : agent,
        siteId: site.id,
        tool: ["create_entry", "preview_page", "publish"][i] as string,
        decision: i === 2 ? "approval-required" : "allow",
        outcome: i === 2 ? "pending" : "ok",
      });
    await audit.record({
      at: new Date().toISOString(),
      actor: agent,
      siteId: "site_other0000001",
      tool: "list_pages",
      decision: "allow",
    });

    expect((await app.request(`/api/sites/${site.id}/activity`)).status).toBe(401);
    const first = await get(`/api/sites/${site.id}/activity?limit=2`);
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as {
      items: { id: number; tool: string; actor: { name?: string } }[];
      nextBefore: number | null;
    };
    expect(page1.items.map((r) => r.tool)).toEqual(["publish", "preview_page"]);
    expect(page1.items[0]?.actor.name).toBe("Halil");
    expect(page1.nextBefore).toBe(page1.items[1]?.id);
    const page2 = (await (
      await get(`/api/sites/${site.id}/activity?limit=2&before=${page1.nextBefore}`)
    ).json()) as typeof page1;
    expect(page2.items.map((r) => r.tool)).toEqual(["create_entry"]);
    expect(page2.nextBefore).toBeNull();
    const byActor = (await (
      await get(`/api/sites/${site.id}/activity?actorId=${human.id}`)
    ).json()) as typeof page1;
    expect(byActor.items).toHaveLength(1);
    expect((await get(`/api/sites/${site.id}/activity?limit=0`)).status).toBe(400);
    expect((await get("/api/sites/site_missing000001/activity")).status).toBe(404);
  });

  it("is 404 when the server keeps no audit log", async () => {
    const { site, get } = await setup(false);
    expect((await get(`/api/sites/${site.id}/activity`)).status).toBe(404);
  });
});

describe("preview", () => {
  it("renders pages and entries as sandboxed, uncached HTML (drafts included)", async () => {
    const { store, site, get } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    const res = await get(`/api/sites/${site.id}/pages/${home?.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("Studio Site");

    const draft = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "draft-one",
      locale: "en",
      status: "draft",
      title: "Draft <one>",
      body: { format: "markdown", value: "# Draft body" },
      fields: {},
      tags: [],
      author: human,
    });
    const entryHtml = await (await get(`/api/sites/${site.id}/entries/${draft.id}/preview`)).text();
    expect(entryHtml).toContain("<h1>Draft body</h1>");
    expect(entryHtml).toContain("Draft &lt;one&gt;");
    expect((await get(`/api/sites/${site.id}/entries/entry_missing00001/preview`)).status).toBe(
      404,
    );
  });
});

describe("draft preview", () => {
  const post = (app: Awaited<ReturnType<typeof setup>>["app"], path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("renders an article's unsaved title and body without writing anything", async () => {
    const { store, site, app } = await setup();
    const entry = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "saved-one",
      locale: "en",
      status: "draft",
      title: "Saved title",
      body: { format: "markdown", value: "Saved body" },
      fields: {},
      tags: [],
      author: human,
    });
    const path = `/api/sites/${site.id}/entries/${entry.id}/preview`;
    const res = await post(app, path, {
      title: "Unsaved <title>",
      summary: "Unsaved summary",
      body: { format: "markdown", value: "## Unsaved heading\n\n<script>x()</script>" },
      // Mistyped fields are dropped, never an error: the draft still previews.
      coverImage: { src: 42 },
      slug: "ignored",
    });
    expect(res.status).toBe(200);
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain("Unsaved &lt;title&gt;");
    expect(html).toContain("<h2>Unsaved heading</h2>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Saved body");
    // Nothing was written.
    const after = await store.getContentEntry(entry.id);
    expect(after?.title).toBe("Saved title");
    expect(after?.rev).toBe(entry.rev);
    // An empty or broken request previews the saved entry.
    const empty = await app.request(path, {
      method: "POST",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: "not json",
    });
    expect(((await empty.json()) as { html: string }).html).toContain("Saved body");
    expect(
      (await post(app, `/api/sites/${site.id}/entries/entry_missing00001/preview`, {})).status,
    ).toBe(404);
  });

  it("renders a page's unsaved sections, keeping only valid ones", async () => {
    const { store, site, app } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const path = `/api/sites/${site.id}/pages/${home.id}/preview`;
    const res = await post(app, path, {
      title: "Home draft",
      sections: [
        { id: "sec_draft0000001", kind: "richText", format: "markdown", body: "Draft **section**" },
        { id: "bad", kind: "nope" },
      ],
    });
    expect(res.status).toBe(200);
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain("<strong>section</strong>");
    expect(html).not.toContain("nope");
    expect((await store.getPage(home.id))?.rev).toBe(home.rev);
  });
});

describe("snapshot nodes", () => {
  it("returns a node as a snapshot holds it, and 404s outside it", async () => {
    const { store, site, get } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const snap = await store.createSnapshot(site.id, { reason: "manual", actor: human });
    await store.updatePage({ ...home, title: "Changed later" });
    const res = await get(`/api/sites/${site.id}/snapshots/${snap.id}/nodes/${home.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { title: string }).title).toBe(home.title);
    expect(
      (await get(`/api/sites/${site.id}/snapshots/${snap.id}/nodes/page_missing0001`)).status,
    ).toBe(404);
    expect(
      (await get(`/api/sites/site_other000001/snapshots/${snap.id}/nodes/${home.id}`)).status,
    ).toBe(404);
  });
});

describe("body proposals", () => {
  const agentActor = { kind: "agent" as const, id: "agent_proposal01", name: "Writer" };
  const post = (app: Awaited<ReturnType<typeof setup>>["app"], path: string, body: unknown = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("lists open proposals with their diff, and accepts, rejects or reports them stale", async () => {
    const { store, site, app, get } = await setup();
    const entry = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "proposed",
      locale: "en",
      status: "draft",
      title: "Proposed",
      body: { format: "markdown", value: "First.\n\nSecond.\n" },
      fields: {},
      tags: [],
      author: human,
    });
    const blocks = entry.body.blocks ?? [];
    const propose = (markdown: string) =>
      store.proposals.create({
        siteId: site.id,
        nodeId: entry.id,
        ops: [{ op: "replace", block: blocks[0]?.id as string, markdown }],
        actor: agentActor,
        note: "Better",
      });
    const one = await propose("First, better.");
    const two = await propose("First, other.");
    const base = `/api/sites/${site.id}/proposals`;
    const listed = (await (await get(`${base}?nodeId=${entry.id}`)).json()) as {
      items: { proposal: { id: string }; diff?: { words: { added: number } } }[];
    };
    expect(listed.items.map((i) => i.proposal.id).sort()).toEqual([one.id, two.id].sort());
    expect(listed.items[0]?.diff?.words.added).toBeGreaterThan(0);

    const accepted = await post(app, `${base}/${one.id}/accept`);
    expect(accepted.status).toBe(200);
    expect((await store.getContentEntry(entry.id))?.body.value).toBe("First, better.\n\nSecond.\n");
    // The second proposal targeted the same block: it is stale now, never applied.
    const stale = await post(app, `${base}/${two.id}/accept`);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe("stale");
    // A new proposal is read against the body as it is now; rejecting it changes nothing.
    const three = await propose("Something else.");
    const rejected = await post(app, `${base}/${three.id}/reject`);
    expect(rejected.status).toBe(200);
    expect((await store.getContentEntry(entry.id))?.body.value).toBe("First, better.\n\nSecond.\n");
    expect((await post(app, `${base}/${three.id}/accept`)).status).toBe(409);
    expect((await post(app, `${base}/prop_missing000001/accept`)).status).toBe(404);
  });
});

describe("preview links", () => {
  it("mints signed links for drafts and snapshots on the site's primary domain", async () => {
    const { verifyPreviewToken } = await import("@cloudhal/core-ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const seeded = await seedStarterSite(store, { name: "Links", slug: "links" });
    const secret = "api-preview-secret-at-least-32-bytes-long";
    const app = createApi({
      store,
      resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      preview: { secret },
    });
    const post = (body: unknown) =>
      app.request(`/api/sites/${seeded.id}/preview-links`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "1" },
        body: JSON.stringify(body),
      });

    const noDomain = (await (await post({})).json()) as { url: string | null; token: string };
    expect(noDomain.url).toBeNull();
    expect((await verifyPreviewToken(secret, noDomain.token, seeded.id)).target).toBe("live");

    const site = await store.getSite(seeded.id);
    await store.updateSite({
      ...(site as NonNullable<typeof site>),
      domains: [{ hostname: "news.example.com", primary: true }],
    });
    const snap = await store.createSnapshot(seeded.id, { actor: human, reason: "manual" });
    const res = await post({ target: { snapshot: snap.id }, path: "/about", ttlSeconds: 300 });
    expect(res.status).toBe(201);
    const link = (await res.json()) as { url: string; token: string; expiresAt: string };
    expect(link.url).toMatch(/^https:\/\/news\.example\.com\/about\?cloudhal-preview=/);
    expect((await verifyPreviewToken(secret, link.token, seeded.id)).target).toEqual({
      snapshot: snap.id,
    });
    expect(Date.parse(link.expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);

    expect((await post({ target: { snapshot: "snap_missing000001" } })).status).toBe(404);
    expect((await post({ target: 42 })).status).toBe(400);
    expect(
      (await app.request(`/api/sites/${seeded.id}/preview-links`, { method: "POST" })).status,
    ).toBe(401);
  });
});

describe("instance and skills", () => {
  it("report sign-up mode, features and the skills agents see", async () => {
    const { loadSkills } = await import("@cloudhal/agent-runtime");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const skillsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../skills/official",
    );
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const app = createApi({
      store,
      resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      signUp: "first-user",
      mcp: {
        stateKey: "instance-test-state-key-0123456789abcdef",
        skills: await loadSkills(skillsDir),
      },
    });
    expect((await app.request("/api/instance")).status).toBe(401);
    const info = await (
      await app.request("/api/instance", { headers: { "x-test-user": "1" } })
    ).json();
    expect(info).toEqual({
      signUp: "first-user",
      features: {
        agentKeys: false,
        mcp: true,
        activity: false,
        previewLinks: false,
        deployTransfer: false,
        approvals: false,
        elevationRequests: false,
        members: false,
        // RFC-0007 §12: a server without comment storage says so
        comments: {
          available: false,
          protection: [],
          aiLabels: false,
          keys: false,
          purge: { pending: 0 },
        },
        // RFC-0008 §13: a server without schedules says so
        schedules: {
          available: false,
          scheduler: null,
          gates: false,
          automations: false,
          publishNow: false,
          limits: { maxItems: 100, horizonDays: 366, requestHorizonDays: 30, lateMinutes: 60 },
        },
        // RFC-0006 §8: a server without analytics says so
        analytics: {
          enabled: false,
          store: "none",
          reader: "none",
          liveDays: 92,
          budget: null,
          rollups: "scheduled",
          defaults: {
            enabled: false,
            uniqueVisitors: false,
            vitalsOneIn: 5,
            rollupRetentionDays: null,
          },
        },
      },
      agentModes: {
        modes: ["plan", "manual", "edits", "auto"],
        default: "edits",
        scopes: {
          plan: [
            "site:read",
            "content:read",
            "preview:create",
            "analytics:read",
            "comments:read",
            "schedules:read",
            "content:propose",
          ],
          manual: [
            "site:read",
            "content:read",
            "preview:create",
            "analytics:read",
            "comments:read",
            "schedules:read",
            "content:write",
            "asset:upload",
            "site:publish",
            "site:rollback",
            "schedules:write",
          ],
          edits: [
            "site:read",
            "content:read",
            "preview:create",
            "analytics:read",
            "comments:read",
            "schedules:read",
            "content:write",
            "asset:upload",
            "site:publish",
            "site:rollback",
            "schedules:write",
          ],
          auto: [
            "site:read",
            "content:read",
            "preview:create",
            "analytics:read",
            "comments:read",
            "schedules:read",
            "content:write",
            "asset:upload",
            "site:publish",
            "site:rollback",
            "schedules:write",
          ],
        },
        autoPublishLimit: 20,
        elevation: { minMinutes: 5, maxMinutes: 1440, noticeMinutes: 10 },
      },
      roles: expect.objectContaining({
        names: ["owner", "administrator", "editor", "author", "contributor"],
        modeCaps: {
          owner: "auto",
          administrator: "auto",
          editor: "auto",
          author: "auto",
          contributor: "edits",
        },
      }),
      invites: {
        defaultHours: 168,
        minHours: 1,
        maxHours: 336,
        adminMaxHours: 72,
        delivery: ["link"],
      },
      // RFC-0011: no mail sender, so only Administrator-issued reset links
      passwordReset: ["admin"],
    });
    const skills = (await (
      await app.request("/api/skills", { headers: { "x-test-user": "1" } })
    ).json()) as {
      name: string;
      approval: string[];
      resource: string;
      references: string[];
    }[];
    expect(skills.map((s) => s.name)).toEqual([
      "comment-triage",
      "publish-article",
      "rollback",
      "safe-edit",
      "site-bootstrap",
      "stale-review",
    ]);
    expect(skills.find((s) => s.name === "rollback")?.approval).toContain("rollback");
    expect(skills.find((s) => s.name === "publish-article")).toMatchObject({
      resource: "skill://publish-article/SKILL.md",
      references: ["editorial-checklist.md"],
    });
  });
});

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
    expect(html).toContain('<h2 id="unsaved-heading">Unsaved heading</h2>');
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

  it("describes each operation, previews a choice of them, accepts that choice and audits it", async () => {
    const { store, site, app, get, audit } = await setup();
    const entry = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "chosen",
      locale: "en",
      status: "draft",
      title: "Chosen",
      body: { format: "markdown", value: "First.\n\nSecond.\n" },
      fields: {},
      tags: [],
      author: human,
    });
    const [first, second] = entry.body.blocks ?? [];
    const proposal = await store.proposals.create({
      siteId: site.id,
      nodeId: entry.id,
      ops: [
        { op: "replaceText", block: first?.id as string, find: "First", replace: "Opening" },
        { op: "delete", block: second?.id as string },
      ],
      actor: agentActor,
    });
    const base = `/api/sites/${site.id}/proposals`;
    const listed = (await (await get(`${base}?nodeId=${entry.id}`)).json()) as {
      items: { steps: unknown[] }[];
    };
    expect(listed.items[0]?.steps).toEqual([
      { op: "replaceText", before: "First", after: "Opening" },
      { op: "delete", before: "Second." },
    ]);
    const preview = (await (
      await post(app, `${base}/${proposal.id}/preview`, { ops: [1] })
    ).json()) as {
      diff: { words: { added: number; removed: number } };
    };
    expect(preview.diff.words).toEqual({ added: 0, removed: 1 });
    expect((await post(app, `${base}/${proposal.id}/preview`, { ops: "all" })).status).toBe(400);
    expect((await post(app, `${base}/${proposal.id}/preview`, { ops: [] })).status).toBe(400);

    const accepted = await post(app, `${base}/${proposal.id}/accept`, { ops: [0] });
    expect(((await accepted.json()) as { proposal: { status: string } }).proposal.status).toBe(
      "partial",
    );
    expect((await store.getContentEntry(entry.id))?.body.value).toBe("Opening.\n\nSecond.\n");
    const rows = await audit.list({ siteId: site.id });
    expect(rows[0]).toMatchObject({
      actor: human,
      tool: "edit_body",
      decision: "allow",
      reason: `accepted proposal ${proposal.id} from Writer`,
      input: { proposalId: proposal.id, nodeId: entry.id, ops: [0] },
    });
  });
});

describe("block types (RFC-0015)", () => {
  it("lists the registry and refuses component props that do not fit", async () => {
    const { store, site, app, get } = await setup();
    const listed = (await (await get(`/api/sites/${site.id}/block-types`)).json()) as {
      types: { name: string; where: string[] }[];
    };
    expect(listed.types.map((t) => t.name)).toEqual(["callout", "button", "embed", "faq"]);
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const res = await app.request(`/api/sites/${site.id}/pages/${home.id}`, {
      method: "PUT",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify({
        ...home,
        sections: [
          ...home.sections,
          { id: "sec_block000001", kind: "component", type: "faq", props: { items: [] } },
        ],
      }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: "invalid_props",
      details: { type: "faq", issues: [{ path: "items", message: "at least 1 item" }] },
    });
  });
});

describe("PATCH body (RFC-0014 §4)", () => {
  const patch = (app: Awaited<ReturnType<typeof setup>>["app"], path: string, body: unknown) =>
    app.request(path, {
      method: "PATCH",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("applies block operations to an article body in one write, and refuses bad ones", async () => {
    const { store, site, app } = await setup();
    const entry = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "patched",
      locale: "en",
      status: "draft",
      title: "Patched",
      body: { format: "markdown", value: "First.\n\nSecond.\n" },
      fields: {},
      tags: [],
      author: human,
    });
    const [first, second] = entry.body.blocks ?? [];
    const url = `/api/sites/${site.id}/entries/${entry.id}/body`;
    const res = await patch(app, url, {
      rev: entry.rev,
      ops: [
        { op: "replace", block: first?.id, markdown: "First, edited." },
        { op: "insert", after: second?.id, markdown: "Third." },
      ],
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { rev: number; changed: string[]; added: string[] };
    expect(result.changed).toEqual([first?.id]);
    expect(result.added).toHaveLength(1);
    const saved = await store.getContentEntry(entry.id);
    expect(saved?.body.value).toBe("First, edited.\n\nSecond.\n\nThird.\n");
    expect(saved?.rev).toBe(result.rev);
    expect(saved?.body.blocks?.[0]).toMatchObject({ by: human, via: "studio" });

    // A stale rev without ifHash is a conflict; a malformed op names its index.
    const stale = await patch(app, url, {
      rev: entry.rev,
      ops: [{ op: "delete", block: second?.id }],
    });
    expect(stale.status).toBe(409);
    const bad = await patch(app, url, {
      rev: result.rev,
      ops: [
        { op: "delete", block: second?.id },
        { op: "replace", block: first?.id },
      ],
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid", details: { op: 1 } });
    expect((await patch(app, url, { ops: [] })).status).toBe(400);
    expect(
      (
        await patch(app, `/api/sites/${site.id}/entries/entry_missing000001/body`, {
          rev: 1,
          ops: [{ op: "delete", block: second?.id }],
        })
      ).status,
    ).toBe(404);
  });

  it("edits a page's markdown rich-text section", async () => {
    const { store, site, app } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const page = await store.updatePage({
      ...home,
      sections: [
        ...home.sections,
        { id: "sec_patched00001", kind: "richText", format: "markdown", body: "Hello." },
      ] as typeof home.sections,
    });
    const section = page.sections.find((s) => s.id === "sec_patched00001");
    const block = section?.kind === "richText" ? section.blocks?.[0] : undefined;
    const res = await patch(
      app,
      `/api/sites/${site.id}/pages/${page.id}/sections/sec_patched00001/body`,
      {
        rev: page.rev,
        ops: [{ op: "replaceText", block: block?.id, find: "Hello", replace: "Hello, world" }],
      },
    );
    expect(res.status).toBe(200);
    const saved = await store.getPage(page.id);
    expect(saved?.sections.find((s) => s.id === "sec_patched00001")).toMatchObject({
      body: "Hello, world.",
    });
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
        // RFC-0016: no way to reach Workers AI
        ai: "none",
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
      "site-design",
      "stale-review",
    ]);
    expect(skills.find((s) => s.name === "rollback")?.approval).toContain("rollback");
    expect(skills.find((s) => s.name === "publish-article")).toMatchObject({
      resource: "skill://publish-article/SKILL.md",
      references: ["editorial-checklist.md"],
    });
  });
});

describe("theme settings (RFC-0017)", () => {
  it("serves the theme's schema and values, and saves values that fit", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({
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
    await store.init();
    const site = await seedStarterSite(store, { name: "Look", slug: "look" });
    const app = createApi({ store, resolveActor: async () => human });
    const url = `/api/sites/${site.id}/theme-settings`;
    const got = (await (await app.request(url)).json()) as {
      theme: string;
      schema: { properties: Record<string, unknown> } | null;
      values: Record<string, unknown>;
      rev: number;
    };
    expect(got.theme).toBe("blog");
    expect(Object.keys(got.schema?.properties ?? {})).toEqual(["brand", "surface"]);
    const put = (values: Record<string, unknown>, rev = got.rev) =>
      app.request(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rev, values }),
      });
    const misfit = await put({ brand: "#fafafa" });
    expect(misfit.status).toBe(422);
    expect(((await misfit.json()) as { error: string }).error).toBe("invalid_props");
    const ok = await put({ brand: "#1d4ed8" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ values: { brand: "#1d4ed8" }, rev: got.rev + 1 });
    expect((await put({ brand: "#1e40af" })).status).toBe(409);
  });

  it("says when the theme declares none", async () => {
    const { site, get, app } = await setup();
    const got = (await (await get(`/api/sites/${site.id}/theme-settings`)).json()) as {
      schema: unknown;
    };
    expect(got.schema).toBeNull();
    const res = await app.request(`/api/sites/${site.id}/theme-settings`, {
      method: "PUT",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify({ rev: 0, values: {} }),
    });
    expect(res.status).toBe(400);
  });
});

describe("chrome (RFC-0025)", () => {
  it("reads and replaces the header, footer and brand, with the checks the contract cannot make", async () => {
    const { site, app } = await setup();
    const url = `/api/sites/${site.id}/chrome`;
    const headers = { "x-test-user": "1", "content-type": "application/json" };
    const got = (await (await app.request(url, { headers })).json()) as {
      header: object;
      schemas: { header: { properties: Record<string, unknown> } };
      menus: string[];
      rev: number;
    };
    expect(got.header).toEqual({});
    expect(got.menus).toContain("primary");
    expect(Object.keys(got.schemas.header.properties)).toContain("layout");
    const put = (body: Record<string, unknown>) =>
      app.request(url, { method: "PUT", headers, body: JSON.stringify(body) });
    const bad = await put({ rev: got.rev, header: { nav: "nowhere" } });
    expect(bad.status).toBe(400);
    expect((await put({ rev: got.rev, brand: { logo: "/logo.png" } })).status).toBe(400);
    expect((await put({ rev: got.rev, header: { layout: "zigzag" } })).status).toBe(400);
    const ok = await put({
      rev: got.rev,
      header: { behavior: "sticky", layout: "" },
      footer: { layout: "minimal" },
      brand: { social: [{ network: "github", href: "https://github.com/x" }] },
    });
    expect(ok.status).toBe(200);
    const saved = (await ok.json()) as {
      header: object;
      footer: object;
      brand: object;
      rev: number;
    };
    expect(saved).toMatchObject({
      header: { behavior: "sticky" },
      footer: { layout: "minimal" },
      brand: { social: [{ network: "github", href: "https://github.com/x" }] },
    });
    const cleared = (await (await put({ rev: saved.rev, footer: {} })).json()) as {
      footer: object;
    };
    expect(cleared.footer).toEqual({});
    expect((await put({ rev: saved.rev, footer: {} })).status).toBe(409);
  });
});

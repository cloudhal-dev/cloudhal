/**
 * RFC-0003 over MCP: menu tools, approval in every remote mode, targets resolved before anyone is
 * asked, the §6.3 delta in prompts, one snapshot per write, and menus in the publish prompt and
 * the `auto`-mode structure rule.
 */
import {
  type AgentMode,
  ApprovalStore,
  AuditLog,
  PolicyEngine,
  roleScopes,
} from "@cloudhal/agent-runtime";
import type { Menu, Page, Site, Term } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createCloudhalMcpServer } from "../src/server.ts";
import {
  defineTools,
  runTool,
  type ToolContext,
  type ToolError,
  toolPolicies,
} from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_menus00001", name: "Navigator" };
const owner = { kind: "human" as const, id: "user_owner000001", name: "Owner" };
const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const policy = new PolicyEngine(toolPolicies(tools));

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  approvals: ApprovalStore;
  site: Site;
  about: Page;
  draft: Page;
  news: Term;
  world: Term;
}

async function world(): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  let site = await seedStarterSite(store, { name: "Nav Site", slug: "nav" });
  site = await store.updateSite({ ...site, locales: ["en", "tr"] });
  const about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
  const created = await store.createPage(site, {
    siteId: site.id,
    path: "/careers",
    title: "Careers",
    locale: "en",
    status: "draft",
    sections: [],
  });
  site = created.site;
  const draft = created.page;
  const news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
  const category = await store.getTaxonomyByKey(site.id, "category");
  const worldTerm = await store.createTerm({
    siteId: site.id,
    taxonomyId: category?.id as string,
    slug: "world",
    status: "active",
    visibility: "public",
    labels: { en: { name: "World" } },
    parentId: news.id,
  });
  return {
    store,
    audit: new AuditLog(sql),
    approvals: new ApprovalStore(sql),
    site,
    about,
    draft,
    news,
    world: worldTerm,
  };
}

function direct(w: World, principal: ToolContext["principal"]) {
  const ctx: ToolContext = { store: w.store, principal };
  return (name: string, args: Record<string, unknown>, confirmed = false) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, {
      policy,
      audit: w.audit,
      confirmed,
    });
}

async function mcp(w: World, mode: AgentMode = "edits") {
  const server = createCloudhalMcpServer({
    store: w.store,
    audit: w.audit,
    approvals: w.approvals,
    principal: { actor: agent, scopes: ["*"], mode },
    stateKey: "menu-test-state-key-0123456789abcdef0",
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
  const approved = async (name: string, args: Record<string, unknown>) => {
    const ask = await call(name, args);
    expect(ask.text).toMatch(/^approval pending:/);
    const approvalId = ask.text.match(/approvalId: (appr_\w+)/)?.[1] as string;
    await w.approvals.decide(approvalId, "approved", owner);
    const done = await call(name, { ...args, approvalId });
    expect(done.isError, done.text).toBe(false);
    return { prompt: ask.text, ...done };
  };
  return { call, approved };
}

async function publishAsPerson(w: World): Promise<void> {
  const snap = await w.store.createSnapshot(w.site.id, { actor: owner, reason: "publish" });
  await w.store.publish((await w.store.getSite(w.site.id)) as Site, snap.id);
}

const createPrimary = (w: World) =>
  w.store.createMenu({
    siteId: w.site.id,
    key: "primary",
    maxDepth: 3,
    items: [
      { id: "item_ABOUT00001", kind: "page", pageId: w.about.id, labels: { tr: "Hakkında" } },
      {
        id: "item_CONTACT001",
        kind: "url",
        href: "https://contact.example.com",
        labels: { en: "Contact" },
      },
      {
        id: "item_HELP000001",
        kind: "group",
        labels: { en: "Help" },
        children: [
          {
            id: "item_FAQ0000001",
            kind: "url",
            href: "https://faq.example.com",
            labels: { en: "FAQ" },
          },
        ],
      },
      {
        id: "item_API0000001",
        kind: "url",
        href: "https://api.example.com",
        labels: { en: "API" },
      },
      { id: "item_WORLD00001", kind: "term", termId: "PLACEHOLDER" },
      {
        id: "item_RES0000001",
        kind: "group",
        labels: { en: "Resources" },
        children: [
          {
            id: "item_R10000001",
            kind: "url",
            href: "https://r1.example.com",
            labels: { en: "R1" },
          },
          {
            id: "item_R20000001",
            kind: "url",
            href: "https://r2.example.com",
            labels: { en: "R2" },
          },
        ],
      },
    ].map((i) => (i.kind === "term" ? { ...i, termId: w.news.id } : i)) as Menu["items"],
  });

describe("RFC-0003 over MCP", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("exposes five menu tools with honest annotations and scopes", () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["list_menus", "get_menu", "update_menu", "set_menu", "delete_menu"]),
    );
    expect(names.indexOf("list_menus")).toBe(names.indexOf("delete_redirect") + 1);
    for (const n of ["list_menus", "get_menu"])
      expect(byName[n]).toMatchObject({
        scopes: ["site:read"],
        annotations: { readOnlyHint: true },
      });
    for (const n of ["update_menu", "set_menu", "delete_menu"])
      expect(byName[n]).toMatchObject({ scopes: ["site:write"], requiresApproval: true });
    expect(byName.delete_menu?.annotations.destructiveHint).toBe(true);
  });

  it("every agent write waits for a person in every remote mode; plan mode is read-only; local bypass runs", async () => {
    const args = {
      siteId: w.site.id,
      key: "primary",
      create: {},
      ops: [{ op: "add", item: { target: { kind: "page", ref: "/about" } } }],
    };
    for (const mode of ["manual", "edits", "auto"] as const) {
      const r = await direct(w, { actor: agent, scopes: ["*"], mode })("update_menu", args);
      expect(r.decision.kind, mode).toBe("approval-required");
      expect(r.approvalPrompt).toContain('Create menu "primary" (Header) with 1 item');
    }
    expect(
      (await direct(w, { actor: agent, scopes: ["*"], mode: "plan" })("update_menu", args)).decision
        .kind,
    ).toBe("deny");
    // without site:write (the default agent scopes), refused outright
    const scoped = await direct(w, {
      actor: agent,
      scopes: ["site:read", "content:read", "content:write"],
    })("update_menu", args);
    expect(scoped.decision).toMatchObject({ kind: "deny" });
    // RFC-0005 roles (ADR-0019): keys of Contributors and Authors cannot write menus; Editors' can
    // (and still wait for a person)
    for (const role of ["contributor", "author"] as const)
      expect(
        (await direct(w, { actor: agent, scopes: roleScopes(role) })("update_menu", args)).decision
          .kind,
        role,
      ).toBe("deny");
    expect(
      (await direct(w, { actor: agent, scopes: roleScopes("editor") })("update_menu", args))
        .decision.kind,
    ).toBe("approval-required");
    expect(await w.store.getMenuByKey(w.site.id, "primary")).toBeUndefined();
    const local = await direct(w, { actor: agent, scopes: ["*"], mode: "bypass", local: true })(
      "update_menu",
      args,
    );
    expect(local.decision.kind).toBe("allow");
    expect((await w.store.getMenuByKey(w.site.id, "primary"))?.items).toHaveLength(1);
  });

  it("resolves targets before approval: calls that cannot succeed never wait for a person", async () => {
    await createPrimary(w);
    const run = direct(w, { actor: agent, scopes: ["*"] });
    const add = (item: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      run("update_menu", {
        siteId: w.site.id,
        key: "primary",
        rev: 0,
        ops: [{ op: "add", item, ...extra }],
      });
    const fails = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return e as ToolError;
      }
      throw new Error("expected a refusal");
    };
    expect((await fails(add({ target: { kind: "page", ref: "/nope" } }))).code).toBe(
      "unknown_target",
    );
    expect((await fails(add({ target: { kind: "term", ref: "category:nope" } }))).code).toBe(
      "unknown_term",
    );
    expect(
      (
        await fails(
          add({ target: { kind: "url", href: "http://plain.example" }, labels: { en: "x" } }),
        )
      ).code,
    ).toBe("invalid_menu");
    expect((await fails(add({ target: { kind: "collection", collection: "posts" } }))).code).toBe(
      "invalid_label",
    );
    const deep = await fails(
      Promise.resolve().then(() =>
        run("update_menu", {
          siteId: w.site.id,
          key: "primary",
          rev: 0,
          ops: [
            {
              op: "add",
              item: {
                target: { kind: "group" },
                labels: { en: "L2" },
                children: [
                  {
                    target: { kind: "group" },
                    labels: { en: "L3" },
                    children: [{ target: { kind: "page", ref: "/about" } }],
                  },
                ],
              },
              parent: "item_HELP000001",
            },
          ],
        }),
      ),
    );
    expect([deep.code, deep.details.opIndex]).toEqual(["too_deep", 0]);
    expect(
      (
        await fails(
          run("update_menu", {
            siteId: w.site.id,
            key: "primary",
            rev: 7,
            ops: [{ op: "remove", itemId: "item_API0000001" }],
          }),
        )
      ).code,
    ).toBe("conflict");
    expect(
      (
        await fails(
          run("update_menu", {
            siteId: w.site.id,
            key: "footer",
            ops: [{ op: "remove", itemId: "item_API0000001" }],
          }),
        )
      ).code,
    ).toBe("not_found");
    expect(await w.approvals.list({ siteId: w.site.id, status: "pending" })).toHaveLength(0);
    const denied = (await w.audit.list({ siteId: w.site.id })).filter(
      (r) => r.tool === "update_menu",
    );
    expect(denied.every((r) => r.decision === "deny")).toBe(true);
    expect(denied.length).toBeGreaterThanOrEqual(7);
  });

  it("prompts show the §6.3 delta; one approved call writes once and takes one snapshot", async () => {
    await createPrimary(w);
    const { approved } = await mcp(w);
    const before = (await w.store.listSnapshots(w.site.id)).length;
    const r = await approved("update_menu", {
      siteId: w.site.id,
      key: "primary",
      rev: 0,
      ops: [
        {
          op: "add",
          item: { target: { kind: "page", ref: "/" }, labels: { en: "Home" } },
          index: 0,
        },
        {
          op: "add",
          item: {
            target: { kind: "url", href: "https://status.example.com/now" },
            labels: { en: "Status" },
            newTab: true,
          },
          parent: "item_HELP000001",
        },
        { op: "add", item: { target: { kind: "page", ref: "/careers" } } },
        { op: "remove", itemId: "item_RES0000001" },
        { op: "move", itemId: "item_API0000001", index: 1 },
        { op: "move", itemId: "item_CONTACT001", parent: "item_HELP000001", index: 0 },
        { op: "update", itemId: "item_ABOUT00001", labels: { tr: "Hakkımızda" } },
        {
          op: "update",
          itemId: "item_WORLD00001",
          target: { kind: "term", ref: "category:world" },
        },
      ],
    });
    const prompt = r.prompt;
    expect(prompt).toContain('Change menu "primary" (Header): 8 changes, 9 → 9 items.');
    expect(prompt).toContain('+ "Home" → / (page), top level, position 1');
    expect(prompt).toContain(
      '+ "Status" → https://status.example.com/now (external: status.example.com, new tab), under "Help", position 3',
    );
    expect(prompt).toContain('+ "Careers" (title) → /careers (page), top level, position 6');
    expect(prompt).toContain('− "Resources" and 2 items below it');
    expect(prompt).toContain('↕ "API": position 4 → 2');
    expect(prompt).toContain('↳ "Contact" moved under "Help" (was top level)');
    expect(prompt).toContain('~ "About" (title): label [tr] "Hakkında" → "Hakkımızda"');
    expect(prompt).toContain('~ "World" (title): target term "News" → term "World"');
    expect(prompt).toContain('! "Careers" (title) stays hidden: its page is not published');
    expect(prompt).toContain('! "World" (title) stays hidden: its archive is not served');
    // the "Home" insertion at the top does not report its siblings as moved
    expect(prompt).not.toContain('↕ "About"');
    const menu = r.out.menu as unknown as Menu;
    expect(menu.rev).toBe(1);
    expect(r.out.delta).toEqual({ added: 3, removed: 1, moved: 2, changed: 2, items: 9 });
    const snaps = await w.store.listSnapshots(w.site.id);
    expect(snaps.length).toBe(before + 1);
    expect(snaps[0]?.metadata).toMatchObject({
      "cloudhal.tool": "update_menu",
      "cloudhal.menu": "primary",
    });
    expect(snaps[0]?.nodes.some((n) => n.kind === "menu" && n.id === menu.id)).toBe(true);
    const row = (await w.audit.list({ siteId: w.site.id })).find(
      (x) => x.tool === "update_menu" && x.outcome === "ok",
    );
    const input = row?.input as { effect?: { menu?: Record<string, unknown> } } | undefined;
    const fx = input?.effect?.menu ?? {};
    expect(fx).toMatchObject({ key: "primary", removed: ["item_RES0000001"] });
    expect((fx.added as string[]).length).toBe(3);
    expect(JSON.stringify(fx)).not.toContain("Status");
  });

  it("get_menu and list_menus report each item's state, reason, label source and href", async () => {
    const { call } = await mcp(w);
    expect((await call("list_menus", { siteId: w.site.id })).out).toMatchObject({
      menus: [],
      derived: ["primary", "footer"],
      limits: { maxDepth: 6, perLevel: 100, total: 500 },
    });
    expect((await call("get_menu", { siteId: w.site.id, key: "primary" })).text).toMatch(
      /derived default/,
    );
    const menu = await createPrimary(w);
    await w.store.updateMenu({
      ...menu,
      items: [...menu.items, { id: "item_CAREERS001", kind: "page", pageId: w.draft.id }],
    });
    const listed = (await call("list_menus", { siteId: w.site.id })).out;
    expect(listed.menus).toEqual([
      { id: menu.id, key: "primary", rev: 1, maxDepth: 3, items: 10, hidden: 1 },
    ]);
    const got = await call("get_menu", { siteId: w.site.id, key: "primary" });
    expect(got.isError, got.text).toBe(false);
    const items = got.out.items as unknown as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({
      id: "item_ABOUT00001",
      state: "shown",
      label: "About",
      labelSource: "target",
      href: "/about",
    });
    expect(items.at(-1)).toMatchObject({
      state: "hidden",
      reason: "unpublished",
      label: "Careers",
    });
    const tr = await call("get_menu", { siteId: w.site.id, key: "primary", locale: "tr" });
    expect((tr.out.items as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      label: "Hakkında",
      labelSource: "item",
      state: "hidden",
      reason: "other-locale",
    });
  });

  it("set_menu keeps given ids, creates without rev; delete_menu falls back to the derived default", async () => {
    const { approved, call } = await mcp(w);
    const created = await approved("set_menu", {
      siteId: w.site.id,
      key: "footer",
      items: [
        { target: { kind: "url", href: "https://status.example.com" }, labels: { en: "Status" } },
        { target: { kind: "contentEntry", ref: "posts/hello-world" } },
      ],
    });
    expect(created.prompt).toContain('Create menu "footer" (Footer) with 2 items (maxDepth 2)');
    const footer = created.out.menu as unknown as Menu;
    expect(footer.maxDepth).toBe(2);
    const keep = footer.items[1]?.id as string;
    const replaced = await approved("set_menu", {
      siteId: w.site.id,
      key: "footer",
      rev: footer.rev,
      items: [
        {
          id: keep,
          target: { kind: "contentEntry", ref: "posts/hello-world" },
          labels: { en: "First post" },
        },
      ],
    });
    expect(replaced.prompt).toContain(
      '− "Status" → https://status.example.com (external: status.example.com)',
    );
    expect(replaced.prompt).toContain('~ "First post": label [en] (none) → "First post"');
    expect((replaced.out.menu as unknown as Menu).items.map((i) => i.id)).toEqual([keep]);
    const missingRev = await call("set_menu", { siteId: w.site.id, key: "footer", items: [] });
    expect(missingRev.isError).toBe(true);
    expect(missingRev.text).toMatch(/send its rev/);
    const deleted = await approved("delete_menu", { siteId: w.site.id, key: "footer", rev: 1 });
    expect(deleted.prompt).toContain('Delete menu "footer" (Footer) with 1 items?');
    expect(await w.store.getMenuByKey(w.site.id, "footer")).toBeUndefined();
    expect((await call("list_menus", { siteId: w.site.id })).out.derived).toEqual([
      "primary",
      "footer",
    ]);
  });

  it("publish: a menu change is structure in auto mode, and the prompt shows menu effects of other changes", async () => {
    await createPrimary(w);
    await publishAsPerson(w);
    const { call, approved } = await mcp(w, "auto");
    await approved("update_menu", {
      siteId: w.site.id,
      key: "primary",
      rev: 0,
      ops: [{ op: "remove", itemId: "item_API0000001" }],
    });
    const waits = await call("publish", { siteId: w.site.id });
    expect(waits.text).toMatch(/^approval pending: Publish "Nav Site"/);
    expect(waits.text).toContain('~ menu "primary" (−1)');
    const [approval] = await w.approvals.list({ siteId: w.site.id, status: "pending" });
    expect(approval).toMatchObject({
      tool: "publish",
      autoCheck: { code: "structure", lowRisk: false },
    });
    await publishAsPerson(w);

    // deleting a linked page never writes the menu; prompts say what it hides
    const run = direct(w, { actor: agent, scopes: ["*"] });
    const ask = await run("delete_page", {
      siteId: w.site.id,
      pageId: w.about.id,
      rev: w.about.rev,
    });
    expect(ask.approvalPrompt).toContain(
      'Menus keep linking it but hide it: 1 item in menu "primary".',
    );
    const site = (await w.store.getSite(w.site.id)) as Site;
    await w.store.deletePage(site, (await w.store.getPage(w.about.id)) as Page);
    const pub = await run("publish", { siteId: w.site.id });
    expect(pub.approvalPrompt).toContain(
      '! menu "primary": "About" (title) hidden (its page was deleted)',
    );
  });

  it("create results say when a new page is not in the primary menu", async () => {
    const run = direct(w, { actor: agent, scopes: ["*"] });
    const before = await run("create_page", { siteId: w.site.id, path: "/one", title: "One" });
    expect((before.result as { hint?: string }).hint).toBeUndefined();
    await createPrimary(w);
    const after = await run("create_page", { siteId: w.site.id, path: "/two", title: "Two" });
    expect((after.result as { hint?: string }).hint).toMatch(/not in any menu.*update_menu/);
    const entry = await run("create_entry", {
      siteId: w.site.id,
      slug: "new-post",
      title: "New",
      body: "Body.",
    });
    expect((entry.result as { hint?: string }).hint).toMatch(/new articles do not join the header/);
  });
});

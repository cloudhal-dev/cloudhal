/**
 * Shared suite for per-site roles (RFC-0034 phase A2): two sites in one installation, people
 * limited to one of them through invites and `PUT /api/members/:userId/sites`, checked over REST
 * and over MCP with the person's own key. Runs on better-sqlite3 and Miniflare D1.
 */
import { AuditLog } from "@cloudhal/agent-runtime";
import { seedStarterSite } from "@cloudhal/core-ts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { RolesBackend } from "./testing-roles.ts";

type Json = Record<string, unknown>;
const PASSWORD = "correct horse battery staple";
const ORIGIN = "http://studio.test";

export function describeSiteRolesApi(label: string, backend: RolesBackend): void {
  describe(`per-site roles: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });

    const setup = async () => {
      const b = await backend.create();
      const english = (await seedStarterSite(b.store, { name: "English", slug: "english" })).id;
      const turkish = (await seedStarterSite(b.store, { name: "Türkçe", slug: "turkce" })).id;
      const auth = createAuth({
        database: b.database,
        sql: b.sql,
        baseURL: ORIGIN,
        secret: "site-roles-secret-0123456789abcdefghij",
        signUp: "first-user",
      });
      const audit = new AuditLog(b.sql);
      const app = createApi({
        store: b.store,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        audit,
        mcp: { stateKey: "site-roles-state-key-0123456789abcdefg", audit },
      });
      let ip = 0;
      const call = async (method: string, path: string, cookie?: string, body?: unknown) => {
        const res = await app.request(`${ORIGIN}${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.1.0.${ip++ % 250}`,
            ...(cookie ? { cookie } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json, res };
      };
      const cookieOf = (res: Response) =>
        (res.headers.getSetCookie?.() ?? [])
          .map((c) => c.split(";")[0] as string)
          .find((c) => c.startsWith("better-auth.session_token=")) ?? "";
      const signUp = await call("POST", "/api/auth/sign-up/email", undefined, {
        name: "Olive Owner",
        email: "owner@example.com",
        password: PASSWORD,
      });
      const owner = cookieOf(signUp.res);
      const join = async (email: string, role: string, sites?: Json) => {
        const inv = await call("POST", "/api/invites", owner, {
          email,
          role,
          ...(sites ? { sites } : {}),
        });
        expect(inv.status, JSON.stringify(inv.body)).toBe(201);
        const token = (inv.body.url as string).split("#")[1];
        const r = await call("POST", "/api/invites/accept", undefined, {
          token,
          name: email.split("@")[0],
          password: PASSWORD,
        });
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        return { cookie: cookieOf(r.res), userId: (r.body.user as { id: string }).id };
      };
      const connect = async (key: string) => {
        const client = new Client(
          { name: "site-roles-agent", version: "1.0.0" },
          { capabilities: {}, versionNegotiation: { mode: "auto" } },
        );
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
            requestInit: { headers: { "x-api-key": key } },
            fetch: async (input, init) => app.fetch(new Request(input, init as RequestInit)),
          }),
        );
        return client;
      };
      return { english, turkish, owner, call, join, connect };
    };

    const ids = (body: unknown) => (body as { id: string }[]).map((s) => s.id).sort();

    it("refuses site limits for Administrators and for unknown sites", async () => {
      const { turkish, owner, call } = await setup();
      const admin = await call("POST", "/api/invites", owner, {
        email: "a@example.com",
        role: "administrator",
        sites: { [turkish]: "editor" },
      });
      expect(admin.status).toBe(400);
      expect(admin.body.error).toBe("invalid_sites");
      const unknown = await call("POST", "/api/invites", owner, {
        email: "b@example.com",
        role: "editor",
        sites: { site_missing0001: "editor" },
      });
      expect(unknown.status).toBe(400);
    });

    it("keeps a site-limited editor inside their site over REST", async () => {
      const { english, turkish, owner, call, join } = await setup();
      const tr = await join("tr-editor@example.com", "editor", { [turkish]: "editor" });

      expect(ids((await call("GET", "/api/sites", tr.cookie)).body)).toEqual([turkish]);
      expect((await call("GET", `/api/sites/${english}/pages`, tr.cookie)).status).toBe(404);
      expect((await call("GET", `/api/sites/${turkish}/pages`, tr.cookie)).status).toBe(200);
      // No installation-wide powers: no invites, no installation activity.
      expect((await call("GET", "/api/invites", tr.cookie)).status).toBe(403);
      expect((await call("GET", "/api/activity", tr.cookie)).status).toBe(403);
      const me = (await call("GET", "/api/me", tr.cookie)).body;
      expect(me.sites).toEqual({ [turkish]: "editor" });
      expect(me.invitableRoles).toEqual([]);
      expect((await call("GET", `/api/me?siteId=${english}`, tr.cookie)).status).toBe(404);

      // Two sites, different roles; the Owner still sees everything.
      const put = await call("PUT", `/api/members/${tr.userId}/sites`, owner, {
        sites: { [turkish]: "editor", [english]: "contributor" },
      });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      expect(ids((await call("GET", "/api/sites", tr.cookie)).body)).toEqual(
        [english, turkish].sort(),
      );
      expect((await call("GET", `/api/me?siteId=${english}`, tr.cookie)).body.role).toBe(
        "contributor",
      );
      expect(ids((await call("GET", "/api/sites", owner)).body)).toEqual([english, turkish].sort());

      // An empty map lifts the limit; a promotion to Administrator drops the rows.
      await call("PUT", `/api/members/${tr.userId}/sites`, owner, {
        sites: { [turkish]: "editor" },
      });
      await call("PATCH", `/api/members/${tr.userId}`, owner, { role: "administrator" });
      expect((await call("GET", "/api/me", tr.cookie)).body.sites).toBeUndefined();
      expect(ids((await call("GET", "/api/sites", tr.cookie)).body)).toEqual(
        [english, turkish].sort(),
      );
    });

    it("shows a site-limited person only the members who share a site", async () => {
      const { english, turkish, call, join } = await setup();
      const tr = await join("tr@example.com", "author", { [turkish]: "author" });
      await join("en@example.com", "author", { [english]: "author" });
      await join("all@example.com", "editor");
      const names = ((await call("GET", "/api/members", tr.cookie)).body.items as Json[]).map(
        (m) => m.name,
      );
      expect(names).toContain("all");
      expect(names).toContain("tr");
      expect(names).not.toContain("en");
    });

    it("lets the Owner create a site in a project, and lists projects by what one may open", async () => {
      const { english, turkish, owner, call, join } = await setup();
      const editor = await join("editor@example.com", "editor");
      const body = { name: "Deutsch", slug: "deutsch", locale: "de" };
      expect((await call("POST", "/api/sites", editor.cookie, body)).status).toBe(403);
      const projectId = (
        (await call("GET", `/api/sites/${english}`, owner)).body as { projectId: string }
      ).projectId;
      const made = await call("POST", "/api/sites", owner, { ...body, projectId });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const site = (made.body as { site: { id: string; defaultLocale: string; projectId: string } })
        .site;
      expect(site.defaultLocale).toBe("de");
      expect(site.projectId).toBe(projectId);
      expect((await call("POST", "/api/sites", owner, body)).status).toBe(409);

      const limited = await join("tr-only@example.com", "author", { [turkish]: "author" });
      const mine = (await call("GET", "/api/projects", limited.cookie)).body.items as {
        sites: { id: string }[];
      }[];
      expect(mine.flatMap((p) => p.sites.map((s) => s.id))).toEqual([turkish]);
      const all = (await call("GET", "/api/projects", owner)).body.items as {
        id: string;
        sites: { id: string; published: boolean }[];
      }[];
      const project = all.find((p) => p.id === projectId);
      expect(project?.sites.map((s) => s.id)).toContain(site.id);
    });

    it("creates a language edition of a site, in its project", async () => {
      const { english, owner, call } = await setup();
      const res = await call("POST", "/api/sites", owner, {
        name: "English (DE)",
        slug: "english-de",
        locale: "de",
        from: english,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const { site, edition } = res.body as {
        site: { id: string; projectId: string; defaultLocale: string };
        edition: { pages: number; skipped: unknown[] };
      };
      const source = (await call("GET", `/api/sites/${english}`, owner)).body as {
        projectId: string;
      };
      expect(site.projectId).toBe(source.projectId);
      expect(site.defaultLocale).toBe("de");
      expect(edition.pages).toBeGreaterThan(0);
      expect(
        (
          await call("POST", "/api/sites", owner, {
            name: "X",
            slug: "x",
            from: "site_missing0001",
          })
        ).status,
      ).toBe(404);
    });

    it("keeps the person's agent key inside their site over MCP", async () => {
      const { english, turkish, call, join, connect } = await setup();
      const tr = await join("tr-agent@example.com", "editor", { [turkish]: "editor" });
      const key = await call("POST", "/api/agent-keys", tr.cookie, { name: "tr agent" });
      expect(key.status, JSON.stringify(key.body)).toBe(201);
      const agent = await connect(key.body.key as string);
      const listed = await agent.callTool({ name: "list_sites", arguments: {} });
      expect(
        (listed.structuredContent as { sites: { id: string }[] }).sites.map((s) => s.id),
      ).toEqual([turkish]);
      const other = await agent.callTool({ name: "get_site", arguments: { siteId: english } });
      expect(other.isError).toBe(true);
      const own = await agent.callTool({ name: "get_site", arguments: { siteId: turkish } });
      expect(own.isError, JSON.stringify(own.content)).toBeFalsy();
    });
  });
}

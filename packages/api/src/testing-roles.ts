/**
 * Shared suite for staff roles and invites (RFC-0005 §9, invariants I1–I15): runs the real API
 * with Better Auth on any backend (better-sqlite3 and Miniflare D1 in `test/roles.test.ts`).
 * People join through real invite links, agents through real API keys over MCP.
 */
import { ApprovalStore, AuditLog, type Role } from "@cloudhal/agent-runtime";
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite, sha256Hex } from "@cloudhal/core-ts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { MailMessage } from "./mail.ts";

export interface RolesBackend {
  create(): Promise<{ store: SiteGraphStore; sql: SqlDriver; blobs: BlobStore; database: unknown }>;
  dispose?(): Promise<void>;
}

type Json = Record<string, unknown>;

interface Person {
  role: Role;
  email: string;
  password: string;
  cookie: string;
  userId: string;
  actorId: string;
}

const PASSWORD = "correct horse battery staple";
const DEPLOY_TOKEN = "roles-deploy-token-0123456789abcdefghij";
const ORIGIN = "http://studio.test";

export function describeRolesApi(label: string, backend: RolesBackend): void {
  // Miniflare D1 answers every query over IPC and each test builds a whole team with real password
  // hashing: give a busy machine room.
  describe(`roles and invites: ${label}`, { timeout: 180_000 }, () => {
    let store: SiteGraphStore;
    let sql: SqlDriver;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    let audit: AuditLog;
    let approvals: ApprovalStore;
    let auth: ReturnType<typeof createAuth>;
    let nowMs: number;
    let ip = 0;
    const mailbox: MailMessage[] = [];

    const make = async (signUp: "first-user" | "open" = "first-user", withMail = false) => {
      const b = await backend.create();
      store = b.store;
      sql = b.sql;
      nowMs = Date.now();
      const clock = () => new Date(nowMs);
      siteId = (await seedStarterSite(store, { name: "Roles Daily", slug: "roles-daily" })).id;
      auth = createAuth({
        database: b.database,
        sql: b.sql,
        baseURL: ORIGIN,
        secret: "roles-test-secret-0123456789abcdefghijk",
        signUp,
        now: clock,
      });
      audit = new AuditLog(b.sql);
      approvals = new ApprovalStore(b.sql, { now: clock });
      app = createApi({
        store,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        audit,
        now: clock,
        mcp: { stateKey: "roles-test-state-key-0123456789abcdefgh", audit, approvals },
        admin: { deployToken: DEPLOY_TOKEN, storage: { sql: b.sql, blobs: b.blobs } },
        ...(withMail ? { mail: { id: "test", send: async (m) => void mailbox.push(m) } } : {}),
      });
    };

    beforeEach(async () => {
      mailbox.length = 0;
      await make();
    }, 120_000);
    afterAll(async () => {
      await backend.dispose?.();
    });

    // ───────────────────────────── helpers ─────────────────────────────

    const call = async (
      method: string,
      path: string,
      opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) => {
      const res = await app.request(`${ORIGIN}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.0.${Math.floor(ip / 250)}.${ip++ % 250}`,
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...opts.headers,
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      const text = await res.text();
      let body: Json = {};
      try {
        body = text ? (JSON.parse(text) as Json) : {};
      } catch {
        body = { text };
      }
      return { status: res.status, body, res };
    };
    const cookieOf = (res: Response) =>
      (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""])
        .map((c) => c.split(";")[0] as string)
        .find((c) => c.startsWith("better-auth.session_token=")) ?? "";

    const signUpOwner = async (): Promise<Person> => {
      const email = "owner@example.com";
      const r = await call("POST", "/api/auth/sign-up/email", {
        body: { name: "Olive Owner", email, password: PASSWORD },
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const cookie = cookieOf(r.res);
      const me = await call("GET", "/api/me", { cookie });
      return {
        role: "owner",
        email,
        password: PASSWORD,
        cookie,
        userId: me.body.userId as string,
        actorId: (me.body.actor as { id: string }).id,
      };
    };

    const invite = (by: Person, email: string, role: string, extra: Json = {}) =>
      call("POST", "/api/invites", { cookie: by.cookie, body: { email, role, ...extra } });
    const tokenOf = (url: unknown) => (url as string).split("#")[1] as string;
    const accept = (token: string, body: Json = {}, cookie?: string) =>
      call("POST", "/api/invites/accept", {
        ...(cookie ? { cookie } : {}),
        body: { token, name: "New Person", password: PASSWORD, ...body },
      });

    const join = async (by: Person, role: Role, name: string = role): Promise<Person> => {
      const email = `${name}@example.com`;
      const inv = await invite(by, email, role);
      expect(inv.status, JSON.stringify(inv.body)).toBe(201);
      const r = await accept(tokenOf(inv.body.url), { name: name.toUpperCase() });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const user = r.body.user as { id: string; actorId: string };
      return {
        role,
        email,
        password: PASSWORD,
        cookie: cookieOf(r.res),
        userId: user.id,
        actorId: user.actorId,
      };
    };

    const team = async () => {
      const owner = await signUpOwner();
      const administrator = await join(owner, "administrator");
      const editor = await join(owner, "editor");
      const author = await join(owner, "author");
      const contributor = await join(owner, "contributor");
      return { owner, administrator, editor, author, contributor };
    };

    const newsId = async () =>
      ((await store.getTermBySlug(siteId, "category", "news")) as { id: string }).id;
    const entryBody = async (slug: string, extra: Json = {}) => ({
      collection: "posts",
      slug,
      locale: "en",
      status: "draft",
      title: slug,
      body: { format: "markdown", value: `# ${slug}` },
      fields: {},
      tags: [],
      terms: { category: { ids: [await newsId()], primary: await newsId() } },
      ...extra,
    });

    const connect = async (key: string) => {
      const client = new Client(
        { name: "roles-agent", version: "1.0.0" },
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
    const text = (r: { content: unknown }) =>
      ((r.content as { text?: string }[])[0]?.text ?? "") as string;
    const structured = <T>(r: { structuredContent?: unknown }) => r.structuredContent as T;
    const newKey = async (p: Person, body: Json) => {
      const r = await call("POST", "/api/agent-keys", { cookie: p.cookie, body });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body as { id: string; key: string; scopes: string[]; mode: string };
    };
    const publishBaseline = async (owner: Person) => {
      const r = await call("POST", `/api/sites/${siteId}/snapshots`, {
        cookie: owner.cookie,
        body: { publish: true, label: "baseline" },
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    };

    // ───────────────────────────── I1, I2, I3 ─────────────────────────────

    it("I1/I2: the first account is the Owner; a person without a membership has no scopes", async () => {
      const owner = await signUpOwner();
      const me = await call("GET", "/api/me", { cookie: owner.cookie });
      expect(me.body).toMatchObject({ role: "owner", member: true, scopes: ["*"] });
      expect((me.body.can as Json)["ownership.transfer"]).toBe(true);
      expect(me.body.invitableRoles).toEqual(["administrator", "editor", "author", "contributor"]);
      const members = await call("GET", "/api/members", { cookie: owner.cookie });
      expect(members.body.items).toEqual([
        expect.objectContaining({ role: "owner", email: "owner@example.com", name: "Olive Owner" }),
      ]);
      // sign-up is closed now
      const second = await call("POST", "/api/auth/sign-up/email", {
        body: { name: "x", email: "x@example.com", password: PASSWORD },
      });
      expect(second.status).toBe(403);
      // a user without a membership (removed meanwhile) keeps /api/me only
      const editor = await join(owner, "editor");
      await sql.run(`DELETE FROM "member" WHERE "userId" = ?`, [editor.userId]);
      const gone = await call("GET", "/api/me", { cookie: editor.cookie });
      expect(gone.body).toMatchObject({ role: null, member: false, scopes: [] });
      const refused = await call("GET", "/api/sites", { cookie: editor.cookie });
      expect(refused.status).toBe(403);
      expect(refused.body.error).toBe("not_a_member");
      // and signing in again is refused
      const signIn = await call("POST", "/api/auth/sign-in/email", {
        body: { email: editor.email, password: PASSWORD },
      });
      expect(signIn.status).toBe(403);
      expect(JSON.stringify(signIn.body)).toMatch(/access was removed/);
    });

    it("I3: Better Auth's organization, admin and api-key endpoints answer 404 over HTTP", async () => {
      const owner = await signUpOwner();
      for (const [method, path, body] of [
        ["POST", "/api/auth/organization/create", { name: "x", slug: "x" }],
        ["GET", "/api/auth/organization/list", undefined],
        ["POST", "/api/auth/organization/invite-member", { email: "a@example.com", role: "owner" }],
        ["POST", "/api/auth/organization/update-member-role", { memberId: "m", role: "owner" }],
        ["POST", "/api/auth/admin/set-role", { userId: owner.userId, role: "admin" }],
        [
          "POST",
          "/api/auth/admin/create-user",
          { email: "b@example.com", name: "b", password: PASSWORD },
        ],
        ["POST", "/api/auth/api-key/create", { name: "sneaky" }],
        ["POST", "/api/auth/api-key/update", { keyId: "k", metadata: { mode: "auto" } }],
      ] as const) {
        const r = await call(method, path, { cookie: owner.cookie, ...(body ? { body } : {}) });
        expect(r.status, `${method} ${path}`).toBe(404);
      }
      expect((await sql.all(`SELECT * FROM "organization"`)).length).toBe(1);
      expect(
        await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "user"`).then((r) => Number(r?.n)),
      ).toBe(1);
    });

    // ───────────────────────────── permission matrix ─────────────────────────────

    it("permission matrix against the real routes (RFC-0005 §2.2, §10.1)", async () => {
      const t = await team();
      const roles = ["contributor", "author", "editor", "administrator", "owner"] as const;
      const site = (await store.getSite(siteId)) as Site;
      const tag = (await store.getTaxonomyByKey(siteId, "tag")) as { id: string };
      const cases: {
        name: string;
        allowed: readonly Role[];
        run: (p: Person) => ReturnType<typeof call>;
      }[] = [
        {
          name: "read sites",
          allowed: roles,
          run: (p) => call("GET", `/api/sites/${siteId}`, { cookie: p.cookie }),
        },
        {
          name: "read entries",
          allowed: roles,
          run: (p) => call("GET", `/api/sites/${siteId}/entries`, { cookie: p.cookie }),
        },
        {
          name: "list members",
          allowed: roles,
          run: (p) => call("GET", "/api/members", { cookie: p.cookie }),
        },
        {
          name: "instance",
          allowed: roles,
          run: (p) => call("GET", "/api/instance", { cookie: p.cookie }),
        },
        {
          name: "preview link",
          allowed: roles,
          run: (p) =>
            call("POST", `/api/sites/${siteId}/preview-links`, { cookie: p.cookie, body: {} }),
        },
        {
          name: "site settings",
          allowed: ["administrator", "owner"],
          run: (p) =>
            call("PUT", `/api/sites/${siteId}`, {
              cookie: p.cookie,
              body: { ...site, name: `Renamed by ${p.role}` },
            }),
        },
        {
          name: "create page",
          allowed: ["editor", "administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/pages`, {
              cookie: p.cookie,
              body: {
                path: `/p-${p.role}`,
                title: "P",
                locale: "en",
                status: "draft",
                sections: [],
              },
            }),
        },
        {
          name: "create redirect",
          allowed: ["editor", "administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/redirects`, {
              cookie: p.cookie,
              body: { from: `/old-${p.role}`, to: "/about", status: 301, match: "exact" },
            }),
        },
        {
          name: "create a category",
          allowed: ["editor", "administrator", "owner"],
          run: async (p) => {
            const tax = (await store.getTaxonomyByKey(siteId, "category")) as { id: string };
            return call("POST", `/api/sites/${siteId}/terms`, {
              cookie: p.cookie,
              body: {
                taxonomyId: tax.id,
                slug: `cat-${p.role}`,
                labels: { en: { name: `Cat ${p.role}` } },
              },
            });
          },
        },
        {
          name: "propose a tag",
          allowed: roles,
          run: (p) =>
            call("POST", `/api/sites/${siteId}/terms`, {
              cookie: p.cookie,
              body: {
                taxonomyId: tag.id,
                slug: `tag-${p.role}`,
                labels: { en: { name: `Tag ${p.role}` } },
              },
            }),
        },
        {
          name: "read menus",
          allowed: roles,
          run: (p) => call("GET", `/api/sites/${siteId}/menus`, { cookie: p.cookie }),
        },
        {
          name: "preview a menu",
          allowed: roles,
          run: (p) =>
            call("POST", `/api/sites/${siteId}/menus/preview`, {
              cookie: p.cookie,
              body: { menus: [{ key: "primary" }] },
            }),
        },
        {
          name: "create a menu (RFC-0003: Editor and above)",
          allowed: ["editor", "administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/menus`, {
              cookie: p.cookie,
              body: { key: `menu-${p.role}`, items: [] },
            }),
        },
        {
          name: "create a menu from pages",
          allowed: ["editor", "administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/menus/from-pages`, {
              cookie: p.cookie,
              body: { key: `pages-${p.role}`, dryRun: true },
            }),
        },
        {
          name: "tags migration",
          allowed: ["administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/migrations/tags-to-terms`, {
              cookie: p.cookie,
              body: { dryRun: true },
            }),
        },
        {
          name: "deployment activity",
          allowed: ["editor", "administrator", "owner"],
          run: (p) => call("GET", "/api/activity", { cookie: p.cookie }),
        },
        {
          name: "list invites",
          allowed: ["editor", "administrator", "owner"],
          run: (p) => call("GET", "/api/invites", { cookie: p.cookie }),
        },
        {
          name: "all agent keys",
          allowed: ["administrator", "owner"],
          run: (p) => call("GET", "/api/agent-keys?all=1", { cookie: p.cookie }),
        },
        {
          name: "rollback",
          allowed: ["editor", "administrator", "owner"],
          run: (p) =>
            call("POST", `/api/sites/${siteId}/snapshots/snap_nothere00001/rollback`, {
              cookie: p.cookie,
            }),
        },
      ];
      for (const cs of cases)
        for (const role of roles) {
          const r = await cs.run(t[role]);
          if (cs.allowed.includes(role))
            expect(r.status, `${cs.name} as ${role}: ${JSON.stringify(r.body)}`).not.toBe(403);
          else {
            expect(r.status, `${cs.name} as ${role}`).toBe(403);
            expect(["missing_scope", "forbidden"]).toContain(r.body.error);
          }
        }
      // proposals by people below Editor stay proposed (never public)
      const proposed = (await store.getTermBySlug(siteId, "tag", "tag-author")) as {
        status: string;
        proposedBy?: { id: string };
      };
      expect(proposed.status).toBe("proposed");
      expect(proposed.proposedBy?.id).toBe(t.author.actorId);
      expect(
        ((await store.getTermBySlug(siteId, "tag", "tag-editor")) as { status: string }).status,
      ).toBe("active");
      // emails only for members:manage
      const asEditor = await call("GET", "/api/members", { cookie: t.editor.cookie });
      expect((asEditor.body.items as Json[]).every((m) => m.email === undefined)).toBe(true);
      const asAdmin = await call("GET", "/api/members", { cookie: t.administrator.cookie });
      expect((asAdmin.body.items as Json[]).every((m) => typeof m.email === "string")).toBe(true);
      expect((asAdmin.body.items as Json[]).map((m) => m.role)).toEqual([
        "owner",
        "administrator",
        "editor",
        "author",
        "contributor",
      ]);
      // the ability map follows the role
      const can = (await call("GET", "/api/me", { cookie: t.author.cookie })).body.can as Json;
      expect(can).toMatchObject({
        "publish.own": true,
        "publish.any": false,
        "pages.write": false,
      });
    });

    // ───────────────────────────── I9: entries ─────────────────────────────

    it("I9: own-limited writes; a body author is trusted only with full content:write", async () => {
      const t = await team();
      const base = `/api/sites/${siteId}/entries`;
      // Contributor: body author ignored, draft only
      const c1 = await call("POST", base, {
        cookie: t.contributor.cookie,
        body: await entryBody("by-contributor", { author: { kind: "human", id: t.owner.actorId } }),
      });
      expect(c1.status, JSON.stringify(c1.body)).toBe(201);
      const draft = c1.body as unknown as ContentEntry;
      expect(draft.author.id).toBe(t.contributor.actorId);
      const toReview = await call("PUT", `${base}/${draft.id}`, {
        cookie: t.contributor.cookie,
        body: { ...draft, status: "review" },
      });
      expect(toReview.status, JSON.stringify(toReview.body)).toBe(200);
      const inReview = toReview.body as unknown as ContentEntry;
      const publishIt = await call("PUT", `${base}/${draft.id}`, {
        cookie: t.contributor.cookie,
        body: { ...inReview, status: "published" },
      });
      expect(publishIt.status).toBe(403);
      expect(publishIt.body).toMatchObject({ error: "not_own", details: { code: "draft_only" } });
      const createPublished = await call("POST", base, {
        cookie: t.contributor.cookie,
        body: await entryBody("contributor-live", { status: "published" }),
      });
      expect(createPublished.status).toBe(403);
      // Author: cannot touch others' entries, cannot change the author, may publish their own
      const othersEdit = await call("PUT", `${base}/${draft.id}`, {
        cookie: t.author.cookie,
        body: { ...inReview, title: "hijack" },
      });
      expect(othersEdit.status).toBe(403);
      expect(othersEdit.body).toMatchObject({ details: { code: "not_own" } });
      const a1 = (
        await call("POST", base, { cookie: t.author.cookie, body: await entryBody("by-author") })
      ).body as unknown as ContentEntry;
      const shed = await call("PUT", `${base}/${a1.id}`, {
        cookie: t.author.cookie,
        body: { ...a1, author: { kind: "human", id: t.editor.actorId } },
      });
      expect(shed.body).toMatchObject({ details: { code: "author_immutable" } });
      const live = await call("PUT", `${base}/${a1.id}`, {
        cookie: t.author.cookie,
        body: { ...a1, status: "published" },
      });
      expect(live.status, JSON.stringify(live.body)).toBe(200);
      const published = live.body as unknown as ContentEntry;
      // Contributor cannot delete it; the Author can; nobody below Editor deletes others'
      expect(
        (
          await call("DELETE", `${base}/${a1.id}?rev=${published.rev}`, {
            cookie: t.contributor.cookie,
          })
        ).status,
      ).toBe(403);
      // Editor: edits anyone's and may credit someone else
      const credited = await call("POST", base, {
        cookie: t.editor.cookie,
        body: await entryBody("imported", { author: { kind: "human", id: t.author.actorId } }),
      });
      expect((credited.body as unknown as ContentEntry).author.id).toBe(t.author.actorId);
      const editorEdit = await call("PUT", `${base}/${draft.id}`, {
        cookie: t.editor.cookie,
        body: { ...inReview, author: { kind: "human", id: t.editor.actorId }, status: "published" },
      });
      expect(editorEdit.status, JSON.stringify(editorEdit.body)).toBe(200);
      // once published, the Contributor's own article is read-only to them
      const after = editorEdit.body as unknown as ContentEntry;
      const lateEdit = await call("PUT", `${base}/${draft.id}`, {
        cookie: t.contributor.cookie,
        body: { ...after, title: "late" },
      });
      expect(lateEdit.status).toBe(403);
      expect(
        (await call("DELETE", `${base}/${a1.id}?rev=${published.rev}`, { cookie: t.author.cookie }))
          .status,
      ).toBe(204);
      // pages stay with Editors
      expect(
        (
          await call("POST", `/api/sites/${siteId}/pages`, {
            cookie: t.author.cookie,
            body: { path: "/x", title: "X", locale: "en", status: "draft", sections: [] },
          })
        ).status,
      ).toBe(403);
    });

    // ───────────────────────────── I10: Author publish ─────────────────────────────

    it("I10: an Author publishes own-only change sets; anything wider becomes a `role` request an Editor approves", async () => {
      const t = await team();
      await publishBaseline(t.owner);
      const base = `/api/sites/${siteId}`;
      const mine = (
        await call("POST", `${base}/entries`, {
          cookie: t.author.cookie,
          body: await entryBody("author-own", { status: "published" }),
        })
      ).body as unknown as ContentEntry;
      expect(mine.status).toBe("published");
      const own = await call("POST", `${base}/snapshots`, {
        cookie: t.author.cookie,
        body: { publish: true, label: "mine" },
      });
      expect(own.status, JSON.stringify(own.body)).toBe(201);
      expect(((await store.getSite(siteId)) as Site).publishedSnapshotId).toBe(
        (own.body.snapshot as { id: string }).id,
      );
      // a Contributor cannot publish at all
      expect(
        (
          await call("POST", `${base}/snapshots`, {
            cookie: t.contributor.cookie,
            body: { publish: true },
          })
        ).status,
      ).toBe(403);
      // someone else's published article in the change set → 202 with a request
      const hello = (await store.listContentEntries(siteId, "posts")).find(
        (e) => e.slug === "hello-world",
      ) as ContentEntry;
      await call("PUT", `${base}/entries/${hello.id}`, {
        cookie: t.editor.cookie,
        body: { ...hello, title: "Edited by the Editor" },
      });
      const live = ((await store.getSite(siteId)) as Site).publishedSnapshotId;
      const wide = await call("POST", `${base}/snapshots`, {
        cookie: t.author.cookie,
        body: { publish: true },
      });
      expect(wide.status, JSON.stringify(wide.body)).toBe(202);
      const request = wide.body.request as { id: string; cause: string; actor: { id: string } };
      expect(request).toMatchObject({ cause: "role", actor: { id: t.author.actorId } });
      expect(((await store.getSite(siteId)) as Site).publishedSnapshotId).toBe(live);
      // the same snapshot again returns the same request
      const snapId = (wide.body.snapshot as { id: string }).id;
      const again = await call("POST", `${base}/snapshots/${snapId}/publish`, {
        cookie: t.author.cookie,
      });
      expect(again.status).toBe(202);
      expect((again.body.request as { id: string }).id).toBe(request.id);
      // nobody approves their own request; another Author cannot (not own-only for them)
      const list = await call("GET", `${base}/approvals?status=pending`, {
        cookie: t.author.cookie,
      });
      expect((list.body.items as Json[]).find((a) => a.id === request.id)?.canDecide).toBe(false);
      const self = await call("POST", `${base}/approvals/${request.id}/approve`, {
        cookie: t.author.cookie,
      });
      expect(self.status).toBe(403);
      expect(self.body).toMatchObject({ error: "cannot_decide", details: { code: "own_request" } });
      const author2 = await join(t.owner, "author", "author2");
      const other = await call("POST", `${base}/approvals/${request.id}/approve`, {
        cookie: author2.cookie,
      });
      expect(other.body).toMatchObject({ details: { code: "not_own" } });
      // the Editor sees it as decidable and approving publishes it
      const editorList = await call("GET", `${base}/approvals?status=pending`, {
        cookie: t.editor.cookie,
      });
      expect((editorList.body.items as Json[]).find((a) => a.id === request.id)?.canDecide).toBe(
        true,
      );
      const ok = await call("POST", `${base}/approvals/${request.id}/approve`, {
        cookie: t.editor.cookie,
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.status).toBe("consumed");
      expect(((await store.getSite(siteId)) as Site).publishedSnapshotId).toBe(snapId);
      // a request whose site moved on is closed with 409
      await call("PUT", `${base}/entries/${hello.id}`, {
        cookie: t.editor.cookie,
        body: { ...(await store.getContentEntry(hello.id)), title: "Again" },
      });
      const stale = await call("POST", `${base}/snapshots`, {
        cookie: t.author.cookie,
        body: { publish: true },
      });
      const staleId = (stale.body.request as { id: string }).id;
      await call("POST", `${base}/snapshots`, { cookie: t.editor.cookie, body: { publish: true } });
      const late = await call("POST", `${base}/approvals/${staleId}/approve`, {
        cookie: t.editor.cookie,
      });
      expect(late.status).toBe(409);
      expect(late.body.error).toBe("state_changed");
    });

    // ───────────────────────────── I5, I6, I8 with agents ─────────────────────────────

    it("I5/I8: keys fit the role; an Author's agent publishes own work only with its creator's approval, wider work with an Editor's", async () => {
      const t = await team();
      await publishBaseline(t.owner);
      // I5 at creation
      expect(
        (
          await call("POST", "/api/agent-keys", {
            cookie: t.author.cookie,
            body: { name: "x", scopes: ["content:write"] },
          })
        ).body.error,
      ).toBe("scope_above_role");
      expect(
        (
          await call("POST", "/api/agent-keys", {
            cookie: t.author.cookie,
            body: { name: "x", scopes: ["audit:read"] },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("POST", "/api/agent-keys", {
            cookie: t.contributor.cookie,
            body: { name: "x", mode: "auto" },
          })
        ).body.error,
      ).toBe("mode_above_role");
      const contributorKey = await newKey(t.contributor, { name: "c-bot" });
      expect(contributorKey.scopes).toEqual([
        "site:read",
        "content:read",
        "preview:create",
        "content:draft:own",
        // RFC-0004: Contributors and above upload media (ADR-0018); keys outside plan get it.
        "asset:upload",
      ]);
      const key = await newKey(t.author, { name: "author-bot", mode: "edits" });
      expect(key.scopes).toEqual([
        "site:read",
        "content:read",
        "preview:create",
        "content:write:own",
        "asset:upload",
        "site:publish:own",
      ]);

      const agent = await connect(key.key);
      expect(agent.getInstructions()).toMatch(/This key belongs to AUTHOR, Author/);
      // tools/list stays the full deterministic list (ADR-0004)
      expect((await agent.listTools()).tools.map((x) => x.name)).toContain("create_page");
      const denied = await agent.callTool({
        name: "create_page",
        arguments: { siteId, path: "/x", title: "X" },
      });
      expect(text(denied)).toMatch(/missing scope content:write/);
      const created = await agent.callTool({
        name: "create_entry",
        arguments: {
          siteId,
          slug: "agent-post",
          title: "Agent post",
          body: "b",
          terms: { category: { primary: "news" } },
        },
      });
      expect(created.isError, text(created)).toBeFalsy();
      const entry = structured<{ entry: ContentEntry }>(created).entry;
      const toLive = await agent.callTool({
        name: "update_entry",
        arguments: { siteId, entryId: entry.id, rev: entry.rev, status: "published" },
      });
      expect(toLive.isError, text(toLive)).toBeFalsy();
      // the agent cannot touch the seeded (system) article
      const hello = (await store.listContentEntries(siteId, "posts")).find(
        (e) => e.slug === "hello-world",
      ) as ContentEntry;
      const foreign = await agent.callTool({
        name: "update_entry",
        arguments: { siteId, entryId: hello.id, rev: hello.rev, title: "x" },
      });
      expect(text(foreign)).toMatch(/denied: .*own articles/);

      // own-only publish: waits for a person (edits mode), its creator may approve (answer 3)
      const ask = await agent.callTool({ name: "publish", arguments: { siteId } });
      const approvalId = text(ask).match(/approvalId: (appr_\w+)/)?.[1] as string;
      expect(approvalId).toBeDefined();
      const asContributor = await call(
        "POST",
        `/api/sites/${siteId}/approvals/${approvalId}/approve`,
        { cookie: t.contributor.cookie },
      );
      expect(asContributor.body).toMatchObject({
        error: "cannot_decide",
        details: { code: "missing_scope" },
      });
      const asAuthor = await call("POST", `/api/sites/${siteId}/approvals/${approvalId}/approve`, {
        cookie: t.author.cookie,
      });
      expect(asAuthor.status, JSON.stringify(asAuthor.body)).toBe(200);
      const redeemed = await agent.callTool({ name: "publish", arguments: { siteId, approvalId } });
      expect(redeemed.isError, text(redeemed)).toBeFalsy();

      // wider change set: cause `role`; the Author cannot approve, an Editor can, the redeem works
      await call("PUT", `/api/sites/${siteId}/entries/${hello.id}`, {
        cookie: t.editor.cookie,
        body: { ...hello, title: "Editor change" },
      });
      const wide = await agent.callTool({ name: "publish", arguments: { siteId } });
      const wideId = text(wide).match(/approvalId: (appr_\w+)/)?.[1] as string;
      expect((await approvals.get(wideId))?.cause).toBe("role");
      const authorTry = await call("POST", `/api/sites/${siteId}/approvals/${wideId}/approve`, {
        cookie: t.author.cookie,
      });
      expect(authorTry.body).toMatchObject({ details: { code: "not_own" } });
      expect(
        (
          await call("POST", `/api/sites/${siteId}/approvals/${wideId}/approve`, {
            cookie: t.editor.cookie,
          })
        ).status,
      ).toBe(200);
      const wideDone = await agent.callTool({
        name: "publish",
        arguments: { siteId, approvalId: wideId },
      });
      expect(wideDone.isError, text(wideDone)).toBeFalsy();
      // the key's creator may always deny their own agent's request
      await agent.callTool({
        name: "delete_entry",
        arguments: {
          siteId,
          entryId: entry.id,
          rev: (await store.getContentEntry(entry.id))?.rev ?? 0,
        },
      });
      const pendingDelete = (await approvals.list({ siteId, status: "pending" }))[0] as {
        id: string;
      };
      expect(
        (
          await call("POST", `/api/sites/${siteId}/approvals/${pendingDelete.id}/deny`, {
            cookie: t.author.cookie,
          })
        ).status,
      ).toBe(200);
      await agent.close();
    });

    it("I5/I6: demotion narrows keys at once (no restart), persists it, ends elevations above the cap; promotion never widens", async () => {
      const t = await team();
      const key = await newKey(t.editor, {
        name: "editor-bot",
        mode: "auto",
        scopes: ["site:read", "content:read", "content:write", "site:publish", "site:rollback"],
      });
      const elevated = await call("POST", `/api/agent-keys/${key.id}/elevation`, {
        cookie: t.editor.cookie,
        body: { mode: "auto", minutes: 60 },
      });
      expect(elevated.status).toBe(400); // already auto: not more autonomous
      const modeBefore = structured<{ scopes: string[]; person: { role: string } }>(
        await (await connect(key.key)).callTool({ name: "get_mode", arguments: {} }),
      );
      expect(modeBefore).toMatchObject({
        person: { role: "editor" },
        scopes: ["site:read", "content:read", "content:write", "site:publish", "site:rollback"],
      });

      // runtime layer: the role is read on every call — simulate the gap before the key rewrite
      await sql.run(`UPDATE "member" SET "role" = 'author' WHERE "userId" = ?`, [t.editor.userId]);
      const between = structured<{ scopes: string[] }>(
        await (await connect(key.key)).callTool({ name: "get_mode", arguments: {} }),
      );
      expect(between.scopes).toEqual([
        "site:read",
        "content:read",
        "content:write:own",
        "site:publish:own",
      ]);
      await sql.run(`UPDATE "member" SET "role" = 'editor' WHERE "userId" = ?`, [t.editor.userId]);

      // persisted layer: the role change rewrites keys in the same request
      const demote = await call("PATCH", `/api/members/${t.editor.userId}`, {
        cookie: t.administrator.cookie,
        body: { role: "contributor" },
      });
      expect(demote.status, JSON.stringify(demote.body)).toBe(200);
      expect(demote.body.keysNarrowed).toEqual([
        {
          keyId: key.id,
          name: "editor-bot",
          scopes: {
            from: ["site:read", "content:read", "content:write", "site:publish", "site:rollback"],
            to: ["site:read", "content:read", "content:draft:own"],
          },
          mode: { from: "auto", to: "edits" },
          elevationEnded: false,
        },
      ]);
      const listed = (await call("GET", "/api/agent-keys", { cookie: t.editor.cookie }))
        .body as unknown as { id: string; scopes: string[]; mode: string }[];
      expect(listed.find((k) => k.id === key.id)).toMatchObject({
        scopes: ["site:read", "content:read", "content:draft:own"],
        mode: "edits",
      });
      const after = await connect(key.key);
      expect(
        structured<{ mode: string; scopes: string[] }>(
          await after.callTool({ name: "get_mode", arguments: {} }),
        ),
      ).toMatchObject({
        mode: "edits",
        scopes: ["site:read", "content:read", "content:draft:own"],
      });
      const rows = await audit.list({ deployment: true, limit: 50 });
      expect(rows.find((r) => r.tool === "agent-key.narrow")?.input).toMatchObject({
        keyId: key.id,
        mode: { from: "auto", to: "edits" },
      });
      expect(rows.find((r) => r.tool === "member.role")?.input).toEqual({
        userId: t.editor.userId,
        from: "editor",
        to: "contributor",
      });
      // the demoted person is told (notification)
      const notes = await call("GET", "/api/notifications", { cookie: t.editor.cookie });
      expect((notes.body.items as Json[]).find((n) => n.kind === "role-changed")).toMatchObject({
        from: "editor",
        to: "contributor",
      });
      // promotion does not widen the key back
      await call("PATCH", `/api/members/${t.editor.userId}`, {
        cookie: t.administrator.cookie,
        body: { role: "editor" },
      });
      const promoted = (await call("GET", "/api/agent-keys", { cookie: t.editor.cookie }))
        .body as unknown as { id: string; scopes: string[] }[];
      expect(promoted.find((k) => k.id === key.id)?.scopes).toEqual([
        "site:read",
        "content:read",
        "content:draft:own",
      ]);
    });

    it("I6/I12: elevations — only the creator grants (also via a request), up to the role's cap; Administrators end them and revoke keys", async () => {
      const t = await team();
      const authorKey = await newKey(t.author, { name: "a-bot", mode: "edits" });
      const contributorKey = await newKey(t.contributor, { name: "c-bot", mode: "manual" });
      // the creator grants; an Administrator cannot (someone else's key is not found for them)
      expect(
        (
          await call("POST", `/api/agent-keys/${authorKey.id}/elevation`, {
            cookie: t.administrator.cookie,
            body: { mode: "auto", minutes: 30 },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await call("POST", `/api/agent-keys/${contributorKey.id}/elevation`, {
            cookie: t.contributor.cookie,
            body: { mode: "auto", minutes: 30 },
          })
        ).body.error,
      ).toBe("mode_above_role");
      expect(
        (
          await call("POST", `/api/agent-keys/${authorKey.id}/elevation`, {
            cookie: t.author.cookie,
            body: { mode: "auto", minutes: 30 },
          })
        ).status,
      ).toBe(200);
      // an Administrator ends it and revokes the key (agents:manage); an Editor cannot
      expect(
        (
          await call("DELETE", `/api/agent-keys/${authorKey.id}/elevation`, {
            cookie: t.editor.cookie,
          })
        ).status,
      ).toBe(404);
      const ended = await call("DELETE", `/api/agent-keys/${authorKey.id}/elevation`, {
        cookie: t.administrator.cookie,
      });
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body.elevation).toBeUndefined();
      const all = await call("GET", "/api/agent-keys?all=1", { cookie: t.administrator.cookie });
      expect(
        (all.body as unknown as { id: string; owner: { userId: string } }[]).find(
          (k) => k.id === authorKey.id,
        )?.owner.userId,
      ).toBe(t.author.userId);
      // an agent's elevation request: a Contributor's agent may ask only up to edits
      const cAgent = await connect(contributorKey.key);
      const tooHigh = await cAgent.callTool({
        name: "request_elevation",
        arguments: { siteId, mode: "auto", minutes: 30, reason: "publish series" },
      });
      expect(text(tooHigh)).toMatch(/caps keys at EDITS/);
      const okAsk = await cAgent.callTool({
        name: "request_elevation",
        arguments: { siteId, mode: "edits", minutes: 30, reason: "write drafts" },
      });
      const reqId = structured<{ request: { id: string } }>(okAsk).request.id;
      // only the key's creator decides it
      const byAdmin = await call("POST", `/api/sites/${siteId}/approvals/${reqId}/approve`, {
        cookie: t.administrator.cookie,
      });
      expect(byAdmin.body).toMatchObject({ details: { code: "not_key_creator" } });
      const byCreator = await call("POST", `/api/sites/${siteId}/approvals/${reqId}/approve`, {
        cookie: t.contributor.cookie,
      });
      expect(byCreator.status, JSON.stringify(byCreator.body)).toBe(200);
      const revoked = await call("DELETE", `/api/agent-keys/${contributorKey.id}`, {
        cookie: t.administrator.cookie,
      });
      expect(revoked.status).toBe(204);
      expect(
        (await call("GET", "/api/me", { headers: { "x-api-key": contributorKey.key } })).status,
      ).toBe(401);
      expect(
        (await audit.list({ deployment: true })).some((r) => r.tool === "agent-key.revoke"),
      ).toBe(true);
    });

    // ───────────────────────────── I13: removal ─────────────────────────────

    it("I13: removal deletes the membership, revokes sessions, disables keys, cancels invites and denies pending requests", async () => {
      const t = await team();
      const key = await newKey(t.editor, { name: "doomed", mode: "edits" });
      const agent = await connect(key.key);
      const hello = (await store.listContentEntries(siteId, "posts")).find(
        (e) => e.slug === "hello-world",
      ) as ContentEntry;
      await agent.callTool({
        name: "delete_entry",
        arguments: { siteId, entryId: hello.id, rev: hello.rev },
      });
      const pending = await approvals.list({ siteId, status: "pending" });
      expect(pending).toHaveLength(1);
      const sent = await invite(t.editor, "friend@example.com", "author");
      expect(sent.status).toBe(201);
      // Editors cannot remove anyone; nobody removes the Owner or themselves
      expect(
        (await call("DELETE", `/api/members/${t.author.userId}`, { cookie: t.editor.cookie }))
          .status,
      ).toBe(403);
      const owner = await call("DELETE", `/api/members/${t.owner.userId}`, {
        cookie: t.administrator.cookie,
      });
      expect(owner.body).toMatchObject({ error: "rank", details: { problem: "target_is_owner" } });
      expect(
        (
          await call("DELETE", `/api/members/${t.administrator.userId}`, {
            cookie: t.administrator.cookie,
          })
        ).body,
      ).toMatchObject({ details: { problem: "self" } });

      const removed = await call("DELETE", `/api/members/${t.editor.userId}`, {
        cookie: t.administrator.cookie,
      });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      expect(removed.body).toEqual({
        userId: t.editor.userId,
        role: "editor",
        keysDisabled: 1,
        invitesCanceled: 1,
        requestsDenied: 1,
      });
      expect((await call("GET", "/api/me", { cookie: t.editor.cookie })).status).toBe(401);
      expect((await call("GET", "/api/me", { headers: { "x-api-key": key.key } })).status).toBe(
        401,
      );
      const denied = await approvals.get((pending[0] as { id: string }).id);
      expect(denied).toMatchObject({
        status: "denied",
        decidedBy: "sys_members0001",
        reason: "member removed",
      });
      const inviteToken = tokenOf(sent.body.url);
      expect(
        (await call("POST", "/api/invites/inspect", { body: { token: inviteToken } })).status,
      ).toBe(410);
      const row = (await audit.list({ deployment: true, tool: "member.remove" }))[0];
      expect(row?.input).toMatchObject({
        userId: t.editor.userId,
        keysDisabled: 1,
        invitesCanceled: 1,
      });
      expect(row?.siteId).toBeUndefined();
      // re-inviting restores access with the existing account (§7.4)
      const back = await invite(t.owner, t.editor.email, "author");
      const inspect = await call("POST", "/api/invites/inspect", {
        body: { token: tokenOf(back.body.url) },
      });
      expect(inspect.body.account).toBe("existing");
      expect((await accept(tokenOf(back.body.url), { password: "wrong password!" })).status).toBe(
        403,
      );
      const rejoin = await accept(tokenOf(back.body.url), {});
      expect(rejoin.status, JSON.stringify(rejoin.body)).toBe(200);
      expect(rejoin.body.role).toBe("author");
      await agent.close();
    });

    // ───────────────────────────── I11, I12, I14: invites ─────────────────────────────

    it("I11/I14: invite tokens are 256-bit, hashed, shown once, in the fragment, single use, revocable, expiring, email- and role-bound", async () => {
      const owner = await signUpOwner();
      const sent = await invite(owner, "Writer@Example.com", "author");
      expect(sent.status).toBe(201);
      const url = sent.body.url as string;
      expect(url).toMatch(/^http:\/\/studio\.test\/invite#chinv_[A-Za-z0-9_-]{43}$/);
      const token = tokenOf(url);
      const inv = sent.body.invite as Json;
      expect(inv).toMatchObject({
        email: "writer@example.com",
        role: "author",
        status: "pending",
        delivery: "link",
      });
      expect(JSON.stringify(sent.body.invite)).not.toContain(token);
      // only the hash is stored
      const stored = await sql.get<Json>(`SELECT * FROM "invitation" WHERE "id" = ?`, [
        inv.id as string,
      ]);
      expect(stored?.tokenHash).toBe(await sha256Hex(token));
      expect(JSON.stringify(stored)).not.toContain(token);
      // listing never shows the token again
      expect(
        JSON.stringify((await call("GET", "/api/invites", { cookie: owner.cookie })).body),
      ).not.toContain(token);
      // inspect consumes nothing; JSON only
      for (let i = 0; i < 2; i++) {
        const seen = await call("POST", "/api/invites/inspect", { body: { token } });
        expect(seen.body).toMatchObject({
          email: "writer@example.com",
          role: "author",
          inviterName: "Olive Owner",
          deploymentName: "Roles Daily",
          account: "new",
        });
      }
      const form = await app.request(`${ORIGIN}/api/invites/inspect`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${token}`,
      });
      expect(form.status).toBe(415);
      expect((await app.request(`${ORIGIN}/api/invites/inspect`)).status).toBe(404); // no GET
      // a different signed-in user is refused (no silent session switch)
      expect((await accept(token, {}, owner.cookie)).body.error).toBe("signed_in_as_other");
      // bound to its email and role: the body cannot pick others
      const done = await accept(token, {
        name: "Wanda Writer",
        email: "other@example.com",
        role: "administrator",
      });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(done.body).toMatchObject({
        role: "author",
        user: { email: "writer@example.com", name: "Wanda Writer" },
      });
      expect(cookieOf(done.res)).toMatch(/^better-auth\.session_token=/);
      const me = await call("GET", "/api/me", { cookie: cookieOf(done.res) });
      expect(me.body.role).toBe("author");
      expect(
        await sql.get(`SELECT "emailVerified" FROM "user" WHERE "email" = 'writer@example.com'`),
      ).toEqual({ emailVerified: 0 });
      // single use
      expect((await accept(token)).status).toBe(410);
      // revocation
      const second = await invite(owner, "second@example.com", "contributor");
      expect(
        (
          await call("DELETE", `/api/invites/${(second.body.invite as Json).id}`, {
            cookie: owner.cookie,
          })
        ).status,
      ).toBe(200);
      expect((await accept(tokenOf(second.body.url))).status).toBe(410);
      // re-inviting an email replaces its pending invite
      const r1 = await invite(owner, "again@example.com", "contributor");
      const r2 = await invite(owner, "again@example.com", "author");
      expect(
        (await call("POST", "/api/invites/inspect", { body: { token: tokenOf(r1.body.url) } }))
          .status,
      ).toBe(410);
      expect(
        (await call("POST", "/api/invites/inspect", { body: { token: tokenOf(r2.body.url) } })).body
          .role,
      ).toBe("author");
      // expiry (the default is 7 days)
      const expiring = await invite(owner, "late@example.com", "contributor", {
        expiresInHours: 1,
      });
      nowMs += 2 * 3_600_000;
      expect(
        (
          await call("POST", "/api/invites/inspect", {
            body: { token: tokenOf(expiring.body.url) },
          })
        ).body.error,
      ).toBe("invite_gone");
      expect((await accept(tokenOf(expiring.body.url))).status).toBe(410);
      expect(
        (await call("POST", "/api/invites/inspect", { body: { token: "chinv_notatoken" } })).status,
      ).toBe(410);
      // already a member
      expect((await invite(owner, "writer@example.com", "editor")).body.error).toBe(
        "already_member",
      );
      // I14: no token or hash in any audit row
      const rows = await audit.list({ limit: 200 });
      const dump = JSON.stringify(rows);
      expect(dump).not.toMatch(/chinv_/);
      expect(dump).not.toContain(await sha256Hex(token));
      expect(rows.map((r) => r.tool)).toEqual(
        expect.arrayContaining(["member.invite", "member.invite-accept", "member.invite-revoke"]),
      );
      expect(rows.find((r) => r.tool === "member.invite-accept")?.input).toMatchObject({
        role: "author",
        invitedBy: owner.userId,
      });
      // the inviter is told
      const notes = await call("GET", "/api/notifications", { cookie: owner.cookie });
      expect((notes.body.items as Json[]).find((n) => n.kind === "member-joined")).toMatchObject({
        role: "author",
        name: "Wanda Writer",
      });
    });

    it("I12: who invites whom; Administrator invites expire within 72 hours; public endpoints are rate-limited", async () => {
      const t = await team();
      expect((await invite(t.editor, "c@example.com", "contributor")).status).toBe(201);
      expect((await invite(t.editor, "a@example.com", "author")).status).toBe(201);
      const tooHigh = await invite(t.editor, "e@example.com", "editor");
      expect(tooHigh.status).toBe(403);
      expect(tooHigh.body).toMatchObject({ error: "rank", details: { problem: "role_too_high" } });
      expect((await invite(t.author, "x@example.com", "contributor")).body.error).toBe(
        "missing_scope",
      );
      expect((await invite(t.contributor, "x@example.com", "contributor")).status).toBe(403);
      expect((await invite(t.owner, "o@example.com", "owner")).body).toMatchObject({
        details: { problem: "owner_role" },
      });
      expect(
        (await invite(t.administrator, "ad@example.com", "administrator", { expiresInHours: 73 }))
          .body.error,
      ).toBe("invalid_expiry");
      const admin = await invite(t.administrator, "ad@example.com", "administrator");
      expect(admin.status).toBe(201);
      const hours =
        (Date.parse((admin.body.invite as Json).expiresAt as string) - nowMs) / 3_600_000;
      expect(hours).toBe(72);
      expect(
        (await invite(t.owner, "long@example.com", "author", { expiresInHours: 14 * 24 + 1 }))
          .status,
      ).toBe(400);
      expect(
        (await invite(t.owner, "mail@example.com", "author", { delivery: "email" })).body.error,
      ).toBe("delivery_unavailable");
      // an Editor cannot revoke an Administrator invite
      const adminInviteId = (admin.body.invite as Json).id as string;
      expect(
        (await call("DELETE", `/api/invites/${adminInviteId}`, { cookie: t.editor.cookie })).status,
      ).toBe(403);
      // 10 per minute per IP on the public endpoints
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++)
        statuses.push(
          (
            await call("POST", "/api/invites/inspect", {
              body: { token: "chinv_x" },
              headers: { "x-forwarded-for": "203.0.113.9" },
            })
          ).status,
        );
      expect(statuses.slice(0, 10).every((s) => s === 410)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    });

    it("§7.2: with a mail sender, invites are mailed (no link shown) and the email counts as verified", async () => {
      await make("first-user", true);
      const owner = await signUpOwner();
      const info = await call("GET", "/api/instance", { cookie: owner.cookie });
      expect((info.body.invites as Json).delivery).toEqual(["link", "email"]);
      const sent = await invite(owner, "mailed@example.com", "contributor", { delivery: "email" });
      expect(sent.status).toBe(201);
      expect(sent.body.url).toBeUndefined();
      expect(mailbox).toHaveLength(1);
      const token = (mailbox[0]?.text.match(/#(chinv_[A-Za-z0-9_-]{43})/) ?? [])[1] as string;
      expect((await accept(token)).status).toBe(200);
      expect(
        await sql.get(`SELECT "emailVerified" FROM "user" WHERE "email" = 'mailed@example.com'`),
      ).toEqual({ emailVerified: 1 });
    });

    // ───────────────────────────── I2: ownership ─────────────────────────────

    it("I2: ownership moves only by transfer — Owner only, to an Administrator, with the password, never two Owners", async () => {
      const t = await team();
      const transfer = (p: Person, body: Json) =>
        call("POST", "/api/members/transfer-ownership", { cookie: p.cookie, body });
      expect(
        (await transfer(t.administrator, { userId: t.administrator.userId, password: PASSWORD }))
          .body.error,
      ).toBe("owner_only");
      expect(
        (await transfer(t.owner, { userId: t.editor.userId, password: PASSWORD })).body.error,
      ).toBe("not_administrator");
      expect(
        (await transfer(t.owner, { userId: t.administrator.userId, password: "nope nope nope" }))
          .body.error,
      ).toBe("wrong_password");
      // the Owner cannot be demoted, and nobody assigns `owner`
      expect(
        (
          await call("PATCH", `/api/members/${t.owner.userId}`, {
            cookie: t.administrator.cookie,
            body: { role: "editor" },
          })
        ).body,
      ).toMatchObject({ details: { problem: "target_is_owner" } });
      expect(
        (
          await call("PATCH", `/api/members/${t.editor.userId}`, {
            cookie: t.administrator.cookie,
            body: { role: "owner" },
          })
        ).body,
      ).toMatchObject({ details: { problem: "owner_role" } });
      expect(
        (
          await call("PATCH", `/api/members/${t.administrator.userId}`, {
            cookie: t.administrator.cookie,
            body: { role: "editor" },
          })
        ).body,
      ).toMatchObject({ details: { problem: "self" } });
      const ok = await transfer(t.owner, { userId: t.administrator.userId, password: PASSWORD });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const roles = async () =>
        Object.fromEntries(
          (
            (await call("GET", "/api/members", { cookie: t.owner.cookie })).body.items as Json[]
          ).map((m) => [m.userId, m.role]),
        );
      expect(await roles()).toMatchObject({
        [t.owner.userId]: "administrator",
        [t.administrator.userId]: "owner",
      });
      expect(
        (await audit.list({ deployment: true, tool: "member.transfer-ownership" }))[0]?.input,
      ).toEqual({ from: t.owner.userId, to: t.administrator.userId });
      // concurrent transfers by the new Owner: at most one wins, there is exactly one Owner
      const another = await join(t.administrator, "administrator", "admin2");
      const results = await Promise.all([
        auth.staff.store.transfer(t.administrator.userId, t.owner.userId),
        auth.staff.store.transfer(t.administrator.userId, another.userId),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const owners = await sql.all(`SELECT "userId" FROM "member" WHERE "role" = 'owner'`);
      expect(owners).toHaveLength(1);
    });

    it("operator recovery: POST /api/admin/owner behind the deployment token (cloudhal owner transfer)", async () => {
      const t = await team();
      const post = (body: Json, token = DEPLOY_TOKEN) =>
        call("POST", "/api/admin/owner", { body, headers: { authorization: `Bearer ${token}` } });
      expect(
        (await post({ email: t.editor.email }, "wrong-token-wrong-token-wrong-token!!")).status,
      ).toBe(401);
      expect((await post({ email: "nobody@example.com" })).status).toBe(404);
      const moved = await post({ email: t.editor.email });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      expect(moved.body).toMatchObject({ from: t.owner.userId, to: t.editor.userId });
      expect((await call("GET", "/api/me", { cookie: t.editor.cookie })).body.role).toBe("owner");
      expect((await call("GET", "/api/me", { cookie: t.owner.cookie })).body.role).toBe(
        "administrator",
      );
      expect(
        (await audit.list({ deployment: true, tool: "member.transfer-ownership" }))[0],
      ).toMatchObject({ actor: { id: "sys_operator01" }, input: { via: "deploy-token" } });
    });

    // ───────────────────────────── password reset (open question 6) ─────────────────────────────

    it("an Administrator issues a one-time reset link (chrst_, 1 hour); never for the Owner", async () => {
      const t = await team();
      expect(
        (
          await call("POST", `/api/members/${t.owner.userId}/password-reset`, {
            cookie: t.administrator.cookie,
          })
        ).body,
      ).toMatchObject({ details: { problem: "target_is_owner" } });
      expect(
        (
          await call("POST", `/api/members/${t.author.userId}/password-reset`, {
            cookie: t.editor.cookie,
          })
        ).status,
      ).toBe(403);
      const issued = await call("POST", `/api/members/${t.author.userId}/password-reset`, {
        cookie: t.administrator.cookie,
      });
      expect(issued.status).toBe(201);
      expect(issued.body.url).toMatch(/\/reset-password#chrst_[A-Za-z0-9_-]{43}$/);
      const token = tokenOf(issued.body.url);
      expect(
        (await call("POST", "/api/password-reset/inspect", { body: { token } })).body,
      ).toMatchObject({ email: t.author.email });
      expect(
        (await call("POST", "/api/password-reset/complete", { body: { token, password: "short" } }))
          .body.error,
      ).toBe("weak_password");
      const done = await call("POST", "/api/password-reset/complete", {
        body: { token, password: "a brand new passphrase" },
      });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(
        (
          await call("POST", "/api/password-reset/complete", {
            body: { token, password: "another new passphrase" },
          })
        ).status,
      ).toBe(410);
      // signed out everywhere; the old password stops working, the new one works
      expect((await call("GET", "/api/me", { cookie: t.author.cookie })).status).toBe(401);
      expect(
        (
          await call("POST", "/api/auth/sign-in/email", {
            body: { email: t.author.email, password: PASSWORD },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call("POST", "/api/auth/sign-in/email", {
            body: { email: t.author.email, password: "a brand new passphrase" },
          })
        ).status,
      ).toBe(200);
      // expiry
      const later = await call("POST", `/api/members/${t.contributor.userId}/password-reset`, {
        cookie: t.administrator.cookie,
      });
      nowMs += 61 * 60_000;
      expect(
        (
          await call("POST", "/api/password-reset/inspect", {
            body: { token: tokenOf(later.body.url) },
          })
        ).status,
      ).toBe(410);
      const dump = JSON.stringify(await audit.list({ limit: 200 }));
      expect(dump).not.toMatch(/chrst_/);
    });

    // ───────────────────────────── sign-up modes ─────────────────────────────

    it("§7.5: `open` sign-ups join as Contributors (the first one is the Owner)", async () => {
      await make("open");
      const signUp = (email: string) =>
        call("POST", "/api/auth/sign-up/email", {
          body: { name: email, email, password: PASSWORD },
        });
      const first = await signUp("first@example.com");
      const second = await signUp("second@example.com");
      expect((await call("GET", "/api/me", { cookie: cookieOf(first.res) })).body.role).toBe(
        "owner",
      );
      const me = await call("GET", "/api/me", { cookie: cookieOf(second.res) });
      expect(me.body).toMatchObject({ role: "contributor" });
      expect(
        (
          await call("POST", `/api/sites/${siteId}/pages`, {
            cookie: cookieOf(second.res),
            body: { path: "/x", title: "x", locale: "en", status: "draft", sections: [] },
          })
        ).status,
      ).toBe(403);
    });

    it("§10.2: a person's MCP session has their role's scopes; a publish beyond it becomes a request an Editor approves", async () => {
      const t = await team();
      await publishBaseline(t.owner);
      const client = new Client(
        { name: "author-session", version: "1.0.0" },
        { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: "auto" } },
      );
      const asked: string[] = [];
      client.setRequestHandler("elicitation/create", async (req) => {
        asked.push(req.params.message);
        return { action: "accept", content: { confirm: true } };
      });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
          requestInit: { headers: { cookie: t.author.cookie } },
          fetch: async (input, init) => app.fetch(new Request(input, init as RequestInit)),
        }),
      );
      expect(client.getInstructions()).toMatch(/You are acting for AUTHOR, Author/);
      expect(
        text(
          await client.callTool({
            name: "create_page",
            arguments: { siteId, path: "/y", title: "Y" },
          }),
        ),
      ).toMatch(/missing scope content:write/);
      const hello = (await store.listContentEntries(siteId, "posts")).find(
        (e) => e.slug === "hello-world",
      ) as ContentEntry;
      await call("PUT", `/api/sites/${siteId}/entries/${hello.id}`, {
        cookie: t.editor.cookie,
        body: { ...hello, title: "Editor" },
      });
      const wide = await client.callTool({ name: "publish", arguments: { siteId } });
      expect(asked).toHaveLength(0); // never elicited from the person's own client
      const id = text(wide).match(/approvalId: (appr_\w+)/)?.[1] as string;
      expect(await approvals.get(id)).toMatchObject({
        cause: "role",
        actor: { kind: "human", id: t.author.actorId },
      });
      const ok = await call("POST", `/api/sites/${siteId}/approvals/${id}/approve`, {
        cookie: t.editor.cookie,
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.status).toBe("consumed");
      expect((await store.getContentEntry(hello.id))?.title).toBe("Editor");
      const live = await store.getSnapshot(
        ((await store.getSite(siteId)) as Site).publishedSnapshotId as string,
      );
      expect(live?.reason).toBe("publish");
      await client.close();
    });
  });
}

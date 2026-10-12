import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { SqlDriver } from "@cloudhal/storage";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";

interface Backend {
  label: string;
  setup(): Promise<{
    store: SiteGraphStore;
    database: unknown;
    sql: SqlDriver;
    dispose?(): Promise<void>;
  }>;
}

const backends: Backend[] = [
  {
    label: "better-sqlite3",
    async setup() {
      const db = new Database(":memory:");
      const sql = new BetterSqlite3Driver(db);
      const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
      await store.init();
      return { store, database: db, sql };
    },
  },
  {
    label: "Cloudflare D1 (Miniflare)",
    async setup() {
      const h = await createMiniflareD1();
      const sql = new D1Driver(h.db);
      const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
      await store.init();
      return { store, database: h.db, sql, dispose: () => h.dispose() };
    },
  },
];

for (const backend of backends) {
  describe(`auth on ${backend.label}`, async () => {
    const { store, database, sql, dispose } = await backend.setup();
    const siteId = (await seedStarterSite(store, { name: "Auth Site", slug: "auth-site" })).id;
    const auth = createAuth({
      database,
      sql,
      baseURL: "http://localhost",
      secret: "test-secret-test-secret-test-secret",
    });
    const app = createApi({
      store,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      staff: auth.staff,
    });

    afterAll(async () => {
      await dispose?.();
    });

    it("sign-up sets a session cookie that resolves to a human actor", async () => {
      const res = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Halil",
          email: "halil@example.com",
          password: "correct horse battery",
        }),
      });
      expect(res.status, await res.clone().text()).toBe(200);
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("better-auth.session_token=");
      const sessionCookie = cookie.split(";")[0] as string;

      const me = await app.request("/api/me", { headers: { cookie: sessionCookie } });
      expect(me.status).toBe(200);
      const { actor } = (await me.json()) as { actor: { kind: string; id: string; name?: string } };
      expect(actor.kind).toBe("human");
      expect(actor.id).toMatch(/^user_[A-Za-z0-9]{6,32}$/);
      expect(actor.name).toBe("Halil");

      // an authenticated mutation records the actor
      const snap = await app.request(`/api/sites/${siteId}/snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ label: "from session" }),
      });
      expect(snap.status).toBe(201);
      expect(
        ((await snap.json()) as { snapshot: { actor: { id: string } } }).snapshot.actor.id,
      ).toBe(actor.id);
    });

    it("sign-in works, wrong password and anonymous requests are rejected", async () => {
      const bad = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "halil@example.com", password: "wrong" }),
      });
      expect(bad.status).toBe(401);
      const ok = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "halil@example.com", password: "correct horse battery" }),
      });
      expect(ok.status).toBe(200);
      expect((await app.request("/api/sites")).status).toBe(401);
      expect(
        (
          await app.request("/api/sites", {
            headers: { cookie: "better-auth.session_token=forged" },
          })
        ).status,
      ).toBe(401);
    });
  });
}

describe("sign-up policy", () => {
  const signUp = (app: ReturnType<typeof createApi>, email: string) =>
    app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: email, email, password: "correct horse battery" }),
    });
  const make = async (signUpMode?: "first-user" | "closed" | "open", setupToken?: string) => {
    const db = new Database(":memory:");
    const sql = new BetterSqlite3Driver(db);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const auth = createAuth({
      database: db,
      sql,
      baseURL: "http://localhost",
      secret: "test-secret-test-secret-test-secret",
      ...(signUpMode ? { signUp: signUpMode } : {}),
      ...(setupToken ? { setupToken } : {}),
    });
    return createApi({
      store,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      staff: auth.staff,
    });
  };

  it("by default only the first account (the owner) can sign up", async () => {
    const app = await make();
    expect((await signUp(app, "owner@example.com")).status).toBe(200);
    const second = await signUp(app, "stranger@example.com");
    expect(second.status).toBe(403);
    expect(await second.text()).toMatch(/already has an owner/);
  });

  it("can be closed or opened explicitly", async () => {
    expect((await signUp(await make("closed"), "a@example.com")).status).not.toBe(200);
    const open = await make("open");
    expect((await signUp(open, "a@example.com")).status).toBe(200);
    expect((await signUp(open, "b@example.com")).status).toBe(200);
  });

  it("with a setup token, only its holder can create the owner account (M4)", async () => {
    const token = "owner-setup-token-0123456789abcdefghijkl";
    const app = await make("first-user", token);
    const withToken = (value: string) =>
      app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-cloudhal-setup-token": value },
        body: JSON.stringify({
          name: "o",
          email: "owner@example.com",
          password: "correct horse battery",
        }),
      });
    expect((await signUp(app, "squatter@example.com")).status).toBe(403);
    expect((await withToken("wrong-token")).status).toBe(403);
    expect((await withToken(token)).status).toBe(200);
    expect((await withToken(token)).status).toBe(403); // owner exists: closed for everyone
  });
});

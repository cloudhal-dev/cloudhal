/**
 * Where the API and Better Auth take the client's address from (#165): the header the deployment
 * vouches for (`clientAddressHeader`; `CF-Connecting-IP` by default), never `X-Forwarded-For` as
 * the client sent it. And Better Auth's Origin check for a Studio served without a public origin:
 * `trustedOriginsWithOwn` accepts the origin a request was made to, as the API's CSRF check does.
 */
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { type AuthOptions, createAuth, trustedOriginsWithOwn } from "../src/auth.ts";

const SECRET = "test-secret-test-secret-test-secret";

async function make(
  options: Partial<Pick<AuthOptions, "trustedOrigins" | "originCheck" | "baseURL">> & {
    clientAddressHeader?: string;
  } = {},
) {
  const db = new Database(":memory:");
  const sql = new BetterSqlite3Driver(db);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const auth = createAuth({
    database: db,
    sql,
    baseURL: options.baseURL ?? "http://localhost:8787",
    secret: SECRET,
    ...(options.trustedOrigins ? { trustedOrigins: options.trustedOrigins } : {}),
    ...(options.originCheck ? { originCheck: options.originCheck } : {}),
    ...(options.clientAddressHeader ? { clientAddressHeader: options.clientAddressHeader } : {}),
  });
  const app = createApi({
    store,
    resolvePrincipal: auth.resolvePrincipal,
    authHandler: auth.handler,
    staff: auth.staff,
    ...(options.clientAddressHeader ? { clientAddressHeader: options.clientAddressHeader } : {}),
  });
  return { app, sql };
}

const json = { "content-type": "application/json" };

function signUp(
  app: Awaited<ReturnType<typeof make>>["app"],
  url: string,
  headers: Record<string, string>,
) {
  return app.request(url, {
    method: "POST",
    headers: { ...json, ...headers },
    body: JSON.stringify({
      name: "Olive Owner",
      email: "owner@example.test",
      password: "correct horse battery staple",
    }),
  });
}

describe("the client address for rate limits", () => {
  const inspect = (app: Awaited<ReturnType<typeof make>>["app"], headers: Record<string, string>) =>
    app.request("http://localhost:8787/api/invites/inspect", {
      method: "POST",
      headers: { ...json, ...headers },
      body: JSON.stringify({ token: "chinv_x" }),
    });
  const statuses = async (
    app: Awaited<ReturnType<typeof make>>["app"],
    headers: (i: number) => Record<string, string>,
    n = 11,
  ) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await inspect(app, headers(i))).status);
    return out;
  };

  it("is read from the configured header only, whatever else the client sends", async () => {
    const { app } = await make({ clientAddressHeader: "x-test-address" });
    const one = await statuses(app, (i) => ({
      "x-test-address": "203.0.113.9",
      // a client varying these does not get fresh buckets
      "cf-connecting-ip": `198.51.100.${i}`,
      "x-forwarded-for": `192.0.2.${i}`,
    }));
    expect(one.slice(0, 10).every((s) => s === 410)).toBe(true);
    expect(one[10]).toBe(429);
    // another address counts separately
    expect((await inspect(app, { "x-test-address": "203.0.113.10" })).status).toBe(410);
  });

  it("defaults to CF-Connecting-IP (Workers) and never to X-Forwarded-For", async () => {
    const { app } = await make();
    const spoofing = await statuses(app, (i) => ({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": `192.0.2.${i}`,
    }));
    expect(spoofing[10]).toBe(429);
    const { app: fresh } = await make();
    const distinct = await statuses(fresh, (i) => ({ "cf-connecting-ip": `198.51.100.${i}` }));
    expect(distinct.every((s) => s === 410)).toBe(true);
  });

  it("is what Better Auth records for a session", async () => {
    const { app, sql } = await make({ clientAddressHeader: "x-test-address" });
    const res = await signUp(app, "http://localhost:8787/api/auth/sign-up/email", {
      "x-test-address": "203.0.113.9",
      "x-forwarded-for": "198.51.100.7",
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const row = await sql.get<{ ipAddress: string | null }>(
      'SELECT "ipAddress" FROM "session" ORDER BY "createdAt" DESC LIMIT 1',
    );
    expect(row?.ipAddress).toBe("203.0.113.9");
  });

  it("limits Better Auth's sign-in per address even outside production (Node, #165)", async () => {
    const { app } = await make({ clientAddressHeader: "x-test-address" });
    const signIn = (address: string, spoof: string) =>
      app.request("http://localhost:8787/api/auth/sign-in/email", {
        method: "POST",
        headers: { ...json, "x-test-address": address, "x-forwarded-for": spoof },
        body: JSON.stringify({ email: "nobody@example.test", password: "wrong password here" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await signIn("203.0.113.9", `192.0.2.${i}`)).status);
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
    expect((await signIn("203.0.113.10", "192.0.2.9")).status).not.toBe(429);
  });
});

describe("Better Auth's Origin check for a Studio without a public origin", () => {
  const own = "http://10.0.0.5:8787";
  const url = `${own}/api/auth/sign-up/email`;

  it("trustedOriginsWithOwn adds the request's origin to the list", async () => {
    const trusted = trustedOriginsWithOwn(["http://localhost:5173"]);
    expect(await trusted(new Request(`${own}/api/auth/sign-in/email`))).toEqual([
      "http://localhost:5173",
      own,
    ]);
    expect(await trusted(undefined)).toEqual(["http://localhost:5173"]);
    const loopback = trustedOriginsWithOwn([], { loopbackOnly: true });
    expect(await loopback(new Request("http://127.0.0.1:8787/x"))).toEqual([
      "http://127.0.0.1:8787",
    ]);
    expect(await loopback(new Request("http://[::1]:8787/x"))).toEqual(["http://[::1]:8787"]);
    expect(await loopback(new Request("http://localhost:8787/x"))).toEqual([
      "http://localhost:8787",
    ]);
    expect(await loopback(new Request("http://127.0.0.2:8787/x"))).toEqual([
      "http://127.0.0.2:8787",
    ]);
    expect(await loopback(new Request("http://[::ffff:127.0.0.1]:8787/x"))).toEqual([
      "http://[::ffff:7f00:1]:8787",
    ]);
    expect(await loopback(new Request("http://rebound.example:8787/x"))).toEqual([]);
    expect(await loopback(new Request("http://127.0.0.1.rebound.example:8787/x"))).toEqual([]);
  });

  it("refuses a sign-up from an address that is not the base URL with the static list", async () => {
    const { app } = await make({
      originCheck: "always",
      trustedOrigins: ["http://localhost:5173"],
    });
    const res = await signUp(app, url, { origin: own });
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/invalid origin/i);
  });

  it("accepts it once the request's own origin is trusted, and still refuses other origins", async () => {
    const trusted = trustedOriginsWithOwn(["http://localhost:5173"]);
    const { app } = await make({ originCheck: "always", trustedOrigins: trusted });
    expect((await signUp(app, url, { origin: "https://evil.example" })).status).toBe(403);
    const ok = await signUp(app, url, { origin: own });
    expect(ok.status, await ok.clone().text()).toBe(200);
    // the dev server, from the static part of the list
    const { app: dev } = await make({ originCheck: "always", trustedOrigins: trusted });
    expect((await signUp(dev, url, { origin: "http://localhost:5173" })).status).toBe(200);
  });
});

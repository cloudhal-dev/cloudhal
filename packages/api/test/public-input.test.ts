/**
 * #174 item 1: the unauthenticated reset request checks the address in linear time with the
 * length first, and public token endpoints refuse bodies above `JSON_BODY_MAX_BYTES` with 413.
 */
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { EMAIL_MAX_LENGTH, isEmailAddress } from "../src/email.ts";
import { JSON_BODY_MAX_BYTES } from "../src/tokens.ts";

/** What the routes checked before #174. */
const OLD_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oldCheck = (s: string) => OLD_EMAIL.test(s) && s.length <= EMAIL_MAX_LENGTH;

describe("isEmailAddress (#174)", () => {
  it("accepts exactly what the old regex and length cap accepted", () => {
    const samples = [
      "a@b.c",
      "owner@example.com",
      "first.last+tag@sub.example.co.uk",
      "a@b..c",
      "a@.b.c",
      "a@..",
      "a@...",
      "a@b.",
      "a@.b",
      "a@bc",
      "@b.c",
      "a@@b.c",
      "a@b@c.d",
      "a b@c.d",
      "a@b.c ",
      "a@b.\tc",
      "",
      "@",
      "a@",
      `${"a".repeat(250)}@b.c`,
      `${"a".repeat(251)}@b.c`,
    ];
    for (const s of samples) expect(isEmailAddress(s), JSON.stringify(s)).toBe(oldCheck(s));
    // Every string of up to 6 characters over the characters that matter.
    const alphabet = ["a", ".", "@", " "];
    let all = [""];
    for (let len = 1; len <= 6; len++) {
      all = all.flatMap((s) => alphabet.map((c) => s + c));
      for (const s of all) expect(isEmailAddress(s), JSON.stringify(s)).toBe(oldCheck(s));
    }
  });

  it("answers in linear time on input that made the old regex backtrack", () => {
    // The old regex took about a second on 40k dots and grew with the square of the length.
    const start = performance.now();
    expect(isEmailAddress(`a@${".".repeat(100_000)}@`)).toBe(false);
    expect(isEmailAddress(`a@b${".".repeat(100_000)}`)).toBe(false);
    expect(isEmailAddress(`a@${".".repeat(200)}@`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("public token endpoints (#174)", () => {
  const ORIGIN = "http://public.test";
  const setup = async () => {
    const database = new Database(":memory:");
    const sql = new BetterSqlite3Driver(database);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const auth = createAuth({
      database,
      sql,
      baseURL: ORIGIN,
      secret: "public-input-test-secret-0123456789abcde",
      signUp: "first-user",
    });
    return createApi({
      store,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      staff: auth.staff,
      signUp: auth.signUp,
      mail: { id: "test", send: async () => undefined },
      defer: () => undefined,
    });
  };
  const post = (app: Awaited<ReturnType<typeof setup>>, path: string, body: string) =>
    app.request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  it("refuses a 100k-character address quickly, before any regex sees it", async () => {
    const app = await setup();
    const email = `a@${".".repeat(60_000)}@`; // under the body cap; the old regex took ~2 s
    const start = performance.now();
    const res = await post(app, "/api/password-reset/request", JSON.stringify({ email }));
    expect(res.status).toBe(400);
    expect(performance.now() - start).toBeLessThan(500);
    const ok = await post(app, "/api/password-reset/request", JSON.stringify({ email: "x@y.z" }));
    expect(ok.status).toBe(202);
  });

  it("answers 413 for a body above the cap, with or without content-length", async () => {
    const app = await setup();
    const big = JSON.stringify({ email: `a@${".".repeat(JSON_BODY_MAX_BYTES)}` });
    const res = await post(app, "/api/password-reset/request", big);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    // A streamed body (no content-length) is cut off once it passes the cap.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(encoder.encode(" ".repeat(10_000)));
        controller.enqueue(encoder.encode("{}"));
        controller.close();
      },
    });
    const streamed = await app.request(`${ORIGIN}/api/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(streamed.status).toBe(413);
    // At the cap the body is read and judged as usual.
    const atCap = JSON.stringify({ email: "x@y.z", pad: " ".repeat(JSON_BODY_MAX_BYTES - 40) });
    expect(new TextEncoder().encode(atCap).byteLength).toBeLessThanOrEqual(JSON_BODY_MAX_BYTES);
    expect((await post(app, "/api/password-reset/request", atCap)).status).toBe(202);
  });
});

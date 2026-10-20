/** RFC-0036 phase 3, the parts that need no workerd: sessions, link prefixes, Worker routing. */
import { describe, expect, it } from "vitest";
import {
  createPlaygroundWorker,
  newSessionId,
  type PlaygroundEnv,
  prefixPath,
  sessionTime,
  signSession,
  verifySession,
} from "../src/playground.ts";
import { readSessionCookie, SESSION_COOKIE } from "../src/playground-session.ts";

const SECRET = "playground-unit-secret-0123456789abcdef";

describe("playground sessions", () => {
  it("encodes the creation time in a ULID", () => {
    const now = Date.parse("2026-10-20T18:00:00.123Z");
    const id = newSessionId(now);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(sessionTime(id)).toBe(now);
    expect(newSessionId(now)).not.toBe(id);
    expect(sessionTime("not-a-ulid")).toBeUndefined();
  });

  it("signs cookies and refuses forged or altered ones", async () => {
    const id = newSessionId(Date.now());
    const value = await signSession(id, SECRET);
    expect(await verifySession(value, SECRET)).toBe(id);
    expect(await verifySession(value, `${SECRET}x`)).toBeUndefined();
    const other = newSessionId(Date.now());
    expect(await verifySession(`${other}.${value.split(".")[1]}`, SECRET)).toBeUndefined();
    expect(await verifySession(id, SECRET)).toBeUndefined();
    expect(await verifySession(`${value}.x`, SECRET)).toBeUndefined();
  });

  it("reads the cookie among others", () => {
    const req = new Request("https://try.test/", {
      headers: { cookie: `a=1; ${SESSION_COOKIE}=abc.def; b=2` },
    });
    expect(readSessionCookie(req)).toBe("abc.def");
  });
});

describe("prefixPath", () => {
  it("keeps the session's site under its prefix and leaves Worker paths alone", () => {
    const p = "/s/01J";
    expect(prefixPath("/", p)).toBe("/s/01J/");
    expect(prefixPath("/blog/post/", p)).toBe("/s/01J/blog/post/");
    expect(prefixPath("/s/01J/x", p)).toBe("/s/01J/x");
    for (const href of [
      "/media/abc/x.png",
      "/_astro/a.css",
      "https://x.test/",
      "//x.test/",
      "#top",
      "mailto:a@b",
    ])
      expect(prefixPath(href, p), href).toBe(href);
  });
});

describe("the playground Worker without workerd", () => {
  const seen: string[] = [];
  const env = (extra: Partial<PlaygroundEnv> = {}): PlaygroundEnv =>
    ({
      ASSETS: {
        fetch: async (r: Request) => {
          seen.push(new URL(r.url).pathname);
          return new Response(`asset ${new URL(r.url).pathname}`);
        },
      },
      PLAYGROUND: {
        idFromName: (n: string) => n,
        get: () => ({ fetch: async () => new Response("from the session") }),
      },
      PLAYGROUND_SECRET: SECRET,
      ...extra,
    }) as unknown as PlaygroundEnv;
  const { worker } = createPlaygroundWorker({
    deployUrl: "https://cloudhal.dev/docs/deploy",
    seed: async () => ({ siteId: "site_x" }),
  });
  const cookieFor = async (id: string) => `${SESSION_COOKIE}=${await signSession(id, SECRET)}`;

  it("shows the landing page at / without a session and Studio with one", async () => {
    expect(await (await worker.fetch(new Request("https://try.test/"), env())).text()).toBe(
      "asset /landing/",
    );
    const cookie = await cookieFor(newSessionId(Date.now()));
    const studio = await worker.fetch(
      new Request("https://try.test/", { headers: { cookie } }),
      env(),
    );
    expect(await studio.text()).toBe("asset /");
  });

  it("issues a signed, host-only session cookie", async () => {
    const res = await worker.fetch(
      new Request("https://try.test/_playground/session", { method: "POST" }),
      env(),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sites");
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(
      /^__Host-cloudhal_try=[0-9A-Z]{26}\.[\w-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7200$/,
    );
    expect(set).not.toContain("Domain");
  });

  it("refuses expired, future-dated and unsigned sessions", async () => {
    for (const cookie of [
      await cookieFor(newSessionId(Date.now() - 121 * 60_000)),
      await cookieFor(newSessionId(Date.now() + 10 * 60_000)),
      `${SESSION_COOKIE}=${newSessionId(Date.now())}`,
    ]) {
      const res = await worker.fetch(
        new Request("https://try.test/api/me", { headers: { cookie } }),
        env(),
      );
      expect(res.status).toBe(410);
    }
  });

  it("guards the API before the Durable Object and keeps sessions apart", async () => {
    const id = newSessionId(Date.now());
    const cookie = await cookieFor(id);
    const call = (path: string, method = "GET") =>
      worker.fetch(new Request(`https://try.test${path}`, { method, headers: { cookie } }), env());
    expect((await call("/api/members")).status).toBe(403);
    expect((await call("/mcp", "POST")).status).toBe(403);
    expect(await (await call("/api/me")).text()).toBe("from the session");
    expect(await (await call(`/s/${id}/`)).text()).toBe("from the session");
    expect((await call(`/s/${newSessionId(Date.now())}/`)).status).toBe(404);
  });

  it("serves only the landing page behind the kill switch", async () => {
    const off = env({ PLAYGROUND_ENABLED: "false" });
    const cookie = await cookieFor(newSessionId(Date.now()));
    expect(
      await (
        await worker.fetch(new Request("https://try.test/", { headers: { cookie } }), off)
      ).text(),
    ).toBe("asset /landing/");
    expect(
      (await worker.fetch(new Request("https://try.test/api/me", { headers: { cookie } }), off))
        .status,
    ).toBe(503);
    const session = await worker.fetch(
      new Request("https://try.test/_playground/session", { method: "POST" }),
      off,
    );
    expect(session.status).toBe(503);
    expect(session.headers.get("set-cookie")).toBeNull();
  });

  it("asks for Turnstile only after a rate-limit hit", async () => {
    const limited = env({
      SESSION_LIMIT: { limit: async () => ({ success: false }) },
      TURNSTILE_SITE_KEY: "site-key",
    });
    const res = await worker.fetch(
      new Request("https://try.test/_playground/session", { method: "POST" }),
      limited,
    );
    expect(res.status).toBe(429);
    expect(((await res.json()) as { turnstile?: string }).turnstile).toBe("site-key");
  });
});

/**
 * `serveNode` behind a reverse proxy (self-hosting, #143): with `trustProxy` the request the app
 * sees carries the scheme and host the proxy forwarded, so the API's own origin is the public one;
 * without it the headers are ignored.
 */
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import type { CloudhalApi } from "../src/app.ts";
import { forwardedUrl, serveNode } from "../src/node.ts";

describe("forwardedUrl", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("takes scheme and host from the proxy headers", () => {
    expect(
      forwardedUrl(
        "http://127.0.0.1:8787/api/me?x=1",
        h({ "x-forwarded-proto": "https", "x-forwarded-host": "studio.example.com" }),
      ),
    ).toBe("https://studio.example.com/api/me?x=1");
  });

  it("uses the first value of a proxy chain and keeps a forwarded port", () => {
    expect(
      forwardedUrl(
        "http://127.0.0.1:8787/",
        h({ "x-forwarded-proto": "https, http", "x-forwarded-host": "a.example:8443, b.example" }),
      ),
    ).toBe("https://a.example:8443/");
  });

  it("changes only what a header says, and ignores values that are not a scheme or a host", () => {
    expect(forwardedUrl("http://studio.example.com/x", h({ "x-forwarded-proto": "https" }))).toBe(
      "https://studio.example.com/x",
    );
    expect(forwardedUrl("http://127.0.0.1:8787/x", h({ "x-forwarded-host": "[::1]:9000" }))).toBe(
      "http://[::1]:9000/x",
    );
    expect(
      forwardedUrl(
        "http://127.0.0.1:8787/x",
        h({ "x-forwarded-proto": "javascript", "x-forwarded-host": "evil.example/path" }),
      ),
    ).toBe("http://127.0.0.1:8787/x");
    expect(forwardedUrl("http://127.0.0.1:8787/x", h({}))).toBe("http://127.0.0.1:8787/x");
  });
});

describe("serveNode trustProxy", () => {
  const app = new Hono();
  app.all("*", async (c) =>
    c.json({
      url: c.req.url,
      method: c.req.method,
      body: c.req.method === "POST" ? await c.req.text() : null,
    }),
  );
  const servers: { server: { close(cb: () => void): void } }[] = [];
  afterAll(async () => {
    for (const s of servers) await new Promise<void>((r) => s.server.close(() => r()));
  });
  const start = async (trustProxy: boolean) => {
    const s = await serveNode(app as unknown as CloudhalApi, { port: 0, trustProxy });
    servers.push(s);
    return `http://127.0.0.1:${s.port}`;
  };
  const forwarded = { "x-forwarded-proto": "https", "x-forwarded-host": "studio.example.com" };

  it("rewrites the request URL from the forwarded headers, body included", async () => {
    const base = await start(true);
    const get = (await (await fetch(`${base}/api/x?y=1`, { headers: forwarded })).json()) as {
      url: string;
    };
    expect(get.url).toBe("https://studio.example.com/api/x?y=1");
    const post = (await (
      await fetch(`${base}/api/x`, { method: "POST", headers: forwarded, body: "hello" })
    ).json()) as { url: string; body: string };
    expect(post).toEqual({
      url: "https://studio.example.com/api/x",
      method: "POST",
      body: "hello",
    });
    // nothing forwarded: the request is as it came
    const plain = (await (await fetch(`${base}/api/x`)).json()) as { url: string };
    expect(plain.url).toBe(`${base}/api/x`);
  });

  it("ignores the headers without trustProxy", async () => {
    const base = await start(false);
    const r = (await (await fetch(`${base}/api/x`, { headers: forwarded })).json()) as {
      url: string;
    };
    expect(r.url).toBe(`${base}/api/x`);
  });
});

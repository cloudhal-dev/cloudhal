/**
 * `serveNode` behind a reverse proxy (self-hosting, #143) and the client address it vouches for
 * (#165): with `trustProxy` the request the app sees carries the scheme and host the proxy
 * forwarded and the last `X-Forwarded-For` hop as the client's address; without it the headers
 * are ignored and the socket's address counts. A client never picks its own address.
 */
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import type { CloudhalApi } from "../src/app.ts";
import {
  CLIENT_ADDRESS_HEADER,
  clientAddress,
  forwardedUrl,
  inboundRequest,
  serveNode,
} from "../src/node.ts";

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

  it("uses the last value of a chain (the trusted proxy's own) and keeps a forwarded port", () => {
    expect(
      forwardedUrl(
        "http://127.0.0.1:8787/",
        h({
          "x-forwarded-proto": "http, https",
          "x-forwarded-host": "evil.example, a.example:8443",
        }),
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

describe("clientAddress", () => {
  it("is the socket's address unless a proxy is trusted", () => {
    expect(
      clientAddress({
        remoteAddress: "203.0.113.9",
        forwardedFor: "198.51.100.7",
        trustProxy: false,
      }),
    ).toBe("203.0.113.9");
    expect(clientAddress({ remoteAddress: undefined, trustProxy: false })).toBeUndefined();
  });

  it("behind a trusted proxy takes the last hop, and the socket when there is none usable", () => {
    const own = { remoteAddress: "10.0.0.2", trustProxy: true };
    expect(clientAddress({ ...own, forwardedFor: "1.2.3.4, 198.51.100.7" })).toBe("198.51.100.7");
    expect(clientAddress({ ...own, forwardedFor: "198.51.100.7" })).toBe("198.51.100.7");
    expect(clientAddress({ ...own, forwardedFor: "198.51.100.7, evil" })).toBe("10.0.0.2");
    expect(clientAddress({ ...own, forwardedFor: null })).toBe("10.0.0.2");
    expect(clientAddress({ ...own, forwardedFor: " , " })).toBe("10.0.0.2");
  });

  it("normalises the forms proxies and sockets write", () => {
    const of = (forwardedFor: string) =>
      clientAddress({ remoteAddress: "10.0.0.2", forwardedFor, trustProxy: true });
    expect(of("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(of("[2001:DB8::1]:443")).toBe("2001:db8::1");
    expect(of("2001:db8::1")).toBe("2001:db8::1");
    expect(of("203.0.113.9:5555")).toBe("203.0.113.9");
    expect(of("example.com")).toBe("10.0.0.2");
    expect(clientAddress({ remoteAddress: "::ffff:127.0.0.1", trustProxy: false })).toBe(
      "127.0.0.1",
    );
  });
});

describe("inboundRequest", () => {
  it("writes the derived address over whatever the client sent, and leaves other requests alone", () => {
    const spoofed = new Request("http://127.0.0.1:8787/x", {
      headers: { [CLIENT_ADDRESS_HEADER]: "203.0.113.9" },
    });
    const seen = inboundRequest(spoofed, { remoteAddress: "198.51.100.7", trustProxy: false });
    expect(seen.headers.get(CLIENT_ADDRESS_HEADER)).toBe("198.51.100.7");
    const unknown = inboundRequest(spoofed, { remoteAddress: undefined, trustProxy: false });
    expect(unknown.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull();
    const plain = new Request("http://127.0.0.1:8787/x");
    expect(inboundRequest(plain, { remoteAddress: undefined, trustProxy: false })).toBe(plain);
  });
});

describe("serveNode", () => {
  const app = new Hono();
  app.all("*", async (c) =>
    c.json({
      url: c.req.url,
      method: c.req.method,
      body: c.req.method === "POST" ? await c.req.text() : null,
      address: c.req.header(CLIENT_ADDRESS_HEADER) ?? null,
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
  type Seen = { url: string; method: string; body: string | null; address: string | null };
  const seen = async (url: string, init?: RequestInit) =>
    (await (await fetch(url, init)).json()) as Seen;

  it("rewrites the request URL from the forwarded headers, body included", async () => {
    const base = await start(true);
    const get = await seen(`${base}/api/x?y=1`, { headers: forwarded });
    expect(get.url).toBe("https://studio.example.com/api/x?y=1");
    const post = await seen(`${base}/api/x`, { method: "POST", headers: forwarded, body: "hello" });
    expect(post).toMatchObject({
      url: "https://studio.example.com/api/x",
      method: "POST",
      body: "hello",
    });
    // nothing forwarded: the request is as it came
    const plain = await seen(`${base}/api/x`);
    expect(plain.url).toBe(`${base}/api/x`);
  });

  it("counts the last X-Forwarded-For hop as the client behind a trusted proxy", async () => {
    const base = await start(true);
    const chain = await seen(`${base}/api/x`, {
      headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.7" },
    });
    expect(chain.address).toBe("198.51.100.7");
    const none = await seen(`${base}/api/x`);
    expect(none.address).toBe("127.0.0.1");
    const junk = await seen(`${base}/api/x`, { headers: { "x-forwarded-for": "evil" } });
    expect(junk.address).toBe("127.0.0.1");
  });

  it("without trustProxy ignores every forwarded header and takes the socket's address", async () => {
    const base = await start(false);
    const r = await seen(`${base}/api/x`, {
      headers: {
        ...forwarded,
        "x-forwarded-for": "203.0.113.9",
        [CLIENT_ADDRESS_HEADER]: "198.51.100.7",
      },
    });
    expect(r.url).toBe(`${base}/api/x`);
    expect(r.address).toBe("127.0.0.1");
  });
});

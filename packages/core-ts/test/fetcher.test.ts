/**
 * RFC-0004 §5.7: the SSRF-safe fetcher. A fake resolver and fake origin drive the rules (private
 * addresses, redirects, rebinding, size, time, content type, allowlist); the Node transport is then
 * exercised over a real local socket to show the connection is pinned to the vetted address.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvariantError } from "../src/errors.ts";
import { PNG_1X1 } from "../src/media/fixtures.ts";
import {
  checkFetchUrl,
  dohResolver,
  type FetchTransport,
  isIpLiteral,
  isPublicAddress,
  safeFetch,
  type TransportResponse,
  workersTransport,
} from "../src/media/index.ts";
import { nodeTransport } from "../src/media-node.ts";

async function failure(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvariantError) return { code: e.code, message: e.message };
    throw e;
  }
  throw new Error("expected a rejection");
}

type Handler = (
  url: URL,
  address: string | undefined,
) => TransportResponse | Promise<TransportResponse>;

/** A resolver + origin in memory. `dns[host]` may be a list of answers, one per lookup (rebinding). */
function fake(dns: Record<string, string[] | string[][]>, routes: Record<string, Handler>) {
  const lookups: Record<string, number> = {};
  const requests: { url: string; address: string | undefined }[] = [];
  const transport: FetchTransport = {
    name: "fake",
    pins: true,
    async resolve(host) {
      const answers = dns[host];
      if (!answers) return [];
      const n = lookups[host] ?? 0;
      lookups[host] = n + 1;
      return Array.isArray(answers[0])
        ? ((answers as string[][])[Math.min(n, answers.length - 1)] as string[])
        : (answers as string[]);
    },
    async request(url, init) {
      requests.push({ url: url.toString(), address: init.address });
      const handler = routes[url.toString()];
      if (!handler) return { status: 404, headers: new Headers(), body: null };
      return handler(url, init.address);
    },
  };
  return { transport, requests, lookups };
}

const png = (): TransportResponse => ({
  status: 200,
  headers: new Headers({
    "content-type": "image/png",
    "content-length": String(PNG_1X1.byteLength),
  }),
  body: new Response(PNG_1X1).body,
});
const redirect = (to: string, status = 302): TransportResponse => ({
  status,
  headers: new Headers({ location: to }),
  body: null,
});
const PUBLIC = "93.184.216.34";
const accept = ["image/png", "image/jpeg"];

describe("URL and address rules", () => {
  it.each([
    ["http://images.example.com/a.png", /only https/],
    ["https://127.0.0.1/a.png", /IP addresses/],
    ["https://2130706433/a.png", /IP addresses/],
    ["https://0x7f.1/a.png", /IP addresses/],
    ["https://0177.0.0.1/a.png", /IP addresses/],
    ["https://[::1]/a.png", /IP addresses/],
    ["https://[::ffff:169.254.169.254]/", /IP addresses/],
    ["https://localhost/a.png", /internal name/],
    ["https://printer.local/a.png", /internal name/],
    ["https://metadata.google.internal/computeMetadata/v1/", /internal name/],
    ["https://nas.home.arpa/x.png", /internal name/],
    ["https://intranet/x.png", /internal name/],
    ["https://fileserver/x.png", /public DNS name/],
    ["https://user:pw@images.cdn.net/a.png", /credentials/],
    ["https://images.cdn.net:8443/a.png", /port/],
    [`https://images.cdn.net/${"a".repeat(2050)}`, /2,048/],
  ])("refuses %s", (url, message) => {
    expect(() => checkFetchUrl(url)).toThrow(message);
  });

  it("refuses this deployment's own hosts and enforces the per-site allowlist", () => {
    expect(() =>
      checkFetchUrl("https://studio.example.org/api/x", { blockedHosts: ["studio.example.org"] }),
    ).toThrow(/belongs to this deployment/);
    expect(() =>
      checkFetchUrl("https://edge.acme.workers.dev/", { blockedHosts: ["*.acme.workers.dev"] }),
    ).toThrow();
    const allowHosts = ["images.unsplash.com", "*.wikimedia.org"];
    expect(checkFetchUrl("https://upload.wikimedia.org/x.png", { allowHosts }).hostname).toBe(
      "upload.wikimedia.org",
    );
    expect(() => checkFetchUrl("https://evil.example.net/x.png", { allowHosts })).toThrow(
      /not on this site's list/,
    );
  });

  it("classifies IPv4 and IPv6 ranges, including embedded IPv4", () => {
    for (const a of [PUBLIC, "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001:82a::200e"])
      expect(isPublicAddress(a), a).toBe(true);
    for (const a of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.8",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.9",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd00:ec2::254",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "100::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a9fe:a9fe",
      "2002:c0a8:0101::1",
      "2001:0:4136:e378::1",
      "fe80::1%en0",
      "not-an-ip",
    ])
      expect(isPublicAddress(a), a).toBe(false);
    expect(isIpLiteral("127.1")).toBe(true);
    expect(isIpLiteral("images.example.com")).toBe(false);
  });
});

describe("safeFetch", () => {
  it("fetches through a public address and reports the chain and pinned address", async () => {
    const { transport, requests } = fake(
      { "images.cdn.net": [PUBLIC] },
      { "https://images.cdn.net/a.png": png },
    );
    const r = await safeFetch("https://images.cdn.net/a.png", {
      transport,
      maxBytes: 1000,
      accept,
    });
    expect(r.bytes).toEqual(PNG_1X1);
    expect(r.contentType).toBe("image/png");
    expect(r.address).toBe(PUBLIC);
    expect(requests).toEqual([{ url: "https://images.cdn.net/a.png", address: PUBLIC }]);
  });

  it("refuses a host whose second A record is private, and 127.0.0.1.nip.io", async () => {
    const { transport, requests } = fake(
      { "mixed.example.net": [PUBLIC, "10.0.0.5"], "127.0.0.1.nip.io": ["127.0.0.1"] },
      { "https://mixed.example.net/a.png": png },
    );
    expect(
      (
        await failure(
          safeFetch("https://mixed.example.net/a.png", { transport, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("fetch_blocked");
    expect(
      (await failure(safeFetch("https://127.0.0.1.nip.io/", { transport, maxBytes: 1000, accept })))
        .message,
    ).toMatch(/private or reserved address/);
    expect(requests).toEqual([]); // nothing was ever connected to
  });

  it("re-checks every redirect hop: a redirect to the metadata service or to http is refused", async () => {
    const { transport } = fake(
      { "images.cdn.net": [PUBLIC], "meta.attacker.net": ["169.254.169.254"] },
      {
        "https://images.cdn.net/a.png": () =>
          redirect("https://meta.attacker.net/latest/meta-data/"),
        "https://images.cdn.net/b.png": () => redirect("http://images.cdn.net/a.png", 301),
        "https://images.cdn.net/c.png": () => redirect("https://169.254.169.254/latest/", 307),
      },
    );
    const opts = { transport, maxBytes: 1000, accept };
    expect((await failure(safeFetch("https://images.cdn.net/a.png", opts))).code).toBe(
      "fetch_blocked",
    );
    expect((await failure(safeFetch("https://images.cdn.net/b.png", opts))).message).toMatch(
      /only https/,
    );
    expect((await failure(safeFetch("https://images.cdn.net/c.png", opts))).message).toMatch(
      /IP addresses/,
    );
  });

  it("follows at most 3 redirects, each against the allowlist", async () => {
    const hop = (n: number) => () => redirect(`https://images.cdn.net/${n}`);
    const { transport, requests } = fake(
      { "images.cdn.net": [PUBLIC], "other.cdn.net": [PUBLIC] },
      {
        "https://images.cdn.net/0": hop(1),
        "https://images.cdn.net/1": hop(2),
        "https://images.cdn.net/2": hop(3),
        "https://images.cdn.net/3": png,
        "https://images.cdn.net/x": hop(0),
        "https://images.cdn.net/away": () => redirect("https://other.cdn.net/a.png"),
      },
    );
    const ok = await safeFetch("https://images.cdn.net/0", { transport, maxBytes: 1000, accept });
    expect(ok.chain).toHaveLength(4);
    expect(requests).toHaveLength(4);
    expect(
      (await failure(safeFetch("https://images.cdn.net/x", { transport, maxBytes: 1000, accept })))
        .message,
    ).toMatch(/more than 3 redirects/);
    expect(
      (
        await failure(
          safeFetch("https://images.cdn.net/away", {
            transport,
            maxBytes: 1000,
            accept,
            allowHosts: ["images.cdn.net"],
          }),
        )
      ).message,
    ).toMatch(/not on this site's list/);
  });

  it("DNS rebinding: the vetted answer is the one connected to, per hop", async () => {
    // First lookup public, every later one private: a check-then-connect race would hit 10.0.0.1.
    const { transport, requests, lookups } = fake(
      { "rebind.example.net": [[PUBLIC], ["10.0.0.1"]] },
      { "https://rebind.example.net/a.png": png },
    );
    await safeFetch("https://rebind.example.net/a.png", { transport, maxBytes: 1000, accept });
    expect(lookups["rebind.example.net"]).toBe(1);
    expect(requests[0]?.address).toBe(PUBLIC);
    // A second fetch sees the private answer and is refused before connecting.
    expect(
      (
        await failure(
          safeFetch("https://rebind.example.net/a.png", { transport, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("fetch_blocked");
    expect(requests).toHaveLength(1);
  });

  it("caps size (counted while streaming, Content-Length advisory) and refuses non-200", async () => {
    const big = new Uint8Array(5000);
    const lying = (): TransportResponse => ({
      status: 200,
      headers: new Headers({ "content-type": "image/png", "content-length": "10" }),
      body: new Response(big).body,
    });
    const declared = (): TransportResponse => ({
      status: 200,
      headers: new Headers({ "content-type": "image/png", "content-length": "999999" }),
      body: new Response(big).body,
    });
    const { transport } = fake(
      { "images.cdn.net": [PUBLIC] },
      {
        "https://images.cdn.net/lying": lying,
        "https://images.cdn.net/declared": declared,
        "https://images.cdn.net/gone": () => ({
          status: 404,
          headers: new Headers(),
          body: new Response("secret body").body,
        }),
      },
    );
    expect(
      (
        await failure(
          safeFetch("https://images.cdn.net/lying", { transport, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("too_large");
    expect(
      (
        await failure(
          safeFetch("https://images.cdn.net/declared", { transport, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("too_large");
    const gone = await failure(
      safeFetch("https://images.cdn.net/gone", { transport, maxBytes: 1000, accept }),
    );
    expect(gone).toEqual({ code: "fetch_failed", message: "the server answered 404" });
  });

  it("content type must be accepted; an HTML page gets a specific message", async () => {
    const typed = (ct: string) => (): TransportResponse => ({
      status: 200,
      headers: new Headers({ "content-type": ct }),
      body: new Response("<html>secret</html>").body,
    });
    const { transport } = fake(
      { "images.cdn.net": [PUBLIC] },
      {
        "https://images.cdn.net/page": typed("text/html; charset=utf-8"),
        "https://images.cdn.net/zip": typed("application/zip"),
      },
    );
    const page = await failure(
      safeFetch("https://images.cdn.net/page", { transport, maxBytes: 1000, accept }),
    );
    expect(page.message).toBe("that URL is a web page; pass the address of the image itself");
    expect(page.message).not.toContain("secret");
    expect(
      (
        await failure(
          safeFetch("https://images.cdn.net/zip", { transport, maxBytes: 1000, accept }),
        )
      ).message,
    ).toMatch(/application\/zip, which is not accepted/);
  });

  it("slow servers time out: headers and the whole body", async () => {
    const slowHeaders = () => new Promise<TransportResponse>(() => {});
    const slowBody = (): TransportResponse => ({
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(10));
        },
      }),
    });
    const { transport } = fake(
      { "images.cdn.net": [PUBLIC] },
      { "https://images.cdn.net/h": slowHeaders, "https://images.cdn.net/b": slowBody },
    );
    const h = await failure(
      safeFetch("https://images.cdn.net/h", {
        transport,
        maxBytes: 1000,
        accept,
        headersTimeoutMs: 50,
      }),
    );
    expect(h).toEqual({ code: "fetch_failed", message: "images.cdn.net did not answer in time" });
    const b = await failure(
      safeFetch("https://images.cdn.net/b", {
        transport,
        maxBytes: 1000,
        accept,
        totalTimeoutMs: 80,
      }),
    );
    expect(b).toEqual({ code: "fetch_failed", message: "the download took too long" });
  });

  it("the Workers transport checks DoH answers and never follows redirects itself", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${url} ${init?.redirect ?? ""}`);
      if (url.startsWith("https://cloudflare-dns.com/")) {
        const type = new URL(url).searchParams.get("type");
        const name = new URL(url).searchParams.get("name");
        const data = name === "evil.example.net" ? "192.168.0.10" : PUBLIC;
        return Response.json({ Status: 0, Answer: type === "A" ? [{ type: 1, data }] : [] });
      }
      return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    const transport = workersTransport({ fetch: fakeFetch });
    expect(transport.pins).toBe(false);
    const ok = await safeFetch("https://images.cdn.net/a.png", {
      transport,
      maxBytes: 1000,
      accept,
    });
    expect(ok.address).toBeUndefined();
    expect(calls.at(-1)).toBe("https://images.cdn.net/a.png manual");
    expect(
      (
        await failure(
          safeFetch("https://evil.example.net/a.png", { transport, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("fetch_blocked");
    expect(await dohResolver({ fetch: fakeFetch })("images.cdn.net")).toEqual([PUBLIC]);
  });
});

describe("Node transport (local socket)", () => {
  let server: Server;
  let port: number;
  const seen: { host: string | undefined; ua: string | undefined; cookie: string | undefined }[] =
    [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({
        host: req.headers.host,
        ua: req.headers["user-agent"],
        cookie: req.headers.cookie,
      });
      if (req.url === "/a.png") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_1X1);
      } else if (req.url === "/slow") {
        res.writeHead(200, { "content-type": "image/png" });
        res.write(PNG_1X1.slice(0, 10)); // and never finishes
      } else if (req.url === "/big") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(new Uint8Array(4096));
      } else {
        res.writeHead(302, { location: "https://inner.example.net/a.png" });
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  /** The resolver says "public", the socket goes to the local server; rebinding answers private later. */
  function transport(answers: Record<string, string[][]>) {
    const n: Record<string, number> = {};
    const connected: string[] = [];
    const t = nodeTransport({
      resolve: async (host) => {
        const list = answers[host] ?? [];
        const i = n[host] ?? 0;
        n[host] = i + 1;
        return list[Math.min(i, list.length - 1)] ?? [];
      },
      testConnect: (address) => {
        connected.push(address);
        return { host: "127.0.0.1", port };
      },
    });
    return { t, connected };
  }

  it("connects to the vetted address with a clean request, and streams the body", async () => {
    const { t, connected } = transport({ "img.example.net": [[PUBLIC], ["10.0.0.9"]] });
    const r = await safeFetch("https://img.example.net/a.png", {
      transport: t,
      maxBytes: 1000,
      accept,
    });
    expect(r.bytes).toEqual(PNG_1X1);
    expect(r.address).toBe(PUBLIC);
    expect(connected).toEqual([PUBLIC]);
    expect(seen.at(-1)).toEqual({
      host: "img.example.net",
      ua: "Cloudhal-Fetch/1 (+https://cloudhal.dev/fetch)",
      cookie: undefined,
    });
  });

  it("refuses a redirect into a private network before connecting to it", async () => {
    const { t, connected } = transport({
      "img.example.net": [[PUBLIC]],
      "inner.example.net": [["10.0.0.9"]],
    });
    expect(
      (
        await failure(
          safeFetch("https://img.example.net/redirect", { transport: t, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("fetch_blocked");
    expect(connected).toEqual([PUBLIC]);
  });

  it("stops oversized and slow downloads", async () => {
    const { t } = transport({ "img.example.net": [[PUBLIC]] });
    expect(
      (
        await failure(
          safeFetch("https://img.example.net/big", { transport: t, maxBytes: 1000, accept }),
        )
      ).code,
    ).toBe("too_large");
    expect(
      await failure(
        safeFetch("https://img.example.net/slow", {
          transport: t,
          maxBytes: 1000,
          accept,
          totalTimeoutMs: 200,
        }),
      ),
    ).toEqual({ code: "fetch_failed", message: "the download took too long" });
  });
});

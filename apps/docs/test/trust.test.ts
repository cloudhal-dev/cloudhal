/**
 * The yank-list proxy (RFC-0046 §9, #226): a fixed upstream with no request input, bytes passed
 * through unchanged with their content type, five-minute caching, 502 (never an old copy) when the
 * upstream fails, and the Worker routing only the two well-known paths to it.
 */
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker/index.ts";
import { YANK_LIST_PATHS, YANK_LIST_TTL, yankList } from "../src/worker/trust.ts";

const SIG = new Uint8Array(64).map((_, i) => (i * 37) % 256);
const JSON_BYTES = new TextEncoder().encode('{\n  "serial": 3\n}\n');

function upstream(answer: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init: unknown }[] = [];
  const fetchImpl = async (url: string, init?: unknown) => {
    calls.push({ url, init });
    return answer(url);
  };
  return { calls, fetchImpl };
}

describe("yankList", () => {
  it("fetches exactly the yank-list branch's raw file and passes the bytes through", async () => {
    const u = upstream(
      (url) => new Response(url.endsWith(".sig") ? SIG : JSON_BYTES, { status: 200 }),
    );
    const json = await yankList(
      new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json?x=../../evil"),
      "/.well-known/cloudhal/yanked.json",
      u.fetchImpl,
    );
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toBe("application/json");
    expect(json.headers.get("cache-control")).toBe(`public, max-age=${YANK_LIST_TTL}`);
    expect(new Uint8Array(await json.arrayBuffer())).toEqual(JSON_BYTES);
    const sig = await yankList(
      new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json.sig"),
      "/.well-known/cloudhal/yanked.json.sig",
      u.fetchImpl,
    );
    expect(sig.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await sig.arrayBuffer())).toEqual(SIG);
    // Fixed URLs: nothing from the request (its query) reaches the upstream.
    expect(u.calls.map((c) => c.url)).toEqual([
      "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/yanked.json",
      "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/yanked.json.sig",
    ]);
    expect(u.calls[0]?.init).toEqual({ cf: { cacheTtl: 300, cacheEverything: true } });
    expect(YANK_LIST_TTL).toBeLessThanOrEqual(300);
  });

  it("answers 502, never an old copy, when the upstream fails or is too large", async () => {
    for (const answer of [
      () => new Response("nope", { status: 404 }),
      () => new Response("down", { status: 503 }),
      () => Promise.reject(new Error("network")),
      () => new Response(new Uint8Array(256 * 1024 + 1), { status: 200 }),
    ]) {
      const res = await yankList(
        new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json"),
        "/.well-known/cloudhal/yanked.json",
        upstream(answer).fetchImpl,
      );
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("serves GET and HEAD only, and nothing outside its two paths", async () => {
    const u = upstream(() => new Response(JSON_BYTES, { status: 200 }));
    const post = await yankList(
      new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json", { method: "POST" }),
      "/.well-known/cloudhal/yanked.json",
      u.fetchImpl,
    );
    expect(post.status).toBe(405);
    const head = await yankList(
      new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json", { method: "HEAD" }),
      "/.well-known/cloudhal/yanked.json",
      u.fetchImpl,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(JSON_BYTES.length));
    expect(
      (
        await yankList(
          new Request("https://cloudhal.dev/x"),
          "/.well-known/cloudhal/x",
          u.fetchImpl,
        )
      ).status,
    ).toBe(404);
    expect(Object.keys(YANK_LIST_PATHS)).toEqual([
      "/.well-known/cloudhal/yanked.json",
      "/.well-known/cloudhal/yanked.json.sig",
    ]);
  });

  it("the Worker routes only the two well-known yank paths to it; keys.json stays a static asset", async () => {
    const seen: string[] = [];
    const env: Env = {
      ASSETS: {
        fetch: async (request: Request) => {
          seen.push(new URL(request.url).pathname);
          return new Response("{}", { status: 200 });
        },
      },
    };
    await worker.fetch(new Request("https://cloudhal.dev/.well-known/cloudhal/keys.json"), env);
    await worker.fetch(
      new Request("https://cloudhal.dev/.well-known/cloudhal/yanked.json.bak"),
      env,
    );
    expect(seen).toEqual([
      "/.well-known/cloudhal/keys.json",
      "/.well-known/cloudhal/yanked.json.bak",
    ]);
  });
});

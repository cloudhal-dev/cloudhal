/**
 * The yank-list proxy (RFC-0046 §9, #226): fixed upstream URLs with no request input and no edge
 * cache, served only as a pair whose signature verifies with the yank key of the static keys.json,
 * kept as one entry for five minutes; on a failure or a mismatched pair upstream, the last good
 * pair or a 502, never a mismatch; and the Worker routing only the two well-known paths to it.
 */
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/worker/index.ts";
import {
  type PairStore,
  pairVerifies,
  YANK_LIST_PATHS,
  YANK_LIST_TTL,
  type YankPair,
  yankList,
} from "../src/worker/trust.ts";

const enc = (s: string) => new TextEncoder().encode(s);
function yankKey(): { privateKey: KeyObject; raw: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, raw: Buffer.from(der.subarray(12)).toString("base64") };
}
const KEY = yankKey();
const KEYS_JSON = enc(
  JSON.stringify({ keys: [{ keyId: "cloudhal-yank-2026a", role: "yank", publicKey: KEY.raw }] }),
);
function list(serial: number) {
  const json = enc(JSON.stringify({ serial, signing: { keyId: "cloudhal-yank-2026a" } }));
  return { json, sig: new Uint8Array(sign(null, json, KEY.privateKey)) };
}
const JSON_PATH = "/.well-known/cloudhal/yanked.json";
const SIG_PATH = "/.well-known/cloudhal/yanked.json.sig";

function memoryStore(): PairStore & { pair?: YankPair } {
  const store: PairStore & { pair?: YankPair } = {
    get: async () => store.pair,
    put: async (pair) => {
      store.pair = pair;
    },
  };
  return store;
}

/** An upstream answering `files[name]` (bytes, a status, or a network failure). */
function upstream(files: Record<string, Uint8Array | number | Error>) {
  const calls: { url: string; init: unknown }[] = [];
  const fetchImpl = async (url: string, init?: unknown) => {
    calls.push({ url, init });
    const answer = files[url.slice(url.lastIndexOf("/") + 1)];
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return new Response("x", { status: answer });
    return new Response(answer ?? null, { status: answer ? 200 : 404 });
  };
  return { calls, fetchImpl };
}

const get = (path: string, method = "GET") =>
  new Request(`https://cloudhal.dev${path}?x=../../evil`, { method });
const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());

describe("yankList", () => {
  it("fetches exactly the yank-list branch's two raw files, uncached, and serves a pair that verifies", async () => {
    const good = list(3);
    const u = upstream({ "yanked.json": good.json, "yanked.json.sig": good.sig });
    const deps = { keyList: async () => KEYS_JSON, fetchImpl: u.fetchImpl, store: memoryStore() };
    const json = await yankList(get(JSON_PATH), JSON_PATH, deps);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toBe("application/json");
    expect(json.headers.get("cache-control")).toBe("no-cache");
    expect(await bytes(json)).toEqual(good.json);
    const sig = await yankList(get(SIG_PATH), SIG_PATH, deps);
    expect(sig.headers.get("content-type")).toBe("application/octet-stream");
    expect(await bytes(sig)).toEqual(good.sig);
    // Both halves name the same pair.
    expect(sig.headers.get("etag")).toBe(json.headers.get("etag"));
    // Fixed URLs, nothing from the request; no edge cache; the second request used the stored pair.
    expect(u.calls).toEqual([
      {
        url: "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/yanked.json",
        init: { cache: "no-store" },
      },
      {
        url: "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/yanked.json.sig",
        init: { cache: "no-store" },
      },
    ]);
    expect(YANK_LIST_TTL).toBeLessThanOrEqual(300);
  });

  it("never serves a mismatched pair: the last good pair, else 502", async () => {
    const old = list(3);
    const next = list(4);
    // raw.githubusercontent.com caching each file on its own: the new document, the old signature.
    const mismatch = { "yanked.json": next.json, "yanked.json.sig": old.sig };
    const fresh = {
      keyList: async () => KEYS_JSON,
      fetchImpl: upstream(mismatch).fetchImpl,
      store: memoryStore(),
    };
    const none = await yankList(get(JSON_PATH), JSON_PATH, fresh);
    expect(none.status).toBe(502);
    expect(none.headers.get("cache-control")).toBe("no-store");
    expect(fresh.store.pair).toBeUndefined();

    const store = memoryStore();
    store.pair = { ...old, fetchedAt: 0 }; // last good, long past its five minutes
    const deps = { ...fresh, store, now: () => 10 * 60 * 1000 };
    const json = await yankList(get(JSON_PATH), JSON_PATH, deps);
    const sig = await yankList(get(SIG_PATH), SIG_PATH, deps);
    expect(await bytes(json)).toEqual(old.json);
    expect(await bytes(sig)).toEqual(old.sig);
    expect(await pairVerifies(old.json, old.sig, KEYS_JSON)).toBe(true);
    expect(await pairVerifies(next.json, old.sig, KEYS_JSON)).toBe(false);
    expect(store.pair?.json).toEqual(old.json); // not replaced by the mismatch
  });

  it("refetches after five minutes and keeps the stored pair until then", async () => {
    const old = list(3);
    const next = list(4);
    const store = memoryStore();
    store.pair = { ...old, fetchedAt: 1_000 };
    const u = upstream({ "yanked.json": next.json, "yanked.json.sig": next.sig });
    const at = (ms: number) => ({
      keyList: async () => KEYS_JSON,
      fetchImpl: u.fetchImpl,
      store,
      now: () => ms,
    });
    expect(await bytes(await yankList(get(JSON_PATH), JSON_PATH, at(1_000 + 299_000)))).toEqual(
      old.json,
    );
    expect(u.calls).toHaveLength(0);
    expect(await bytes(await yankList(get(JSON_PATH), JSON_PATH, at(1_000 + 300_000)))).toEqual(
      next.json,
    );
    expect(store.pair?.fetchedAt).toBe(301_000);
  });

  it("answers 502 when the upstream fails, is too large, or there is no keys.json yet", async () => {
    const good = list(3);
    for (const files of [
      { "yanked.json": 404, "yanked.json.sig": good.sig },
      { "yanked.json": good.json, "yanked.json.sig": 503 },
      { "yanked.json": new Error("network"), "yanked.json.sig": good.sig },
      { "yanked.json": new Uint8Array(256 * 1024 + 1), "yanked.json.sig": good.sig },
    ]) {
      const res = await yankList(get(JSON_PATH), JSON_PATH, {
        keyList: async () => KEYS_JSON,
        fetchImpl: upstream(files).fetchImpl,
        store: memoryStore(),
      });
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const beforeCeremony = await yankList(get(JSON_PATH), JSON_PATH, {
      keyList: async () => undefined,
      fetchImpl: upstream({ "yanked.json": good.json, "yanked.json.sig": good.sig }).fetchImpl,
    });
    expect(beforeCeremony.status).toBe(502);
  });

  it("serves GET and HEAD only, and nothing outside its two paths", async () => {
    const good = list(3);
    const deps = {
      keyList: async () => KEYS_JSON,
      fetchImpl: upstream({ "yanked.json": good.json, "yanked.json.sig": good.sig }).fetchImpl,
    };
    expect((await yankList(get(JSON_PATH, "POST"), JSON_PATH, deps)).status).toBe(405);
    const head = await yankList(get(JSON_PATH, "HEAD"), JSON_PATH, deps);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(good.json.length));
    expect(
      (await yankList(new Request("https://cloudhal.dev/x"), "/.well-known/cloudhal/x", deps))
        .status,
    ).toBe(404);
    expect(Object.keys(YANK_LIST_PATHS)).toEqual([JSON_PATH, SIG_PATH]);
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

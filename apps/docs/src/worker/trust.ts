/**
 * `/.well-known/cloudhal/yanked.json` and `.sig` (RFC-0046 §9, #226): the yank list the weekly
 * *Yank list* workflow publishes to the append-only `yank-list` branch.
 *
 * The two files change together, so they are served only as a pair that belongs together: the
 * Worker fetches both from fixed URLs (no part of the request in them, no edge cache), checks that
 * the signature verifies the document with the yank key the static `keys.json` names, and keeps
 * that pair as one cached entry for at most five minutes. When the upstream fails, or answers a
 * pair that does not belong together (raw.githubusercontent.com caches each file on its own), the
 * Worker serves the last good pair, else 502; never a mismatch. Both halves carry the same `etag`.
 *
 * The check is about consistency, not trust: consumers still verify `keys.json` against the pinned
 * root and the yank list against it (`@cloudhal/release-verify`). `keys.json` changes yearly and is
 * a static asset (scripts/postbuild.ts).
 */
const UPSTREAM = "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/";
export const KEY_LIST_PATH = "/.well-known/cloudhal/keys.json";

/** The two paths this module serves, and which half of the pair and content type each is. */
export const YANK_LIST_PATHS: Readonly<
  Record<string, { file: string; half: "json" | "sig"; type: string }>
> = {
  "/.well-known/cloudhal/yanked.json": {
    file: "yanked.json",
    half: "json",
    type: "application/json",
  },
  "/.well-known/cloudhal/yanked.json.sig": {
    file: "yanked.json.sig",
    half: "sig",
    type: "application/octet-stream",
  },
};

/** Seconds a verified pair is served before it is fetched again; the list is valid for 30 days. */
export const YANK_LIST_TTL = 300;
const MAX_BYTES = 256 * 1024;
const MAX_KEYS_BYTES = 64 * 1024;

/** A pair whose signature verified, and when it was fetched. */
type Bytes = Uint8Array<ArrayBuffer>;

export interface YankPair {
  readonly json: Bytes;
  readonly sig: Bytes;
  readonly fetchedAt: number;
}

/** Where the last good pair is kept (per colo: the Cache API; tests: memory). */
export interface PairStore {
  get(): Promise<YankPair | undefined>;
  put(pair: YankPair): Promise<void>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface YankListDeps {
  /** The static `keys.json` bytes, or undefined before the root ceremony. */
  readonly keyList: () => Promise<Bytes | undefined>;
  readonly fetchImpl?: Fetch;
  readonly store?: PairStore;
  readonly now?: () => number;
}

const PAIR_KEY = "https://cloudhal.dev/__cloudhal/yank-pair";

/** The part of the Workers Cache API the store uses (`caches.default`). */
export interface PairCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

/** The last good pair in the colo's cache: signature (64 bytes) then document, one entry. */
export function cachePairStore(cache: PairCache): PairStore {
  return {
    async get() {
      const res = await cache.match(PAIR_KEY);
      if (!res) return undefined;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length <= 64) return undefined;
      return {
        sig: bytes.slice(0, 64),
        json: bytes.slice(64),
        fetchedAt: Number(res.headers.get("x-fetched-at") ?? 0),
      };
    },
    async put(pair) {
      const body = new Uint8Array(64 + pair.json.length);
      body.set(pair.sig, 0);
      body.set(pair.json, 64);
      await cache.put(
        PAIR_KEY,
        new Response(body, {
          headers: {
            "cache-control": "max-age=2592000",
            "x-fetched-at": String(pair.fetchedAt),
          },
        }),
      );
    },
  };
}

function unavailable(reason: string): Response {
  return new Response(`The yank list is unavailable upstream (${reason}). Try again shortly.\n`, {
    status: 502,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

const fromBase64 = (s: string): Bytes | undefined => {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
};

/** True when `sig` verifies `json` with the yank key `keys.json` lists under its signer's id. */
export async function pairVerifies(
  json: Bytes,
  sig: Bytes,
  keyList: Bytes | undefined,
): Promise<boolean> {
  if (!keyList || keyList.length > MAX_KEYS_BYTES || sig.length !== 64) return false;
  try {
    const doc = JSON.parse(new TextDecoder().decode(json)) as { signing?: { keyId?: unknown } };
    const keys = JSON.parse(new TextDecoder().decode(keyList)) as {
      keys?: { keyId?: unknown; role?: unknown; publicKey?: unknown }[];
    };
    const keyId = doc?.signing?.keyId;
    const listed = keys?.keys?.find((k) => k.keyId === keyId && k.role === "yank");
    const raw = typeof listed?.publicKey === "string" ? fromBase64(listed.publicKey) : undefined;
    if (raw?.length !== 32) return false;
    const key = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, json);
  } catch {
    return false;
  }
}

/** Both files from the upstream, uncached, or the reason they could not be read. */
async function fetchPair(get: Fetch): Promise<{ json: Bytes; sig: Bytes } | string> {
  try {
    const [json, sig] = await Promise.all(
      ["yanked.json", "yanked.json.sig"].map(async (file) => {
        const res = await get(UPSTREAM + file, { cache: "no-store" });
        if (res.status !== 200) throw new Error(String(res.status));
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_BYTES) throw new Error("413");
        return bytes;
      }),
    );
    return { json: json as Bytes, sig: sig as Bytes };
  } catch (e) {
    return (e as Error).message || "network";
  }
}

async function pairTag(sig: Bytes): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", sig));
  return `"${Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

/** The current good pair: the cached one while fresh, else a fresh one that verifies, else the last good one. */
async function currentPair(deps: YankListDeps): Promise<YankPair | string> {
  const now = (deps.now ?? Date.now)();
  const stored = await deps.store?.get();
  if (stored && now - stored.fetchedAt < YANK_LIST_TTL * 1000) return stored;
  const fresh = await fetchPair(deps.fetchImpl ?? fetch);
  if (typeof fresh !== "string") {
    if (await pairVerifies(fresh.json, fresh.sig, await deps.keyList())) {
      const pair = { ...fresh, fetchedAt: now };
      await deps.store?.put(pair);
      return pair;
    }
  }
  if (stored) return stored;
  return typeof fresh === "string" ? fresh : "the two files do not belong together";
}

/** The response for one of `YANK_LIST_PATHS` (the caller checks the path). */
export async function yankList(
  request: Request,
  path: string,
  deps: YankListDeps,
): Promise<Response> {
  const target = YANK_LIST_PATHS[path];
  if (!target) return new Response("Not found\n", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed\n", { status: 405, headers: { allow: "GET, HEAD" } });
  const pair = await currentPair(deps);
  if (typeof pair === "string") return unavailable(pair);
  const bytes = target.half === "json" ? pair.json : pair.sig;
  return new Response(request.method === "HEAD" ? null : bytes, {
    status: 200,
    headers: {
      "content-type": target.type,
      "content-length": String(bytes.byteLength),
      // Shared caches revalidate: both halves carry the pair's etag, so they never mix.
      "cache-control": "no-cache",
      etag: await pairTag(pair.sig),
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

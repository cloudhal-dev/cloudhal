/**
 * `/.well-known/cloudhal/yanked.json` and `.sig` (RFC-0046 §9, #226): the yank list the weekly
 * *Yank list* workflow publishes to the append-only `yank-list` branch. The Worker fetches exactly
 * that branch's raw file, from a fixed URL with no part of the request in it, caches it for at
 * most five minutes, and passes the bytes through unchanged. The signature makes this proxy
 * trust-free; it only adds availability under cloudhal.dev. When the upstream fails it answers 502,
 * never an old copy. (`keys.json` changes yearly and is a static asset: scripts/postbuild.ts.)
 */
const UPSTREAM = "https://raw.githubusercontent.com/cloudhal-dev/cloudhal/yank-list/";

/** The two paths this module serves, and the upstream file and content type of each. */
export const YANK_LIST_PATHS: Readonly<Record<string, { file: string; type: string }>> = {
  "/.well-known/cloudhal/yanked.json": { file: "yanked.json", type: "application/json" },
  "/.well-known/cloudhal/yanked.json.sig": {
    file: "yanked.json.sig",
    type: "application/octet-stream",
  },
};

/** Seconds a fetched copy may be served; the list itself is valid for 30 days. */
export const YANK_LIST_TTL = 300;
const MAX_BYTES = 256 * 1024;

type Fetch = (
  input: string,
  init?: RequestInit & { cf?: Record<string, unknown> },
) => Promise<Response>;

function unavailable(status: number): Response {
  return new Response(`The yank list is unavailable upstream (${status}). Try again shortly.\n`, {
    status: 502,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The response for one of `YANK_LIST_PATHS` (the caller checks the path). */
export async function yankList(
  request: Request,
  path: string,
  fetchImpl: Fetch = fetch,
): Promise<Response> {
  const target = YANK_LIST_PATHS[path];
  if (!target) return new Response("Not found\n", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed\n", { status: 405, headers: { allow: "GET, HEAD" } });
  let upstream: Response;
  try {
    upstream = await fetchImpl(UPSTREAM + target.file, {
      cf: { cacheTtl: YANK_LIST_TTL, cacheEverything: true },
    });
  } catch {
    return unavailable(0);
  }
  if (upstream.status !== 200) return unavailable(upstream.status);
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return unavailable(413);
  return new Response(request.method === "HEAD" ? null : bytes, {
    status: 200,
    headers: {
      "content-type": target.type,
      "content-length": String(bytes.byteLength),
      "cache-control": `public, max-age=${YANK_LIST_TTL}`,
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

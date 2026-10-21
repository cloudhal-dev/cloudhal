/**
 * The `cloudhal-dev` Worker (ADR-0037, ADR-0039): a small script in front of the static assets.
 *
 * - `/mcp`: the read-only docs MCP (`mcp.ts`), rate limited per IP;
 * - `Accept: text/markdown` on a page answers its Markdown copy, with `Vary: Accept` and an
 *   `x-markdown-tokens` estimate (RFC-0037 §4);
 * - everything else goes to the assets binding unchanged.
 */
import { SEARCH_INDEX_PATH, type SearchIndex } from "../lib/search.ts";
import { CORS, handleMcp } from "./mcp.ts";
import { isPagePath, markdownPath, pageId } from "./paths.ts";

/** The parts of the Workers bindings this script uses. */
export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly MCP_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

let index: Promise<SearchIndex> | undefined;

function loadIndex(env: Env, origin: string): Promise<SearchIndex> {
  index ??= env.ASSETS.fetch(new Request(new URL(SEARCH_INDEX_PATH, origin))).then((res) => {
    if (!res.ok) throw new Error(`search index: ${res.status}`);
    return res.json() as Promise<SearchIndex>;
  });
  // A failed load is retried on the next call instead of staying cached.
  index.catch(() => {
    index = undefined;
  });
  return index;
}

async function markdownAsset(env: Env, origin: string, path: string): Promise<string | undefined> {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  return res.status === 200 ? res.text() : undefined;
}

/** True when the client asks for Markdown (`text/markdown` in `Accept`, not with `q=0`). */
export function wantsMarkdown(accept: string | null): boolean {
  return (accept ?? "").split(",").some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    if (type?.trim() !== "text/markdown") return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

function withVary(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.append("vary", "Accept");
  return out;
}

async function negotiate(request: Request, env: Env, url: URL): Promise<Response> {
  const id = wantsMarkdown(request.headers.get("accept")) ? pageId(url.pathname) : undefined;
  if (id) {
    const res = await env.ASSETS.fetch(new Request(new URL(markdownPath(id), url.origin)));
    if (res.status === 200) {
      const body = await res.text();
      const headers = new Headers(res.headers);
      headers.set("content-type", "text/markdown; charset=utf-8");
      headers.set("x-markdown-tokens", String(Math.ceil(body.length / 4)));
      headers.append("vary", "Accept");
      return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
    }
  }
  return withVary(await env.ASSETS.fetch(request));
}

async function mcp(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "POST" && env.MCP_RATE_LIMITER) {
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.MCP_RATE_LIMITER.limit({ key });
    if (!success) {
      return new Response("Too many requests", {
        status: 429,
        headers: { "retry-after": "60", ...CORS },
      });
    }
  }
  return handleMcp(request, {
    index: () => loadIndex(env, url.origin),
    markdown: (path) => markdownAsset(env, url.origin, path),
    selfHost: url.host,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") return mcp(request, env, url);
    const page =
      (request.method === "GET" || request.method === "HEAD") && isPagePath(url.pathname);
    return page ? negotiate(request, env, url) : env.ASSETS.fetch(request);
  },
};

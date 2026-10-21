import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allPages, type Page } from "../src/lib/pages.ts";
import { SEARCH_INDEX_PATH, searchDocs, snippet, tokens } from "../src/lib/search.ts";
import { buildSearchIndex, plainText } from "../src/lib/search-index.ts";
import worker, { type Env, wantsMarkdown } from "../src/worker/index.ts";
import { isPagePath, markdownPath, pageId } from "../src/worker/paths.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const page = (id: string, title: string, body: string, description = ""): Page => ({
  id,
  title,
  description,
  body,
});

const PAGES = [
  page("index", "Cloudhal", "Agent-native sites."),
  page("docs/agents/clients", "Connect an agent", "Claude Code, Codex and Cursor setup for MCP."),
  page("docs/guides/search", "Site search", "Full-text search for a site with FTS5 indexes."),
  page("docs/adr/0011-mcp", "ADR-0011: MCP tools", "Tools and transports of the MCP server."),
];

/** A fake assets binding: the built index plus Markdown and HTML per path. */
function env(files: Record<string, string> = {}, limited = false): Env & { seen: string[] } {
  const all: Record<string, string> = {
    [SEARCH_INDEX_PATH]: JSON.stringify(buildSearchIndex(PAGES)),
    "/index.md": "# Cloudhal\n",
    "/docs/agents/clients.md": "---\ntitle: Connect an agent\n---\n# Connect an agent\n",
    "/docs/agents/clients": "<html>clients</html>",
    ...files,
  };
  const seen: string[] = [];
  return {
    seen,
    ASSETS: {
      fetch: async (request: Request) => {
        const p = new URL(request.url).pathname;
        seen.push(p);
        const body = all[p];
        return body === undefined
          ? new Response("not found", { status: 404 })
          : new Response(body, { headers: { "content-type": "text/html", "x-asset": p } });
      },
    },
    MCP_RATE_LIMITER: { limit: async () => ({ success: !limited }) },
  };
}

async function rpc(e: Env, body: unknown, headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request("https://cloudhal.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    e,
  );
  // biome-ignore lint/suspicious/noExplicitAny: JSON-RPC answers, checked field by field below
  const json: any = res.status === 200 ? await res.json() : undefined;
  return { res, json };
}

const call = (e: Env, name: string, args: unknown) =>
  rpc(e, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

describe("search", () => {
  it("tokenizes without stop words, with a light plural stem", () => {
    expect(tokens("How do the Pages search_docs?")).toEqual(["page", "search", "doc"]);
  });

  it("strips Markdown to plain text", () => {
    expect(plainText("## A [link](/x) and `code`\n\n| a | b |\n|---|---|\n")).toBe(
      "A link and code a b",
    );
  });

  it("ranks title matches first, matches prefixes, and filters by section", () => {
    const index = buildSearchIndex(PAGES);
    expect(searchDocs(index, "search")[0]?.url).toBe("https://cloudhal.dev/docs/guides/search");
    expect(searchDocs(index, "curs").map((h) => h.title)).toEqual(["Connect an agent"]);
    expect(searchDocs(index, "mcp", { section: "adr" }).map((h) => h.title)).toEqual([
      "ADR-0011: MCP tools",
    ]);
    expect(searchDocs(index, "zzzz")).toEqual([]);
  });

  it("cuts a snippet around the first match", () => {
    const text = `${"word ".repeat(100)}needle ${"tail ".repeat(100)}`;
    const s = snippet(text, "needle");
    expect(s).toContain("needle");
    expect(s.startsWith("…") && s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(260);
    const cluster = `alpha ${"x ".repeat(200)}alpha beta ${"y ".repeat(200)}`;
    expect(snippet(cluster, "alpha beta")).toContain("alpha beta");
  });

  it("finds the client setup page in the real docs", () => {
    const index = buildSearchIndex(allPages(REPO, true));
    const hits = searchDocs(index, "connect Claude Code MCP client");
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(hits.slice(0, 3).map((h) => h.url)).toContain(
      "https://cloudhal.dev/docs/agents/clients",
    );
    for (const hit of searchDocs(index, "rollback", { section: "rfcs" })) {
      expect(hit.url).toMatch(/^https:\/\/cloudhal\.dev\/docs\/rfcs/);
    }
  });
});

describe("pageId", () => {
  it("accepts cloudhal.dev URLs and site paths", () => {
    expect(pageId("https://cloudhal.dev/docs/agents.md#modes")).toBe("docs/agents");
    expect(pageId("/docs/agents/index.md")).toBe("docs/agents");
    expect(pageId("docs/Agents/?x=1")).toBe("docs/agents");
    expect(pageId("https://cloudhal.dev/")).toBe("index");
    expect(pageId("http://localhost:8787/docs", "localhost:8787")).toBe("docs");
  });

  it("rejects other hosts, schemes and odd paths", () => {
    expect(pageId("https://example.com/docs")).toBeUndefined();
    expect(pageId("//evil.test/docs")).toBeUndefined();
    expect(pageId("file:///etc/passwd")).toBeUndefined();
    expect(pageId("/docs/../secrets")).toBeUndefined();
    expect(pageId("/docs/%2e%2e/x")).toBeUndefined();
  });

  it("maps ids to Markdown paths and spots page paths", () => {
    expect(markdownPath("index")).toBe("/index.md");
    expect(markdownPath("docs/agents")).toBe("/docs/agents.md");
    expect(isPagePath("/docs/agents")).toBe(true);
    expect(isPagePath("/llms.txt")).toBe(false);
  });
});

describe("docs MCP", () => {
  it("initializes with the client's protocol version and lists two read-only tools", async () => {
    const e = env();
    const init = await rpc(e, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } },
    });
    expect(init.json.result.protocolVersion).toBe("2025-06-18");
    expect(init.json.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(init.res.headers.get("mcp-session-id")).toBeNull();
    const old = await rpc(e, { jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
    expect(old.json.result.protocolVersion).toBe("2025-11-25");
    const list = await rpc(e, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = list.json.result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toEqual(["search_docs", "read_doc"]);
    expect(
      tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint),
    ).toBe(true);
  });

  it("answers notifications with 202 and unknown methods with -32601", async () => {
    const e = env();
    const note = await rpc(e, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.res.status).toBe(202);
    const unknown = await rpc(e, { jsonrpc: "2.0", id: 9, method: "resources/list" });
    expect(unknown.json.error.code).toBe(-32601);
    const batch = await rpc(e, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]);
    expect(batch.json).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });

  it("searches, with structured content", async () => {
    const { json } = await call(env(), "search_docs", { query: "codex" });
    expect(json.result.structuredContent.results[0]).toMatchObject({
      title: "Connect an agent",
      url: "https://cloudhal.dev/docs/agents/clients",
    });
    expect(JSON.parse(json.result.content[0].text)).toEqual(json.result.structuredContent);
    const bad = await call(env(), "search_docs", { query: "x", section: "nope" });
    expect(bad.json.result.isError).toBe(true);
  });

  it("reads cloudhal.dev pages only", async () => {
    const ok = await call(env(), "read_doc", { url: "https://cloudhal.dev/docs/agents/clients" });
    expect(ok.json.result.content[0].text).toContain("# Connect an agent");
    const elsewhere = await call(env(), "read_doc", { url: "https://example.com/docs" });
    expect(elsewhere.json.result.isError).toBe(true);
    const missing = await call(env(), "read_doc", { url: "/docs/nope" });
    expect(missing.json.result.content[0].text).toContain("No page at /docs/nope");
    const unknown = await call(env(), "write_doc", {});
    expect(unknown.json.error.code).toBe(-32602);
  });

  it("refuses GET, non-JSON bodies and bad JSON, and rate limits", async () => {
    const get = await worker.fetch(new Request("https://cloudhal.dev/mcp"), env());
    expect(get.status).toBe(405);
    const form = await worker.fetch(
      new Request("https://cloudhal.dev/mcp", { method: "POST", body: "x" }),
      env(),
    );
    expect(form.status).toBe(415);
    const broken = await worker.fetch(
      new Request("https://cloudhal.dev/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      env(),
    );
    expect(broken.status).toBe(400);
    const limited = await rpc(env({}, true), { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(limited.res.status).toBe(429);
  });
});

describe("content negotiation", () => {
  const get = (e: Env, p: string, accept?: string) =>
    worker.fetch(new Request(`https://cloudhal.dev${p}`, accept ? { headers: { accept } } : {}), e);

  it("answers Accept: text/markdown with the page's Markdown", async () => {
    const res = await get(env(), "/docs/agents/clients", "text/markdown, text/html;q=0.9");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toContain("Accept");
    expect(Number(res.headers.get("x-markdown-tokens"))).toBeGreaterThan(0);
    expect(await res.text()).toContain("# Connect an agent");
    expect(await (await get(env(), "/", "text/markdown")).text()).toBe("# Cloudhal\n");
  });

  it("serves everything else from the assets unchanged", async () => {
    const e = env({ "/llms.txt": "# llms" });
    const html = await get(e, "/docs/agents/clients", "text/html");
    expect(await html.text()).toBe("<html>clients</html>");
    expect(html.headers.get("vary")).toContain("Accept");
    expect(await (await get(e, "/llms.txt", "text/markdown")).text()).toBe("# llms");
    const none = await get(e, "/docs/missing", "text/markdown");
    expect(none.status).toBe(404);
    expect(e.seen).toEqual([
      "/docs/agents/clients",
      "/llms.txt",
      "/docs/missing.md",
      "/docs/missing",
    ]);
  });

  it("reads Accept with q values", () => {
    expect(wantsMarkdown("text/markdown")).toBe(true);
    expect(wantsMarkdown("text/html, text/markdown;q=0.5")).toBe(true);
    expect(wantsMarkdown("text/markdown;q=0")).toBe(false);
    expect(wantsMarkdown("text/html,*/*")).toBe(false);
    expect(wantsMarkdown(null)).toBe(false);
  });
});

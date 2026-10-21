/**
 * The docs MCP at `https://cloudhal.dev/mcp` (ADR-0039 rule 4): Streamable HTTP, stateless,
 * read-only, no authentication. Every POST carries one JSON-RPC message (or a batch, for
 * 2025-03-26 clients) and gets one JSON answer; there are no sessions and no server-sent events.
 * Separate from Cloudhal's site MCP (`cloudhal mcp`, remote `/mcp` on a deployment).
 */
import { type SearchIndex, searchDocs } from "../lib/search.ts";
import { markdownPath, pageId } from "./paths.ts";

export interface McpDeps {
  /** The search index, loaded once per isolate. */
  readonly index: () => Promise<SearchIndex>;
  /** A page's Markdown by its `.md` path, or `undefined` when there is none. */
  readonly markdown: (path: string) => Promise<string | undefined>;
  /** The Worker's own host, accepted by `read_doc` besides cloudhal.dev. */
  readonly selfHost?: string;
}

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SECTION_KEYS = ["start", "agents", "reference", "guides", "contributing", "adr", "rfcs"];
const MAX_BODY = 64 * 1024;

const INSTRUCTIONS =
  "Cloudhal's public documentation (https://cloudhal.dev), read-only. Use search_docs to find pages, then read_doc to read one as Markdown. The index of every page is https://cloudhal.dev/llms.txt. This server only reads the docs: to work on a Cloudhal site, connect that site's own MCP server (cloudhal mcp, or /mcp on a deployment; see https://cloudhal.dev/docs/agents/clients).";

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: "search_docs",
    title: "Search the Cloudhal docs",
    description:
      "Search Cloudhal's documentation (guides, reference, agents and MCP setup, ADRs and RFCs). Returns up to 8 pages with title, url and a snippet; read one with read_doc.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200, description: "Words to look for." },
        section: {
          type: "string",
          enum: SECTION_KEYS,
          description:
            "Only this section: start, agents (agents and MCP), reference, guides, contributing (internals), adr (decisions) or rfcs (proposals).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              snippet: { type: "string" },
            },
            required: ["title", "url", "snippet"],
          },
        },
      },
      required: ["results"],
    },
    annotations: READ_ONLY,
  },
  {
    name: "read_doc",
    title: "Read a Cloudhal docs page",
    description:
      "One page of Cloudhal's documentation as Markdown, with frontmatter (title, description, url, source). Takes a https://cloudhal.dev URL or a path such as /docs/agents/clients.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "A https://cloudhal.dev page URL or path (from search_docs or llms.txt).",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
] as const;

type Id = string | number | null;
interface Message {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const text = (value: string, isError = false) => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError: true } : {}),
});

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function searchTool(args: Record<string, unknown>, deps: McpDeps) {
  const { query, section } = args;
  if (typeof query !== "string" || query.trim() === "" || query.length > 200) {
    return text("query must be 1 to 200 characters.", true);
  }
  if (section !== undefined && (typeof section !== "string" || !SECTION_KEYS.includes(section))) {
    return text(`section must be one of ${SECTION_KEYS.join(", ")}.`, true);
  }
  const results = searchDocs(await deps.index(), query, { section, limit: 8 });
  return { ...text(JSON.stringify({ results })), structuredContent: { results } };
}

async function readTool(args: Record<string, unknown>, deps: McpDeps) {
  const { url } = args;
  if (typeof url !== "string" || url.length > 500) return text("url must be a string.", true);
  const id = pageId(url, deps.selfHost);
  if (!id) return text("read_doc reads only cloudhal.dev pages (a URL or a /docs/… path).", true);
  const markdown = await deps.markdown(markdownPath(id));
  if (markdown === undefined) {
    return text(`No page at ${url}. Find pages with search_docs or in /llms.txt.`, true);
  }
  return text(markdown);
}

const TOOL_HANDLERS: Record<string, typeof searchTool> = {
  search_docs: searchTool,
  read_doc: readTool,
};

const METHODS: Record<string, (params: Record<string, unknown>, deps: McpDeps) => unknown> = {
  initialize: (params) => {
    const asked = params.protocolVersion;
    const protocolVersion =
      typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "cloudhal-docs", title: "Cloudhal docs", version: "1.0.0" },
      instructions: INSTRUCTIONS,
    };
  },
  ping: () => ({}),
  "tools/list": () => ({ tools: TOOLS }),
  "tools/call": (params, deps) => {
    const handler = typeof params.name === "string" ? TOOL_HANDLERS[params.name] : undefined;
    if (!handler) throw new RpcError(-32602, `Unknown tool: ${String(params.name)}`);
    return handler(record(params.arguments), deps);
  },
};

/** One JSON-RPC message's answer; `undefined` for notifications and responses. */
async function answer(message: unknown, deps: McpDeps): Promise<object | undefined> {
  const m = record(message) as Message;
  const id: Id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
  if (m.jsonrpc !== "2.0" || (typeof m.method !== "string" && m.id === undefined)) {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid request" } };
  }
  if (typeof m.method !== "string" || m.id === undefined) return undefined;
  const method = Object.hasOwn(METHODS, m.method) ? METHODS[m.method] : undefined;
  if (!method) return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  try {
    return { jsonrpc: "2.0", id, result: await method(record(m.params), deps) };
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32603;
    const message = error instanceof RpcError ? error.message : "Internal error";
    return { jsonrpc: "2.0", id, error: { code, message } };
  }
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-max-age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });

const rpcError = (code: number, message: string, status: number) =>
  json({ jsonrpc: "2.0", id: null, error: { code, message } }, status);

/** `/mcp`: POST is JSON-RPC; GET (no event stream) and DELETE (no sessions) answer 405. */
export async function handleMcp(request: Request, deps: McpDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST", ...CORS } });
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return rpcError(-32700, "Content-Type must be application/json", 415);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return rpcError(-32600, "Request too large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(-32700, "Parse error", 400);
  }
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return rpcError(-32600, "Invalid request", 400);
    const answers = (await Promise.all(body.map((m) => answer(m, deps)))).filter(Boolean);
    return answers.length > 0 ? json(answers) : new Response(null, { status: 202, headers: CORS });
  }
  const one = await answer(body, deps);
  return one ? json(one) : new Response(null, { status: 202, headers: CORS });
}

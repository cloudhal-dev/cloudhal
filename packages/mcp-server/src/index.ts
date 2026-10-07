/**
 * @cloudhal/mcp-server — the semantic tool surface agents use (ADR-0004, ADR-0011).
 * `tools.ts` is SDK-independent; `server.ts` wraps it in `@modelcontextprotocol/server`;
 * `stdio.ts` / `http.ts` are the transports.
 */
export * from "./http.ts";
export * from "./server.ts";
export * from "./stdio.ts";
export * from "./tools.ts";

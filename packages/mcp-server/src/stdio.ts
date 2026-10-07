/** stdio transport: `cloudhal mcp` runs this for local MCP clients (Claude Code, Cursor, …). */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { type CloudhalMcpOptions, createCloudhalMcpServer } from "./server.ts";

export interface StdioOptions extends Omit<CloudhalMcpOptions, "stateKey"> {
  stateKey?: Uint8Array | string | undefined;
  onerror?: ((error: Error) => void) | undefined;
}

/** Serves one Cloudhal MCP server over the process's stdin/stdout. Resolves `close()` to stop. */
export function serveCloudhalStdio(options: StdioOptions): { close(): Promise<void> } {
  // One process serves every round of an approval, so a per-process random key is enough.
  const stateKey = options.stateKey ?? crypto.getRandomValues(new Uint8Array(32));
  const { onerror, ...rest } = options;
  return serveStdio(() => createCloudhalMcpServer({ ...rest, stateKey }), {
    ...(onerror ? { onerror } : {}),
  });
}

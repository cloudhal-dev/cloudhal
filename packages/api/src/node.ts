import { type ServerType, serve } from "@hono/node-server";
import type { CloudhalApi } from "./app.ts";

/** Serves the API on Node. Resolves once listening; returns the server for shutdown. */
export function serveNode(
  app: CloudhalApi,
  options: { port: number; hostname?: string },
): Promise<{ server: ServerType; port: number }> {
  return new Promise((resolve) => {
    const server = serve(
      { fetch: app.fetch, port: options.port, hostname: options.hostname ?? "127.0.0.1" },
      (info) => {
        resolve({ server, port: info.port });
      },
    );
  });
}

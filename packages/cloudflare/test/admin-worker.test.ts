/**
 * Unit-level behaviour of the admin Worker that needs no D1. The full flow (D1, R2, Better Auth,
 * MCP, service binding to the site Worker) runs on workerd in packages/cli/test/cloudflare-deploy.test.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAdminWorker, STUDIO_SECURITY_HEADERS } from "../src/admin-worker.ts";

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

describe("admin Worker routing", () => {
  it("hands everything except /api, /mcp and /.well-known to the Studio assets", async () => {
    const seen: string[] = [];
    const env = {
      ASSETS: {
        fetch: async (r: Request) => {
          seen.push(new URL(r.url).pathname);
          return new Response("studio");
        },
      },
    } as never;
    const worker = createAdminWorker();
    for (const p of ["/", "/sites/site_x", "/login", "/apix", "/mcpx"]) {
      const res = await worker.fetch(new Request(`https://admin.example${p}`), env, ctx);
      expect(await res.text()).toBe("studio");
    }
    // every client route is answered with the shell at "/"
    expect(seen).toEqual(["/", "/", "/", "/", "/"]);
    // …with Studio's security headers (the same `_headers` gives the static files)
    const shell = await worker.fetch(new Request("https://admin.example/sites/site_x"), env, ctx);
    expect(shell.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(shell.headers.get("x-content-type-options")).toBe("nosniff");
    const headersFile = await readFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../apps/studio/public/_headers",
      ),
      "utf8",
    );
    for (const [k, v] of Object.entries(STUDIO_SECURITY_HEADERS))
      expect(headersFile.toLowerCase(), k).toContain(`${k}: ${v}`.toLowerCase());
    // a missing build file is a 404, never the SPA shell (which could be cached under its URL)
    const missing = await worker.fetch(
      new Request("https://admin.example/assets/Old-abc123.js"),
      env,
      ctx,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(seen).not.toContain("/assets/Old-abc123.js");
    const noAssets = await worker.fetch(new Request("https://admin.example/"), {} as never, ctx);
    expect(noAssets.status).toBe(404);
  });

  it("validates bundled skills at construction", () => {
    expect(() =>
      createAdminWorker({
        skills: [{ name: "broken", markdown: "no frontmatter", references: {} }],
      }),
    ).toThrow(/frontmatter/);
  });
});

/**
 * Unit-level behaviour of the admin Worker that needs no D1. The full flow (D1, R2, Better Auth,
 * MCP, service binding to the site Worker) runs on workerd in packages/cli/test/cloudflare-deploy.test.ts.
 */
import { describe, expect, it } from "vitest";
import { createAdminWorker } from "../src/admin-worker.ts";

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
    expect(seen).toEqual(["/", "/sites/site_x", "/login", "/apix", "/mcpx"]);
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

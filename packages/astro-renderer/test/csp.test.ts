/**
 * Theme scripts under `SITE_CSP` (`script-src 'self'`): the `cloudhal()` integration keeps Astro
 * from inlining a component's `<script>` into the page, and `cloudhal dev` sends the policy
 * report-only so a blocked script shows before a deploy.
 */
import { describe, expect, it } from "vitest";
import { SITE_CSP, scriptsNotInlined } from "../src/csp.ts";
import { onRequest } from "../src/csp-middleware.ts";
import { cloudhal } from "../src/integration.ts";

const bytes = (n: number) => new Uint8Array(n);

describe("scriptsNotInlined", () => {
  it("never inlines a script chunk; other assets keep the project's limit", () => {
    const vite = scriptsNotInlined(undefined);
    expect(vite("_astro/Hero.astro_astro_type_script_index_0_lang.Bx1.js", bytes(10))).toBe(false);
    expect(vite("_astro/chunk.mjs", bytes(10))).toBe(false);
    // Undefined: Vite's (and Astro's) own 4 KB default decides.
    expect(vite("_astro/logo.svg", bytes(10))).toBeUndefined();
    expect(scriptsNotInlined(100)("a.png", bytes(99))).toBe(true);
    expect(scriptsNotInlined(100)("a.png", bytes(100))).toBe(false);
    expect(scriptsNotInlined(100)("a.js", bytes(1))).toBe(false);
    const own = scriptsNotInlined((file) => file.endsWith(".woff2"));
    expect(own("a.woff2", bytes(1))).toBe(true);
    expect(own("a.js", bytes(1))).toBe(false);
  });

  it("is what the integration gives Vite, on top of the project's own setting", async () => {
    let vite: { build?: { assetsInlineLimit?: unknown } } = {};
    const middleware: string[] = [];
    const setup = cloudhal({ dataDir: "/tmp/data", siteId: "site_1" }).hooks["astro:config:setup"];
    await setup?.({
      updateConfig: (c: { vite: typeof vite }) => {
        vite = c.vite;
      },
      addMiddleware: (m: { entrypoint: string }) => middleware.push(m.entrypoint),
      config: { root: new URL("file:///site/"), vite: { build: { assetsInlineLimit: 0 } } },
      command: "dev",
    } as never);
    const limit = vite.build?.assetsInlineLimit as (f: string, c: Uint8Array) => unknown;
    expect(limit("_astro/Theme.js", bytes(1))).toBe(false);
    expect(limit("_astro/icon.svg", bytes(1))).toBe(false);
    expect(middleware).toContain("@cloudhal/astro-renderer/csp-middleware");
  });
});

describe("cloudhal dev's report-only CSP", () => {
  const run = (response: Response) =>
    onRequest({ request: new Request("http://localhost/") }, async () => response);

  it("reports what the Site Worker would block on HTML pages", async () => {
    const page = await run(
      new Response("<p>hi</p>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    expect(page.headers.get("content-security-policy-report-only")).toBe(SITE_CSP);
    expect(page.headers.has("content-security-policy")).toBe(false);
  });

  it("leaves other responses and a page's own policy alone", async () => {
    const js = await run(new Response("1", { headers: { "content-type": "text/javascript" } }));
    expect(js.headers.has("content-security-policy-report-only")).toBe(false);
    const own = await run(
      new Response("<p>hi</p>", {
        headers: { "content-type": "text/html", "content-security-policy": "default-src 'none'" },
      }),
    );
    expect(own.headers.has("content-security-policy-report-only")).toBe(false);
  });
});

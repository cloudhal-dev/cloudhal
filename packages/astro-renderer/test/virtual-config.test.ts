/**
 * `virtual:cloudhal/config` (RFC-0046 §11b, #239): the `cloudflare` target bakes in no `dataDir`.
 * The Site Worker reads D1 and R2 through its bindings, and the resolved value would be the build
 * machine's absolute path, which a release bundle built in CI would carry to every deployment.
 * Node targets keep it (`cloudhal dev` and static builds read the local store from it).
 */
import { describe, expect, it } from "vitest";
import { cloudhal, virtualConfig } from "../src/integration.ts";

type Plugin = { name: string; load: (id: string) => string | undefined };

/** The virtual config module's source after `astro:config:setup` (no build, no dev server). */
async function configModule(target: "node" | "cloudflare", dataDir: string): Promise<string> {
  const integration = cloudhal({ siteId: "site_abc123", dataDir, target });
  const plugins: Plugin[] = [];
  const setup = integration.hooks["astro:config:setup"] as unknown as (o: object) => Promise<void>;
  await setup({
    command: "sync",
    config: { root: new URL("file:///ci/runner/work/project/"), vite: {} },
    addMiddleware: () => {},
    updateConfig: (c: { vite?: { plugins?: Plugin[] } }) =>
      plugins.push(...(c.vite?.plugins ?? [])),
  });
  const plugin = plugins.find((p) => p.name === "cloudhal-config");
  const body = plugin?.load("\0virtual:cloudhal/config");
  if (!body) throw new Error("no virtual config module");
  return body;
}

describe("virtual:cloudhal/config", () => {
  it("carries no dataDir on the cloudflare target, whatever cloudhal.json says", async () => {
    for (const dataDir of [".cloudhal", "/ci/runner/work/data", "other/data"]) {
      const body = await configModule("cloudflare", dataDir);
      expect(body).not.toContain("dataDir");
      expect(body).not.toContain("/ci/runner");
      expect(body).toContain('"siteId":"site_abc123"');
    }
    // So the module is the same bytes for every dataDir.
    expect(await configModule("cloudflare", ".cloudhal")).toBe(
      await configModule("cloudflare", "/elsewhere/data"),
    );
  });

  it("keeps the resolved dataDir on Node targets", async () => {
    expect(await configModule("node", ".cloudhal")).toContain(
      '"dataDir":"/ci/runner/work/project/.cloudhal"',
    );
    expect(virtualConfig({ siteId: "s", dataDir: "/d" }, false)).toEqual({
      siteId: "s",
      dataDir: "/d",
    });
    expect(virtualConfig({ siteId: "s", dataDir: "/d" }, true)).toEqual({ siteId: "s" });
  });
});

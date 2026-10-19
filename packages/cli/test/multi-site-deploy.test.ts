/** RFC-0034 phase C1: `cloudhal.json` `sites`, the generated configs and the deploy's site check. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Site } from "@cloudhal/core-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { adminWorkerConfig, siteWorkerConfig } from "../src/cloudflare/config.ts";
import type { DeployContext } from "../src/commands/deploy/context.ts";
import { servedSites } from "../src/commands/deploy/served-sites.ts";
import { parseSites, readProjectConfig } from "../src/config.ts";

const EN = "site_english01";
const TR = "site_turkish01";
const DOCS = "site_docs00001";
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("cloudhal.json sites (RFC-0034 §4)", () => {
  it("puts the project's site first, drops repeats and ignores a list of one", () => {
    expect(parseSites(EN, [TR, EN, TR])).toEqual([EN, TR]);
    expect(parseSites(EN, [EN])).toBeUndefined();
    expect(parseSites(EN, undefined)).toBeUndefined();
    expect(() => parseSites(EN, ["nope"])).toThrow(/site ids/);
  });

  it("writes CLOUDHAL_SITE_IDS and a route per hostname for a multi-site Worker", () => {
    const names = { name: "news", databaseId: "00000000-0000-0000-0000-000000000001" };
    const site = siteWorkerConfig({
      ...names,
      siteId: EN,
      siteIds: [EN, TR],
      domain: "en.example.com",
      domains: ["tr.example.com", "en.example.com"],
    }) as { vars: Record<string, string>; routes: unknown };
    expect(site.vars.CLOUDHAL_SITE_IDS).toBe(`${EN},${TR}`);
    expect(site.vars.CLOUDHAL_SITE_ID).toBeUndefined();
    expect(site.routes).toEqual([
      { pattern: "en.example.com", custom_domain: true },
      { pattern: "tr.example.com", custom_domain: true },
    ]);
    const admin = adminWorkerConfig({
      ...names,
      studioDir: "studio",
      main: "worker.ts",
      siteId: EN,
      siteIds: [EN, TR],
    }) as { vars: Record<string, string> };
    expect(admin.vars.CLOUDHAL_SITE_IDS).toBe(`${EN},${TR}`);
    expect(admin.vars.CLOUDHAL_SITE_ID).toBeUndefined();
    // a single-site deployment is unchanged
    const single = siteWorkerConfig({ ...names, siteId: EN }) as { vars: Record<string, string> };
    expect(single.vars.CLOUDHAL_SITE_ID).toBe(EN);
  });
});

describe("servedSites: the deploy's check of cloudhal.json sites", () => {
  async function project(sites: string[], remote: unknown[]) {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-served-"));
    dirs.push(projectDir);
    await writeFile(
      path.join(projectDir, "cloudhal.json"),
      JSON.stringify({
        siteId: EN,
        sites,
        dataDir: ".cloudhal",
        domains: { site: "en.example.com" },
      }),
    );
    await mkdir(path.join(projectDir, ".cloudhal/deploy"), { recursive: true });
    await writeFile(
      path.join(projectDir, ".cloudhal/deploy/secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: "deploy-token-for-tests" }),
    );
    const cfg = await readProjectConfig(projectDir);
    const fetch = (async () =>
      Response.json({ sites: remote })) as unknown as typeof globalThis.fetch;
    const lines: string[] = [];
    const ctx = {
      options: { projectDir, fetch },
      cfg,
      site: { id: EN, theme: { name: "blog" } } as Site,
      previous: { name: "news", adminUrl: "https://news-admin.example.workers.dev" },
      log: (l: string) => lines.push(l),
    } as unknown as DeployContext;
    return { ctx, lines };
  }
  const row = (id: string, slug: string, theme: string, hosts: string[]) => ({
    id,
    slug,
    name: slug,
    theme,
    hosts,
    conflicts: [],
  });

  it("collects the other sites' hostnames, without workers.dev or the site domain", async () => {
    const { ctx } = await project(
      [TR],
      [
        row(EN, "english", "blog", ["en.example.com", "news.example.workers.dev"]),
        row(TR, "turkce", "blog", ["tr.example.com", "haber.example.com"]),
      ],
    );
    expect(await servedSites(ctx)).toEqual({
      siteIds: [EN, TR],
      hosts: ["tr.example.com", "haber.example.com"],
    });
  });

  it("refuses a site the deployment does not have, or one with another theme", async () => {
    const missing = await project([TR], [row(EN, "english", "blog", [])]);
    await expect(servedSites(missing.ctx)).rejects.toThrow(/site_turkish01 not found/);
    const otherTheme = await project(
      [DOCS],
      [row(EN, "english", "blog", []), row(DOCS, "docs", "docs", ["docs.example.com"])],
    );
    await expect(servedSites(otherTheme.ctx)).rejects.toThrow(/docs \(docs\) use another theme/);
  });

  it("serves the list without routes on a first deploy", async () => {
    const { ctx, lines } = await project([TR], []);
    (ctx as { previous: unknown }).previous = undefined;
    expect(await servedSites(ctx)).toEqual({ siteIds: [EN, TR], hosts: [] });
    expect(lines.join("\n")).toMatch(/deploy again/);
  });
});

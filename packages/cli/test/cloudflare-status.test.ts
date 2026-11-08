/**
 * RFC-0043 §1 on real workerd (wrangler's test harness): before the first publish the Site
 * Worker answers page paths with the renderer's status page (503, `Retry-After`, `no-store`,
 * `noindex`, its own CSP) before Astro runs, restyled by the project's `statusPage` theme hook;
 * machine paths get the starter's plain answer; `/__cloudhal/health` says `not-published`; a
 * preview token that does not verify answers 410 instead of the published page. A publish turns
 * all of it into the real site.
 */
import { appendFile, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Site } from "@cloudhal/core-contracts";
import { copySite, mintPreviewToken, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import { siteConfigPath, siteWorkerConfig, writeWranglerConfig } from "../src/cloudflare/config.ts";
import { init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const PREVIEW_SECRET = "status-worker-test-preview-secret-32b!";
const PURGE_TOKEN = "status-worker-test-purge-token";
const human = { kind: "human" as const, id: "user_cfstatus001", name: "Halil" };

/** The project's theme hook (§1.7): restyles every page but maintenance, which stays built in. */
const THEME_HOOK = `
// test: the status pages' theme hook (RFC-0043 §1.7)
import type { StatusPageHook } from "@cloudhal/astro-renderer/status-page";
export const statusPage: StatusPageHook = (state, ctx) =>
  state === "maintenance" ? undefined : ctx.defaultHtml({ css: "/* hooked by the theme */" });
`;

describe("Site Worker status pages on workerd (RFC-0043 §1)", () => {
  let tmp: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  let remote: SiteGraphStore;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-cf-status-"));
    const projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Edge Status <Site>" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await appendFile(path.join(projectDir, "src/theme.ts"), THEME_HOOK);
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({
        name: "status-test",
        siteId,
        databaseId: "00000000-0000-0000-0000-0000000c0de3",
      }),
      "test",
    );
    const config = await buildSiteWorker(projectDir);
    harness = createTestHarness({
      root: projectDir,
      workers: [
        {
          configPath: config,
          secrets: { CLOUDHAL_PREVIEW_SECRET: PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN: PURGE_TOKEN },
        },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    const target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
    await migrate(target.sql, migrations);
    // `cloudhal push` of a project nobody has published yet.
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await copySite(local, target, siteId);
    await local.close();
    remote = new SiteGraphStore(target);
  }, 600_000);

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const get = (p: string, init?: Parameters<typeof harness.fetch>[1]) =>
    harness.fetch(`https://status.example${p}`, init);

  it("answers page paths with the not-published page before the first publish", async () => {
    const res = await get("/");
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(503);
    expect(res.headers.get("x-cloudhal-state")).toBe("not-published");
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("vary")).toBe("Host");
    expect(res.headers.get("content-type")).toContain("text/html");
    // the theme hook restyled the built-in page: the site CSP, not the built-in one
    expect(html).toContain("/* hooked by the theme */");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(html).toContain("<h1>Coming soon</h1>");
    expect(html).toContain("Edge Status &lt;Site&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//);
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(8192);
    expect((await get("/about")).status).toBe(503);
    expect((await get("/posts/hello-world")).headers.get("x-cloudhal-state")).toBe("not-published");
    const head = await get("/", { method: "HEAD" });
    expect(head.status).toBe(503);
    expect(await head.text()).toBe("");
  });

  it("machine paths and robots.txt keep their own answers", async () => {
    const rss = await get("/rss.xml");
    expect(rss.status).toBe(503);
    expect(rss.headers.get("content-type")).toContain("text/plain");
    expect(rss.headers.get("x-cloudhal-state")).toBe("not-published");
    expect(await rss.text()).toContain("Coming soon.");
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(503);
    expect(await robots.text()).toContain("Disallow: /");
    expect((await get("/sitemap.xml")).status).toBe(503);
  });

  it("health says not-published with the admin's shape", async () => {
    const res = await get("/__cloudhal/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.json()).toEqual({ ok: true, state: "not-published" });
  });

  it("a preview token that does not verify answers 410; a valid one shows the draft", async () => {
    const bad = await get("/?cloudhal-preview=not-a-token");
    expect(bad.status).toBe(410);
    expect(bad.headers.get("x-cloudhal-state")).toBe("preview-expired");
    expect(bad.headers.get("x-robots-tag")).toBe("noindex");
    expect(bad.headers.get("cache-control")).toBe("no-store");
    expect(await bad.text()).toContain("This preview link has expired");
    const token = await mintPreviewToken(PREVIEW_SECRET, { site: siteId, target: "live" });
    const ok = await get(`/?cloudhal-preview=${token}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-cloudhal-mode")).toBe("preview");
  });

  it("a publish turns the pages, the feed and health into the real site", async () => {
    const site = (await remote.getSite(siteId)) as Site;
    const snap = await remote.createSnapshot(siteId, { actor: human, reason: "publish" });
    await remote.publish(site, snap.id);
    const purge = await get("/__cloudhal/purge", {
      method: "POST",
      headers: { authorization: `Bearer ${PURGE_TOKEN}` },
    });
    expect(purge.status).toBe(200);
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-cloudhal-mode")).toBe("published");
    expect(res.headers.get("x-cloudhal-state")).toBeNull();
    expect((await get("/rss.xml")).status).toBe(200);
    expect(await (await get("/__cloudhal/health")).json()).toEqual({
      ok: true,
      state: "published",
    });
    // an invalid preview link still never falls back to the published page (§1.2)
    const bad = await get("/about?cloudhal-preview=expired");
    expect(bad.status).toBe(410);
    expect(await bad.text()).toContain("Edge Status &lt;Site&gt;");
  });
});

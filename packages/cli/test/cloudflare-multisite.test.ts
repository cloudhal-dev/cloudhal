/**
 * RFC-0034 phase B: one Site Worker serves two sites of an installation, picked by hostname from
 * `site_hosts`, on real workerd (wrangler's test harness) against local D1 + R2. Unknown hosts get
 * a short-cached 404, never another site; the workers.dev host shows the first site, `noindex`; a
 * purge names its site and stays tag-only.
 */
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Site } from "@cloudhal/core-contracts";
import { copySite, seedStarterSite } from "@cloudhal/core-ts";
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
const PURGE_TOKEN = "multi-site-test-purge-token";
const human = { kind: "human" as const, id: "user_multisite01", name: "Halil" };

describe("multi-site Site Worker on workerd (RFC-0034 §4)", () => {
  let tmp: string;
  let english: string;
  let turkish: string;
  let harness: ReturnType<typeof createTestHarness>;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-multi-"));
    const projectDir = path.join(tmp, "site");
    english = (await init({ dir: projectDir, name: "English Edition" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const first = (await local.store.getSite(english)) as Site;
    turkish = (
      await seedStarterSite(local.store, {
        name: "Türkçe Baskı",
        slug: "turkce",
        locale: "tr",
        projectId: first.projectId,
      })
    ).id;
    for (const [id, host] of [
      [english, "en.example.test"],
      [turkish, "tr.example.test"],
    ] as const) {
      const site = (await local.store.getSite(id)) as Site;
      await local.store.updateSite({ ...site, domains: [{ hostname: host, primary: true }] });
      const snap = await local.store.createSnapshot(id, { actor: human, reason: "publish" });
      await local.store.publish((await local.store.getSite(id)) as Site, snap.id);
    }
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({
        name: "multi-test",
        siteId: english,
        siteIds: [english, turkish],
        databaseId: "00000000-0000-0000-0000-0000000c0de2",
      }),
      "test",
    );
    const config = await buildSiteWorker(projectDir);
    harness = createTestHarness({
      root: projectDir,
      workers: [{ configPath: config, secrets: { CLOUDHAL_PURGE_TOKEN: PURGE_TOKEN } }],
    });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    const target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
    await migrate(target.sql, migrations);
    // `cloudhal push` of both sites; the import writes their hostnames into site_hosts.
    await copySite(local, target, english);
    await copySite(local, target, turkish);
    await local.close();
  }, 600_000);

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it("serves each site on its own hostname", async () => {
    const en = await harness.fetch("https://en.example.test/");
    const enHtml = await en.text();
    expect(en.status, enHtml.slice(0, 300)).toBe(200);
    expect(enHtml).toMatch(/<h1[^>]*>English Edition<\/h1>/);
    expect(en.headers.get("cache-tag")?.split(",")[0]).toBe(`cloudhal-site-${english}`);

    const tr = await harness.fetch("https://tr.example.test/");
    const trHtml = await tr.text();
    expect(tr.status, trHtml.slice(0, 300)).toBe(200);
    expect(trHtml).toMatch(/<h1[^>]*>Türkçe Baskı<\/h1>/);
    expect(tr.headers.get("cache-tag")?.split(",")[0]).toBe(`cloudhal-site-${turkish}`);
    expect(trHtml).not.toContain("English Edition");
  });

  it("answers an unknown hostname with a short-cached 404, never another site", async () => {
    const res = await harness.fetch("https://unknown.example.test/");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await res.text()).not.toContain("English Edition");
  });

  it("shows the first site on the workers.dev host, marked noindex", async () => {
    const res = await harness.fetch("https://multi-test-site.example.workers.dev/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toMatch(/<h1[^>]*>English Edition<\/h1>/);
  });

  it("purges one site by tag and refuses a site it does not serve", async () => {
    const purge = (body: unknown) =>
      harness.fetch("https://en.example.test/__cloudhal/purge", {
        method: "POST",
        headers: { authorization: `Bearer ${PURGE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const one = await purge({ siteId: turkish });
    expect(one.status).toBe(200);
    expect(((await one.json()) as { tags?: string[] }).tags).toEqual([`cloudhal-site-${turkish}`]);
    expect((await purge({ siteId: "site_notserved01" })).status).toBe(400);
    // Without a site: every served site's tag, never purgeEverything.
    const all = (await (await purge({})).json()) as { tags?: string[] };
    expect(all.tags?.sort()).toEqual(
      [`cloudhal-site-${english}`, `cloudhal-site-${turkish}`].sort(),
    );
  });
});

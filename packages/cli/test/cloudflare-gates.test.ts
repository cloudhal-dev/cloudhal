/**
 * RFC-0008 rollout step 4 on real workerd (wrangler's test harness), through the blog starter's
 * own routes:
 *
 * - **Route sweep (S9).** The fixture of `astro-renderer/test/gates-fixture.ts` (pages and entries
 *   embargoed, expired and gated at `t`; an image riding only with an embargoed entry; a menu
 *   pointing at gated nodes) is published; every route the starter serves — pages, entries,
 *   archives and their pages, term feeds, `rss.xml`, `sitemap.xml`, `robots.txt`, every media URL,
 *   the 404 page, every gated node's own URL — is fetched, and no body or header may name a gated
 *   node. Previews (live and snapshot links) show them, with the notice.
 * - **Cache cap (S10).** Published responses carry `max-age` up to the next gate; a gate a few
 *   seconds ahead opens on its own, with no purge and no scheduler.
 * - **Features handshake (§7.7).** `GET /__cloudhal/features` answers `{ "gates": 1 }` to the admin
 *   only, and the admin Worker accepts `availability` over REST once it has asked.
 * - **Writer guard (S15).** Against an "old" site Worker (no features endpoint), the admin Worker
 *   refuses `availability` in REST writes and bundle pushes with `409 gates_unsupported`.
 *
 * Comments and analytics endpoints are off in these Workers (no key, no dataset); their gate
 * checks run in the renderer sweep (`entryById`, `publishedNode`).
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Site } from "@cloudhal/core-contracts";
import {
  copySite,
  exportSite,
  GATES_ENFORCED,
  mintPreviewToken,
  SiteGraphStore,
} from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { mediaPath } from "@cloudhal/core-ts/media";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
// The renderer is not a dependency of the CLI; its sources (and the sweep fixture) are read in place.
import { staticPaths } from "../../astro-renderer/src/routing.ts";
import { SnapshotSource } from "../../astro-renderer/src/source.ts";
import { applyGatesFixture, type GatesFixture } from "../../astro-renderer/test/gates-fixture.ts";
import { prepareAdminWorker } from "../src/cloudflare/admin.ts";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import {
  COMPATIBILITY_DATE,
  siteConfigPath,
  siteWorkerConfig,
  workerNames,
  writeWranglerConfig,
} from "../src/cloudflare/config.ts";
import { init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const secrets = {
  BETTER_AUTH_SECRET: "gates-better-auth-secret-0123456789abcd",
  MCP_STATE_KEY: "gates-mcp-state-key-0123456789abcdefghi",
  CLOUDHAL_PREVIEW_SECRET: "gates-preview-secret-0123456789abcdefgh",
  CLOUDHAL_PURGE_TOKEN: "gates-purge-token-0123456789abcdefghijk",
  CLOUDHAL_DEPLOY_TOKEN: "gates-deploy-token-0123456789abcdefghij",
};
const human = { kind: "human" as const, id: "user_gatescf0001", name: "Halil" };
const browser = { origin: "https://admin.example" };
/**
 * How far ahead of the cache-cap test its own gate is set: room for one publish and a few fetches.
 * The gate is placed when that test starts, never in `beforeAll`, so no earlier test races it.
 */
const SOON_MS = 10_000;

type Harness = ReturnType<typeof createTestHarness>;

/** A project with the starter seed, the Workers' configs, and a built admin Worker. */
async function project(name: string) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), `cloudhal-${name}-`));
  const projectDir = path.join(tmp, "site");
  const names = { name, databaseId: "00000000-0000-0000-0000-0000000a7e50" };
  const { siteId } = await init({ dir: projectDir, name: "Gated Newsroom" });
  await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
  await writeWranglerConfig(
    siteConfigPath(projectDir),
    siteWorkerConfig({ ...names, siteId }),
    "test",
  );
  const studioDir = path.join(tmp, "studio");
  await mkdir(studioDir);
  await writeFile(path.join(studioDir, "index.html"), "<!doctype html><title>Studio</title>");
  const cfg = await readProjectConfig(projectDir);
  const admin = await prepareAdminWorker({ projectDir, dataDir: cfg.dataDir, names, studioDir });
  return { tmp, projectDir, siteId, names, W: workerNames(names), cfg, admin };
}

/** The owner's session cookie (first sign-up). */
async function signUp(adminFetch: (p: string, init?: RequestInit) => Promise<Response>) {
  const res = await adminFetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...browser },
    body: JSON.stringify({
      name: "Owner",
      email: "owner@example.com",
      password: "correct horse battery staple",
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

const pushBundle = (
  adminFetch: (p: string, init?: RequestInit) => Promise<Response>,
  siteId: string,
  bundle: unknown,
  mode = "bootstrap",
) =>
  adminFetch(`/api/admin/sites/${siteId}/bundle?mode=${mode}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${secrets.CLOUDHAL_DEPLOY_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(bundle),
  });

describe("time gates on workerd: the starter's routes, the cache cap, the handshake", () => {
  let p: Awaited<ReturnType<typeof project>>;
  let harness: Harness;
  let remote: SiteGraphStore;
  let fx: GatesFixture;
  let snapshotId: string;
  let candidates: string[];

  const siteFetch = (route: string, init?: RequestInit) =>
    harness.getWorker(p.W.site).fetch(`https://news.example${route}`, {
      redirect: "manual",
      ...init,
    } as never) as unknown as Promise<Response>;
  const adminFetch = (route: string, init?: RequestInit) =>
    harness
      .getWorker(p.W.admin)
      .fetch(`https://admin.example${route}`, init as never) as unknown as Promise<Response>;

  beforeAll(async () => {
    p = await project("gates");
    const siteConfig = await buildSiteWorker(p.projectDir);
    harness = createTestHarness({
      root: p.projectDir,
      workers: [
        { configPath: p.admin.configPath, secrets },
        {
          configPath: siteConfig,
          secrets: {
            CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
            CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
          },
        },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker(p.W.site).getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    const target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
    await migrate(target.sql, migrations);
    const local = await openLocalStore(path.join(p.projectDir, p.cfg.dataDir));
    await copySite(local, target, p.siteId);
    await local.close();
    // The fixture is written straight into D1 once the Workers run, so `t` is "now" for them.
    remote = new SiteGraphStore({ ...target, gates: GATES_ENFORCED });
    fx = await applyGatesFixture(remote, p.siteId, Date.now());
    const snap = await remote.createSnapshot(p.siteId, { actor: human, reason: "publish" });
    await remote.publish((await remote.getSite(p.siteId)) as Site, snap.id);
    snapshotId = snap.id;
    // Every route of the site with gates ignored, every gated URL, every media URL, and the rest.
    const everything = new SnapshotSource(remote, snap).ungated();
    const all = await staticPaths(everything, { perPage: 20 });
    const assets = (await everything.assets()).map((a) => mediaPath(a));
    candidates = [
      ...new Set([
        ...all.pages,
        ...all.feeds,
        ...fx.watched.map((w) => w.path),
        fx.tagPath,
        `${fx.tagPath}/rss.xml`,
        "/rss.xml",
        "/sitemap.xml",
        "/robots.txt",
        "/nope",
        ...assets,
      ]),
    ];
    expect(assets).toContain(mediaPath(fx.ridingAsset));
  });

  afterAll(async () => {
    await harness?.close();
    if (p) await rm(p.tmp, { recursive: true, force: true });
  });

  /** Fetches every candidate; returns every body and header as text, and each status. */
  async function sweep(): Promise<{ text: string; status: Map<string, number> }> {
    const status = new Map<string, number>();
    const parts: string[] = [];
    for (const route of candidates) {
      const res = await siteFetch(route);
      status.set(route, res.status);
      // what the site sent, never the URL asked for (the gated URLs are among the candidates)
      const body = await res.text();
      // Astro's 404 page echoes the path asked for ("Path: /posts/…"): that is the request, not a leak.
      parts.push(
        JSON.stringify([...res.headers]),
        res.status === 404 ? body.split(route).join("<requested path>") : body,
      );
    }
    return { text: parts.join("\n"), status };
  }

  it("serves no gated node on any route, and everything that is open (S9)", async () => {
    const before = Date.now();
    const { text, status } = await sweep();
    const after = Date.now();
    // the sweep must not straddle a gate
    expect(fx.hiddenAt(after).map((w) => w.name)).toEqual(fx.hiddenAt(before).map((w) => w.name));
    const hidden = fx.hiddenAt(after);
    expect(hidden.map((w) => w.name).sort()).toEqual(
      [
        "embargoed entry",
        "embargoed page",
        "entry closing at t",
        "expired entry",
        "expired page",
      ].sort(),
    );
    for (const w of hidden) {
      expect(status.get(w.path), w.name).toBe(404);
      for (const leak of w.leaks) {
        expect(text.includes(leak), `${w.name} leaks "${leak}"`).toBe(false);
      }
    }
    for (const w of fx.watched.filter((x) => !hidden.includes(x)))
      expect(status.get(w.path), w.name).toBe(200);
    expect(text).toContain("/posts/opens-now</loc>");
    // the riding image is not served early; the shared one is; the tag only it has is empty
    const riding = mediaPath(fx.ridingAsset);
    expect(status.get(riding)).toBe(404);
    expect(text.includes(fx.ridingAsset.id)).toBe(false);
    expect(text.includes(riding.split("/")[2] as string)).toBe(false);
    expect(status.get(mediaPath(fx.sharedAsset))).toBe(200);
    expect(status.get(fx.tagPath)).toBe(404);
    // a gated 404 is never cached
    const gated = await siteFetch("/posts/embargoed-scoop");
    expect(gated.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
  });

  it("previews show gated nodes with a notice, never cached", async () => {
    const live = await mintPreviewToken(secrets.CLOUDHAL_PREVIEW_SECRET, {
      site: p.siteId,
      target: "live",
    });
    const frozen = await mintPreviewToken(secrets.CLOUDHAL_PREVIEW_SECRET, {
      site: p.siteId,
      target: { snapshot: snapshotId },
    });
    for (const token of [live, frozen])
      for (const w of fx.hiddenAt(Date.now())) {
        const res = await siteFetch(`${w.path}?cloudhal-preview=${token}`);
        const html = await res.text();
        expect(res.status, `${w.name}: ${html.slice(0, 200)}`).toBe(200);
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(html).toContain(w.leaks[2] as string);
        expect(html).toMatch(/data-gate="(embargoed|expired)"/);
        expect(html).toMatch(/(Embargoed until|Expired on) .+\(UTC\)/);
      }
    const riding = await siteFetch(`${mediaPath(fx.ridingAsset)}?cloudhal-preview=${frozen}`);
    expect(riding.status).toBe(200);
    await riding.body?.cancel();
  });

  it("caps the edge cache at the next gate, which then opens without a purge (S10)", async () => {
    const maxAge = async (route: string) => {
      const res = await siteFetch(route);
      await res.body?.cancel();
      expect(res.status, route).toBe(200);
      const m = /^public, max-age=(\d+)$/.exec(
        res.headers.get("cloudflare-cdn-cache-control") ?? "",
      );
      return Number(m?.[1]);
    };
    // A gate a few seconds from now, published like any other: the next gate after it is t+1h.
    const news = await remote.getTermBySlug(p.siteId, "category", "news");
    if (!news) throw new Error("no seed term");
    const soon = Date.now() + SOON_MS;
    await remote.createContentEntry({
      siteId: p.siteId,
      collection: "posts",
      slug: "opens-soon",
      locale: "en",
      status: "published",
      title: "Story ZQXU7",
      body: { format: "markdown", value: "Body of ZQXU7." },
      fields: {},
      tags: [],
      terms: { category: { ids: [news.id], primary: news.id } },
      author: human,
      availability: { from: new Date(soon).toISOString() },
    });
    const snap = await remote.createSnapshot(p.siteId, { actor: human, reason: "publish" });
    await remote.publish((await remote.getSite(p.siteId)) as Site, snap.id);
    const left = Math.ceil((soon - Date.now()) / 1000);
    for (const route of ["/", "/rss.xml", "/sitemap.xml", "/posts/hello-world", "/category/news"]) {
      const age = await maxAge(route);
      expect(age, route).toBeGreaterThanOrEqual(1);
      expect(age, route).toBeLessThanOrEqual(left + 1);
    }
    expect((await siteFetch("/posts/opens-soon")).status).toBe(404);
    // wait for the gate: no purge, no publish, no scheduler
    await new Promise((r) => setTimeout(r, Math.max(0, soon - Date.now()) + 1000));
    const opened = await siteFetch("/posts/opens-soon");
    expect(opened.status).toBe(200);
    expect(await opened.text()).toContain("ZQXU7");
    expect(await (await siteFetch("/rss.xml")).text()).toContain("/posts/opens-soon</link>");
    // the next gate is t+1h now
    const age = await maxAge("/");
    expect(age).toBeGreaterThan(3600 - (Date.now() - fx.t) / 1000 - 5);
    expect(age).toBeLessThanOrEqual(3600);
  });

  it("answers the features handshake to the admin only (§7.7)", async () => {
    const auth = { authorization: `Bearer ${secrets.CLOUDHAL_PURGE_TOKEN}` };
    const ok = await siteFetch("/__cloudhal/features", { headers: auth });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ gates: 1 });
    expect(ok.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    // Workers Cache caches responses without cache headers: every answer here says no-store
    const anonymous = await siteFetch("/__cloudhal/features");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(
      (await siteFetch("/__cloudhal/features", { headers: { authorization: "Bearer wrong" } }))
        .status,
    ).toBe(401);
    expect(
      (await siteFetch("/__cloudhal/features", { method: "POST", headers: auth })).status,
    ).toBe(405);
  });

  it("lets the admin Worker write gates once the site Worker confirmed them", async () => {
    const cookie = await signUp(adminFetch);
    const hello = (await remote.listContentEntries(p.siteId)).find((e) => e.slug === "hello-world");
    if (!hello) throw new Error("no seed entry");
    const until = new Date(Date.now() + 86_400_000).toISOString();
    const res = await adminFetch(`/api/sites/${p.siteId}/entries/${hello.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...browser },
      body: JSON.stringify({ ...hello, availability: { until } }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(((await res.json()) as { availability?: unknown }).availability).toEqual({ until });
    // and still refuses gates that break the rules
    const bad = await adminFetch(`/api/sites/${p.siteId}/entries/${hello.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...browser },
      body: JSON.stringify({
        ...(await remote.getContentEntry(hello.id)),
        availability: { from: until, until },
      }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_availability");
  });
});

describe("time gates on workerd: an old site Worker (S15)", () => {
  let p: Awaited<ReturnType<typeof project>>;
  let harness: Harness;
  let gatedBundle: unknown;
  let plainBundle: unknown;

  const adminFetch = (route: string, init?: RequestInit) =>
    harness
      .getWorker(p.W.admin)
      .fetch(`https://admin.example${route}`, init as never) as unknown as Promise<Response>;

  beforeAll(async () => {
    p = await project("oldsite");
    // the local project as it is, and with gates (the local renderer enforces them)
    const local = await openLocalStore(path.join(p.projectDir, p.cfg.dataDir));
    plainBundle = await exportSite(local, p.siteId);
    await applyGatesFixture(local.store, p.siteId, Date.now());
    gatedBundle = await exportSite(local, p.siteId);
    await local.close();
    // A site Worker from before RFC-0008: no features endpoint (every path falls to its routes).
    const oldDir = path.join(p.tmp, "old-site");
    await mkdir(oldDir);
    await writeFile(
      path.join(oldDir, "worker.mjs"),
      'export default { fetch: () => new Response("not found", { status: 404 }) };\n',
    );
    await writeFile(
      path.join(oldDir, "wrangler.json"),
      JSON.stringify({
        name: p.W.site,
        main: "worker.mjs",
        compatibility_date: COMPATIBILITY_DATE,
      }),
    );
    harness = createTestHarness({
      root: p.projectDir,
      workers: [
        { configPath: p.admin.configPath, secrets },
        { configPath: path.join(oldDir, "wrangler.json") },
      ],
    });
    await harness.listen();
  });

  afterAll(async () => {
    await harness?.close();
    if (p) await rm(p.tmp, { recursive: true, force: true });
  });

  it("refuses availability in pushes and REST writes with 409 gates_unsupported", async () => {
    const refused = await pushBundle(adminFetch, p.siteId, gatedBundle);
    expect(refused.status, await refused.clone().text()).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toBe("gates_unsupported");
    const pushed = await pushBundle(adminFetch, p.siteId, plainBundle);
    expect(pushed.status, await pushed.clone().text()).toBe(200);

    const cookie = await signUp(adminFetch);
    const list = (await (
      await adminFetch(`/api/sites/${p.siteId}/entries`, { headers: { cookie } })
    ).json()) as Array<{ id: string; slug: string }>;
    const hello = list.find((e) => e.slug === "hello-world");
    if (!hello) throw new Error("no seed entry");
    const entry = await (
      await adminFetch(`/api/sites/${p.siteId}/entries/${hello.id}`, { headers: { cookie } })
    ).json();
    const write = await adminFetch(`/api/sites/${p.siteId}/entries/${hello.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...browser },
      body: JSON.stringify({
        ...(entry as object),
        availability: { from: new Date(Date.now() + 3_600_000).toISOString() },
      }),
    });
    expect(write.status, await write.clone().text()).toBe(409);
    expect(((await write.json()) as { error: string }).error).toBe("gates_unsupported");
    // everything else still works
    const retitle = await adminFetch(`/api/sites/${p.siteId}/entries/${hello.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...browser },
      body: JSON.stringify({ ...(entry as object), title: "Hello again" }),
    });
    expect(retitle.status, await retitle.clone().text()).toBe(200);
  });
});

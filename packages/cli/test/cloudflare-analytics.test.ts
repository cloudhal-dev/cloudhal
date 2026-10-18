/**
 * RFC-0006 rollout step 5 on real workerd (wrangler's test harness): site analytics on the Site
 * Worker. Workers Analytics Engine has no local backend (Miniflare's `writeDataPoint` is a no-op),
 * so `ANALYTICS` is bound to a fake Worker that keeps the data points it receives over RPC.
 *
 * Acceptance (RFC-0006 §Compatibility): a page view of a cached page — a beacon on its own, the
 * page never rendered — is written; forged beacons (another origin, a draft path, a client node id)
 * store nothing; GPC means no visitor hash; with analytics off there is no tag. Also: the tag
 * appears on published HTML only, the hashed script is a ≤ 1 KB static asset, render events.
 */
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { putAnalyticsSettings } from "@cloudhal/analytics/sql";
import { fromDataPoint } from "@cloudhal/analytics/wae";
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { copySite, mintPreviewToken, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import {
  COMPATIBILITY_DATE,
  siteConfigPath,
  siteWorkerConfig,
  writeWranglerConfig,
} from "../src/cloudflare/config.ts";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const PREVIEW_SECRET = "analytics-test-preview-secret-32-bytes!!";
const PURGE_TOKEN = "analytics-test-purge-token";
// The analytics tag and vitals script; the reader search modal also loads from /_cloudhal/.
const ANALYTICS_ASSET = /\/_cloudhal\/[pv]\.[0-9a-f]{8}\.js/;
const human = { kind: "human" as const, id: "user_cfanalytic1", name: "Halil" };
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Stands in for the Analytics Engine dataset: keeps every point; GET lists them, DELETE clears. */
const FAKE_WAE = `import { WorkerEntrypoint } from "cloudflare:workers";
const points = [];
export class Dataset extends WorkerEntrypoint {
  writeDataPoint(point) { points.push(point); }
}
export default {
  fetch(request) {
    if (request.method === "DELETE") points.length = 0;
    return Response.json(points);
  },
};
`;

/**
 * Stands in for the Workers Rate Limiting binding (`ANALYTICS_RL`, RFC-0006 §5.5): records the keys
 * it is asked about; `POST /deny` refuses every key, `POST /throw` makes `limit` fail, `POST /allow`
 * resets; GET lists the keys, DELETE clears them.
 */
const FAKE_RL = `import { WorkerEntrypoint } from "cloudflare:workers";
const keys = [];
let mode = "allow";
export class Limiter extends WorkerEntrypoint {
  limit(options) {
    keys.push(options.key);
    if (mode === "throw") throw new Error("rate limiter unavailable");
    return { success: mode === "allow" };
  }
}
export default {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST") mode = url.pathname.slice(1);
    if (request.method === "DELETE") keys.length = 0;
    return Response.json(keys);
  },
};
`;

describe("Site Worker analytics on workerd (RFC-0006)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  let remote: SiteGraphStore;
  let sql: D1Driver;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-cf-analytics-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Counted Site" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "local v1", publish: true });
    const base = siteWorkerConfig({
      name: "analytics-test",
      siteId,
      databaseId: "00000000-0000-0000-0000-0000000a11c5",
    });
    // What `cloudhal deploy` will generate (rollout step 9): the dataset binding and the vars.
    // Here the binding is a service binding to the fake dataset below.
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      {
        ...base,
        vars: {
          ...base.vars,
          CLOUDHAL_ANALYTICS: "on",
          CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({ enabled: true, vitalsOneIn: 5 }),
          CLOUDHAL_SITE_HOSTS: "edge.example",
        },
        services: [
          { binding: "ANALYTICS", service: "fake-wae", entrypoint: "Dataset" },
          // `analytics.rateLimit` (§5.5): Miniflare's own limiter cannot be told to refuse, so the
          // binding is a fake with the same `limit({ key })` shape.
          { binding: "ANALYTICS_RL", service: "fake-rl", entrypoint: "Limiter" },
        ],
      },
      "test",
    );
    const config = await buildSiteWorker(projectDir);
    const fake = path.join(tmp, "fake-wae.mjs");
    await writeFile(fake, FAKE_WAE);
    const fakeRl = path.join(tmp, "fake-rl.mjs");
    await writeFile(fakeRl, FAKE_RL);

    harness = createTestHarness({
      root: projectDir,
      workers: [
        {
          configPath: config,
          secrets: { CLOUDHAL_PREVIEW_SECRET: PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN: PURGE_TOKEN },
        },
        { config: { name: "fake-wae", main: fake, compatibility_date: COMPATIBILITY_DATE } },
        { config: { name: "fake-rl", main: fakeRl, compatibility_date: COMPATIBILITY_DATE } },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    sql = new D1Driver(env.DB);
    const target = { sql, blobs: new R2BlobStore(env.BLOBS) };
    await migrate(sql, migrations);
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await copySite(local, target, siteId);
    await local.close();
    remote = new SiteGraphStore(target);
  });

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const get = (p: string, init?: Parameters<typeof harness.fetch>[1]) =>
    harness.getWorker().fetch(`https://edge.example${p}`, init) as unknown as Promise<Response>;
  const fakeWae = () => harness.getWorker("fake-wae");
  /** The events written so far (waits briefly: writes are fire-and-forget). */
  const events = async (count?: number): Promise<AnalyticsEvent[]> => {
    let points: unknown[] = [];
    for (let i = 0; i < 50; i++) {
      points = (await (await fakeWae().fetch("http://fake/")).json()) as unknown[];
      if (count === undefined || points.length >= count) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    return points.map((p) => fromDataPoint(p as never, new Date().toISOString()) as AnalyticsEvent);
  };
  const clear = async () => {
    // let earlier fire-and-forget writes land before clearing
    await new Promise((r) => setTimeout(r, 50));
    await fakeWae().fetch("http://fake/", { method: "DELETE" });
  };
  const purge = () =>
    get("/__cloudhal/purge", {
      method: "POST",
      headers: { authorization: `Bearer ${PURGE_TOKEN}` },
    });
  const beacon = (body: unknown, headers: Record<string, string> = {}) =>
    get("/__cloudhal/e", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "sec-fetch-site": "same-origin",
        "user-agent": CHROME,
        "cf-connecting-ip": "198.51.100.23",
        ...headers,
      },
    });
  const view = (p: string, extra: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    kind: "pageview",
    path: p,
    referrer: "news.ycombinator.com",
    navType: "navigate",
    ...extra,
  });
  const scriptTag = (html: string) =>
    html.match(
      /<script type="module" src="(\/_cloudhal\/p\.[0-9a-f]{8}\.js)" data-v="(\d+)"><\/script>/,
    );

  it("adds the tag to published pages and serves the hashed script as a ≤ 1 KB static asset", async () => {
    const res = await get("/about");
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(200);
    const tag = scriptTag(html);
    expect(tag?.[2]).toBe("5");
    // in <head>, once; the CSP is unchanged ('self' only)
    expect(html.indexOf(tag?.[0] as string)).toBeLessThan(html.indexOf("</head>"));
    expect(html.split("/_cloudhal/p.").length).toBe(2);
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'self'");

    // static assets answer before the Worker runs (through the server, not the Worker handle)
    const asset = (p: string) =>
      harness.fetch(`https://edge.example${p}`) as unknown as Promise<Response>;
    const script = await asset(tag?.[1] as string);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    const code = await script.text();
    expect(gzipSync(code).byteLength).toBeLessThanOrEqual(1024);
    expect(code).toContain("/__cloudhal/e");
    const vitals = code.match(/\/_cloudhal\/v\.[0-9a-f]{8}\.js/)?.[0];
    expect((await asset(vitals as string)).status).toBe(200);
  });

  it("serves the starter's favicon as a static asset: no render, no analytics event", async () => {
    const html = await (await get("/about")).text();
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32">');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    await clear();
    const server = (p: string) =>
      harness.fetch(`https://edge.example${p}`, {
        headers: { "user-agent": CHROME },
      }) as unknown as Promise<Response>;
    const ico = await server("/favicon.ico");
    expect(ico.status).toBe(200);
    expect(ico.headers.get("content-type")).toMatch(/icon/);
    expect(new Uint8Array(await ico.arrayBuffer()).subarray(0, 4)).toEqual(
      new Uint8Array([0, 0, 1, 0]),
    );
    const svg = await server("/favicon.svg");
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
    // A missing file does reach the Worker: its 404 is the only render event.
    expect((await server("/favicon.png")).status).toBe(404);
    const recorded = await events(1);
    expect(recorded.map((e) => [e.kind, e.path])).toEqual([["render", "/favicon.png"]]);
  });

  it("never tags previews or error pages", async () => {
    const token = await mintPreviewToken(PREVIEW_SECRET, { site: siteId, target: "live" });
    const preview = await get(`/about?cloudhal-preview=${token}`);
    expect(preview.headers.get("x-cloudhal-mode")).toBe("preview");
    expect(await preview.text()).not.toMatch(ANALYTICS_ASSET);
    const missing = await get("/does-not-exist");
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toMatch(ANALYTICS_ASSET);
  });

  it("writes a beacon for a cached page view: the Worker never rendered the page", async () => {
    await clear();
    const hello = (await remote.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    const res = await beacon(view("/posts/hello-world"));
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [event] = await events(1);
    expect(event).toMatchObject({
      kind: "pageview",
      siteId,
      path: "/posts/hello-world",
      nodeId: hello?.id,
      nodeKind: "entry",
      refHost: "news.ycombinator.com",
      channel: "social",
      entrance: true,
      device: "desktop",
      browser: "chrome",
      os: "windows",
    });
    expect(event).not.toHaveProperty("visitor");
  });

  it("stores nothing for forged beacons (another origin, a draft path, a client node id)", async () => {
    const draft = await remote.createContentEntry({
      siteId,
      collection: "posts",
      slug: "unpublished-scoop",
      locale: "en",
      status: "draft",
      title: "Scoop",
      summary: "Not yet.",
      body: { format: "markdown", value: "Draft." },
      fields: {},
      tags: [],
      author: human,
    } as never);
    await clear();
    const answers = await Promise.all([
      beacon(view("/about"), { "sec-fetch-site": "cross-site" }),
      beacon(view("/posts/unpublished-scoop")),
      beacon(view("/about", { nodeId: draft.id })),
      get("/__cloudhal/e", {
        method: "POST",
        body: JSON.stringify(view("/about")),
        headers: { "user-agent": CHROME, origin: "https://attacker.example" },
      }),
    ]);
    for (const a of answers) expect(a.status).toBe(204);
    expect((await get("/__cloudhal/e")).status).toBe(405);
    expect(await events()).toEqual([]);
  });

  it("records render events for errors and redirects, not for previews", async () => {
    await clear();
    await get("/wp-login.php", {
      headers: { "user-agent": CHROME, referer: "https://edge.example/about" },
    });
    const token = await mintPreviewToken(PREVIEW_SECRET, { site: siteId, target: "live" });
    await get(`/nothing-here?cloudhal-preview=${token}`);
    const [event, ...rest] = await events(1);
    expect(event).toMatchObject({
      kind: "render",
      path: "/wp-login.php",
      status: 404,
      refPath: "/about",
    });
    expect(rest).toEqual([]);
  });

  it("hashes visitors in unique-visitors mode, but never with GPC", async () => {
    await putAnalyticsSettings(sql, {
      siteId,
      rev: 0,
      patch: { enabled: true, uniqueVisitors: true },
      actorId: human.id,
      now: new Date(),
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
    });
    expect((await purge()).status).toBe(200); // a settings change purges (RFC-0006 §9.2)
    await clear();
    await beacon(view("/about"));
    const [hashed] = await events(1);
    expect(hashed?.kind === "pageview" && hashed.visitor).toMatch(/^[0-9a-f]{16}$/);
    await clear();
    await beacon(view("/about"), { "sec-gpc": "1" });
    const [withGpc] = await events(1);
    // counted, flagged (WAE double10), never hashed
    expect(withGpc).toMatchObject({ kind: "pageview", path: "/about", privacySignal: true });
    expect(withGpc).not.toHaveProperty("visitor");
    expect(hashed).not.toHaveProperty("privacySignal");
  });

  it("asks the Rate Limiting binding per client by an HMAC (never the IP), and falls back when it fails", async () => {
    const rl = (method = "GET", p = "/") =>
      harness
        .getWorker("fake-rl")
        .fetch(`http://fake${p}`, { method }) as unknown as Promise<Response>;
    const keys = async () => (await (await rl()).json()) as string[];
    await rl("DELETE");
    await clear();
    const ip = (n: number) => ({ "cf-connecting-ip": `203.0.113.${n}` });
    await beacon(view("/about"), ip(41));
    await beacon(view("/about"), ip(41));
    await beacon(view("/about"), ip(42));
    expect(await events(3)).toHaveLength(3);
    const [k1, k2, k3] = await keys();
    expect(k1).toMatch(/^[0-9a-f]{32}$/);
    expect(k2).toBe(k1); // the same client, the same key
    expect(k3).not.toBe(k1);
    expect((await keys()).join()).not.toContain("203.0.113");

    // over the shared limit: dropped, still 204
    await rl("POST", "/deny");
    await clear();
    expect((await beacon(view("/about"), ip(43))).status).toBe(204);
    // a binding that fails: the per-isolate limit alone decides, the view is counted
    await rl("POST", "/throw");
    await beacon(view("/about"), ip(44));
    const after = await events(1);
    await rl("POST", "/allow");
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: "pageview", path: "/about" });
  });

  it("with analytics off for the site: no tag and no writes", async () => {
    await putAnalyticsSettings(sql, {
      siteId,
      rev: 1,
      patch: { enabled: false },
      actorId: human.id,
      now: new Date(),
    });
    await purge();
    await clear();
    const html = await (await get("/about")).text();
    expect(html).toContain("<title>");
    expect(html).not.toMatch(ANALYTICS_ASSET);
    expect((await beacon(view("/about"))).status).toBe(204);
    await get("/does-not-exist");
    await new Promise((r) => setTimeout(r, 100));
    expect(await events()).toEqual([]);
  });
});

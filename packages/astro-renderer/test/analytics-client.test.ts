/**
 * The analytics scripts (RFC-0006 §5.1): built and hashed by the integration, within the 1 KB
 * gzipped budget, first-party, storage-free, and sending beacons the contract accepts. The built
 * page-view script runs here against a stubbed browser (`globalThis.location`, `document`, …).
 */
import { gzipSync } from "node:zlib";
import { BEACON_PATH, CLIENT_DIR, PAGEVIEW_GZIP_BUDGET } from "@cloudhal/analytics/client";
import { isValid } from "@cloudhal/core-contracts";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ANALYTICS_BEACON_PATH, ANALYTICS_SCRIPT_DIR } from "../src/analytics.ts";
import { type AnalyticsClient, buildAnalyticsClient } from "../src/analytics-client.ts";

let client: AnalyticsClient;
beforeAll(async () => {
  client = await buildAnalyticsClient();
});

interface Browser {
  url: string;
  referrer?: string;
  visibility?: "visible" | "hidden";
  prerendering?: boolean;
  webdriver?: boolean;
  navType?: string;
  dataV?: string;
  random?: number;
}

const GLOBALS = [
  "location",
  "navigator",
  "document",
  "performance",
  "addEventListener",
  "removeEventListener",
  "fetch",
] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let run = 0;

/** Runs the built page-view script once in a stubbed browser; returns what it sent and its listeners. */
async function runScript(b: Browser) {
  const sent: { url: string; body: unknown }[] = [];
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const docListeners = new Map<string, ((e: unknown) => void)[]>();
  const on =
    (map: Map<string, ((e: unknown) => void)[]>) => (type: string, fn: (e: unknown) => void) =>
      map.set(type, [...(map.get(type) ?? []), fn]);
  const off = (type: string, fn: (e: unknown) => void) =>
    listeners.set(
      type,
      (listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  const url = new URL(b.url);
  const document = {
    referrer: b.referrer ?? "",
    visibilityState: b.visibility ?? "visible",
    prerendering: b.prerendering ?? false,
    querySelector: (sel: string) =>
      sel.startsWith('script[src="') ? { getAttribute: () => b.dataV ?? "0" } : null,
    addEventListener: on(docListeners),
  };
  const stubs: Record<(typeof GLOBALS)[number], unknown> = {
    location: url,
    navigator: {
      webdriver: b.webdriver ?? false,
      sendBeacon: (to: string, data: string) => {
        sent.push({ url: to, body: JSON.parse(data) });
        return true;
      },
    },
    document,
    performance: {
      getEntriesByType: () => [{ type: b.navType ?? "navigate", activationStart: 0 }],
    },
    addEventListener: on(listeners),
    removeEventListener: off,
    fetch: () => Promise.reject(new Error("no fetch in this test")),
  };
  for (const name of GLOBALS) {
    if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value: stubs[name],
      configurable: true,
      writable: true,
    });
  }
  const random = Math.random;
  if (b.random !== undefined) Math.random = () => b.random as number;
  try {
    // a fresh module per run (the comment changes the URL)
    const code = `${client.script.code}\n//${run++}`;
    await import(`data:text/javascript,${encodeURIComponent(code)}`);
  } finally {
    Math.random = random;
  }
  const fire = (type: string, event: unknown = {}) => {
    for (const fn of listeners.get(type) ?? []) fn(event);
  };
  const fireDoc = (type: string, event: unknown = {}) => {
    for (const fn of docListeners.get(type) ?? []) fn(event);
  };
  return { sent, document, fire, fireDoc, url };
}

afterEach(() => {
  for (const [name, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  saved.clear();
});

describe("analytics client build", () => {
  it("emits hashed first-party file names under /_cloudhal/ and keeps the endpoint in sync", () => {
    expect(ANALYTICS_SCRIPT_DIR).toBe(CLIENT_DIR);
    expect(ANALYTICS_BEACON_PATH).toBe(BEACON_PATH);
    expect(client.script.path).toMatch(/^\/_cloudhal\/p\.[0-9a-f]{8}\.js$/);
    expect(client.vitals.path).toMatch(/^\/_cloudhal\/v\.[0-9a-f]{8}\.js$/);
    // the page-view script loads the vitals module by its hashed URL, and nothing else
    expect(client.script.code).toContain(`import(\`${client.vitals.path}\`)`);
    expect(client.vitals.code).toMatch(/export\s*\{/);
  });

  it("keeps the page-view script within its 1 KB gzipped budget", () => {
    const size = gzipSync(client.script.code).byteLength;
    expect(size).toBeLessThanOrEqual(PAGEVIEW_GZIP_BUDGET);
  });

  it("uses no device storage, no cookies and no third-party URL", () => {
    for (const { code } of [client.script, client.vitals]) {
      expect(code).not.toMatch(/cookie|localStorage|sessionStorage|indexedDB/i);
      expect(code).not.toMatch(/https?:\/\//);
    }
  });

  it("sends one page view the beacon contract accepts: path, referrer host, UTM, navigation type", async () => {
    const { sent } = await runScript({
      url: `https://news.example/posts/hello?utm_source=Newsletter&utm_medium=email&utm_campaign=${"x".repeat(200)}&ref=secret`,
      referrer: "https://www.google.com/search?q=private",
      navType: "navigate",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/__cloudhal/e");
    const body = sent[0]?.body as Record<string, unknown>;
    expect(body).toEqual({
      schemaVersion: 1,
      kind: "pageview",
      path: "/posts/hello",
      referrer: "www.google.com",
      utmSource: "Newsletter",
      utmMedium: "email",
      utmCampaign: "x".repeat(128),
      navType: "navigate",
    });
    expect(isValid("analytics-beacon", body)).toBe(true);
  });

  it("waits until a background tab is shown, and skips automated browsers", async () => {
    const hidden = await runScript({ url: "https://news.example/", visibility: "hidden" });
    expect(hidden.sent).toHaveLength(0);
    hidden.document.visibilityState = "visible";
    hidden.fire("visibilitychange");
    hidden.fire("visibilitychange");
    expect(hidden.sent).toHaveLength(1);

    expect((await runScript({ url: "https://news.example/", webdriver: true })).sent).toEqual([]);
    expect((await runScript({ url: "file:///tmp/index.html" })).sent).toEqual([]);
  });

  it("counts a prerendered page on activation and a back/forward restore again", async () => {
    const pre = await runScript({ url: "https://news.example/a", prerendering: true });
    expect(pre.sent).toHaveLength(0);
    pre.fireDoc("prerenderingchange");
    expect(pre.sent.map((s) => (s.body as { navType: string }).navType)).toEqual(["prerender"]);
    pre.fire("pageshow", { persisted: false });
    pre.fire("pageshow", { persisted: true });
    expect(pre.sent.map((s) => (s.body as { navType: string }).navType)).toEqual([
      "prerender",
      "restore",
    ]);
  });

  it("counts Astro view-transition navigations to another path as internal", async () => {
    const r = await runScript({ url: "https://news.example/a", referrer: "" });
    r.fireDoc("astro:page-load"); // the initial load: same path, not counted again
    expect(r.sent).toHaveLength(1);
    (r.url as URL).pathname = "/b";
    r.fireDoc("astro:page-load");
    expect(r.sent[1]?.body).toMatchObject({
      path: "/b",
      referrer: "news.example",
      navType: "navigate",
    });
  });

  it("loads the vitals module only for sampled page views", async () => {
    // data-v="0": never; data-v="5" with Math.random() ≥ 1/5: not this view
    const off = await runScript({ url: "https://news.example/", dataV: "0", random: 0 });
    const notThis = await runScript({ url: "https://news.example/", dataV: "5", random: 0.5 });
    expect(off.sent).toHaveLength(1);
    expect(notThis.sent).toHaveLength(1);
  });
});

describe("_headers for the hashed /_cloudhal/ scripts", () => {
  it("adds one immutable rule next to the adapter's, idempotently", async () => {
    const { mkdtemp, readFile, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeCloudhalAssetHeaders } = await import("../src/static-headers.ts");
    const dir = await mkdtemp(join(tmpdir(), "cloudhal-headers-"));
    await writeFile(
      join(dir, "_headers"),
      "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
    await writeCloudhalAssetHeaders(dir);
    await writeCloudhalAssetHeaders(dir);
    const text = await readFile(join(dir, "_headers"), "utf8");
    expect(text).toBe(
      "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/_cloudhal/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
    const fresh = await mkdtemp(join(tmpdir(), "cloudhal-headers-"));
    await writeCloudhalAssetHeaders(fresh);
    expect(await readFile(join(fresh, "_headers"), "utf8")).toBe(
      "/_cloudhal/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });
});

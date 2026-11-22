/**
 * RFC-0047: the workerd self-host image's settings, config, bundle check, volume guard, first
 * site and generated secrets. The image itself (workerd on SeaweedFS) is covered by
 * scripts/docker-smoke.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBundle, fetchBundle, readBundleManifest } from "../src/selfhost/bundle.ts";
import { secretsEnv } from "../src/selfhost/secrets.ts";
import { readSettings, resolveSecretFiles } from "../src/selfhost/settings.ts";
import { claimDataDir, ensureFirstSite, NODE_VOLUME } from "../src/selfhost/start.ts";
import { durableObjectKey, workerdConfig } from "../src/selfhost/workerd-config.ts";
import {
  bundle,
  cleanup,
  offlineDir,
  tmp,
  trustWorld,
  VERSION,
} from "./fixtures/release-deploy.ts";

afterAll(cleanup);

const parseEnv = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );

const ENV: Record<string, string> = {
  ...parseEnv(secretsEnv()),
  CLOUDHAL_S3_ENDPOINT: "http://seaweedfs:8333",
  CLOUDHAL_S3_BUCKET: "cloudhal",
  CLOUDHAL_CLUSTER_ADVERTISE: "cloudhal-0:7000",
};

describe("selfhost settings", () => {
  it("reads a generated .env with the store, and lists every missing value at once", () => {
    const s = readSettings(ENV);
    expect(s.siteId).toMatch(/^site_[0-9A-Z]{20}$/);
    expect(s.cluster).toEqual({
      key: ENV.CLOUDHAL_CLUSTER_KEY,
      address: "0.0.0.0:7000",
      advertise: "cloudhal-0:7000",
    });
    expect(s.s3).toEqual({
      endpoint: "http://seaweedfs:8333",
      bucket: "cloudhal",
      prefix: "",
      region: "us-east-1",
    });
    expect(s.ports).toEqual({ studio: 8787, site: 8788 });
    expect(readSettings({ ...ENV, CLOUDHAL_S3_PREFIX: "/a/b" }).s3.prefix).toBe("a/b/");

    let message = "";
    try {
      readSettings({ CLOUDHAL_BEHIND_PROXY: "1", CLOUDHAL_SITE_ID: "nope" });
    } catch (e) {
      message = (e as Error).message;
    }
    for (const want of [
      "BETTER_AUTH_SECRET (or BETTER_AUTH_SECRET_FILE) is not set",
      "CLOUDHAL_SETUP_TOKEN",
      "CLOUDHAL_CLUSTER_KEY: at least 32",
      "CLOUDHAL_S3_ENDPOINT is not set",
      "CLOUDHAL_S3_BUCKET is not set",
      "CLOUDHAL_SITE_ID: site_",
      "CLOUDHAL_BEHIND_PROXY=1 needs CLOUDHAL_BASE_URL",
    ])
      expect(message).toContain(want);
    expect(() => readSettings({ ...ENV, CLOUDHAL_PORT: "99999" })).toThrow(/CLOUDHAL_PORT/);
  });

  it("resolves secrets from _FILE, trims one final newline, and refuses a value set both ways", () => {
    const files: Record<string, string> = { "/run/secrets/auth": "from-a-file\n" };
    const read = (f: string) => {
      const v = files[f];
      if (v === undefined) throw new Error("ENOENT");
      return v;
    };
    const env = resolveSecretFiles(
      { BETTER_AUTH_SECRET_FILE: "/run/secrets/auth", OTHER: "x" },
      read,
    );
    expect(env.BETTER_AUTH_SECRET).toBe("from-a-file");
    expect(env.BETTER_AUTH_SECRET_FILE).toBeUndefined();
    expect(env.OTHER).toBe("x");
    expect(() =>
      resolveSecretFiles(
        { BETTER_AUTH_SECRET: "a", BETTER_AUTH_SECRET_FILE: "/run/secrets/auth" },
        read,
      ),
    ).toThrow(/both set/);
    expect(() => resolveSecretFiles({ AWS_SECRET_ACCESS_KEY_FILE: "/missing" }, read)).toThrow(
      /AWS_SECRET_ACCESS_KEY_FILE: cannot read/,
    );
  });
});

async function extracted() {
  const t = await trustWorld();
  const b = await bundle();
  const out = path.join(tmp("selfhost-bundle-"), "bundle");
  const lines: string[] = [];
  const manifest = await fetchBundle({
    version: VERSION,
    out,
    from: offlineDir(b, t),
    pinnedKeys: b.keys,
    trustRoots: t.roots,
    log: (l) => lines.push(l),
  });
  return { out, manifest, lines };
}

describe("selfhost bundle", () => {
  it("fetches, verifies and extracts a release, and checks its files at start", async () => {
    const { out, manifest, lines } = await extracted();
    expect(manifest.version).toBe(VERSION);
    expect(lines.join("\n")).toMatch(/verified v0\.9\.0/);
    expect(existsSync(path.join(out, "site/modules/entry.mjs"))).toBe(true);
    expect(existsSync(`${out}.download`)).toBe(false);
    expect((await checkBundle(out)).version).toBe(VERSION);
    await expect(fetchBundle({ version: VERSION, out })).rejects.toThrow(/exists/);

    writeFileSync(path.join(out, "admin/modules/worker.js"), "export default {};\n");
    writeFileSync(path.join(out, "site/assets/extra.js"), "alert(1)\n");
    await expect(checkBundle(out)).rejects.toThrow(
      /admin\/modules\/worker\.js changed[\s\S]*site\/assets\/extra\.js is not in the release/,
    );
  });
});

describe("selfhost workerd config", () => {
  it("serves both Workers as a cluster instance on the S3 store, with no local bucket store", async () => {
    const { out } = await extracted();
    const manifest = await readBundleManifest(out);
    const configDir = tmp("selfhost-run-");
    const settings = readSettings(ENV);
    const c = workerdConfig({ manifest, bundleDir: out, configDir, settings });
    expect(c).toContain('bucket = "s3://cloudhal/cluster"');
    expect(c).toContain('"aws_endpoint=http://seaweedfs:8333"');
    expect(c).toContain(`key = "${ENV.CLOUDHAL_CLUSTER_KEY}"`);
    expect(c).toContain('advertise = "cloudhal-0:7000"');
    expect(c).toContain('(name = "blobs", bucket = (path = "blobs"))');
    expect(c).not.toMatch(/bucket = \([^)]*localDisk/);
    expect(c).toContain('bundled = "/workerd/d1.js"');
    expect(c).toContain('moduleName = "cloudflare-internal:d1-api"');
    expect(c).toContain('props = (json = "{\\"bucket\\":\\"media\\"}")');
    expect(c).toContain('(name = "CRONS", json = "{\\"admin\\":[\\"* * * * *\\"]}")');
    expect(c).toContain('(name = "CLOUDHAL_SCHEDULER", text = "cron")');
    expect(c).toContain(`(name = "CLOUDHAL_SITE_ID", text = "${settings.siteId}")`);
    expect(c).toContain('(name = "BETTER_AUTH_SECRET", fromEnvironment = "BETTER_AUTH_SECRET")');
    expect(c).not.toContain(ENV.BETTER_AUTH_SECRET as string);
    // embed paths are relative to the config; the main module comes first
    const rel = path.relative(configDir, path.join(out, "site/modules/entry.mjs"));
    expect(c).toContain(`(name = "entry.mjs", esModule = embed ${JSON.stringify(rel)})`);
    // no proxy: an incoming CF-Connecting-IP is removed
    expect(c).toContain('injectRequestHeaders = [(name = "CF-Connecting-IP")]');
    expect(c).not.toContain("tracing");

    const proxied = workerdConfig({
      manifest,
      bundleDir: out,
      configDir,
      settings: readSettings({
        ...ENV,
        CLOUDHAL_BEHIND_PROXY: "1",
        CLOUDHAL_BASE_URL: "https://studio.example.com",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel:4318/v1/traces",
        CLOUDHAL_AUTOMATIONS: "off",
      }),
    });
    expect(proxied).toContain('forwardedProtoHeader = "X-Forwarded-Proto"');
    expect(proxied).not.toContain("injectRequestHeaders");
    expect(proxied).toContain('tracing = (otlp = "otlp")');
    expect(proxied).toContain('external = (address = "otel:4318"');
    expect(proxied).toContain('(name = "CLOUDHAL_AUTOMATIONS", text = "off")');
  });

  it("derives one Durable Object key per class, never from anything that changes", () => {
    expect(durableObjectKey("SchedulerClock")).toBe("cloudhal-scheduler-clock");
    expect(durableObjectKey("BuildRoom")).toBe("cloudhal-build-room");
    expect(() => durableObjectKey("not-a-class")).toThrow();
  });
});

describe("selfhost start", () => {
  it("refuses a Node image volume and marks a new one as v2", async () => {
    const node = tmp("selfhost-node-");
    writeFileSync(path.join(node, "cloudhal.json"), "{}");
    await expect(claimDataDir(node, "0.11.0")).rejects.toThrow(NODE_VOLUME);

    const fresh = tmp("selfhost-data-");
    await claimDataDir(fresh, "0.11.0");
    expect(readFileSync(path.join(fresh, ".selfhost/first-version"), "utf8")).toBe("0.11.0\n");
    expect(existsSync(path.join(fresh, "do"))).toBe(true);
    // marked: a later cloudhal.json (a restored archive, say) no longer reads as a Node volume
    writeFileSync(path.join(fresh, "cloudhal.json"), "{}");
    await expect(claimDataDir(fresh, "0.11.1")).resolves.toBeUndefined();
    mkdirSync(path.join(fresh, "x"), { recursive: true });
  });

  it("creates the site under its id once Studio answers, and leaves an existing one alone", async () => {
    const settings = readSettings({ ...ENV, CLOUDHAL_SITE_NAME: "Ünlü Blog" });
    const calls: { url: string; method: string; body?: unknown }[] = [];
    let sites: { id: string }[] = [];
    let healthy = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, ...(init?.body ? { body: JSON.parse(init.body as string) } : {}) });
      if (url.endsWith("/api/health"))
        return new Response("", { status: healthy++ < 2 ? 503 : 200 });
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${ENV.CLOUDHAL_DEPLOY_TOKEN}`,
      );
      if (method === "GET") return Response.json({ sites });
      sites = [{ id: settings.siteId }];
      return Response.json({ site: { id: settings.siteId } }, { status: 201 });
    }) as typeof fetch;
    const log: string[] = [];
    const input = {
      settings,
      deployToken: ENV.CLOUDHAL_DEPLOY_TOKEN as string,
      fetch: fake,
      log: (l: string) => log.push(l),
      sleep: async () => {},
    };
    expect(await ensureFirstSite(input)).toBe(true);
    expect(calls.filter((c) => c.method === "POST")[0]?.body).toEqual({
      id: settings.siteId,
      name: "Ünlü Blog",
      slug: "unlu-blog",
      locale: "en",
    });
    expect(log.join("\n")).toContain("/login#setup=<CLOUDHAL_SETUP_TOKEN>");
    expect(log.join("\n")).not.toContain(ENV.CLOUDHAL_SETUP_TOKEN as string);
    expect(await ensureFirstSite(input)).toBe(false);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

/**
 * RFC-0004 end to end on a local project: an agent uploads an image over `cloudhal mcp` and makes
 * it an article's cover by `assetId`; `cloudhal dev` serves the media route and renders the cover;
 * `cloudhal build` copies published media with checksums; `cloudhal media verify` recomputes them;
 * `cloudhal media import-urls` copies a linked image into the library and reverts.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Asset, ContentEntry } from "@cloudhal/core-contracts";
import { mediaBlobKey } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { makePng, PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaImportUrls, mediaVerify } from "../src/commands/media.ts";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");

function childEnv(): Record<string, string> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env as Record<string, string>;
  return env;
}

async function spawnDev(
  projectDir: string,
  port: number,
): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn(process.execPath, [BIN, "dev", "--port", String(port)], {
    cwd: projectDir,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`cloudhal dev did not start:\n${output}`)),
      60_000,
    );
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const m = output.match(/cloudhal dev → (http:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1] as string);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudhal dev exited with ${code}:\n${output}`));
    });
  });
  return { child, url };
}

async function run(
  projectDir: string,
  args: string[],
): Promise<{ code: number | null; output: string }> {
  const child = spawn(process.execPath, [BIN, ...args], {
    cwd: projectDir,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (c: Buffer) => (output += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (output += c.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { code, output };
}

describe("media in a local project (RFC-0004)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let asset: Asset;
  let entry: ContentEntry;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-media-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Media Site" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("an agent uploads an image and uses it as an article's cover over cloudhal mcp", async () => {
    const client = new Client({ name: "media-e2e", version: "1.0.0" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "mcp", "--mode", "bypass"],
      cwd: projectDir,
      env: childEnv(),
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const uploaded = await client.callTool({
        name: "upload_asset",
        arguments: {
          siteId,
          filename: "harbour.png",
          data: Buffer.from(PNG_1X1).toString("base64"),
          alt: "The harbour at night",
        },
      });
      expect(uploaded.isError, JSON.stringify(uploaded.content)).toBeFalsy();
      asset = (uploaded.structuredContent as { asset: Asset }).asset;
      expect(asset).toMatchObject({
        mediaType: "image/png",
        slug: "harbour",
        image: { width: 1, height: 1 },
      });
      const created = await client.callTool({
        name: "create_entry",
        arguments: {
          siteId,
          slug: "harbour",
          title: "The harbour",
          body: `Lights on the water.\n\n![](asset:${asset.id})`,
          coverImage: { assetId: asset.id },
        },
      });
      expect(created.isError, JSON.stringify(created.content)).toBeFalsy();
      entry = (created.structuredContent as { entry: ContentEntry }).entry;
      expect(entry.coverImage?.src).toBe(`/media/${asset.sha256.slice(0, 16)}/harbour.png`);
    } finally {
      await client.close();
    }
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const [news] = await local.store.listTerms(siteId, { taxonomy: "category" });
    await local.store.updateContentEntry({
      ...((await local.store.getContentEntry(entry.id)) as ContentEntry),
      status: "published",
      terms: { category: { ids: [news?.id as string], primary: news?.id as string } },
    });
    await local.close();
    await snapshot({ projectDir, label: "with media", publish: true });
  });

  it("dev serves the media route (no-store, drafts included) and renders the cover", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    try {
      const mediaUrl = new URL(`/media/${asset.sha256.slice(0, 16)}/harbour.png`, server.url);
      let res = await fetch(mediaUrl);
      for (let i = 0; i < 40 && res.status !== 200; i++) {
        await new Promise((r) => setTimeout(r, 250));
        res = await fetch(mediaUrl);
      }
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("etag")).toBe(`"${asset.sha256}"`);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_1X1);
      const sum = await fetch(`${mediaUrl}.sha256`);
      expect(await sum.text()).toBe(`${asset.sha256}  harbour.png\n`);
      const old = await fetch(
        new URL(`/media/${asset.sha256.slice(0, 16)}/old-name.png`, server.url),
        {
          redirect: "manual",
        },
      );
      expect(old.status).toBe(301);
      const html = await (await fetch(new URL("/posts/harbour", server.url))).text();
      expect(html).toContain(
        `<figure class="ch-cover"><img src="/media/${asset.sha256.slice(0, 16)}/harbour.png" alt="The harbour at night" width="1" height="1" loading="eager" decoding="async" fetchpriority="high"></figure>`,
      );
      expect(html).toContain('<meta property="og:image:type" content="image/png">');
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((r) => server.child.once("exit", r));
    }
  });

  it("build copies published media with checksum sidecars and cache headers", async () => {
    const r = await run(projectDir, ["build"]);
    expect(r.code, r.output.slice(-2000)).toBe(0);
    const dist = path.join(projectDir, "dist");
    const file = path.join(dist, "media", asset.sha256.slice(0, 16), "harbour.png");
    const bytes = new Uint8Array(await readFile(file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    expect(await readFile(`${file}.sha256`, "utf8")).toBe(`${asset.sha256}  harbour.png\n`);
    const headers = await readFile(path.join(dist, "_headers"), "utf8");
    expect(headers).toContain("/media/*\n  Cache-Control: public, max-age=31536000, immutable");
    const post = await readFile(path.join(dist, "posts", "harbour", "index.html"), "utf8");
    expect(post).toContain(`src="/media/${asset.sha256.slice(0, 16)}/harbour.png"`);
    expect(post).toContain('"@type":"ImageObject"');
  });

  it("media verify recomputes checksums and finds damage", async () => {
    expect(await mediaVerify({ projectDir })).toMatchObject({ checked: 1, problems: [] });
    const cfg = await readProjectConfig(projectDir);
    const blobFile = path.join(
      projectDir,
      cfg.dataDir,
      "blobs",
      ...mediaBlobKey(siteId, asset.sha256).split("/"),
    );
    const original = await readFile(blobFile);
    await writeFile(blobFile, Buffer.from("tampered"));
    const bad = await run(projectDir, ["media", "verify"]);
    expect(bad.code).toBe(1);
    expect(bad.output).toContain(`${asset.id}: SHA-256 mismatch`);
    await writeFile(blobFile, original);
  });

  it("media import-urls copies a linked image from public/, refuses unsafe URLs, and reverts", async () => {
    await mkdir(path.join(projectDir, "public", "images"), { recursive: true });
    await writeFile(
      path.join(projectDir, "public", "images", "old-cover.png"),
      makePng({ width: 20, height: 10 }),
    );
    const cfg = await readProjectConfig(projectDir);
    let local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const about = (await local.store.listPages(siteId)).find((p) => p.path === "/about");
    if (!about) throw new Error("no about page");
    await local.store.updatePage({
      ...about,
      seo: { ogImage: { src: "/images/old-cover.png", alt: "Old cover" } },
      sections: [
        ...about.sections,
        {
          id: "sec_about0unsafe",
          kind: "image",
          image: { src: "https://127.0.0.1/x.png", alt: "x" },
        },
        { id: "sec_about00escape", kind: "image", image: { src: "/../../etc/passwd", alt: "y" } },
      ],
    });
    await local.close();

    const dry = await run(projectDir, ["media", "import-urls", "--dry-run"]);
    expect(dry.code, dry.output).toBe(0);
    expect(dry.output).toContain("dry run: 3 source(s) in 1 node(s)");

    const result = await mediaImportUrls({ projectDir });
    if (!("sources" in result)) throw new Error("expected an import result");
    expect(result.assets).toHaveLength(1);
    expect(result.skipped.map((s) => s.from).sort()).toEqual([
      "/../../etc/passwd",
      "https://127.0.0.1/x.png",
    ]);
    expect(result.skipped.find((s) => s.from.startsWith("https"))?.reason).toMatch(/fetch_blocked/);
    local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const imported = await local.store.getAsset(result.assets[0]?.assetId as string);
    expect(imported).toMatchObject({
      source: { kind: "import", from: "/images/old-cover.png", importer: "import-urls" },
      alt: { en: "Old cover" },
      image: { width: 20, height: 10 },
    });
    const page = await local.store.getPage(about.id);
    expect(page?.seo?.ogImage).toMatchObject({ assetId: imported?.id, alt: "Old cover" });
    await local.close();

    const reverted = await run(projectDir, [
      "media",
      "import-urls",
      "--revert",
      result.migrationId,
    ]);
    expect(reverted.code, reverted.output).toBe(0);
    expect(reverted.output).toContain("1 node(s) restored, 1 asset(s) deleted");
    local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    expect((await local.store.getPage(about.id))?.seo?.ogImage).toEqual({
      src: "/images/old-cover.png",
      alt: "Old cover",
    });
    expect(await local.store.getAsset(imported?.id as string)).toBeUndefined();
    await local.close();
  });
});

/**
 * A world for `cloudhal deploy --release` tests (RFC-0046 §11b), with no network: a project from
 * `cloudhal init`, a throwaway root and yank key with signed `keys.json` and `yanked.json`, the
 * synthetic signed bundle of `@cloudhal/release-verify`'s tests, a fetch that serves all of it
 * (and records every URL), and a wrangler stand-in that records its calls.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { releaseAssetUrls, TRUST_BASE_URL } from "@cloudhal/release-verify";
import { rootInit, signKeys, signYanked, yankInit } from "../../../../scripts/release-keys.ts";
import {
  type Synthetic,
  type SyntheticOptions,
  synthetic,
} from "../../../release-verify/test/helpers.ts";
import type { WranglerRunner } from "../../src/cloudflare/wrangler.ts";
import { init } from "../../src/index.ts";

export const VERSION = "0.9.0";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const DAY = 86_400_000;
const quiet = () => {};

const dirs: string[] = [];
export const tmp = (prefix = "release-deploy-") => {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
};
export const cleanup = () => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
};

export interface TrustWorld {
  readonly roots: Readonly<Record<string, { publicKey: string }>>;
  readonly keys: { document: Uint8Array; signature: Uint8Array };
  readonly yanked: { document: Uint8Array; signature: Uint8Array };
  /** Signs another yank list (same keys), e.g. one that yanks or revokes. */
  readonly resign: (o: {
    versions?: { version: string; yankedAt: string; reason: string }[];
    revokedKeys?: { keyId: string; revokedAt: string; reason: string }[];
    published?: { document: Uint8Array; signature: Uint8Array };
  }) => Promise<{ document: Uint8Array; signature: Uint8Array }>;
}

/** A root, a yank key, and both signed lists. */
export async function trustWorld(): Promise<TrustWorld> {
  const keysDir = tmp("release-deploy-keys-");
  const root = rootInit({
    keyId: "cloudhal-root-2026a",
    out: keysDir,
    passphrase: "a long passphrase",
    log: quiet,
  });
  const yank = yankInit({ keyId: "cloudhal-yank-2026a", out: keysDir, log: quiet });
  const keys = await signKeys({
    rootKey: readFileSync(path.join(keysDir, "cloudhal-root-2026a.key.enc"), "utf8"),
    passphrase: "a long passphrase",
    rootPub: root,
    source: {
      keys: [
        {
          keyId: "cloudhal-yank-2026a",
          publicKey: yank.publicKey,
          role: "yank",
          notBefore: iso(NOW - DAY),
          notAfter: iso(NOW + 300 * DAY),
          status: "active",
        },
      ],
    },
    out: tmp(),
    now: NOW,
  });
  const roots = { [root.keyId]: { publicKey: root.publicKey } };
  const resign: TrustWorld["resign"] = (o) =>
    signYanked({
      keyId: "cloudhal-yank-2026a",
      keyPem: readFileSync(path.join(keysDir, "cloudhal-yank-2026a.pem"), "utf8"),
      keyList: keys,
      roots,
      source: { versions: o.versions ?? [], revokedKeys: o.revokedKeys ?? [] },
      published: o.published,
      out: tmp(),
      now: NOW,
    });
  return { roots, keys, yanked: await resign({}), resign };
}

export interface Served {
  readonly fetch: typeof fetch;
  readonly urls: string[];
}

/** What the fake network serves; any other URL answers 404 (and is recorded). */
export interface World {
  trust: { keys: TrustWorld["keys"]; yanked: TrustWorld["yanked"] } | "down";
  release: "published" | "draft" | "missing" | "no-bundle";
  bundle: Synthetic;
}

export function serve(world: World): Served {
  const urls: string[] = [];
  const f = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    if (url.startsWith(TRUST_BASE_URL)) {
      if (world.trust === "down") return new Response("bad gateway", { status: 502 });
      const name = url.slice(TRUST_BASE_URL.length);
      const t = world.trust;
      const body = {
        "keys.json": t.keys.document,
        "keys.json.sig": t.keys.signature,
        "yanked.json": t.yanked.document,
        "yanked.json.sig": t.yanked.signature,
      }[name];
      return body ? new Response(body) : new Response("no", { status: 404 });
    }
    if (url === `https://api.github.com/repos/cloudhal-dev/cloudhal/releases/tags/v${VERSION}`) {
      if (world.release === "missing") return new Response("{}", { status: 404 });
      const names =
        world.release === "no-bundle"
          ? ["cloudhal-cli.tgz"]
          : releaseAssetUrls(VERSION).map((a) => a.name);
      return Response.json({
        draft: world.release === "draft",
        assets: names.map((name) => ({ name })),
      });
    }
    const asset = releaseAssetUrls(VERSION).find((a) => a.url === url);
    if (asset) return new Response(assetBytes(world.bundle, asset.name));
    return new Response("not found", { status: 404 });
  };
  return { fetch: f as typeof fetch, urls };
}

/** The bytes of one release asset of the synthetic bundle. */
export function assetBytes(b: Synthetic, name: string): Uint8Array {
  const i = b.input;
  const map: Record<string, Uint8Array> = {
    [`cloudhal-release-${VERSION}.tar.gz`]: b.tarball,
    "manifest.json": i.manifest,
    "release-statement.json": i.statement,
    "release-statement.sig": i.signature,
    [`cloudhal-release-${VERSION}.sigstore.json`]: new TextEncoder().encode("{}\n"),
  };
  const bytes = map[name];
  if (!bytes) throw new Error(`no asset ${name}`);
  return bytes;
}

/** Every file `--from <dir>` reads, written into a fresh directory. */
export function offlineDir(b: Synthetic, t: Pick<TrustWorld, "keys" | "yanked">): string {
  const dir = tmp("release-deploy-from-");
  for (const a of releaseAssetUrls(VERSION))
    writeFileSync(path.join(dir, a.name), assetBytes(b, a.name));
  writeFileSync(path.join(dir, "keys.json"), t.keys.document);
  writeFileSync(path.join(dir, "keys.json.sig"), t.keys.signature);
  writeFileSync(path.join(dir, "yanked.json"), t.yanked.document);
  writeFileSync(path.join(dir, "yanked.json.sig"), t.yanked.signature);
  return dir;
}

export const bundle = (opts?: SyntheticOptions) => synthetic(opts);

/** A fresh project from `cloudhal init`. */
export async function project(): Promise<string> {
  const dir = path.join(tmp("release-deploy-project-"), "site");
  await init({ dir, name: "Release Me" });
  return dir;
}

/** A wrangler stand-in: D1, R2 and deploys succeed; every call is recorded. */
export function recordingWrangler(): {
  run: WranglerRunner;
  calls: { args: string[]; cwd: string }[];
} {
  const calls: { args: string[]; cwd: string }[] = [];
  let created = false;
  const run: WranglerRunner = async (args, { cwd }) => {
    calls.push({ args, cwd });
    const ok = (stdout = "") => ({ code: 0, stdout, stderr: "", records: [] });
    if (args[0] === "d1" && args[1] === "info")
      return created
        ? ok(JSON.stringify({ uuid: "11111111-2222-3333-4444-555555555555" }))
        : { code: 1, stdout: "", stderr: "not found", records: [] };
    if (args[0] === "d1" && args[1] === "create") created = true;
    return ok();
  };
  return { run, calls };
}

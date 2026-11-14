/**
 * Test bundles: the real v0.9.0 statement, signature and manifest (test/fixtures/v0.9.0, byte
 * exact), and small synthetic bundles shaped like it, written by the producer's own tar and gzip
 * code and signed with a throwaway key that tests pass as `keys`.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../scripts/release-bundle/manifest.ts";
import { gzipBytes, tarArchive } from "../../../scripts/release-bundle/tar.ts";
import type { ReleaseKeys, VerifyReleaseInput } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures/v0.9.0");
export const fixture = (name: string): Uint8Array => readFileSync(path.join(FIXTURES, name));

/** The real v0.9.0 assets as `verifyRelease` input (no tarball: it is not committed). */
export function realInput(over: Partial<VerifyReleaseInput> = {}): VerifyReleaseInput {
  return {
    request: { version: "0.9.0" },
    statement: fixture("release-statement.json"),
    signature: fixture("release-statement.sig"),
    manifest: fixture("manifest.json"),
    tarball: () => new Uint8Array(0),
    planVersion: 1,
    ...over,
  };
}

/** A copy of `bytes` with one byte flipped at `at` (default: the middle). */
export function flip(bytes: Uint8Array, at = Math.floor(bytes.length / 2)): Uint8Array {
  const out = new Uint8Array(bytes);
  out[at] = (out[at] as number) ^ 0x01;
  return out;
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const utf8 = (s: string) => new TextEncoder().encode(s);

export const TEST_KEY_ID = "test-release-key";

type Doc = Record<string, unknown> & {
  workers: Record<"site" | "admin", Record<string, unknown>>;
};

export interface SyntheticOptions {
  /** Changes the manifest document before it is serialised (and pinned by the statement). */
  readonly manifest?: (m: Doc) => void;
  /** Changes the statement document before it is serialised and signed. */
  readonly statement?: (s: Record<string, unknown>) => void;
  /** Tar entries: change, drop or add before the tar is written. */
  readonly entries?: (e: { path: string; bytes: Uint8Array }[]) => void;
  /** The mtime written into the tar (default: createdAt). */
  readonly mtime?: number;
  /** Compresses the tar (default: the producer's fixed-header gzip). */
  readonly compress?: (tar: Uint8Array) => Promise<Uint8Array>;
  /** Raw tar bytes instead of the producer's (after `entries`). */
  readonly tar?: (tar: Uint8Array) => Uint8Array;
  /** More parts, listed and in the tar, by tar path (`site/assets/x`, `site/modules/y.mjs`). */
  readonly parts?: Readonly<Record<string, string>>;
}

export interface Synthetic {
  readonly input: VerifyReleaseInput;
  readonly tarball: Uint8Array;
  readonly keys: ReleaseKeys;
  readonly listed: number;
}

const PARTS = {
  "site/modules/entry.mjs": "export default { fetch() { return new Response('site'); } };\n",
  "site/modules/chunks/page.mjs": "export const page = 'a page';\n",
  "site/assets/index.html": "<!doctype html><title>site</title>\n",
  "site/assets/fonts/v1/a.woff2": "not really a font\n",
  "admin/modules/worker.js": "export default { fetch() { return new Response('admin'); } };\n",
  "admin/assets/app.js": "console.log('studio');\n",
} as const;

const file = (p: string, bytes: Uint8Array) => ({
  path: p,
  bytes: bytes.length,
  sha256: sha(bytes),
  assetHash: sha(bytes).slice(0, 32),
  contentType: "application/octet-stream",
});

/** A signed synthetic bundle of six parts (plus `opts.parts`), `opts` applied. */
export async function synthetic(opts: SyntheticOptions = {}): Promise<Synthetic> {
  const m = JSON.parse(new TextDecoder().decode(fixture("manifest.json"))) as Doc;
  const parts: Record<string, string> = { ...PARTS, ...opts.parts };
  for (const role of ["site", "admin"] as const) {
    const modules = Object.keys(parts)
      .filter((p) => p.startsWith(`${role}/modules/`))
      .map((p) => {
        const b = utf8(parts[p] as string);
        return {
          path: p.slice(`${role}/modules/`.length),
          type: "esm",
          bytes: b.length,
          sha256: sha(b),
        };
      });
    const files = Object.keys(parts)
      .filter((p) => p.startsWith(`${role}/assets/`))
      .map((p) => file(p.slice(`${role}/assets`.length), utf8(parts[p] as string)));
    const w = m.workers[role];
    w.mainModule = (modules.find((x) => !x.path.startsWith("chunks/")) ?? modules[0])?.path;
    w.modules = modules;
    const assets = w.assets as Record<string, unknown>;
    assets.files = files;
    assets.count = files.length;
    assets.bytes = files.reduce((s, f) => s + f.bytes, 0);
  }
  (m.signing as Record<string, unknown>).keyId = TEST_KEY_ID;
  const commit = m.commit;
  opts.manifest?.(m);
  const manifestBytes = utf8(canonicalJson(m));

  const entries = Object.entries(parts).map(([p, text]) => ({ path: p, bytes: utf8(text) }));
  opts.entries?.(entries);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const createdAt = "2026-11-13T16:13:20Z";
  let tar = tarArchive(entries, opts.mtime ?? Date.parse(createdAt) / 1000);
  if (opts.tar) tar = opts.tar(tar);
  const tarball = await (opts.compress ?? gzipBytes)(tar);

  const s: Record<string, unknown> = {
    schemaVersion: 1,
    format: "cloudhal.release-statement@1",
    version: "0.9.0",
    channel: "stable",
    securityRelease: false,
    commit,
    createdAt,
    signing: { keyId: TEST_KEY_ID, algorithm: "Ed25519", signature: "release-statement.sig" },
    manifest: { name: "manifest.json", sha256: sha(manifestBytes), bytes: manifestBytes.length },
    tarball: { name: "cloudhal-release-0.9.0.tar.gz", sha256: sha(tarball), bytes: tarball.length },
  };
  opts.statement?.(s);
  const statement = utf8(canonicalJson(s));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const raw = Buffer.from(der.subarray(12)).toString("base64");
  const keys: ReleaseKeys = { [TEST_KEY_ID]: { publicKey: raw, status: "active" } };
  return {
    input: {
      request: { version: "0.9.0" },
      statement,
      signature: new Uint8Array(sign(null, statement, privateKey)),
      manifest: manifestBytes,
      tarball: () => tarball,
      planVersion: 1,
      keys,
    },
    tarball,
    keys,
    listed: Object.keys(parts).length,
  };
}

/** `bytes` as a ReadableStream of `size`-byte chunks (exercises every buffer boundary). */
export function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(c) {
      if (at >= bytes.length) return c.close();
      c.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

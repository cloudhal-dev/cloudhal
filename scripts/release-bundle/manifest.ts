/**
 * The release manifest (`cloudhal.release-manifest@1`, RFC-0046 §3) of a build output, its
 * canonical bytes, the part list of the tarball and the normative limits (§7).
 */
import { createHash } from "node:crypto";
import type { BuildOutput, SourceFile, WorkerBuild } from "./read-build.ts";
import {
  DEFAULT_RUNTIME,
  PRODUCER,
  STANDARD_MANIFEST_FIELDS,
  STANDARD_STARTER,
} from "./standard.ts";

/** RFC-0046 §7. */
export const LIMITS = {
  manifestBytes: 1_900_000,
  statementBytes: 4096,
  tarballBytes: 104_857_600,
  partBytes: 64 * 1024 * 1024,
  assetBytes: 25 * 1024 * 1024,
  assetsPerWorker: 20_000,
  tarEntries: 30_000,
} as const;

export const sha256 = (b: Uint8Array | string): string =>
  createHash("sha256").update(b).digest("hex");

const MODULE_TYPES: Readonly<Record<string, string>> = {
  mjs: "esm",
  js: "esm",
  cjs: "cjs",
  wasm: "wasm",
  txt: "text",
  html: "text",
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  txt: "text/plain",
  xml: "application/xml",
  wasm: "application/wasm",
  webmanifest: "application/manifest+json",
};

const extOf = (p: string) => {
  const base = p.split("/").pop() ?? p;
  return base.includes(".") ? (base.split(".").pop() ?? "").toLowerCase() : "";
};

/** `sha256(base64(bytes) + extension)[0:32]` (Workers direct upload's formula, no dot). */
export function assetHash(p: string, bytes: Uint8Array): string {
  return sha256(`${Buffer.from(bytes).toString("base64")}${extOf(p)}`).slice(0, 32);
}

function workerArtifact(w: WorkerBuild, role: "site" | "admin") {
  const files = w.assets.map((a) => ({
    path: a.path,
    bytes: a.bytes.length,
    sha256: sha256(a.bytes),
    assetHash: assetHash(a.path, a.bytes),
    contentType: CONTENT_TYPES[extOf(a.path)] ?? "application/octet-stream",
  }));
  return {
    mainModule: w.mainModule,
    modules: w.modules.map((m) => ({
      path: m.path,
      type: MODULE_TYPES[extOf(m.path)] ?? "data",
      bytes: m.bytes.length,
      sha256: sha256(m.bytes),
    })),
    assets: {
      count: files.length,
      bytes: files.reduce((s, f) => s + f.bytes, 0),
      files,
      headers: w.headers,
      ...(w.config ? { config: w.config } : {}),
    },
    bindingTemplate: role,
  };
}

/** Keys sorted recursively by UTF-16 code unit, 2-space indent, trailing newline (§1). */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** `vX.Y.Z-<pre>` ⇔ `next` (§6 channel rule). */
export const channelOf = (version: string): "stable" | "next" =>
  version.includes("-") ? "next" : "stable";

export interface ReleaseFacts {
  readonly version: string;
  /** The release commit (40 hex), which the tag names. */
  readonly commit: string;
  /** Its committer time in whole seconds, `YYYY-MM-DDTHH:MM:SSZ`. */
  readonly createdAt: string;
  readonly keyId: string;
  readonly migrations: readonly string[];
  readonly securityRelease?: boolean;
  readonly compatibleWithPrevious?: boolean;
  readonly planVersion?: number;
  /** `toolchain` beyond `producer` and `starter`: node, cli, astro, wrangler. */
  readonly toolchain: Readonly<Record<string, string>>;
}

/** The manifest document (not yet validated) of `build` for `facts`. */
export function manifestOf(build: BuildOutput, facts: ReleaseFacts): Record<string, unknown> {
  const names = [...facts.migrations];
  if (names.length === 0) throw new Error("a release needs at least one migration name");
  return {
    schemaVersion: 1,
    format: "cloudhal.release-manifest@1",
    version: facts.version,
    channel: channelOf(facts.version),
    securityRelease: facts.securityRelease ?? false,
    commit: facts.commit,
    createdAt: facts.createdAt,
    ...STANDARD_MANIFEST_FIELDS,
    migrations: {
      first: names[0],
      last: names[names.length - 1],
      count: names.length,
      names,
      compatibleWithPrevious: facts.compatibleWithPrevious ?? true,
    },
    runtime: build.runtime ?? DEFAULT_RUNTIME,
    toolchain: { ...facts.toolchain, producer: PRODUCER, starter: STANDARD_STARTER },
    theme: {
      name: STANDARD_STARTER,
      version: facts.version,
      blockTypes: [],
      settingsSha256: sha256(""),
      designSha256: sha256(""),
    },
    workers: {
      site: workerArtifact(build.site, "site"),
      admin: workerArtifact(build.admin, "admin"),
    },
    starter: build.starter
      ? {
          kind: "bundle",
          path: `starter/${build.starter.file.path}`,
          bytes: build.starter.file.bytes.length,
          sha256: sha256(build.starter.file.bytes),
          siteId: build.starter.siteId,
        }
      : { kind: "admin-api" },
    planVersion: facts.planVersion ?? 1,
    signing: { keyId: facts.keyId, algorithm: "Ed25519", signature: "release-statement.sig" },
  };
}

const byPath = (a: SourceFile, b: SourceFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** The tarball's entries: every part under its bundle path, sorted by path (§7). */
export function bundleEntries(build: BuildOutput): SourceFile[] {
  const out: SourceFile[] = [];
  for (const role of ["site", "admin"] as const) {
    for (const m of build[role].modules)
      out.push({ path: `${role}/modules/${m.path}`, bytes: m.bytes });
    for (const a of build[role].assets)
      out.push({ path: `${role}/assets${a.path}`, bytes: a.bytes });
  }
  if (build.starter)
    out.push({ path: `starter/${build.starter.file.path}`, bytes: build.starter.file.bytes });
  return out.sort(byPath);
}

/** Refuses a build outside §7's limits; the message names the part, never its content. */
export function checkLimits(build: BuildOutput, entries: readonly SourceFile[]): void {
  if (entries.length > LIMITS.tarEntries)
    throw new Error(`${entries.length} parts; a release holds at most ${LIMITS.tarEntries}`);
  for (const role of ["site", "admin"] as const) {
    const n = build[role].assets.length;
    if (n > LIMITS.assetsPerWorker)
      throw new Error(`${role}: ${n} assets; a Worker serves at most ${LIMITS.assetsPerWorker}`);
    for (const a of build[role].assets)
      if (a.bytes.length > LIMITS.assetBytes)
        throw new Error(`${role}/assets${a.path} is above ${LIMITS.assetBytes} bytes`);
  }
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.bytes.length > LIMITS.partBytes)
      throw new Error(`${e.path} is above ${LIMITS.partBytes} bytes`);
    if (seen.has(e.path)) throw new Error(`${e.path} appears twice`);
    seen.add(e.path);
  }
}

/** The bundle path → `{bytes, sha256}` of every part a manifest lists. */
export function manifestParts(manifest: {
  workers: Record<
    "site" | "admin",
    {
      modules: readonly { path: string; bytes: number; sha256: string }[];
      assets: { files: readonly { path: string; bytes: number; sha256: string }[] };
    }
  >;
  starter: { kind: string; path?: string; bytes?: number; sha256?: string };
}): Map<string, { bytes: number; sha256: string }> {
  const out = new Map<string, { bytes: number; sha256: string }>();
  for (const role of ["site", "admin"] as const) {
    const w = manifest.workers[role];
    for (const m of w.modules) out.set(`${role}/modules/${m.path}`, m);
    for (const f of w.assets.files) out.set(`${role}/assets${f.path}`, f);
  }
  const s = manifest.starter;
  if (s.kind === "bundle" && s.path && s.bytes !== undefined && s.sha256)
    out.set(s.path, { bytes: s.bytes, sha256: s.sha256 });
  return out;
}

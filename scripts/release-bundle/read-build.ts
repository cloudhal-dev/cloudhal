/**
 * Reads the build output `cloudhal deploy --dry-run` leaves in a project (RFC-0046 §4 step 3):
 *
 *   <project>/.cloudhal/deploy/out/site/**   site modules (`entry.mjs`, `chunks/*.mjs`), else dist/server
 *   <project>/dist/client/**                 site assets (`_headers` → headers text, `.assetsignore`)
 *   <project>/dist/server/wrangler.json      compatibility date and flags (optional)
 *   <project>/.cloudhal/deploy/out/admin/**  the admin module (`worker.js`)
 *   <studio>/**                              Studio assets (`apps/studio/dist`; `*.map` dropped)
 *
 * Source maps, READMEs and Wrangler's own files are never parts. A `_redirects` file is refused:
 * the manifest has no field for it, so a bundle without it would serve a different site.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ADMIN_CONFIG, type AssetsConfig, SITE_CONFIG } from "./standard.ts";

export interface SourceFile {
  /** Module path (`chunks/a.mjs`), asset path (`/favicon.svg`) or starter file name. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface WorkerBuild {
  readonly mainModule: string;
  readonly modules: readonly SourceFile[];
  readonly assets: readonly SourceFile[];
  /** The `_headers` text (sent as `assets.config._headers`, never an asset). */
  readonly headers: string;
  readonly config?: AssetsConfig;
}

export interface BuildOutput {
  readonly site: WorkerBuild;
  readonly admin: WorkerBuild;
  readonly starter?: { readonly file: SourceFile; readonly siteId: string };
  readonly runtime?: { readonly compatibilityDate: string; readonly compatibilityFlags: string[] };
}

export interface BuildLayout {
  readonly project: string;
  /** Studio assets (`apps/studio/dist`); none → the admin Worker serves no assets. */
  readonly studio?: string;
  readonly starter?: { readonly file: string; readonly siteId: string };
}

const SKIP_MODULE = /(^|\/)(README\.md|wrangler\.json|\.dev\.vars|\.assetsignore)$|\.map$/;
const SKIP_ASSET = new Set(["_headers", ".assetsignore", "wrangler.json", ".dev.vars"]);

/** Every regular file under `dir`, as `/`-separated paths sorted per directory. */
export function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const st = statSync(path.join(dir, r));
    if (st.isDirectory()) out.push(...walk(dir, r));
    else if (st.isFile()) out.push(r);
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");

/** `.assetsignore` lines → a matcher (`*` within a segment, `**` across; no `/` = basename). */
export function ignoreMatcher(text: string): (rel: string) => boolean {
  const rules = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.startsWith("/") ? l.slice(1) : l;
      const re = p.split("**").map(escapeRe).join(".*");
      return { re: new RegExp(`^${re}$`), base: !p.includes("/") };
    });
  return (rel) => rules.some((r) => r.re.test(r.base ? (rel.split("/").pop() ?? rel) : rel));
}

export function readModules(dir: string): SourceFile[] {
  return walk(dir)
    .filter((r) => !SKIP_MODULE.test(r))
    .map((r) => ({ path: r, bytes: readFileSync(path.join(dir, r)) }));
}

export function readAssets(
  dir: string,
  extraIgnore = "",
): { assets: SourceFile[]; headers: string } {
  if (existsSync(path.join(dir, "_redirects")))
    throw new Error(
      `${dir}/_redirects: a release manifest cannot carry redirects; remove the file from the build`,
    );
  const ignoreFile = path.join(dir, ".assetsignore");
  const ignored = ignoreMatcher(
    `${existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : ""}\n${extraIgnore}`,
  );
  const headersFile = path.join(dir, "_headers");
  const assets = walk(dir)
    .filter((r) => !SKIP_ASSET.has(r) && !ignored(r))
    .map((r) => ({ path: `/${r}`, bytes: readFileSync(path.join(dir, r)) }));
  return { assets, headers: existsSync(headersFile) ? readFileSync(headersFile, "utf8") : "" };
}

function firstDir(...dirs: string[]): string {
  const d = dirs.find((x) => existsSync(x));
  if (!d) throw new Error(`none of these exist: ${dirs.join(", ")}`);
  return d;
}

/** Compatibility date and flags of the site's generated `wrangler.json`, if any. */
export function runtimeOf(wranglerJson: string): BuildOutput["runtime"] | undefined {
  if (!existsSync(wranglerJson)) return undefined;
  const w = JSON.parse(readFileSync(wranglerJson, "utf8")) as {
    compatibility_date?: unknown;
    compatibility_flags?: unknown;
  };
  if (typeof w.compatibility_date !== "string") return undefined;
  const flags = Array.isArray(w.compatibility_flags)
    ? w.compatibility_flags.filter((f): f is string => typeof f === "string")
    : [];
  return { compatibilityDate: w.compatibility_date, compatibilityFlags: [...new Set(flags)] };
}

const mainOf = (mods: readonly SourceFile[], name: string) => {
  if (!mods.some((m) => m.path === name)) throw new Error(`no ${name} in the build output`);
  return name;
};

/** Reads a Cloudhal build output (see the file comment for the layout). */
export function readBuildOutput(layout: BuildLayout): BuildOutput {
  const p = layout.project;
  const siteModules = readModules(
    firstDir(path.join(p, ".cloudhal/deploy/out/site"), path.join(p, "dist/server")),
  );
  const site = readAssets(firstDir(path.join(p, "dist/client")));
  const adminModules = readModules(firstDir(path.join(p, ".cloudhal/deploy/out/admin")));
  const studio = layout.studio ? readAssets(layout.studio, "*.map") : { assets: [], headers: "" };
  const runtime = runtimeOf(path.join(p, "dist/server/wrangler.json"));
  const starter = layout.starter;
  return {
    site: {
      mainModule: mainOf(siteModules, "entry.mjs"),
      modules: siteModules,
      ...site,
      config: SITE_CONFIG,
    },
    admin: {
      mainModule: mainOf(adminModules, "worker.js"),
      modules: adminModules,
      ...studio,
      config: ADMIN_CONFIG,
    },
    ...(runtime ? { runtime } : {}),
    ...(starter
      ? {
          starter: {
            file: { path: path.basename(starter.file), bytes: readFileSync(starter.file) },
            siteId: starter.siteId,
          },
        }
      : {}),
  };
}

/** Migration names (`NNNN_name`) of a `@cloudhal/storage`-style migrations directory. */
export function migrationNames(dir: string): string[] {
  return readdirSync(dir)
    .map((f) => /^(\d{4}_[a-z0-9_]+)\.(ts|js|sql)$/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort();
}

/**
 * The values of the project's generated deploy secrets (`.cloudhal/deploy/secrets.json`): kept in
 * memory only, to refuse a part that contains one. Never printed.
 */
export function readDeploySecrets(file: string): string[] {
  const doc = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return Object.values(doc).filter((v): v is string => typeof v === "string" && v.length >= 16);
}

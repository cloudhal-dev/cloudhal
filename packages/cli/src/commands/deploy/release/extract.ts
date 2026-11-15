/**
 * Extraction of a verified release (RFC-0046 §11b) into a fresh `.cloudhal/deploy/release/<v>/`:
 * removed first and created empty, every target `path.resolve`d and refused unless it lies inside,
 * every file created with exclusive create (`wx`, so a duplicate fails), and only entries the
 * verifier yielded, so the directory holds exactly the manifest's listings. `_headers` comes from
 * the manifest's inline text. Layout:
 *
 *   <dir>/site/modules/<module>    <dir>/site/assets/<asset>    (and admin/…)
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReleaseManifest, VerifiedRelease } from "@cloudhal/release-verify";
import { refuseDeploy } from "./errors.ts";

export type WorkerRole = "site" | "admin";

export interface ExtractedWorker {
  /** `<dir>/<role>/modules`. */
  readonly modulesDir: string;
  /** `<dir>/<role>/assets`. */
  readonly assetsDir: string;
  readonly mainModule: string;
  /** Module paths by manifest type (`esm`, `cjs`, `wasm`, `text`, `data`). */
  readonly modulesByType: Readonly<Record<string, readonly string[]>>;
}

export interface Extracted {
  readonly dir: string;
  readonly site: ExtractedWorker;
  readonly admin: ExtractedWorker;
  readonly files: number;
}

const ROLES: readonly WorkerRole[] = ["site", "admin"];

/** `rel` under `base`, refused unless it stays inside. */
function inside(base: string, rel: string): string {
  const target = path.resolve(base, rel);
  if (!target.startsWith(base + path.sep))
    refuseDeploy("extract-unsafe", `the bundle entry ${rel} would land outside ${base}`);
  return target;
}

async function writeNew(base: string, rel: string, bytes: Uint8Array | string): Promise<void> {
  const target = inside(base, rel);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      refuseDeploy("extract-unsafe", `the bundle lists ${rel} twice`);
    throw e;
  }
}

function workerOf(dir: string, role: WorkerRole, manifest: ReleaseManifest): ExtractedWorker {
  const w = manifest.workers[role];
  const byType: Record<string, string[]> = {};
  for (const m of w.modules) byType[m.type] = [...(byType[m.type] ?? []), m.path];
  return {
    modulesDir: path.join(dir, role, "modules"),
    assetsDir: path.join(dir, role, "assets"),
    mainModule: w.mainModule,
    modulesByType: byType,
  };
}

/** Writes every verified entry (see the file comment); throws, writing nothing more, on the first refusal. */
export async function extractRelease(release: VerifiedRelease, dir: string): Promise<Extracted> {
  const base = path.resolve(dir);
  await rm(base, { recursive: true, force: true });
  await mkdir(base, { recursive: true });
  for (const role of ROLES) {
    await mkdir(path.join(base, role, "modules"), { recursive: true });
    await mkdir(path.join(base, role, "assets"), { recursive: true });
  }
  let files = 0;
  for await (const entry of release.entries()) {
    if (entry.kind === "starter" || !entry.worker) continue; // the first push carries content
    const kind = entry.kind === "module" ? "modules" : "assets";
    const rel = entry.kind === "asset" ? entry.path.slice(1) : entry.path;
    await writeNew(path.join(base, entry.worker, kind), rel, entry.bytes);
    files++;
  }
  for (const role of ROLES) {
    const headers = release.manifest.workers[role].assets.headers;
    if (headers) await writeNew(path.join(base, role, "assets"), "_headers", headers);
  }
  return {
    dir: base,
    site: workerOf(base, "site", release.manifest),
    admin: workerOf(base, "admin", release.manifest),
    files,
  };
}

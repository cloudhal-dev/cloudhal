/**
 * The starter demo archive (RFC-0039 rollout step 5): the site `cloudhal init` seeds, published
 * once as `cloudhal snapshot --publish` does, exported by the real `cloudhal export` code into
 * packages/cli/test/fixtures/site-archives/starter-blog.cloudhal. A binary fixture, which the repo
 * otherwise avoids, because invariant 7 (as amended) asks for a committed archive that is checked.
 *
 *   node scripts/demo-archive.ts          # regenerate; writes the file only when it is stale
 *   node scripts/demo-archive.ts --check  # fail if it is stale (pnpm check, CI)
 *
 * Fixed ids (`<prefix>_starter0001`, …) and a fixed clock make the content the same on every run.
 * Node's mock Date is on while the site is seeded and published, because the starter dates its
 * first post with `new Date()`. The check never compares gzip bytes, which differ between zlib
 * builds: it reads both files in full (every size and SHA-256 verified) and compares their
 * manifests without `createdBy`. The manifest pins every other file's SHA-256, so equal manifests
 * mean the same content in the tar.
 */
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readArchive, type SiteArchiveManifest } from "../packages/cli/src/archive/index.ts";
import { loadThemeSettings } from "../packages/cli/src/blocks.ts";
import { exportArchive } from "../packages/cli/src/commands/export.ts";
import { CLI_ACTOR } from "../packages/cli/src/commands/import-apply.ts";
import { writeProjectConfig } from "../packages/cli/src/config.ts";
import { seedStarter } from "../packages/cli/src/seed-site.ts";
import { GATES_ENFORCED, SiteGraphStore } from "../packages/core-ts/src/index.ts";
import { openLocalStore } from "../packages/core-ts/src/local.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "packages/cli/test/fixtures/site-archives/starter-blog.cloudhal");
const AT = "2026-10-26T00:00:00.000Z";

/** `site_starter0001`, `snap_starter0001`, …: valid ids, the same on every run. */
function counterIds(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_starter${String(n).padStart(4, "0")}`;
  };
}

/** Seeds and publishes the starter site into a project at `dir`, as `cloudhal init` does. */
async function seedProject(dir: string): Promise<void> {
  const local = await openLocalStore(path.join(dir, ".cloudhal"));
  const store = new SiteGraphStore({
    sql: local.sql,
    blobs: local.blobs,
    gates: GATES_ENFORCED,
    now: () => new Date(AT),
    idGen: counterIds(),
  });
  mock.timers.enable({ apis: ["Date"], now: Date.parse(AT) });
  try {
    const site = await seedStarter(store, {
      name: "Starter Blog",
      slug: "starter-blog",
      themeSettings: () => loadThemeSettings(path.join(ROOT, "starters/blog")),
    });
    const snap = await store.createSnapshot(site.id, { actor: CLI_ACTOR, reason: "publish" });
    const seeded = await store.getSite(site.id);
    if (!seeded) throw new Error(`site ${site.id} not found after seeding`);
    await store.publish(seeded, snap.id);
    await writeProjectConfig(dir, { siteId: site.id, dataDir: ".cloudhal" });
  } finally {
    mock.timers.reset();
    await local.close();
  }
}

/** The archive's manifest, after reading every file (which verifies each size and SHA-256). */
async function verifiedManifest(file: string): Promise<SiteArchiveManifest> {
  let manifest: SiteArchiveManifest | undefined;
  for await (const item of readArchive(createReadStream(file))) {
    if (item.type === "manifest") manifest = item.manifest;
    if (item.type === "media") for await (const _ of item.body);
  }
  if (!manifest) throw new Error(`${file}: no manifest`);
  return manifest;
}

/** What differs between two manifests, `createdBy` aside: top-level fields and file paths. */
function differences(a: SiteArchiveManifest, b: SiteArchiveManifest): string[] {
  const { createdBy: _a, files: filesA, ...restA } = a;
  const { createdBy: _b, files: filesB, ...restB } = b;
  const out = Object.keys({ ...restA, ...restB }).filter(
    (k) => !isDeepStrictEqual(restA[k as keyof typeof restA], restB[k as keyof typeof restB]),
  );
  const listed = (files: SiteArchiveManifest["files"]) =>
    new Map(files.map((f) => [f.path, `${f.sha256} ${f.bytes}`]));
  const [x, y] = [listed(filesA), listed(filesB)];
  for (const p of new Set([...x.keys(), ...y.keys()])) if (x.get(p) !== y.get(p)) out.push(p);
  return out;
}

/** The committed archive's manifest; undefined when it is missing or does not read in full. */
async function committedManifest(): Promise<SiteArchiveManifest | undefined> {
  try {
    return await verifiedManifest(FIXTURE);
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    console.error(`${path.relative(ROOT, FIXTURE)}: ${missing ? "missing" : (e as Error).message}`);
    return undefined;
  }
}

async function run(check: boolean): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), "cloudhal-demo-archive-"));
  try {
    await seedProject(tmp);
    const { file } = await exportArchive({ projectDir: tmp, out: "starter-blog.cloudhal" });
    const fresh = await verifiedManifest(file);
    const committed = await committedManifest();
    const diff = committed ? differences(committed, fresh) : ["the file"];
    const shown = path.relative(ROOT, FIXTURE);
    if (diff.length === 0) {
      console.log(`${shown} is up to date`);
    } else if (check) {
      console.error(`differs: ${diff.join(", ")}`);
      console.error(`starter demo archive is stale: run pnpm demo:archive and commit ${shown}`);
      process.exitCode = 1;
    } else {
      await mkdir(path.dirname(FIXTURE), { recursive: true });
      await copyFile(file, FIXTURE);
      console.log(`wrote ${shown} (${diff.join(", ")})`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// No main-module guard: nothing imports this script, and comparing `import.meta.url` with argv[1]
// fails on paths with spaces, non-ASCII letters or symlinks, which would make --check pass silently.
await run(process.argv.includes("--check"));

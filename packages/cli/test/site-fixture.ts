/**
 * A seeded local project for the `cloudhal export` and `cloudhal import` tests (RFC-0039): the
 * English site with three uploads (A the entry's cover; B taken down; C deleted, kept by the first
 * snapshot only), three snapshots (the second published, the third after an edit of /about) and a
 * second listed site (`tr`), all written on `SEEDED_AT`. Helpers open its store, copy it and list
 * its blobs, make an empty project and capture what a refused import must leave as it was; every
 * folder they make is removed by `removeTempDirs`.
 */
import { cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Actor, ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { exportSite, type SiteBundle, seedStarterSite } from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { makePng, PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { vi } from "vitest";
import { type ProjectConfig, writeProjectConfig } from "../src/config.ts";

export const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
export const robot: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

export interface Fixture {
  projectDir: string;
  siteId: string;
  trId: string;
  /** A: the entry's cover; B: taken down; C: deleted, kept by the first snapshot only. */
  sha: { a: string; b: string; c: string };
  snapshots: { s1: string; s2: string; s3: string };
}

/** The fixture's rows are written on this day, so a file name dated by the clock would show. */
export const SEEDED_AT = new Date("2026-01-02T03:04:05.000Z");
export const SEEDED_DAY = "20260102";

const dirs: string[] = [];

export async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

export async function removeTempDirs(): Promise<void> {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
}

async function seed(projectDir: string): Promise<Omit<Fixture, "projectDir">> {
  const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
  const { store } = local;
  const site = await seedStarterSite(store, { name: "English", slug: "english" });
  const upload = (bytes: Uint8Array, filename: string) =>
    store.ingestAsset({
      siteId: site.id,
      bytes,
      filename,
      uploadedBy: robot,
      source: { kind: "upload" },
    });
  const a = await upload(PNG_1X1, "pixel.png");
  const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
  await store.updateContentEntry({
    ...entry,
    coverImage: { assetId: a.asset.id, alt: "" } as never,
  });
  const b = await upload(makePng({ width: 3, height: 3 }), "b.png");
  const c = await upload(makePng({ width: 5, height: 4 }), "c.png");
  const s1 = await store.createSnapshot(site.id, { actor: person, reason: "manual" });
  await store.deleteAsset(c.asset);
  await store.purgeBlob(site.id, b.asset.sha256, person, { text: "personal data", legal: false });
  const s2 = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
  await store.publish((await store.getSite(site.id)) as Site, s2.id);
  const about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
  await store.updatePage({ ...about, title: "About us" });
  const s3 = await store.createSnapshot(site.id, { actor: person, reason: "manual" });
  const tr = await seedStarterSite(store, {
    name: "Türkçe",
    slug: "turkce",
    locale: "tr",
    projectId: site.projectId,
  });
  await local.close();
  await writeProjectConfig(projectDir, {
    siteId: site.id,
    dataDir: ".cloudhal",
    sites: [site.id, tr.id],
  });
  return {
    siteId: site.id,
    trId: tr.id,
    sha: { a: a.asset.sha256, b: b.asset.sha256, c: c.asset.sha256 },
    snapshots: { s1: s1.id, s2: s2.id, s3: s3.id },
  };
}

/** The fixture project in a new folder, its rows dated `SEEDED_AT`. */
export async function seedFixture(prefix: string): Promise<Fixture> {
  const projectDir = await tempDir(prefix);
  vi.useFakeTimers({ toFake: ["Date"], now: SEEDED_AT, shouldAdvanceTime: true });
  try {
    return { projectDir, ...(await seed(projectDir)) };
  } finally {
    vi.useRealTimers();
  }
}

/** A copy of the fixture project (without the archives other tests wrote), for tests that change it. */
export async function copyProject(fx: Fixture): Promise<string> {
  const dir = await tempDir("cloudhal-copy-");
  await cp(fx.projectDir, dir, { recursive: true });
  for (const f of await readdir(dir))
    if (f !== ".cloudhal" && f.endsWith(".cloudhal")) await rm(path.join(dir, f));
  return dir;
}

/** The local store of `projectDir`, open for `fn` only. */
export async function withStore<T>(
  projectDir: string,
  fn: (local: LocalStore) => Promise<T>,
): Promise<T> {
  const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
  try {
    return await fn(local);
  } finally {
    await local.close();
  }
}

export const bundleOf = (projectDir: string, siteId: string): Promise<SiteBundle> =>
  withStore(projectDir, (local) => exportSite(local, siteId));

/** A media file of the site in the project's blob store. */
export const mediaFile = (projectDir: string, siteId: string, sha: string): string =>
  path.join(projectDir, ".cloudhal", "blobs", "media", siteId, sha);

/** Every file under the project's blob store but its temporary folder (`blobs/.tmp`). */
export async function blobListing(projectDir: string): Promise<string[]> {
  const root = path.join(projectDir, ".cloudhal", "blobs");
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return [];
      throw e;
    },
  );
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)))
    .filter((f) => f.split(path.sep)[0] !== ".tmp")
    .sort();
}

/** A project with only its cloudhal.json (no .cloudhal): the fixture's sites unless `cfg` says. */
export async function emptyProject(
  fx: Fixture,
  cfg?: Pick<ProjectConfig, "siteId" | "sites">,
): Promise<string> {
  const dir = await tempDir("cloudhal-import-");
  await writeProjectConfig(dir, {
    dataDir: ".cloudhal",
    ...(cfg ?? { siteId: fx.siteId, sites: [fx.siteId, fx.trId] }),
  });
  return dir;
}

export const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

/** What a refused import must leave as it was (opens the store: call it only where one exists). */
export async function stateOf(dir: string) {
  const rows = await withStore(dir, async ({ sql }) => ({
    nodes: await sql.all("SELECT id, site_id, rev, hash FROM nodes ORDER BY id"),
    snapshots: await sql.all("SELECT id FROM snapshots ORDER BY id"),
    projects: await sql.all("SELECT id, rev FROM projects ORDER BY id"),
    media: await sql.all("SELECT site_id, sha256, state FROM media_blobs ORDER BY site_id, sha256"),
  }));
  return {
    rows,
    blobs: await blobListing(dir),
    config: await readFile(path.join(dir, "cloudhal.json"), "utf8"),
  };
}

/**
 * RFC-0047 §5 step 3: every file of the extracted release bundle against its manifest's SHA-256,
 * at each start. Node built-ins only: the image's runtime stage carries this folder without the
 * CLI's dependencies (main.ts).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ReleaseManifest } from "@cloudhal/release-verify";

export const MANIFEST_FILE = "manifest.json";

const sha256 = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

/** Every file the manifest lists for a role, with its expected digest. */
function expected(m: ReleaseManifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const role of ["site", "admin"] as const) {
    const w = m.workers[role];
    for (const mod of w.modules) out.set(`${role}/modules/${mod.path}`, mod.sha256);
    for (const f of w.assets.files) out.set(`${role}/assets${f.path}`, f.sha256);
    if (w.assets.headers)
      out.set(
        `${role}/assets/_headers`,
        createHash("sha256").update(w.assets.headers).digest("hex"),
      );
  }
  return out;
}

async function filesUnder(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

/**
 * The bundle's manifest, once every file it lists is present with its digest and no other file
 * is there (besides the manifest). Throws naming the first few differences.
 */
export async function checkBundle(dir: string): Promise<ReleaseManifest> {
  const file = path.join(dir, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`no release bundle at ${dir} (${MANIFEST_FILE} missing)`);
  const m = JSON.parse(await readFile(file, "utf8")) as ReleaseManifest;
  const want = expected(m);
  const wrong: string[] = [];
  for (const [rel, digest] of want) {
    const p = path.join(dir, rel);
    if (!existsSync(p)) wrong.push(`${rel} is missing`);
    else if ((await sha256(p)) !== digest) wrong.push(`${rel} changed`);
    if (wrong.length >= 5) break;
  }
  if (wrong.length < 5)
    for (const rel of await filesUnder(dir))
      if (rel !== MANIFEST_FILE && !want.has(rel)) wrong.push(`${rel} is not in the release`);
  if (wrong.length > 0)
    throw new Error(
      `the release bundle at ${dir} is not v${m.version} as released:\n  - ${wrong.slice(0, 5).join("\n  - ")}`,
    );
  return m;
}

/** For tests and `selfhost config`: the manifest without the file check. */
export async function readBundleManifest(dir: string): Promise<ReleaseManifest> {
  return JSON.parse(await readFile(path.join(dir, MANIFEST_FILE), "utf8")) as ReleaseManifest;
}

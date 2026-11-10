/**
 * What visitors of the self-hosted static site see now (#150), whoever built it: Studio's queue, a
 * cron or hand-started `site-build`, or the entrypoint. After each swap `site-build` writes
 * `<project>/site/current.json` (temporary file, then a rename): when, which build, the snapshot or
 * the status page, and who ran it. This reads it defensively (a size limit, every field checked)
 * and checks it names the build `site/current` points at; a volume whose builds predate the file
 * reports the build `current` names and its time, one served from a 0.6.3 `dist` folder its time.
 */
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import type { SiteBuildServed } from "@cloudhal/api";

/** The file `site-build` writes is a few hundred bytes. */
const MAX_BYTES = 4096;
const SOURCES = new Set(["studio", "cron", "manual", "start"]);

/** Letters, digits, `_`, `-` and `.`, 1–`max` of them (a snapshot or build id). No regex. */
function isToken(v: unknown, max: number): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    const ok =
      (c >= 0x30 && c <= 0x39) ||
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a) ||
      c === 0x5f ||
      c === 0x2d ||
      c === 0x2e;
    if (!ok) return false;
  }
  return true;
}

/** An ISO instant (as `date -u +%Y-%m-%dT%H:%M:%SZ` writes it), normalised. */
function instant(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 40) return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** The fields of `current.json` that check out, for the build `current` names; else undefined. */
export function parseServed(text: string, currentBuild: string | undefined) {
  if (text.length > MAX_BYTES) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const at = instant(r.at);
  if (!at || !isToken(r.build, 64) || (currentBuild !== undefined && r.build !== currentBuild))
    return undefined;
  const state =
    r.state === "published" || r.state === "not-published" ? (r.state as string) : undefined;
  const served: SiteBuildServed = {
    at,
    build: r.build,
    ...(state === "published" && isToken(r.snapshotId, 64) ? { snapshotId: r.snapshotId } : {}),
    ...(state ? { state: state as "published" | "not-published" } : {}),
    ...(typeof r.source === "string" && SOURCES.has(r.source) ? { source: r.source } : {}),
  };
  return served;
}

async function mtime(p: string): Promise<string | undefined> {
  try {
    return (await lstat(p)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

/** What `<projectDir>`'s static site serves now, or null when nothing was ever built there. */
export async function readServed(projectDir: string): Promise<SiteBuildServed | null> {
  const site = path.join(projectDir, "site");
  let build: string | undefined;
  try {
    build = await readlink(path.join(site, "current"));
  } catch {
    build = undefined;
  }
  if (build === undefined) {
    // a 0.6.3 volume serves a real dist folder until its first build here
    const legacy = await mtime(path.join(projectDir, "dist"));
    return legacy ? { at: legacy } : null;
  }
  try {
    const file = path.join(site, "current.json");
    if ((await lstat(file)).size <= MAX_BYTES) {
      const served = parseServed(await readFile(file, "utf8"), build);
      if (served) return served;
    }
  } catch {
    // no file (a build from before it), or unreadable
  }
  const at = await mtime(path.join(site, "current"));
  return at ? { at, ...(isToken(build, 64) ? { build } : {}) } : null;
}

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AMBIENT_SCRIPT } from "./ambient-client.ts";
import { CHART_SCRIPT } from "./chart.ts";
import { CHROME_SCRIPT, CHROME_SCRIPT_ALIASES } from "./chrome-client.ts";
import { SITE_CSP } from "./csp.ts";
import { EMBED_SCRIPT, withEmbedFrames } from "./embed-client.ts";
import { MOTION_SCRIPT, MOTION_SCRIPT_ALIASES } from "./motion-client.ts";
import { OVERLAY_SCRIPT } from "./overlay-client.ts";
import { PREFS_SCRIPT } from "./prefs-client.ts";
import { SURFACE_SCRIPT, SURFACE_SCRIPT_ALIASES } from "./surface-client.ts";

/** Where the Site Worker build writes its hashed scripts (analytics, comments). */
export const CLOUDHAL_ASSETS_RULE = "/_cloudhal/*";

/**
 * Adds an immutable `Cache-Control` rule for `/_cloudhal/*` to the build's `_headers` (Workers
 * static assets: https://developers.cloudflare.com/workers/static-assets/headers/). The scripts
 * there are named by content hash, like Astro's `/_astro/*` (which the Cloudflare adapter marks
 * immutable in the same file), so browsers need not revalidate them on every page view. Keeps any
 * rules already in the file; idempotent.
 */
export async function writeCloudhalAssetHeaders(dir: URL | string): Promise<void> {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir.href);
  const file = path.join(root, "_headers");
  const existing = await readFile(file, "utf8").catch(() => "");
  if (existing.split("\n").some((line) => line.trim() === CLOUDHAL_ASSETS_RULE)) return;
  const rule = `${CLOUDHAL_ASSETS_RULE}\n  Cache-Control: public, max-age=31536000, immutable\n`;
  const separator =
    existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(file, `${existing}${separator}${rule}`);
}

/** Every path of a static build (`_headers` rule). */
export const STATIC_SECURITY_RULE = "/*";

/**
 * Static builds (`cloudhal build`) get the Site Worker's security headers through `_headers`, for
 * hosts that read it (Cloudflare Workers static assets and Pages, Netlify): the same `SITE_CSP`,
 * `nosniff` and referrer policy the Worker adds to HTML (`withSecurityHeaders`). Agent-written
 * content gets the same defence in depth wherever the site is hosted. A `/*` rule already in the
 * file (the owner's own) is kept as it is; idempotent.
 */
export async function writeStaticSecurityHeaders(
  dir: URL | string,
  options: { embeds?: boolean } = {},
): Promise<boolean> {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir.href);
  const file = path.join(root, "_headers");
  const existing = await readFile(file, "utf8").catch(() => "");
  if (existing.split("\n").some((line) => line.trim() === STATIC_SECURITY_RULE)) return false;
  const rule = [
    STATIC_SECURITY_RULE,
    `  Content-Security-Policy: ${options.embeds ? withEmbedFrames(SITE_CSP) : SITE_CSP}`,
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
  ].join("\n");
  const separator =
    existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(file, `${existing}${separator}${rule}`);
  return true;
}

const rootOf = (dir: URL | string) => (typeof dir === "string" ? dir : fileURLToPath(dir.href));

/** Writes the click-to-load player module (RFC-0015 §4) into the build's `/_cloudhal/`. */
export async function writeEmbedClient(dir: URL | string): Promise<void> {
  const file = path.join(rootOf(dir), ...EMBED_SCRIPT.path.split("/").filter(Boolean));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, EMBED_SCRIPT.code);
}

/** Writes the interaction runtime (RFC-0020 §4) into the build's `/_cloudhal/`. */
export async function writeSurfaceClient(dir: URL | string): Promise<void> {
  const files: [string, string][] = [
    [SURFACE_SCRIPT.path, SURFACE_SCRIPT.code],
    ...SURFACE_SCRIPT_ALIASES.map((alias) => [alias, SURFACE_SCRIPT.code] as [string, string]),
    // RFC-0022 §3: the chart drawer, loaded by the runtime for live charts only.
    [CHART_SCRIPT.path, CHART_SCRIPT.code],
    // RFC-0024 §7: the motion module, loaded by pages whose surfaces move.
    [MOTION_SCRIPT.path, MOTION_SCRIPT.code],
    ...MOTION_SCRIPT_ALIASES.map((alias) => [alias, MOTION_SCRIPT.code] as [string, string]),
    [AMBIENT_SCRIPT.path, AMBIENT_SCRIPT.code],
    // RFC-0025 §2: the chrome module, loaded by pages whose header asks for it.
    [CHROME_SCRIPT.path, CHROME_SCRIPT.code],
    ...CHROME_SCRIPT_ALIASES.map((alias) => [alias, CHROME_SCRIPT.code] as [string, string]),
    // RFC-0025 25d: the bars' preferences, read in <head> before the page paints.
    [PREFS_SCRIPT.path, PREFS_SCRIPT.code],
    // RFC-0025 §3: the overlay module, loaded by surfaces with an overlay.
    [OVERLAY_SCRIPT.path, OVERLAY_SCRIPT.code],
  ];
  for (const [name, code] of files) {
    const file = path.join(rootOf(dir), ...name.split("/").filter(Boolean));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, code);
  }
}

/** Whether any page of a static build has a live surface, motion or the chrome module (its HTML marks one). */
export async function buildShowsLiveSurfaces(dir: URL | string): Promise<boolean> {
  const entries = await readdir(rootOf(dir), { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".html")) continue;
    const html = await readFile(path.join(e.parentPath, e.name), "utf8");
    if (
      html.includes("data-ch-surface=") ||
      html.includes(MOTION_SCRIPT.path) ||
      html.includes(CHROME_SCRIPT.path) ||
      html.includes(OVERLAY_SCRIPT.path) ||
      html.includes(PREFS_SCRIPT.path)
    )
      return true;
  }
  return false;
}

/** Whether any page of a static build shows a video player (its HTML marks one). */
export async function buildShowsEmbeds(dir: URL | string): Promise<boolean> {
  const entries = await readdir(rootOf(dir), { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".html")) continue;
    const html = await readFile(path.join(e.parentPath, e.name), "utf8");
    if (html.includes("data-embed-src=")) return true;
  }
  return false;
}

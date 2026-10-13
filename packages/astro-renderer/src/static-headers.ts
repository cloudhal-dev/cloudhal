import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_CSP } from "./csp.ts";

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
export async function writeStaticSecurityHeaders(dir: URL | string): Promise<boolean> {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir.href);
  const file = path.join(root, "_headers");
  const existing = await readFile(file, "utf8").catch(() => "");
  if (existing.split("\n").some((line) => line.trim() === STATIC_SECURITY_RULE)) return false;
  const rule = [
    STATIC_SECURITY_RULE,
    `  Content-Security-Policy: ${SITE_CSP}`,
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
  ].join("\n");
  const separator =
    existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(file, `${existing}${separator}${rule}`);
  return true;
}

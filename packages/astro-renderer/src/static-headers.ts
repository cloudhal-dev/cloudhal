import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

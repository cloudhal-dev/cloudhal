// @ts-check
import { readFileSync } from "node:fs";
import { cloudhal } from "@cloudhal/astro-renderer/integration";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

/** @type {{ siteId: string; dataDir?: string }} */
const project = JSON.parse(readFileSync(new URL("./cloudhal.json", import.meta.url), "utf8"));

/**
 * `CLOUDHAL_TARGET=cloudflare` (set by `cloudhal deploy`) builds the Site Worker: pages render on
 * demand from D1/R2, so publishing never needs a rebuild. Otherwise: local dev + static builds.
 */
const target = process.env.CLOUDHAL_TARGET === "cloudflare" ? "cloudflare" : "node";
const adapter =
  target === "cloudflare"
    ? (await import("@astrojs/cloudflare")).default({ imageService: "passthrough" })
    : undefined;

export default defineConfig({
  output: "static",
  // Sites keep no server-side session state; without this the Cloudflare adapter would add (and
  // wrangler would provision) a SESSION KV namespace the site never uses.
  session: false,
  ...(adapter ? { adapter } : {}),
  integrations: [
    cloudhal({ siteId: project.siteId, dataDir: project.dataDir ?? ".cloudhal", target }),
  ],
  vite: { plugins: [tailwindcss()] },
});

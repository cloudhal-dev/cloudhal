// @ts-check
import { readFileSync } from "node:fs";
import { cloudhal } from "@cloudhal/astro-renderer/integration";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

/** @type {{ siteId: string; dataDir?: string; media?: { transform?: "cdn-cgi" | "none" }; analytics?: { enabled?: boolean; uniqueVisitors?: boolean; vitalsOneIn?: number; dev?: boolean } }} */
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
    cloudhal({
      siteId: project.siteId,
      dataDir: project.dataDir ?? ".cloudhal",
      target,
      // Responsive images through Cloudflare transformations: opt-in in cloudhal.json (RFC-0004).
      ...(project.media ? { media: project.media } : {}),
      // Cookie-less analytics (RFC-0006) for `cloudhal dev`; the Site Worker reads its vars instead.
      ...(project.analytics ? { analytics: project.analytics } : {}),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});

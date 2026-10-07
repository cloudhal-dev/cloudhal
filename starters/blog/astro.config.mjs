// @ts-check
import { readFileSync } from "node:fs";
import { cloudhal } from "@cloudhal/astro-renderer/integration";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

/** @type {{ siteId: string; dataDir?: string }} */
const project = JSON.parse(readFileSync(new URL("./cloudhal.json", import.meta.url), "utf8"));

export default defineConfig({
  output: "static",
  integrations: [cloudhal({ siteId: project.siteId, dataDir: project.dataDir ?? ".cloudhal" })],
  vite: { plugins: [tailwindcss()] },
});

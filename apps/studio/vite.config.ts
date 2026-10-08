import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Long-lived vendor chunks: they change only when dependencies do, so a Studio deploy re-downloads
 * just the app code. Screens are split per route in `src/router.tsx`. Kumo is left to automatic
 * splitting on purpose: its package also ships the lazy code-highlighting chunks (Shiki languages,
 * WASM engine), and grouping it would pull those into the initial load.
 */
const vendor = (pkgs: string) =>
  new RegExp(
    `[\\\\/]node_modules[\\\\/](?:\\.pnpm[\\\\/][^\\\\/]+[\\\\/]node_modules[\\\\/])?(?:${pkgs})[\\\\/]`,
  );

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.CLOUDHAL_API ?? "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Two chunks are above 500 kB: Kumo's lazily loaded WASM highlighting engine (~620 kB, fetched
    // only when a code block renders) and the shared UI chunk (Kumo components and the Cloudhal
    // blocks, ~670 kB with the media library's). The initial load is ~230 kB of app code + vendor.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: vendor("react|react-dom|scheduler") },
            { name: "tanstack", test: vendor("@tanstack/[^\\\\/]+") },
            {
              name: "auth",
              test: vendor("better-auth|@better-auth/[^\\\\/]+|@better-fetch/[^\\\\/]+|nanostores"),
            },
          ],
        },
      },
    },
  },
});

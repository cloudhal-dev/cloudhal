import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.CLOUDHAL_API ?? "http://localhost:8787", changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});

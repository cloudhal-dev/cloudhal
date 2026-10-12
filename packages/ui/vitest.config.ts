import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    // PreviewPanel renders iframes; tests assert their attributes, never load them.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    include: ["test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
  },
});

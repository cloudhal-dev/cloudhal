import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // One temp directory per run, removed at the end (scripts/vitest-tmpdir.ts).
    globalSetup: ["../../scripts/vitest-tmpdir.ts"],
    environment: "happy-dom",
    // PreviewPanel renders iframes; tests assert their attributes, never load them.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    include: ["test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    // The first test to open a lazy kit (the calendar, charts) pays its cold import; on a CI runner
    // shared with the heavy suites that went past Vitest's 5 s default. Same limit as Studio.
    testTimeout: 20_000,
  },
});

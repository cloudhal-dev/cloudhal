import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One temp directory per run, removed at the end (scripts/vitest-tmpdir.ts).
    globalSetup: ["../../scripts/vitest-tmpdir.ts"],
    include: ["test/**/*.test.ts"],
    // Test files share the starter's node_modules (Vite/Astro caches): build one at a time.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

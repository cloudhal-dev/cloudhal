import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One temp directory per run, removed at the end (scripts/vitest-tmpdir.ts).
    globalSetup: ["../../scripts/vitest-tmpdir.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

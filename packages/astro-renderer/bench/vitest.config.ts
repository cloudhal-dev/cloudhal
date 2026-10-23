import { defineConfig } from "vitest/config";

/** RFC-0042 §4's list benchmark: run on demand (`pnpm bench:lists`), never in `pnpm test`. */
export default defineConfig({
  test: {
    globalSetup: ["../../scripts/vitest-tmpdir.ts"],
    include: ["bench/**/*.test.ts"],
    silent: false,
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});

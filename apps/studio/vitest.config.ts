import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { catalogs } from "./catalogs.ts";

export default defineConfig({
  plugins: [catalogs(), react()],
  test: {
    // One temp directory per run, removed at the end (scripts/vitest-tmpdir.ts).
    globalSetup: ["../../scripts/vitest-tmpdir.ts"],
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    // Dialog/menu flows take ~0.5 s alone but several seconds when the whole monorepo tests in
    // parallel (turbo); 5 s made them flaky.
    testTimeout: 20_000,
  },
});

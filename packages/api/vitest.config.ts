import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each D1 suite is a test worker plus a workerd process: one worker per core oversubscribes the
    // CPU and slows every D1 round trip. Half the cores is faster overall and keeps headroom.
    maxWorkers: "50%",
  },
});

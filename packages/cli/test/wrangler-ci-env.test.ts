import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { wranglerRunner } from "../src/cloudflare/wrangler.ts";

describe("wranglerRunner in Workers Builds", () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("does not pass the build's Worker-name override to wrangler", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-wrangler-env-"));
    await writeFile(path.join(dir, "package.json"), "{}");
    const pkg = path.join(dir, "node_modules/wrangler");
    await mkdir(path.join(pkg, "bin"), { recursive: true });
    await writeFile(path.join(pkg, "package.json"), '{"name":"wrangler","version":"4.151.0"}');
    // A stand-in wrangler that prints the variables a real one would read.
    await writeFile(
      path.join(pkg, "bin/wrangler.js"),
      "process.stdout.write(JSON.stringify({ name: process.env.WRANGLER_CI_OVERRIDE_NAME ?? null, tag: process.env.WRANGLER_CI_MATCH_TAG ?? null, ci: process.env.WORKERS_CI ?? null }));",
    );
    const saved = { ...process.env };
    process.env.WRANGLER_CI_OVERRIDE_NAME = "my-blog-site";
    process.env.WRANGLER_CI_MATCH_TAG = "tag123";
    process.env.WORKERS_CI = "1";
    try {
      const r = await wranglerRunner(dir)(["deploy"], { cwd: dir, quiet: true });
      expect(JSON.parse(r.stdout)).toEqual({ name: null, tag: null, ci: "1" });
    } finally {
      process.env = saved;
    }
  });
});

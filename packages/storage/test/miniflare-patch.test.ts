/**
 * #190: `patches/miniflare@4.20260730.0.patch` backports three upstream Miniflare fixes that the D1
 * harness depends on (ADR-0012, addendum 2026-11-10). This file fails when a Miniflare change
 * arrives without them, or the patch did not apply: re-check the patch against the new release
 * (drop it once the release carries cloudflare/workers-sdk#15552 and #15781) and `pnpm install`.
 */
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { createMiniflareD1 } from "../src/testing.ts";

const require = createRequire(import.meta.url);

describe("Miniflare carries the #190 fixes (ADR-0012)", () => {
  let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
  afterAll(async () => {
    await d1?.dispose();
  });

  it("the synchronous proxy waits for its own reply's generation (workers-sdk#15552)", async () => {
    // The race needs a preempted worker thread, so it cannot be forced from here: check the code.
    const source = await readFile(require.resolve("miniflare"), "utf8");
    expect(source).toContain("/* generation */ (id + 1) | 0");
    expect(source).toContain("seen !== generation");
    expect(source).not.toMatch(/Atomics\.store\(\s*this\.#notifyHandle,\s*\/\* index \*\/\s*0,/);
  });

  it("async D1 calls reuse kept-alive connections (workers-sdk#15781)", async () => {
    d1 = await createMiniflareD1();
    await d1.db.prepare("SELECT 1").first();
    // Unpatched, `dispatchFetch` closes the connection after every call: one new socket (and one
    // port in TIME_WAIT) per query. Each idle socket closes after 1 s, so a few may reconnect.
    let connected = 0;
    const onConnect = () => {
      connected++;
    };
    subscribe("undici:client:connected", onConnect);
    try {
      for (let i = 0; i < 200; i++) await d1.db.prepare("SELECT ?1 AS n").bind(i).first();
    } finally {
      unsubscribe("undici:client:connected", onConnect);
    }
    expect(connected).toBeLessThan(10);
  });
});

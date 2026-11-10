/**
 * #190: `patches/miniflare@4.20260730.0.patch` backports cloudflare/workers-sdk#15552, the fix for
 * the synchronous binding proxy's desync that the D1 harness hit on CI (ADR-0012, addendum
 * 2026-11-10). This file fails when a Miniflare change arrives without it, or the patch did not
 * apply: re-check the patch against the new release (drop it once the release carries #15552)
 * and `pnpm install`.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("Miniflare carries the #190 fix (ADR-0012)", () => {
  it("synchronous D1 calls stay in step when the proxy thread is preempted (workers-sdk#15552)", async () => {
    // A preload stalls both sides of the handshake on every other call, as a busy runner does
    // now and then. Unpatched, the first stalled call fails `message?.id === id`.
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["-r", fixture("preempt-sync-proxy.cjs"), fixture("sync-proxy-calls.cjs")],
      { timeout: 60_000 },
    );
    expect(stdout.trim()).toBe("ok");
  });
});

/**
 * #190: `patches/miniflare@4.20260730.0.patch` backports cloudflare/workers-sdk#15552, the fix for
 * the synchronous binding proxy's desync that the D1 harness hit on CI (ADR-0012, addendum
 * 2026-11-10). This file fails when a Miniflare change arrives without it, or the patch did not
 * apply: re-check the patch against the new release (drop it once the release carries #15552)
 * and `pnpm install`.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("Miniflare carries the #190 fix (ADR-0012)", () => {
  it("the synchronous proxy waits for its own reply's generation (workers-sdk#15552)", async () => {
    // The race needs a preempted worker thread, so it cannot be forced from here: check the code.
    const source = await readFile(require.resolve("miniflare"), "utf8");
    expect(source).toContain("/* generation */ (id + 1) | 0");
    expect(source).toContain("seen !== generation");
    expect(source).not.toMatch(/Atomics\.store\(\s*this\.#notifyHandle,\s*\/\* index \*\/\s*0,/);
  });
});

/**
 * #190: `patches/miniflare@4.20260730.0.patch` backports cloudflare/workers-sdk#15552, the fix for
 * the synchronous binding proxy's desync that the D1 harness hit on CI (ADR-0012, addendum
 * 2026-11-10). This file fails when a Miniflare change arrives without it, or the patch did not
 * apply: re-check the patch against the new release (drop it once the release carries #15552)
 * and `pnpm install`.
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(here, "fixtures", name);

// Below storage's 30 s `testTimeout`, so the child is gone before Vitest gives up on the test.
const CHILD_TIMEOUT_MS = 20_000;

let child: ChildProcess | undefined;

/**
 * Kills the child and its workerd. A hung synchronous proxy call blocks the child's main thread in
 * `Atomics.wait`, where Miniflare's SIGTERM hook never runs, so the whole process group (the child
 * is its leader) gets SIGKILL.
 */
function killChild(): void {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

afterEach(() => {
  killChild();
  child = undefined;
});

/** Runs `node -r preload script` and resolves with its stdout, or rejects after the timeout. */
function runNode(preload: string, script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["-r", preload, script], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      killChild();
      reject(new Error(`child timed out after ${CHILD_TIMEOUT_MS} ms; stderr: ${stderr}`));
    }, CHILD_TIMEOUT_MS);
    proc.on("error", reject);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`child exited with ${code}; stderr: ${stderr}`));
    });
  });
}

describe("Miniflare carries the #190 fix (ADR-0012)", () => {
  it("synchronous D1 calls stay in step when the proxy thread is preempted (workers-sdk#15552)", async () => {
    // A preload stalls both sides of the handshake on every other call, as a busy runner does
    // now and then. Unpatched, the first stalled call fails `message?.id === id`.
    const stdout = await runNode(
      fixture("preempt-sync-proxy.cjs"),
      fixture("sync-proxy-calls.cjs"),
    );
    expect(stdout.trim()).toBe("ok");
  });
});

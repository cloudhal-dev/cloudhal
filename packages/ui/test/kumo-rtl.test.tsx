import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("Kumo is patched for right-to-left (ADR-0033 A1)", () => {
  it("has no physical utilities left and keeps the hand-written changes", () => {
    // Fails when a Kumo upgrade arrives without a regenerated patch, or the patch did not apply:
    // run `node scripts/kumo-patch.ts` and `pnpm install`.
    const script = path.resolve(here, "../../../scripts/kumo-patch.ts");
    expect(() =>
      execFileSync(process.execPath, [script, "--verify"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

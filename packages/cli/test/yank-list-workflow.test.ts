/**
 * .github/workflows/yank-list.yml (RFC-0046 §9, #226): the weekly and on-demand re-signing of
 * yanked.json, with the least it needs: pinned actions, `contents: write` on its one job, the
 * key in one step, no install, inputs only through the environment, and no force-push.
 */
import { describe, expect, it } from "vitest";
import { code, gha, job, OPEN, runs, step, YANK } from "./fixtures/release-bundle/workflow-text.ts";

describe("the Yank list workflow", () => {
  const sign = job(YANK, "sign");

  it("runs weekly and on demand with yank, revoke, reason and first_run", () => {
    expect(YANK).toMatch(/schedule:\n\s+- cron: "\d+ \d+ \* \* \d"/);
    for (const input of ["yank:", "revoke:", "reason:", "first_run:"])
      expect(code(YANK)).toContain(`      ${input}`);
  });

  it("pins every action to a 40-hex commit and grants only contents: write, to one job", () => {
    for (const l of YANK.split("\n").filter((x) => /^\s*(- )?uses: /.test(x)))
      expect(l.split("uses: ")[1]).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    expect(code(YANK)).toContain("\npermissions: {}\n");
    expect(code(sign)).toMatch(/permissions:\n\s+contents: write( #[^\n]*)?\n\s+steps:/);
    expect(code(YANK).match(/permissions:/g)).toHaveLength(2);
    expect(code(sign)).toContain("environment: release-yank");
  });

  it("hands the yank key to the Sign step only, installs only the verifier, never force-pushes", () => {
    expect(code(YANK).match(/secrets\.RELEASE_YANK_KEY/g)).toHaveLength(1);
    expect(step(sign, "Sign")).toContain(`RELEASE_YANK_KEY: ${gha("secrets.RELEASE_YANK_KEY")}`);
    // Exactly one install: the verifier's pinned dependencies, no lifecycle scripts, before the key.
    expect(code(YANK).match(/pnpm install|npm ci|npm install/g)).toHaveLength(1);
    expect(code(YANK)).toContain(
      "run: pnpm install --frozen-lockfile --ignore-scripts --filter @cloudhal/release-verify",
    );
    expect(code(sign).indexOf("--ignore-scripts")).toBeLessThan(
      code(sign).indexOf("RELEASE_YANK_KEY"),
    );
    expect(code(YANK)).not.toMatch(/--force|push -f|\+yank-list/);
    expect(runs(step(sign, "Sign")).join("\n")).toContain("node scripts/release-keys.ts");
  });

  it("passes inputs only through env, never into run scripts", () => {
    for (const script of runs(code(sign))) expect(script).not.toContain(OPEN);
    expect(step(sign, "Sign")).toContain(`YANK: ${gha("inputs.yank")}`);
    expect(step(sign, "Sign")).toContain(`REASON: ${gha("inputs.reason")}`);
  });
});

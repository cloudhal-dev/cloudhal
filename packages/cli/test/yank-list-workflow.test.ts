/**
 * .github/workflows/yank-list.yml (RFC-0046 §9, #226): the weekly and on-demand re-signing of
 * yanked.json, with the least it needs: pinned actions, read-only tokens (the push uses the
 * environment's deploy key), each key in one step, one install (the verifier, no lifecycle
 * scripts), inputs only through the environment, no force-push, a skip before the root ceremony,
 * and a visible failure.
 */
import { describe, expect, it } from "vitest";
import { code, gha, job, OPEN, runs, step, YANK } from "./fixtures/release-bundle/workflow-text.ts";

describe("the Yank list workflow", () => {
  const sign = job(YANK, "sign");

  it("runs weekly and on demand with yank, revoke, reason, first_run, rotate and accept_expired", () => {
    expect(YANK).toMatch(/schedule:\n\s+- cron: "\d+ \d+ \* \* \d"/);
    for (const input of ["yank:", "revoke:", "reason:", "first_run:", "rotate:", "accept_expired:"])
      expect(code(YANK)).toContain(`      ${input}`);
  });

  it("skips, with a notice, outside the repository and before security/keys.json exists", () => {
    const check = job(YANK, "check");
    expect(check).toContain("if: github.repository == 'cloudhal-dev/cloudhal'");
    expect(check).toContain("[ -f security/keys.json ] && [ -f security/keys.json.sig ]");
    expect(check).toContain("::notice::");
    expect(code(sign)).toContain("needs: check");
    expect(code(sign)).toContain("if: needs.check.outputs.ready == 'true'");
    // The environment (and so the key) is referenced only once the check passed.
    expect(code(check)).not.toContain("environment:");
  });

  it("makes a failed or cancelled run visible: a job summary and an issue", () => {
    expect(step(sign, "Summary")).toContain("if: always()");
    const notify = job(YANK, "notify");
    expect(notify).toContain("needs.sign.result == 'cancelled'");
    expect(code(notify)).toMatch(/permissions:\n\s+issues: write( #[^\n]*)?\n\s+steps:/);
    expect(code(notify)).not.toContain("secrets.");
  });

  it("pins every action to a 40-hex commit and grants no job contents: write", () => {
    for (const l of YANK.split("\n").filter((x) => /^\s*(- )?uses: /.test(x)))
      expect(l.split("uses: ")[1]).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    expect(code(YANK)).toContain("\npermissions: {}\n");
    expect(code(sign)).toMatch(/permissions:\n\s+contents: read( #[^\n]*)?\n\s+steps:/);
    // Top level, check (read), sign (write), notify (issues).
    expect(code(YANK).match(/permissions:/g)).toHaveLength(4);
    expect(code(YANK)).not.toContain("contents: write");
    expect(code(sign)).toContain("environment: release-yank");
  });

  it("hands the yank key to the Sign step only, installs only the verifier, never force-pushes", () => {
    expect(code(YANK).match(/secrets\.RELEASE_YANK_KEY/g)).toHaveLength(1);
    expect(step(sign, "Sign")).toContain(`RELEASE_YANK_KEY: ${gha("secrets.RELEASE_YANK_KEY")}`);
    // The deploy key (the ruleset's only bypass) reaches the Publish step only, over pinned SSH.
    expect(code(YANK).match(/secrets\.YANK_LIST_DEPLOY_KEY/g)).toHaveLength(1);
    const publish = step(sign, "Publish to the yank-list branch");
    expect(publish).toContain(`YANK_LIST_DEPLOY_KEY: ${gha("secrets.YANK_LIST_DEPLOY_KEY")}`);
    expect(publish).toContain("StrictHostKeyChecking=yes");
    expect(code(sign)).not.toContain("github.token");
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
    // --name=value: a value starting with "-" is never read as a flag.
    for (const flag of ["yank", "revoke", "reason"])
      expect(step(sign, "Sign")).toContain(`args+=("--${flag}=$${flag.toUpperCase()}")`);
    for (const script of runs(code(job(YANK, "notify")))) expect(script).not.toContain(OPEN);
  });
});

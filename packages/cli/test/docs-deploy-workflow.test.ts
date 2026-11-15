/**
 * .github/workflows/docs-deploy.yml (RFC-0037, #236): a push to main that touches what cloudhal.dev
 * is built from deploys it, with the least it needs: pinned actions, a read-only token, the
 * Cloudflare token in the `docs-deploy` environment and in the deploy step only (after the
 * install), one deploy at a time, and a skip with a notice while the secret is missing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  code,
  DOCS,
  gha,
  job,
  OPEN,
  ROOT,
  runs,
  step,
} from "./fixtures/release-bundle/workflow-text.ts";

describe("the Docs deploy workflow", () => {
  const deploy = job(DOCS, "deploy");

  it("runs on pushes to main that touch what the site is built from, and by hand", () => {
    expect(code(DOCS)).toContain("    branches: [main]");
    for (const p of [
      "apps/docs/**",
      "docs/**",
      "packages/core-contracts/schemas/**",
      "packages/cli/src/cli/help.ts",
      "security/**",
      "pnpm-lock.yaml",
      ".github/workflows/docs-deploy.yml",
    ])
      expect(code(DOCS)).toContain(`      - "${p}"`);
    expect(code(DOCS)).toContain("  workflow_dispatch:");
  });

  it("follows what the docs build actually reads (so the paths cannot drift)", () => {
    const postbuild = readFileSync(path.join(ROOT, "apps/docs/scripts/postbuild.ts"), "utf8");
    expect(postbuild).toContain('"packages/core-contracts/schemas"');
    expect(postbuild).toContain('"security"');
    const reference = readFileSync(path.join(ROOT, "apps/docs/src/lib/reference.ts"), "utf8");
    expect(reference).toContain("packages/cli/src/cli/help.ts");
  });

  it("pins every action to a 40-hex commit, grants contents: read, and runs one deploy at a time", () => {
    for (const l of DOCS.split("\n").filter((x) => /^\s*(- )?uses: /.test(x)))
      expect(l.split("uses: ")[1]).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    expect(code(DOCS)).toContain("\npermissions: {}\n");
    expect(code(deploy)).toMatch(/permissions:\n\s+contents: read\n/);
    expect(code(DOCS)).not.toMatch(/: write/);
    expect(code(DOCS)).toMatch(/concurrency:\n\s+group: docs-deploy\n\s+cancel-in-progress: false/);
    expect(code(deploy)).toContain("if: github.repository == 'cloudhal-dev/cloudhal'");
    expect(code(deploy)).toContain("name: docs-deploy");
  });

  it("hands the Cloudflare token to the deploy step only, after the install", () => {
    expect(code(DOCS).match(/secrets\.CLOUDFLARE_API_TOKEN \}\}/g)).toHaveLength(1);
    const build = step(deploy, "Build and deploy");
    expect(build).toContain(`CLOUDFLARE_API_TOKEN: ${gha("secrets.CLOUDFLARE_API_TOKEN")}`);
    expect(build).toContain(`CLOUDFLARE_ACCOUNT_ID: ${gha("vars.CLOUDFLARE_ACCOUNT_ID")}`);
    expect(runs(build).join("\n")).toBe("pnpm --filter @cloudhal/docs run deploy");
    expect(code(deploy).indexOf("pnpm install --frozen-lockfile")).toBeLessThan(
      code(deploy).indexOf("CLOUDFLARE_API_TOKEN: "),
    );
    expect(step(deploy, "Install")).not.toContain("CLOUDFLARE");
    for (const script of runs(code(deploy))) expect(script).not.toContain(OPEN);
    expect(code(deploy)).toContain("persist-credentials: false");
  });

  it("skips with a notice while the secret or the account id is missing", () => {
    const check = step(deploy, "Is the Cloudflare token configured");
    expect(check).toContain("secrets.CLOUDFLARE_API_TOKEN != ''");
    expect(check).toContain("::notice::");
    for (const name of ["Install", "Build and deploy"])
      expect(step(deploy, name)).toContain("if: steps.token.outputs.ready == 'true'");
  });
});

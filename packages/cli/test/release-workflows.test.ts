/**
 * Text checks of the release workflows (RFC-0046 §4–§6), with no YAML dependency (see
 * fixtures/release-bundle/workflow-text.ts). release-bundle-sign.test.ts runs bundle-sign's inline
 * scripts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_KEY } from "../../../scripts/publish-ci.ts";
import {
  BUILD,
  block,
  blockAt,
  code,
  gha,
  job,
  OPEN,
  RELEASE,
  ROOT,
  runs,
  step,
} from "./fixtures/release-bundle/workflow-text.ts";

const KEYS_DOC = readFileSync(path.join(ROOT, "docs/security/release-signing-keys.md"), "utf8");

const permissions = (jobText: string) =>
  block(jobText, jobText.split("\n").find((l) => l.trim() === "permissions:") as string)
    .split("\n")
    .slice(1)
    .map((l) => l.trim().replace(/ #.*$/, ""))
    .filter(Boolean)
    .sort();

describe("release workflows: pins, permissions, secrets", () => {
  it("pins every action to a 40-hex commit with its version", () => {
    for (const text of [RELEASE, BUILD])
      for (const l of text.split("\n").filter((x) => /^\s*(- )?uses: /.test(x))) {
        const ref = l.split("uses: ")[1] as string;
        if (ref.startsWith("./.github/workflows/")) continue;
        expect(ref).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/);
      }
  });

  it("grants nothing at the top and each job only what it needs", () => {
    expect(RELEASE).toMatch(/^permissions: \{\}$/m);
    expect(BUILD).toMatch(/^permissions: \{\}$/m);
    expect(permissions(job(BUILD, "build"))).toEqual([
      "attestations: write",
      "contents: read",
      "id-token: write",
    ]);
    expect(permissions(job(RELEASE, "bundle"))).toEqual([
      "attestations: write",
      "contents: read",
      "id-token: write",
    ]);
    expect(permissions(job(RELEASE, "bundle-sign"))).toEqual([
      "actions: read",
      "attestations: read",
      "contents: read",
    ]);
    expect(permissions(job(RELEASE, "publish"))).toEqual(["contents: write", "id-token: write"]);
  });

  it("the build workflow holds no secret; the signing key reaches the sign step only", () => {
    expect(code(BUILD)).not.toContain("secrets.");
    const sign = step(job(RELEASE, "bundle-sign"), "Sign the statement");
    expect(sign).toContain(
      `RELEASE_SIGNING_KEY: ${gha("needs.plan.outputs.dry_run != 'true' && secrets.RELEASE_SIGNING_KEY || ''")}`,
    );
    const outside = code(RELEASE).replace(sign, "");
    expect(outside).not.toContain("RELEASE_SIGNING_KEY");
    expect(code(RELEASE).match(/secrets\.RELEASE_SIGNING_KEY/g)).toHaveLength(1);
  });

  it("never expands an expression inside a shell or script body", () => {
    expect(runs(RELEASE).length).toBeGreaterThan(8);
    expect(runs(BUILD).some((b) => b.includes("release-bundle.ts build"))).toBe(true);
    for (const text of [RELEASE, BUILD])
      for (const body of runs(text)) expect(body).not.toContain(OPEN);
  });

  it("checks out without persisted credentials", () => {
    for (const text of [RELEASE, BUILD]) {
      const lines = text.split("\n");
      const checkouts = lines.flatMap((l, i) => (l.includes("uses: actions/checkout@") ? [i] : []));
      expect(checkouts.length).toBeGreaterThan(0);
      for (const i of checkouts) expect(blockAt(lines, i)).toContain("persist-credentials: false");
    }
  });
});

describe("release.yml jobs", () => {
  it("keeps the workflow name and the npm-publish environment npm trusted publishing names", () => {
    expect(RELEASE.startsWith("name: Release\n")).toBe(true);
    expect(job(RELEASE, "publish")).toContain("environment:\n      name: npm-publish");
  });

  it("orders bundle → bundle-sign → publish → template and docker", () => {
    expect(job(RELEASE, "bundle")).toContain("uses: ./.github/workflows/bundle-build.yml");
    expect(job(RELEASE, "bundle")).toContain(
      "vars.RELEASE_BUNDLES == 'true' || needs.plan.outputs.dry_run == 'true'",
    );
    expect(job(RELEASE, "bundle-sign")).toContain("needs: [plan, bundle]");
    expect(job(RELEASE, "publish")).toContain("needs: [plan, bundle-sign]");
    expect(job(RELEASE, "publish")).toContain("vars.RELEASE_BUNDLES != 'true'");
    // A cancelled run never starts publish (always() would, in the gap after plan).
    expect(job(RELEASE, "publish")).toContain("!cancelled() && needs.plan.result == 'success'");
    for (const j of ["template", "docker"]) {
      expect(job(RELEASE, j)).toContain("needs: [plan, publish]");
      expect(job(RELEASE, j)).toContain(
        "needs.publish.result == 'success' && needs.plan.outputs.dry_run != 'true'",
      );
    }
  });

  it("bundle-sign: protected environment, no checkout or package manager, attestation verified first", () => {
    const j = job(RELEASE, "bundle-sign");
    expect(j).toContain("environment: release-signing");
    expect(code(j)).not.toMatch(/\b(pnpm|npm|npx)\b|actions\/checkout/);
    const verifyStep = step(j, "Verify the build attestation");
    for (const flag of [
      "--repo cloudhal-dev/cloudhal",
      "--signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml",
      "--source-ref refs/heads/main",
      '--source-digest "$GITHUB_SHA"',
      "--deny-self-hosted-runners",
    ])
      expect(verifyStep).toContain(flag);
    for (const f of [
      '"bundle/cloudhal-release-$VERSION.tar.gz"',
      "bundle/manifest.json",
      "bundle/release-statement.json",
    ])
      expect(verifyStep).toContain(f);
    expect(j.indexOf("Verify the build attestation")).toBeLessThan(j.indexOf("Sign the statement"));
    expect(j.indexOf("Check the statement")).toBeLessThan(j.indexOf("Sign the statement"));
  });

  it("bundle-sign pins the key the security doc lists as active", () => {
    const row =
      /\| `(cloudhal-release-\d{4}[a-z])` \| Ed25519 \| `([A-Za-z0-9+/]{43}=)` \| active \|/.exec(
        KEYS_DOC,
      );
    expect(row).not.toBeNull();
    const sign = step(job(RELEASE, "bundle-sign"), "Sign the statement");
    expect(sign).toContain(`const PINNED_KEY_ID = "${row?.[1]}";`);
    expect(sign).toContain(`const PINNED_PUBLIC_KEY = "${row?.[2]}";`);
    expect(row?.[1]).toBe("cloudhal-release-2026a");
    expect(row?.[2]).toBe("7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=");
  });

  it("a dry run: no Changesets PR, the plan forced on, publish-ci --dry-run, no template or image", () => {
    expect(RELEASE).toContain("      dry_run:\n        description:");
    expect(job(RELEASE, "version")).toContain(
      "if: vars.RELEASE_ENABLED == 'true' && !inputs.dry_run",
    );
    expect(job(RELEASE, "plan")).toContain(
      `RELEASE_DRY_RUN: ${gha("inputs.dry_run && 'true' || 'false'")}`,
    );
    const publish = step(job(RELEASE, "publish"), "Publish");
    expect(publish).toContain('if [ "$DRY_RUN" = "true" ]; then args+=(--dry-run); fi');
    expect(publish).toContain("node scripts/publish-ci.ts");
    const publishCi = readFileSync(path.join(ROOT, "scripts/publish-ci.ts"), "utf8");
    // The flags come from the planner's npmFlags (release-publish-plan.test.ts), nothing else.
    expect(publishCi).toContain('sh("npm", ["publish", path.join(tarballs, tgz), ...flags]);');
    expect(publishCi.match(/"--(dry-run|provenance)"/g)).toBeNull();
  });

  it("a dry run's draft is deleted by an always() step, even when the job is cancelled", () => {
    const j = job(RELEASE, "publish");
    const clean = step(j, "Delete the dry run's draft");
    expect(j.indexOf("- name: Publish")).toBeLessThan(j.indexOf("Delete the dry run's draft"));
    expect(clean).toContain("if: always() && needs.plan.outputs.dry_run == 'true'");
    expect(clean).toContain(
      `TAG: v${gha("needs.plan.outputs.version")}-dryrun.${gha("github.run_number")}`,
    );
    // Drafts with exactly this run's tag name only: never a published release, never another run's.
    expect(clean).toContain("select(.draft and .tag_name == env.TAG) | .id");
    expect(runs(clean)[0]).toMatch(/gh api -X DELETE "repos\/\$GITHUB_REPOSITORY\/releases\/\$id"/);
  });

  it("publish-ci checks the signature with release.yml's pin, or the dry run's own key", () => {
    const sign = step(job(RELEASE, "bundle-sign"), "Sign the statement");
    const id = /const PINNED_KEY_ID = "([^"]+)";/.exec(sign)?.[1] as string;
    const pub = /const PINNED_PUBLIC_KEY = "([^"]+)";/.exec(sign)?.[1] as string;
    expect(RELEASE_KEY).toEqual({ [id]: pub });
    expect(sign).toContain("id: sign");
    expect(job(RELEASE, "bundle-sign")).toContain(
      `public_key: ${gha("steps.sign.outputs.public_key")}`,
    );
    expect(step(job(RELEASE, "publish"), "Publish")).toContain(
      `RELEASE_DRYRUN_PUBLIC_KEY: ${gha("needs.plan.outputs.dry_run == 'true' && needs.bundle-sign.outputs.public_key || ''")}`,
    );
  });

  it("a security release: the plan's flag reaches the build and bundle-sign checks it", () => {
    expect(job(RELEASE, "plan")).toContain(
      `security_release: ${gha("steps.plan.outputs.security_release")}`,
    );
    expect(job(RELEASE, "bundle")).toContain(
      `security_release: ${gha("needs.plan.outputs.security_release == 'true'")}`,
    );
    expect(job(RELEASE, "bundle-sign")).toContain(
      `SECURITY_RELEASE: ${gha("needs.plan.outputs.security_release")}`,
    );
  });
});

describe("bundle-build.yml", () => {
  it("is reusable with version and dry_run, builds the starter, attests three files, uploads four", () => {
    expect(BUILD).toMatch(
      /on:\n {2}workflow_call:\n {4}inputs:\n {6}version:[\s\S]*\n {6}dry_run:[\s\S]*\n {6}security_release:/,
    );
    const b = job(BUILD, "build");
    expect(b).toContain(`ref: ${gha("github.sha")}`);
    expect(b).toContain("pnpm install --frozen-lockfile");
    expect(b).not.toMatch(/cache: pnpm/);
    expect(b).toContain("node packages/cli/bin/cloudhal.ts init examples/release-std");
    expect(b).toContain("node ../../packages/cli/bin/cloudhal.ts deploy --dry-run");
    expect(b).toContain("node scripts/release-bundle.ts build");
    expect(b).toContain('key_id="dryrun-$RUN_ID"; else key_id="cloudhal-release-2026a"');
    expect(b).toContain(`SECURITY_RELEASE: ${gha("inputs.security_release")}`);
    expect(b).toContain(
      'if [ "$SECURITY_RELEASE" = "true" ]; then flags+=(--security-release); fi',
    );
    expect(b).toContain(['--out "$RUNNER_TEMP/release-bundle" "$', '{flags[@]}"'].join(""));
    const attest = b.slice(b.indexOf("uses: actions/attest-build-provenance@"));
    for (const f of [
      `cloudhal-release-${gha("inputs.version")}.tar.gz`,
      "release-bundle/manifest.json",
      "release-bundle/release-statement.json",
    ])
      expect(attest).toContain(f);
    expect(b).toContain("cloudhal-release-$VERSION.sigstore.json");
    expect(b).toContain(`name: release-bundle-unsigned-${gha("inputs.version")}`);
  });
});

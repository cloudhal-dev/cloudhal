import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isSecurityRelease,
  type Pkg,
  readPackages,
  releaseNotes,
  sharedVersion,
  unpublished,
} from "../../../scripts/release-plan.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = (name: string, version: string): Pkg => ({ dir: name, name, version });

describe("release plan", () => {
  it("the repo's publishable packages share one version (changesets fixed group)", () => {
    const pkgs = readPackages(ROOT);
    expect(pkgs).toHaveLength(14);
    expect(sharedVersion(pkgs)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("refuses packages at different versions", () => {
    expect(() => sharedVersion([pkg("a", "0.3.4"), pkg("b", "0.3.5")])).toThrow(
      /a@0\.3\.4, b@0\.3\.5/,
    );
  });

  it("lists what npm lacks, keeping publish order", async () => {
    const onNpm = async (name: string) => name === "b";
    const missing = await unpublished(
      [pkg("a", "1.0.0"), pkg("b", "1.0.0"), pkg("c", "1.0.0")],
      onNpm,
    );
    expect(missing.map((p) => p.name)).toEqual(["a", "c"]);
  });

  it("builds one set of notes: entries once, no dependency noise, no hashes", () => {
    const api = [
      "# @cloudhal/api",
      "",
      "## 0.3.5",
      "",
      "### Patch Changes",
      "",
      "- abc1234: Agent keys work as Bearer.",
      "  Second line of the entry.",
      "- Updated dependencies [abc1234]",
      "  - @cloudhal/mcp-server@0.3.5",
      "",
      "## 0.3.4",
      "",
      "- def5678: Older entry.",
    ].join("\n");
    const cli = [
      "# @cloudhal/cli",
      "",
      "## 0.3.5",
      "",
      "- 9999999: New projects exempt pnpm's release age.",
      "- Updated dependencies [abc1234]",
      "- @cloudhal/core-contracts@0.3.5",
      "  - @cloudhal/storage@0.3.5",
    ].join("\n");
    const notes = releaseNotes([api, cli, api], "0.3.5");
    expect(notes).toContain("- Agent keys work as Bearer.\n  Second line of the entry.");
    expect(notes).toContain("- New projects exempt pnpm's release age.");
    expect(notes.match(/Agent keys work as Bearer/g)).toHaveLength(1);
    expect(notes).not.toContain("Updated dependencies");
    expect(notes).not.toContain("@cloudhal/core-contracts@0.3.5");
    expect(notes).not.toContain("Older entry");
    expect(notes).toContain("npm install @cloudhal/cli@0.3.5");
  });

  it("says so when a release only moves dependencies", () => {
    expect(releaseNotes(["## 0.3.6\n\n- Updated dependencies [x]"], "0.3.6")).toContain(
      "- Dependency updates only.",
    );
  });

  it("a changeset that starts with **Security release.** marks only its own version", () => {
    const cli = [
      "# @cloudhal/cli",
      "",
      "## 0.8.1",
      "",
      "### Patch Changes",
      "",
      "- 1a2b3c4: **Security release.** The setup token is required on the Node path too.",
      "- Updated dependencies [1a2b3c4]",
      "",
      "## 0.8.0",
      "",
      "- 5d6e7f8: A feature.",
      "",
    ].join("\n");
    const api = "# @cloudhal/api\n\n## 0.8.1\n\n- Updated dependencies [1a2b3c4]\n";
    expect(isSecurityRelease([api, cli], "0.8.1")).toBe(true);
    expect(isSecurityRelease([api, cli], "0.8.0")).toBe(false);
    // Prose that mentions security, or the marker inside an entry, is not the flag.
    const prose =
      "# x\n\n## 0.8.2\n\n- abcdef1: **Security (self-hosting).** Fixed.\n- See **Security release.** notes.\n";
    expect(isSecurityRelease([prose], "0.8.2")).toBe(false);
    expect(isSecurityRelease([], "0.8.1")).toBe(false);
  });
});

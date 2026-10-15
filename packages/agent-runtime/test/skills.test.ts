import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSkill, loadSkills, parseFrontmatter, SkillError } from "../src/skills.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const OFFICIAL = path.resolve(here, "../../../skills/official");

describe("skill loader", () => {
  it("parses the six spec fields and a flat metadata map", () => {
    const { frontmatter, body } = parseFrontmatter(
      '---\nname: x\ndescription: "Does x."\nmetadata:\n  cloudhal.scopes: "a,b"\n---\n# X\nbody',
    );
    expect(frontmatter).toEqual({
      name: "x",
      description: "Does x.",
      metadata: { "cloudhal.scopes": "a,b" },
    });
    expect(body.trim()).toBe("# X\nbody");
    expect(() => parseFrontmatter("no frontmatter")).toThrow(SkillError);
  });

  it("loads the official skills with valid manifests", async () => {
    const skills = await loadSkills(OFFICIAL);
    expect(skills.map((s) => s.manifest.name)).toEqual([
      "comment-triage",
      "publish-article",
      "rollback",
      "safe-edit",
      "site-bootstrap",
      "site-design",
      "stale-review",
    ]);
    const publish = skills.find(
      (s) => s.manifest.name === "publish-article",
    ) as (typeof skills)[number];
    expect(publish.cloudhal.scopes).toContain("site:publish");
    expect(publish.cloudhal.approval).toEqual(["publish", "schedule_release"]);
    // RFC-0008: scheduling is a release a person approves once; the agent never polls
    expect(publish.cloudhal.scopes).toContain("schedules:write");
    expect(await publish.body()).toContain("schedule_release");
    expect(await publish.body()).toMatch(/do not poll/i);
    // RFC-0008 §11.4: the triage skill reads visitor text, so it holds no write scope
    const triage = skills.find(
      (s) => s.manifest.name === "comment-triage",
    ) as (typeof skills)[number];
    for (const scope of triage.cloudhal.scopes)
      expect(scope).not.toMatch(/^(content:write|site:publish|schedules:write|releases:publish)/);
    expect(triage.cloudhal.scopes).toContain("comments:moderate");
    const review = skills.find(
      (s) => s.manifest.name === "stale-review",
    ) as (typeof skills)[number];
    expect(review.cloudhal.scopes).not.toContain("site:publish");
    expect(await review.body()).toContain("propose_release");
    expect(await publish.references()).toEqual(["editorial-checklist.md"]);
    expect((await publish.body()).length).toBeGreaterThan(200);
    // RFC-0002: articles are filed under existing terms, never free tags
    expect(await publish.body()).toContain("list_taxonomies");
    expect(await publish.reference("editorial-checklist.md")).toContain("propose_term");
    const edit = skills.find((s) => s.manifest.name === "safe-edit") as (typeof skills)[number];
    expect(await edit.references()).toEqual(["retagging.md"]);
    expect(edit.cloudhal.scopes).not.toContain("site:write");
    const bootstrap = skills.find(
      (s) => s.manifest.name === "site-bootstrap",
    ) as (typeof skills)[number];
    expect(bootstrap.cloudhal.approval).toEqual([]);
  });

  it("rejects a skill whose name does not match its directory", async () => {
    await expect(loadSkill(path.join(here, "fixtures", "wrong-name"))).rejects.toThrow(
      /must match directory/,
    );
  });
});

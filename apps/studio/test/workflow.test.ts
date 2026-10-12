import { describe, expect, it } from "vitest";
import { canTransition, needsApproval, slugify, TRANSITIONS } from "../src/lib/workflow.ts";

describe("editorial workflow", () => {
  it("follows draft → review → published and back", () => {
    expect(canTransition("draft", "review")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("review", "published")).toBe(true);
    expect(canTransition("published", "draft")).toBe(true);
    expect(Object.keys(TRANSITIONS)).toEqual(["draft", "review", "published", "archived"]);
  });
  it("only publishing needs approval", () => {
    expect(needsApproval("published")).toBe(true);
    expect(needsApproval("review")).toBe(false);
  });
  it("slugify matches the Slug contract", () => {
    for (const s of ["Hello, World!", "Çağrı Merkezi", "  spaces  ", ""])
      expect(slugify(s)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
});

import { describe, expect, it } from "vitest";
import {
  reclaimProblem,
  redirectTargetProblem,
  termCreation,
  termReviewProblem,
} from "../src/taxonomy.ts";

const agent = { kind: "agent" as const, id: "agent_writer0001" };
const other = { kind: "agent" as const, id: "agent_other00001" };
const person = { kind: "human" as const, id: "user_owner000001" };

describe("taxonomy rules for agents (RFC-0002 §6.4)", () => {
  it("allowNewTerms decides what an agent's new term becomes; people always create active terms", () => {
    expect(termCreation(agent, "propose")).toEqual({ allowed: true, status: "proposed" });
    expect(termCreation(agent, "free")).toEqual({ allowed: true, status: "active" });
    expect(termCreation(agent, "none")).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/ask a person/),
    });
    for (const rule of ["none", "propose", "free"] as const)
      expect(termCreation(person, rule)).toEqual({ allowed: true, status: "active" });
  });

  it("agents redirect to site paths only", () => {
    expect(redirectTargetProblem(agent, "/tag/llm")).toBeUndefined();
    expect(redirectTargetProblem(agent, "/posts/new?ref=old#top")).toBeUndefined();
    for (const to of ["https://evil.example/", "//evil.example", "/\\evil.example", "posts/x"])
      expect(redirectTargetProblem(agent, to)).toMatch(/path on this site/);
    expect(redirectTargetProblem(person, "https://partner.example/")).toBeUndefined();
  });

  it("an agent never approves its own proposal, and only people reclaim slugs", () => {
    const mine = { proposedBy: agent };
    expect(termReviewProblem(agent, mine, "approve")).toMatch(/cannot approve a term it proposed/);
    expect(termReviewProblem(agent, mine, "reject")).toBeUndefined();
    expect(termReviewProblem(agent, mine, "merge")).toBeUndefined();
    expect(termReviewProblem(other, mine, "approve")).toBeUndefined();
    expect(termReviewProblem(person, mine, "approve")).toBeUndefined();
    expect(reclaimProblem(agent)).toMatch(/people only/);
    expect(reclaimProblem(person)).toBeUndefined();
  });
});

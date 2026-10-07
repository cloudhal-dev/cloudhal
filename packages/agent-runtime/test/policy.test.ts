import { describe, expect, it } from "vitest";
import { defaultScopes, PolicyEngine, type ToolPolicy } from "../src/policy.ts";

const tools: ToolPolicy[] = [
  {
    name: "get_page",
    scopes: ["content:read"],
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "update_page",
    scopes: ["content:write"],
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  { name: "publish", scopes: ["site:publish"], annotations: { destructiveHint: true } },
  { name: "delete_page", scopes: ["content:write"], annotations: { destructiveHint: true } },
];
const engine = new PolicyEngine(tools);
const human = { kind: "human" as const, id: "user_test000001" };
const agent = { kind: "agent" as const, id: "agent_test00001" };

describe("PolicyEngine", () => {
  it("humans with * can read and write; destructive tools still need approval", () => {
    const p = { actor: human, scopes: defaultScopes(human) };
    expect(engine.evaluate(p, "get_page")).toEqual({ kind: "allow" });
    expect(engine.evaluate(p, "update_page")).toEqual({ kind: "allow" });
    expect(engine.evaluate(p, "publish").kind).toBe("approval-required");
    expect(engine.evaluate(p, "publish", { confirmed: true })).toEqual({ kind: "allow" });
  });

  it("agents get content scopes but not publish", () => {
    const p = { actor: agent, scopes: defaultScopes(agent) };
    expect(engine.evaluate(p, "update_page")).toEqual({ kind: "allow" });
    expect(engine.evaluate(p, "publish")).toMatchObject({
      kind: "deny",
      reason: "missing scope site:publish",
    });
    expect(engine.evaluate(p, "delete_page").kind).toBe("approval-required");
  });

  it("a declared skill narrows what the agent may call and can add approvals", () => {
    const p = {
      actor: agent,
      scopes: ["*"] as const,
      skill: {
        name: "safe-edit",
        scopes: ["site:read", "content:read", "content:write"],
        approval: ["update_page"],
      },
    };
    expect(engine.evaluate({ ...p, scopes: ["*"] }, "update_page").kind).toBe("approval-required");
    expect(engine.evaluate({ ...p, scopes: ["*"] }, "publish")).toMatchObject({ kind: "deny" });
  });

  it("unknown tools are denied", () => {
    expect(engine.evaluate({ actor: human, scopes: ["*"] }, "nope")).toMatchObject({
      kind: "deny",
    });
  });
});

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

  it("asset:manage implies asset:upload (RFC-0004 §6.2, ADR-0018)", () => {
    const media = new PolicyEngine([
      { name: "upload_asset", scopes: ["asset:upload"], annotations: { readOnlyHint: false } },
      { name: "retire_asset", scopes: ["asset:manage"], annotations: { readOnlyHint: false } },
    ]);
    const uploader = { actor: agent, scopes: defaultScopes(agent) };
    expect(uploader.scopes).toContain("asset:upload");
    expect(media.evaluate(uploader, "upload_asset")).toEqual({ kind: "allow" });
    expect(media.evaluate(uploader, "retire_asset")).toMatchObject({
      kind: "deny",
      reason: "missing scope asset:manage",
    });
    const manager = { actor: agent, scopes: ["asset:manage" as const] };
    expect(media.evaluate(manager, "upload_asset")).toEqual({ kind: "allow" });
    expect(media.evaluate(manager, "retire_asset")).toEqual({ kind: "allow" });
  });

  it("analytics:read: read-only tools allowed in every mode, plan included (RFC-0006 §9.3)", () => {
    const analytics = new PolicyEngine([
      {
        name: "get_analytics",
        scopes: ["analytics:read"],
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      },
    ]);
    expect(defaultScopes(agent)).toContain("analytics:read");
    for (const mode of ["plan", "manual", "edits", "auto"] as const)
      expect(
        analytics.evaluate({ actor: agent, scopes: ["analytics:read"], mode }, "get_analytics"),
      ).toEqual({ kind: "allow" });
    expect(
      analytics.evaluate({ actor: agent, scopes: ["site:read", "content:read"] }, "get_analytics"),
    ).toMatchObject({ kind: "deny", reason: "missing scope analytics:read" });
  });

  it("unknown tools are denied", () => {
    expect(engine.evaluate({ actor: human, scopes: ["*"] }, "nope")).toMatchObject({
      kind: "deny",
    });
  });
});

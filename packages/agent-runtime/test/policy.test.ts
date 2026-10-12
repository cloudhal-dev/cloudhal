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

  describe("call classes (RFC-0007 §10.2)", () => {
    const comments = new PolicyEngine([
      {
        name: "list_comments",
        scopes: ["comments:read"],
        annotations: { readOnlyHint: true },
      },
      {
        name: "label_comments",
        scopes: ["comments:moderate"],
        annotations: { readOnlyHint: false },
        own: "comment",
        classify: () => "advisory",
      },
      {
        name: "moderate_comments",
        scopes: ["comments:moderate"],
        annotations: { readOnlyHint: false, destructiveHint: false },
        own: "comment",
        classify: (a) => (a.action === "approve" ? "person" : "reduce"),
      },
    ]);
    const key = (mode: "plan" | "manual" | "edits" | "auto" | "bypass", local = false) => ({
      actor: agent,
      scopes: ["comments:read", "comments:moderate"] as ("comments:read" | "comments:moderate")[],
      mode,
      local,
    });
    const hide = { args: { action: "hide" } };
    const approve = { args: { action: "approve" } };

    it("read is free everywhere; plan refuses every other class", () => {
      for (const mode of ["plan", "manual", "edits", "auto"] as const)
        expect(comments.evaluate(key(mode), "list_comments")).toEqual({ kind: "allow" });
      for (const tool of ["label_comments", "moderate_comments"])
        expect(comments.evaluate(key("plan"), tool, hide)).toMatchObject({
          kind: "deny",
          code: "mode",
        });
    });

    it("advisory is free from manual up; reduce waits only in manual", () => {
      for (const mode of ["manual", "edits", "auto"] as const)
        expect(comments.evaluate(key(mode), "label_comments")).toEqual({ kind: "allow" });
      expect(comments.evaluate(key("manual"), "moderate_comments", hide)).toMatchObject({
        kind: "approval-required",
        cause: "manual-mode",
      });
      for (const mode of ["edits", "auto"] as const)
        expect(comments.evaluate(key(mode), "moderate_comments", hide)).toEqual({ kind: "allow" });
      expect(comments.evaluate(key("bypass", true), "moderate_comments", hide)).toEqual({
        kind: "allow",
      });
    });

    it("person waits in every mode, bypass included, and for people over MCP", () => {
      for (const p of [key("manual"), key("edits"), key("auto"), key("bypass", true)])
        expect(comments.evaluate(p, "moderate_comments", approve)).toMatchObject({
          kind: "approval-required",
          cause: "tool",
        });
      expect(
        comments.evaluate({ actor: human, scopes: ["*"] }, "moderate_comments", approve),
      ).toMatchObject({ kind: "approval-required", cause: "tool" });
      // the person's own answer (or a decided approval) lets it run
      expect(
        comments.evaluate(key("edits"), "moderate_comments", { ...approve, confirmed: true }),
      ).toEqual({ kind: "allow" });
    });

    it("own variants satisfy the tool with a comment limit", () => {
      const author = {
        actor: agent,
        scopes: ["comments:moderate:own" as const],
        mode: "edits" as const,
      };
      expect(comments.evaluate(author, "moderate_comments", hide)).toEqual({
        kind: "allow",
        limit: { level: "own", target: "comment" },
      });
      expect(
        comments.evaluate({ actor: agent, scopes: ["comments:read"] }, "label_comments"),
      ).toMatchObject({ kind: "deny", code: "missing_scope" });
    });
  });

  it("unknown tools are denied", () => {
    expect(engine.evaluate({ actor: human, scopes: ["*"] }, "nope")).toMatchObject({
      kind: "deny",
    });
  });
});

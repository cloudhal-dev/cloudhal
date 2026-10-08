import { describe, expect, it } from "vitest";
import {
  checkAutoPublish,
  describeAutoCheck,
  effectiveMode,
  PolicyEngine,
  type Principal,
  scopesForMode,
  type ToolPolicy,
} from "../src/index.ts";

const tools: ToolPolicy[] = [
  { name: "get_page", scopes: ["content:read"], annotations: { readOnlyHint: true } },
  { name: "preview_page", scopes: ["preview:create"], annotations: { readOnlyHint: true } },
  { name: "update_entry", scopes: ["content:write"], annotations: { readOnlyHint: false } },
  { name: "delete_entry", scopes: ["content:write"], annotations: { destructiveHint: true } },
  {
    name: "publish",
    scopes: ["site:publish"],
    annotations: { destructiveHint: true },
    requiresApproval: true,
  },
  {
    name: "rollback",
    scopes: ["site:rollback"],
    annotations: { destructiveHint: true },
    requiresApproval: true,
  },
];
const engine = new PolicyEngine(tools);
const agent = (mode?: Principal["mode"], local = false): Principal => ({
  actor: { kind: "agent", id: "agent_modes00001" },
  scopes: ["*"],
  ...(mode ? { mode } : {}),
  ...(local ? { local } : {}),
});
const kinds = (p: Principal) =>
  Object.fromEntries(tools.map((t) => [t.name, engine.evaluate(p, t.name).kind]));

describe("agent modes", () => {
  it("plan: reads and previews only", () => {
    expect(kinds(agent("plan"))).toEqual({
      get_page: "allow",
      preview_page: "allow",
      update_entry: "deny",
      delete_entry: "deny",
      publish: "deny",
      rollback: "deny",
    });
  });

  it("manual: every change waits for a person", () => {
    expect(kinds(agent("manual"))).toEqual({
      get_page: "allow",
      preview_page: "allow",
      update_entry: "approval-required",
      delete_entry: "approval-required",
      publish: "approval-required",
      rollback: "approval-required",
    });
    expect(engine.evaluate(agent("manual"), "update_entry", { confirmed: true }).kind).toBe(
      "allow",
    );
  });

  it("edits (default): content is free, publish/rollback/delete need a person", () => {
    for (const p of [agent("edits"), agent()])
      expect(kinds(p)).toEqual({
        get_page: "allow",
        preview_page: "allow",
        update_entry: "allow",
        delete_entry: "approval-required",
        publish: "approval-required",
        rollback: "approval-required",
      });
  });

  it("auto: only publish may skip the person (when the caller finds it low risk)", () => {
    expect(engine.evaluate(agent("auto"), "publish")).toMatchObject({
      kind: "approval-required",
      autoApprove: "low-risk-publish",
    });
    expect(engine.evaluate(agent("auto"), "rollback")).not.toHaveProperty("autoApprove");
    expect(engine.evaluate(agent("auto"), "delete_entry")).not.toHaveProperty("autoApprove");
  });

  it("says why a person must decide", () => {
    const cause = (mode: Parameters<typeof agent>[0], tool: string) =>
      (engine.evaluate(agent(mode), tool) as { cause?: string }).cause;
    expect(cause("edits", "publish")).toBe("tool");
    expect(cause("auto", "rollback")).toBe("tool");
    expect(cause("edits", "delete_entry")).toBe("destructive");
    expect(cause("manual", "update_entry")).toBe("manual-mode");
    expect(cause("manual", "delete_entry")).toBe("destructive");
    expect(cause("edits", "update_entry")).toBeUndefined();
  });

  it("bypass works only locally; a remote key in bypass behaves like edits", () => {
    expect(Object.values(kinds(agent("bypass", true))).every((k) => k === "allow")).toBe(true);
    expect(kinds(agent("bypass"))).toEqual(kinds(agent("edits")));
    expect(effectiveMode(agent("bypass"))).toBe("edits");
    expect(
      effectiveMode({
        actor: { kind: "human", id: "user_x00000001" },
        scopes: ["*"],
        mode: "bypass",
      }),
    ).toBeUndefined();
  });

  it("a mode never grants scopes", () => {
    const narrow: Principal = { ...agent("bypass", true), scopes: ["content:read"] };
    expect(engine.evaluate(narrow, "publish")).toMatchObject({
      kind: "deny",
      reason: "missing scope site:publish",
    });
  });

  it("suggests scopes per mode and defines low-risk publishes", () => {
    expect(scopesForMode("plan")).toEqual(["site:read", "content:read", "preview:create"]);
    expect(scopesForMode("auto")).toContain("site:publish");
    const entry = (id: string) => ({ id, kind: "contentEntry" });
    const check = (diff: Parameters<typeof checkAutoPublish>[0]) => {
      const c = checkAutoPublish(diff);
      return { code: c.code, lowRisk: c.lowRisk, changes: c.changes, text: describeAutoCheck(c) };
    };
    expect(check({ added: [entry("e1")], changed: [{ after: entry("e2") }], removed: [] })).toEqual(
      { code: "low-risk", lowRisk: true, changes: 2, text: "2 article change(s) only" },
    );
    expect(check({ added: [], changed: [], removed: [entry("e1")] })).toEqual({
      code: "removes-content",
      lowRisk: false,
      changes: 1,
      text: "it removes content",
    });
    expect(check({ added: [{ id: "p", kind: "page" }], changed: [], removed: [] }).code).toBe(
      "structure",
    );
    expect(
      check({
        added: Array.from({ length: 21 }, (_, i) => entry(`e${i}`)),
        changed: [],
        removed: [],
      }),
    ).toMatchObject({ code: "too-many", lowRisk: false, text: "it changes more than 20 articles" });
    expect(check({ added: [], changed: [], removed: [] }).code).toBe("nothing");
  });
});

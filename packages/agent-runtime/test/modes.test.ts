import { describe, expect, it } from "vitest";
import {
  activeElevation,
  checkAutoPublish,
  describeAutoCheck,
  effectiveMode,
  elevationProblem,
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
    expect(scopesForMode("plan")).toEqual([
      "site:read",
      "content:read",
      "preview:create",
      "analytics:read",
      "comments:read",
      "schedules:read",
      "content:propose",
    ]);
    expect(scopesForMode("auto")).toContain("site:publish");
    // RFC-0008 §10.1: schedules:read everywhere; manual and up may propose and ask
    expect(scopesForMode("plan")).not.toContain("schedules:write");
    for (const m of ["manual", "edits", "auto"] as const)
      expect(scopesForMode(m)).toContain("schedules:write");
    // RFC-0007 D2: new keys read comments in every mode, and nothing more about them
    for (const m of ["plan", "manual", "edits", "auto"] as const) {
      expect(scopesForMode(m)).toContain("comments:read");
      expect(scopesForMode(m)).not.toContain("comments:moderate");
    }
    // RFC-0006 §9.1: new keys read analytics in every mode
    for (const m of ["plan", "manual", "edits", "auto"] as const)
      expect(scopesForMode(m)).toContain("analytics:read");
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
    // taxonomy, term, redirect and menu changes wait for a person too (RFC-0002 §6.4, RFC-0003 §6.4)
    for (const kind of ["taxonomy", "term", "redirect", "menu"])
      expect(
        check({ added: [entry("e1")], changed: [{ after: { id: "x", kind } }], removed: [] }),
      ).toMatchObject({
        code: "structure",
        lowRisk: false,
        text: "it changes pages, menus, site settings, taxonomies or redirects",
      });
    expect(
      check({
        added: Array.from({ length: 21 }, (_, i) => entry(`e${i}`)),
        changed: [],
        removed: [],
      }),
    ).toMatchObject({ code: "too-many", lowRisk: false, text: "it changes more than 20 articles" });
    expect(check({ added: [], changed: [], removed: [] }).code).toBe("nothing");
    // RFC-0019 §2.4: an article that adds a correction is an editorial statement for a person
    const corrected = checkAutoPublish(
      { added: [entry("e1")], changed: [{ after: entry("e2") }], removed: [] },
      { corrections: new Set(["e2"]) },
    );
    expect(corrected).toMatchObject({ code: "correction", lowRisk: false, changes: 2 });
    expect(describeAutoCheck(corrected)).toBe("it adds a correction to a published article");
  });

  it("media rides along with its article only when the store says so (RFC-0004 §6.3)", () => {
    expect(scopesForMode("edits")).toContain("asset:upload");
    expect(scopesForMode("plan")).not.toContain("asset:upload");
    const entry = { id: "e1", kind: "contentEntry" };
    const photo = { id: "asset_photo01", kind: "asset" };
    const pdf = { id: "asset_paper01", kind: "asset" };
    const riding = new Set([photo.id]);
    const withPhoto = checkAutoPublish(
      { added: [entry, photo], changed: [], removed: [] },
      { ridingAssets: riding },
    );
    // The image does not count toward the limit; its article does.
    expect(withPhoto).toMatchObject({ code: "low-risk", lowRisk: true, changes: 1 });
    const withPdf = checkAutoPublish(
      { added: [entry, photo, pdf], changed: [], removed: [] },
      { ridingAssets: riding },
    );
    expect(withPdf).toMatchObject({ code: "media", lowRisk: false });
    expect(describeAutoCheck(withPdf)).toBe(
      "it adds or changes media that is not part of an article change",
    );
    // A metadata edit of an existing asset is never riding along.
    expect(
      checkAutoPublish(
        { added: [entry], changed: [{ after: photo }], removed: [] },
        { ridingAssets: riding },
      ).code,
    ).toBe("media");
    // Without the store's verdict, every asset waits.
    expect(checkAutoPublish({ added: [entry, photo], changed: [], removed: [] }).code).toBe(
      "media",
    );
    // Pages still count as structure first.
    expect(
      checkAutoPublish(
        { added: [photo, { id: "p", kind: "page" }], changed: [], removed: [] },
        { ridingAssets: riding },
      ).code,
    ).toBe("structure");
  });
});

describe("time-boxed elevation (ADR-0016)", () => {
  it("only accepts a more autonomous remote mode for a bounded time", () => {
    expect(elevationProblem("edits", "auto", 60)).toBeUndefined();
    expect(elevationProblem("plan", "manual", 5)).toBeUndefined();
    expect(elevationProblem("edits", "edits", 60)).toMatch(/more autonomous/);
    expect(elevationProblem("auto", "edits", 60)).toMatch(/more autonomous/);
    expect(elevationProblem("edits", "bypass", 60)).toMatch(/bypass is local only/);
    expect(elevationProblem("edits", "auto", 4)).toMatch(/between 5 and 1440/);
    expect(elevationProblem("edits", "auto", 1441)).toMatch(/between 5 and 1440/);
    expect(elevationProblem("edits", "auto", 1.5)).toMatch(/whole number/);
  });

  it("applies until it ends, and never below the key's own mode", () => {
    const e = {
      mode: "auto" as const,
      until: "2026-10-08T12:00:00.000Z",
      grantedBy: "user_owner1",
      grantedAt: "2026-10-08T11:00:00.000Z",
    };
    expect(activeElevation("edits", e, new Date("2026-10-08T11:59:59Z"))).toBe(e);
    expect(activeElevation("edits", e, new Date("2026-10-08T12:00:00Z"))).toBeUndefined();
    expect(activeElevation("auto", e, new Date("2026-10-08T11:30:00Z"))).toBeUndefined();
    expect(
      activeElevation("edits", { ...e, mode: "bypass" }, new Date("2026-10-08T11:30:00Z")),
    ).toBeUndefined();
    expect(activeElevation("edits", undefined, new Date())).toBeUndefined();
  });
});

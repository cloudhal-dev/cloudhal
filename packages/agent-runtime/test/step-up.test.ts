import { describe, expect, it } from "vitest";
import { scopesForMode } from "../src/modes.ts";
import { type PersonRef, PolicyEngine, type Principal, type Scope } from "../src/policy.ts";
import { narrow, type Role, roleScopes } from "../src/roles.ts";
import { forSite } from "../src/site-access.ts";
import { stepUpScopes } from "../src/step-up.ts";

const engine = new PolicyEngine([
  {
    name: "update_entry",
    scopes: ["content:write"],
    annotations: { readOnlyHint: false },
    own: "entry",
  },
  {
    name: "update_page",
    scopes: ["content:write"],
    annotations: { readOnlyHint: false },
  },
  {
    name: "publish",
    scopes: ["site:publish"],
    annotations: { destructiveHint: true },
    requiresApproval: true,
    own: "changeset",
  },
  {
    name: "edit_body",
    scopes: ["content:write"],
    annotations: { readOnlyHint: false },
    own: "entry",
    classify: (a) => (a.mode === "propose" ? "propose" : undefined),
    proposeScopes: ["content:read", "content:propose"],
  },
  { name: "audit_log", scopes: ["audit:read"], annotations: { readOnlyHint: true } },
]);

/** A token principal of RFC-0044 phase 2: an agent with a grant, its scopes the token's. */
const grant = (role: Role, scopes: Scope[], sites?: PersonRef["sites"]): Principal => ({
  actor: { kind: "agent", id: "agent_grant0001" },
  scopes,
  keyScopes: scopes,
  mode: "edits",
  grantId: "grant_0001",
  person: { id: "user_aaaaaaaa", userId: "u1", role, ...(sites ? { sites } : {}) },
});
const READ: Scope[] = ["site:read", "content:read"];

describe("stepUpScopes (RFC-0044 §1)", () => {
  it("reports what the denial lacks, from the policy engine", () => {
    expect(engine.evaluate(grant("editor", READ), "update_entry")).toMatchObject({
      kind: "deny",
      code: "missing_scope",
      missing: ["content:write"],
    });
    expect(stepUpScopes(engine, grant("editor", READ), "update_entry")).toEqual(["content:write"]);
    expect(stepUpScopes(engine, grant("editor", READ), "publish")).toEqual(["site:publish"]);
  });

  it("asks an Author for the own variant their role holds", () => {
    expect(stepUpScopes(engine, grant("author", READ), "update_entry")).toEqual([
      "content:write:own",
    ]);
    expect(stepUpScopes(engine, grant("author", READ), "publish")).toEqual(["site:publish:own"]);
    // A tool without `own` is not satisfied by an own variant: no challenge, no loop.
    expect(stepUpScopes(engine, grant("author", READ), "update_page")).toBeUndefined();
  });

  it("asks a Contributor for the draft variant, and nothing their role lacks", () => {
    expect(stepUpScopes(engine, grant("contributor", READ), "update_entry")).toEqual([
      "content:draft:own",
    ]);
    expect(stepUpScopes(engine, grant("contributor", READ), "publish")).toBeUndefined();
  });

  it("asks a propose call for proposeScopes, not the write it proposes", () => {
    const propose = { mode: "propose" };
    expect(stepUpScopes(engine, grant("editor", ["site:read"]), "edit_body", propose)).toEqual([
      "content:read",
      "content:propose",
    ]);
    // The same tool applying the change needs the write.
    expect(stepUpScopes(engine, grant("editor", READ), "edit_body", {})).toEqual(["content:write"]);
  });

  it("judges the member's role on the call's site, not the installation role", () => {
    const limited = grant("editor", READ, { site_a: "contributor", site_b: "editor" });
    expect(stepUpScopes(engine, limited, "update_entry", { siteId: "site_a" })).toEqual([
      "content:draft:own",
    ]);
    expect(stepUpScopes(engine, limited, "update_entry", { siteId: "site_b" })).toEqual([
      "content:write",
    ]);
    // The installation role (Editor) holds site:publish; the Contributor on site_a does not.
    expect(stepUpScopes(engine, limited, "publish", { siteId: "site_a" })).toBeUndefined();
    // A site the member cannot open: the handler answers not_found, never a challenge.
    expect(stepUpScopes(engine, limited, "update_entry", { siteId: "site_c" })).toBeUndefined();
  });

  it("asks only for what both the site role and the installation role give (no loop)", () => {
    // An installation Contributor who is an Editor on site_b: consent caps the token at the
    // Contributor's scopes, so asking for content:write would come back as content:draft:own.
    const contributor = grant("contributor", READ, { site_b: "editor" });
    const args = { siteId: "site_b" };
    const asked = stepUpScopes(engine, contributor, "update_entry", args);
    expect(asked).toEqual(["content:draft:own"]);
    // After consent (capped by the installation role) the call runs and nothing is asked again.
    const granted = narrow([...READ, ...(asked ?? [])], roleScopes("contributor"));
    const after = { ...contributor, scopes: granted, keyScopes: granted };
    expect(stepUpScopes(engine, after, "update_entry", args)).toBeUndefined();
    const onSite = forSite(after, "site_b");
    expect(onSite && engine.evaluate(onSite, "update_entry", { args })).toMatchObject({
      kind: "allow",
      limit: { level: "draft" },
    });
    // Publishing is neither role's to give on that site through a Contributor's consent.
    expect(stepUpScopes(engine, contributor, "publish", args)).toBeUndefined();
  });

  it("never challenges a call that would still be denied after consent", () => {
    // Plan mode: the token lacks content:write, but plan mode refuses the write anyway.
    const plan = { ...grant("editor", scopesForMode("plan")), mode: "plan" as const };
    expect(engine.evaluate(plan, "update_entry")).toMatchObject({ code: "missing_scope" });
    expect(stepUpScopes(engine, plan, "update_entry")).toBeUndefined();
    // ... while a propose call, which plan mode may make, is still challenged when it lacks scopes.
    expect(
      stepUpScopes(
        engine,
        { ...plan, scopes: ["site:read"], keyScopes: ["site:read"] },
        "edit_body",
        {
          mode: "propose",
        },
      ),
    ).toEqual(["content:read", "content:propose"]);
    // A declared skill that does not cover the tool's scope: the skill check would refuse it.
    const skilled = {
      ...grant("editor", READ),
      skill: { name: "reader", scopes: ["site:read", "content:read"], approval: [] },
    };
    expect(stepUpScopes(engine, skilled, "update_entry")).toBeUndefined();
    const covering = { ...skilled, skill: { ...skilled.skill, scopes: ["content:write"] } };
    expect(stepUpScopes(engine, covering, "update_entry")).toEqual(["content:write"]);
  });

  it("never asks for a person-only scope, and never for a call that is not a scope denial", () => {
    expect(stepUpScopes(engine, grant("administrator", READ), "audit_log")).toBeUndefined();
    const writer = grant("editor", [...READ, "content:write"]);
    expect(stepUpScopes(engine, writer, "update_entry")).toBeUndefined();
    expect(stepUpScopes(engine, { ...writer, mode: "plan" }, "update_entry")).toBeUndefined();
    expect(stepUpScopes(engine, grant("editor", READ), "no_such_tool")).toBeUndefined();
    const { person: _, ...anonymous } = grant("editor", READ);
    expect(stepUpScopes(engine, anonymous, "update_entry")).toBeUndefined();
  });
});

/** RFC-0005 §1–§5: the scope lattice, roles, narrowing, mode caps and the rank rule (I4, I5, I7, I12). */
import { describe, expect, it } from "vitest";
import {
  holds,
  implies,
  KEY_SCOPES,
  PERSON_SCOPES,
  PolicyEngine,
  type Principal,
  type Scope,
  type ToolPolicy,
  weakerScopes,
} from "../src/policy.ts";
import {
  abilities,
  clampMode,
  invitableRoles,
  inviteDefaultHours,
  inviteExpiryProblem,
  inviteProblem,
  modeCap,
  modesFor,
  narrow,
  ROLE_SCOPES,
  ROLES,
  type Role,
  rank,
  removalProblem,
  roleChangeProblem,
  roleScopes,
  scopesAboveRole,
} from "../src/roles.ts";
import { termCreation } from "../src/taxonomy.ts";

describe("scope lattice", () => {
  it("stronger scopes imply the weaker ones, transitively; * implies everything", () => {
    expect(implies("content:write", "content:write:own")).toBe(true);
    expect(implies("content:write", "content:draft:own")).toBe(true);
    expect(implies("content:write:own", "content:draft:own")).toBe(true);
    expect(implies("content:draft:own", "content:write:own")).toBe(false);
    expect(implies("site:publish", "site:publish:own")).toBe(true);
    expect(implies("asset:manage", "asset:upload")).toBe(true);
    expect(implies("members:manage", "members:invite")).toBe(true);
    expect(implies("*", "agents:manage")).toBe(true);
    expect(holds(["content:write"], "content:draft:own")).toBe(true);
    expect(holds(["content:write:own"], "content:write")).toBe(false);
  });

  it("person-only scopes are never key scopes (I7)", () => {
    for (const s of PERSON_SCOPES) expect(KEY_SCOPES).not.toContain(s);
    expect(KEY_SCOPES).not.toContain("*");
  });
});

describe("roles", () => {
  it("rank orders Owner > Administrator > Editor > Author > Contributor", () => {
    const ranks = ROLES.map(rank);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it("maps every role to the RFC table", () => {
    const has = (role: Role, s: Scope) => holds(roleScopes(role), s);
    const table: [Scope, Role[]][] = [
      ["site:read", ["contributor", "author", "editor", "administrator", "owner"]],
      ["content:draft:own", ["contributor", "author", "editor", "administrator", "owner"]],
      ["content:write:own", ["author", "editor", "administrator", "owner"]],
      ["content:write", ["editor", "administrator", "owner"]],
      ["site:publish:own", ["author", "editor", "administrator", "owner"]],
      ["site:publish", ["editor", "administrator", "owner"]],
      ["site:rollback", ["editor", "administrator", "owner"]],
      ["site:write", ["editor", "administrator", "owner"]],
      ["asset:upload", ["contributor", "author", "editor", "administrator", "owner"]],
      ["asset:manage", ["editor", "administrator", "owner"]],
      ["audit:read", ["editor", "administrator", "owner"]],
      ["members:invite", ["editor", "administrator", "owner"]],
      ["members:manage", ["administrator", "owner"]],
      ["site:settings", ["administrator", "owner"]],
      ["agents:manage", ["administrator", "owner"]],
      // RFC-0006 §9.1: Authors and above see analytics; Contributors do not in v1.
      ["analytics:read", ["author", "editor", "administrator", "owner"]],
      // RFC-0007 §10.1 (D6): Authors moderate and reply on their own entries, Editors and above
      // everywhere; emails only through `commenters:data` (Editor+); Contributors nothing.
      ["comments:read", ["author", "editor", "administrator", "owner"]],
      ["comments:moderate:own", ["author", "editor", "administrator", "owner"]],
      ["comments:moderate", ["editor", "administrator", "owner"]],
      ["comments:reply:own", ["author", "editor", "administrator", "owner"]],
      ["comments:reply", ["editor", "administrator", "owner"]],
      ["commenters:data", ["editor", "administrator", "owner"]],
      // RFC-0008 §10.2: everyone reads the schedule; Contributors and Authors schedule their own
      // nodes; Authors approve their own releases; Editors and above everything, automations too.
      ["schedules:read", ["contributor", "author", "editor", "administrator", "owner"]],
      ["schedules:write:own", ["contributor", "author", "editor", "administrator", "owner"]],
      ["schedules:write", ["editor", "administrator", "owner"]],
      ["releases:publish:own", ["author", "editor", "administrator", "owner"]],
      ["releases:publish", ["editor", "administrator", "owner"]],
      ["automations:manage", ["editor", "administrator", "owner"]],
    ];
    for (const [scope, roles] of table)
      for (const role of ROLES)
        expect(has(role, scope), `${role} ${scope}`).toBe(roles.includes(role));
    // Administrator holds every non-wildcard scope; only the Owner holds `*`.
    for (const s of [...KEY_SCOPES, ...PERSON_SCOPES])
      expect(holds(roleScopes("administrator"), s)).toBe(true);
    expect(ROLE_SCOPES.owner).toEqual(["*"]);
    expect(ROLE_SCOPES.administrator).not.toContain("*");
  });

  it("caps key modes: Contributors at edits, everyone else at auto (never bypass)", () => {
    expect(modeCap("contributor")).toBe("edits");
    for (const r of ["author", "editor", "administrator", "owner"] as const)
      expect(modeCap(r)).toBe("auto");
    expect(modesFor("contributor")).toEqual(["plan", "manual", "edits"]);
    expect(modesFor("owner")).toEqual(["plan", "manual", "edits", "auto"]);
    expect(clampMode("auto", "edits")).toBe("edits");
    expect(clampMode("plan", "edits")).toBe("plan");
  });

  it("abilities follow scopes; only the Owner transfers ownership", () => {
    const author = abilities("author", roleScopes("author"));
    expect(author["publish.own"]).toBe(true);
    expect(author["publish.any"]).toBe(false);
    expect(author["ownership.transfer"]).toBe(false);
    expect(abilities("owner", ["*"])["ownership.transfer"]).toBe(true);
    expect(abilities("administrator", roleScopes("administrator"))["ownership.transfer"]).toBe(
      false,
    );
    // RFC-0006: analytics for Authors and above, its settings for Administrators and above.
    expect(author["analytics.read"]).toBe(true);
    expect(author["analytics.settings"]).toBe(false);
    expect(abilities("contributor", roleScopes("contributor"))["analytics.read"]).toBe(false);
    const admin = abilities("administrator", roleScopes("administrator"));
    expect(admin["analytics.read"] && admin["analytics.settings"]).toBe(true);
    expect(abilities("editor", roleScopes("editor"))["analytics.settings"]).toBe(false);
    // RFC-0007: Authors moderate their own entries' comments; Editors any, and see emails.
    expect(author["comments.read"] && author["comments.moderate"] && author["comments.reply"]).toBe(
      true,
    );
    expect(author["comments.moderateAny"] || author["commenters.data"]).toBe(false);
    const editor = abilities("editor", roleScopes("editor"));
    expect(editor["comments.moderateAny"] && editor["commenters.data"]).toBe(true);
    expect(editor["comments.settings"]).toBe(false);
    expect(admin["comments.settings"]).toBe(true);
    const contributor = abilities("contributor", roleScopes("contributor"));
    expect(contributor["comments.read"] || contributor["comments.moderate"]).toBe(false);
  });

  it("narrows comment scopes on an Author's key to the own variants; emails never on a key", () => {
    expect(
      narrow(["comments:read", "comments:moderate", "comments:reply"], roleScopes("author")),
    ).toEqual(["comments:read", "comments:moderate:own", "comments:reply:own"]);
    expect(narrow(["comments:moderate"], roleScopes("contributor"))).toEqual([]);
    expect(narrow(["commenters:data", "*"], roleScopes("editor"))).not.toContain("commenters:data");
  });
});

describe("narrow (I5)", () => {
  it("keeps what the role holds, else the strongest weaker variant, else drops it", () => {
    expect(narrow(["content:write", "site:publish"], roleScopes("author"))).toEqual([
      "content:write:own",
      "site:publish:own",
    ]);
    expect(
      narrow(
        ["site:read", "content:read", "content:write", "site:publish", "site:rollback"],
        roleScopes("contributor"),
      ),
    ).toEqual(["site:read", "content:read", "content:draft:own"]);
    expect(narrow(["content:write", "site:write"], ["*"])).toEqual(["content:write", "site:write"]);
  });

  it("analytics:read is a key scope that narrows away for Contributors (RFC-0006 §9.1)", () => {
    expect(KEY_SCOPES).toContain("analytics:read");
    expect(narrow(["site:read", "analytics:read"], roleScopes("author"))).toEqual([
      "site:read",
      "analytics:read",
    ]);
    expect(narrow(["site:read", "analytics:read"], roleScopes("contributor"))).toEqual([
      "site:read",
    ]);
    // it implies nothing, and nothing but `*` implies it
    expect(weakerScopes("analytics:read")).toEqual([]);
    for (const s of [...KEY_SCOPES, ...PERSON_SCOPES].filter((x) => x !== "analytics:read"))
      expect(implies(s, "analytics:read"), s).toBe(false);
    expect(implies("*", "analytics:read")).toBe(true);
  });

  it("never lets person-only scopes or * onto a key", () => {
    expect(narrow(["audit:read", "members:manage", "site:read"], ["*"])).toEqual(["site:read"]);
    expect(narrow(["*"], roleScopes("contributor"))).toEqual([
      "site:read",
      "content:read",
      "content:draft:own",
      "preview:create",
      "asset:upload",
      "schedules:read",
      "schedules:write:own",
    ]);
  });

  it("is idempotent and never widens", () => {
    const once = narrow(["content:write", "site:publish", "site:write"], roleScopes("author"));
    expect(narrow(once, roleScopes("author"))).toEqual(once);
    expect(narrow(once, roleScopes("owner"))).toEqual(once);
    expect(scopesAboveRole(["content:write", "site:read"], "author")).toEqual(["content:write"]);
  });
});

describe("rank rule (I4, I12)", () => {
  const m = (userId: string, role: Role) => ({ userId, role });

  it("Administrators invite up to Administrator; Editors only Contributors and Authors; nobody invites an Owner", () => {
    expect(invitableRoles("owner")).toEqual(["administrator", "editor", "author", "contributor"]);
    expect(invitableRoles("administrator")).toEqual([
      "administrator",
      "editor",
      "author",
      "contributor",
    ]);
    expect(invitableRoles("editor")).toEqual(["author", "contributor"]);
    expect(invitableRoles("author")).toEqual([]);
    expect(invitableRoles("contributor")).toEqual([]);
    expect(inviteProblem("owner", "owner")).toBe("owner_role");
    expect(inviteProblem("editor", "editor")).toBe("role_too_high");
    expect(inviteProblem("author", "contributor")).toBe("not_allowed");
  });

  it("role changes and removals: never self, never the Owner, members:manage only", () => {
    expect(roleChangeProblem(m("a", "administrator"), m("a", "administrator"), "editor")).toBe(
      "self",
    );
    expect(roleChangeProblem(m("a", "administrator"), m("o", "owner"), "editor")).toBe(
      "target_is_owner",
    );
    expect(roleChangeProblem(m("a", "administrator"), m("b", "administrator"), "editor")).toBe(
      undefined,
    );
    expect(roleChangeProblem(m("a", "administrator"), m("b", "editor"), "owner")).toBe(
      "owner_role",
    );
    expect(roleChangeProblem(m("e", "editor"), m("b", "author"), "contributor")).toBe(
      "not_allowed",
    );
    expect(roleChangeProblem(m("o", "owner"), m("b", "administrator"), "contributor")).toBe(
      undefined,
    );
    expect(removalProblem(m("a", "administrator"), m("o", "owner"))).toBe("target_is_owner");
    expect(removalProblem(m("o", "owner"), m("o", "owner"))).toBe("self");
    expect(removalProblem(m("a", "administrator"), m("b", "administrator"))).toBe(undefined);
    expect(removalProblem(m("e", "editor"), m("c", "contributor"))).toBe("not_allowed");
  });

  it("invite expiry: 1 h – 14 d, Administrator invites at most 72 h", () => {
    expect(inviteDefaultHours("author")).toBe(168);
    expect(inviteDefaultHours("administrator")).toBe(72);
    expect(inviteExpiryProblem("author", 336)).toBeUndefined();
    expect(inviteExpiryProblem("author", 337)).toMatch(/between 1 and 336/);
    expect(inviteExpiryProblem("author", 0)).toBeDefined();
    expect(inviteExpiryProblem("administrator", 72)).toBeUndefined();
    expect(inviteExpiryProblem("administrator", 73)).toMatch(/72/);
  });
});

describe("policy with own variants (I7, I9)", () => {
  const tools: ToolPolicy[] = [
    { name: "update_entry", scopes: ["content:write"], annotations: {}, own: "entry" },
    { name: "update_page", scopes: ["content:write"], annotations: {} },
    {
      name: "publish",
      scopes: ["site:publish"],
      annotations: { destructiveHint: true },
      requiresApproval: true,
      own: "changeset",
    },
    { name: "audit_tool", scopes: ["audit:read"], annotations: { readOnlyHint: true } },
  ];
  const engine = new PolicyEngine(tools);
  const person = (role: Role): Principal => ({
    actor: { kind: "human", id: "user_roletest01" },
    scopes: roleScopes(role),
  });

  it("own variants satisfy a tool with a limit; full scopes carry none", () => {
    expect(engine.evaluate(person("editor"), "update_entry")).toEqual({ kind: "allow" });
    expect(engine.evaluate(person("author"), "update_entry")).toEqual({
      kind: "allow",
      limit: { level: "own", target: "entry" },
    });
    expect(engine.evaluate(person("contributor"), "update_entry")).toEqual({
      kind: "allow",
      limit: { level: "draft", target: "entry" },
    });
    // tools without `own` are not satisfied by an own variant
    expect(engine.evaluate(person("author"), "update_page")).toMatchObject({
      kind: "deny",
      code: "missing_scope",
    });
    expect(engine.evaluate(person("author"), "publish")).toMatchObject({
      kind: "approval-required",
      cause: "tool",
      limit: { level: "own", target: "changeset" },
    });
    expect(engine.evaluate(person("contributor"), "publish")).toMatchObject({
      kind: "deny",
      reason: "missing scope site:publish",
    });
  });

  it("person-only scopes never satisfy a tool, not even through *", () => {
    expect(engine.evaluate(person("owner"), "audit_tool").kind).toBe("deny");
  });

  it("a declared skill counts own variants", () => {
    const p = {
      ...person("author"),
      skill: { name: "write", scopes: ["content:write:own"], approval: [] },
    };
    expect(engine.evaluate(p, "update_entry")).toMatchObject({ kind: "allow" });
    const narrowSkill = { ...p, skill: { name: "read", scopes: ["content:read"], approval: [] } };
    expect(engine.evaluate(narrowSkill, "update_entry")).toMatchObject({
      kind: "deny",
      code: "skill",
    });
  });

  it("people whose role lacks site:write only propose terms, like agents", () => {
    expect(termCreation(person("contributor"), "propose")).toEqual({
      allowed: true,
      status: "proposed",
    });
    expect(termCreation(person("author"), "none").allowed).toBe(false);
    expect(termCreation(person("editor"), "none")).toEqual({ allowed: true, status: "active" });
    expect(termCreation({ kind: "human", id: "user_roletest01" }, "none").allowed).toBe(true);
  });
});

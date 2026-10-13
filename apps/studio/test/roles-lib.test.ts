import { afterEach, describe, expect, it } from "vitest";
import { modeRules, scopeOptions } from "../src/lib/agents.ts";
import type { Member } from "../src/lib/api.ts";
import { ApiRequestError, errorCode, errorDetail, publishResultOf } from "../src/lib/api.ts";
import {
  entryAccess,
  expiresIn,
  FALLBACK_ROLE_SCOPES,
  forgetHashToken,
  INVITE_TOKEN_PREFIX,
  inviteDefaultHours,
  inviteMaxHours,
  invitePresets,
  inviteRules,
  minimumRole,
  narrowScopes,
  ownOnlyGuess,
  passwordStrength,
  RESET_TOKEN_PREFIX,
  removalProblem,
  roleCan,
  roleChangeProblem,
  roleRules,
  sortMembers,
  takeHashToken,
  validEmail,
} from "../src/lib/roles.ts";

const member = (userId: string, role: Member["role"], name = userId): Member => ({
  userId,
  actorId: `user_${userId}`,
  name,
  role,
  joinedAt: "2026-10-01T10:00:00Z",
});

describe("role rules (RFC-0005 §2)", () => {
  const rules = roleRules();
  it("narrows key scopes to a role: own variants, else dropped", () => {
    const author = FALLBACK_ROLE_SCOPES.author;
    expect(narrowScopes(["content:write", "site:publish", "site:rollback"], author)).toEqual([
      "content:write:own",
      "site:publish:own",
    ]);
    expect(
      narrowScopes(["content:write", "site:publish"], FALLBACK_ROLE_SCOPES.contributor),
    ).toEqual(["content:draft:own"]);
    // `*` on an old key becomes every key scope the role holds; never person-only scopes
    const fromStar = narrowScopes(["*"], FALLBACK_ROLE_SCOPES.administrator);
    expect(fromStar).toContain("site:publish");
    expect(fromStar).not.toContain("members:manage" as never);
  });

  it("names the least senior role for an ability (the tooltip's 'Only Editors and above')", () => {
    expect(minimumRole(rules, "publish.any")).toBe("editor");
    expect(minimumRole(rules, "publish.own")).toBe("author");
    expect(minimumRole(rules, "settings.write")).toBe("administrator");
    expect(minimumRole(rules, "ownership.transfer")).toBe("owner");
    expect(roleCan(rules, "editor", "members.invite")).toBe(true);
    expect(roleCan(rules, "editor", "members.manage")).toBe(false);
  });

  it("caps key modes and narrows a mode's scopes for the person's role", () => {
    const contributor = modeRules(undefined, {
      cap: "edits",
      scopes: FALLBACK_ROLE_SCOPES.contributor,
    });
    expect(contributor.keyModes).toEqual(["plan", "manual", "edits"]);
    expect(contributor.cap).toBe("edits");
    expect(contributor.scopesFor("edits")).toEqual([
      "site:read",
      "content:read",
      "preview:create",
      "schedules:read",
      "content:draft:own",
      "asset:upload",
    ]);
    const owner = modeRules(undefined, { cap: "auto", scopes: ["*"] });
    expect(owner.keyModes).toEqual(["plan", "manual", "edits", "auto"]);
    expect(owner.cap).toBeUndefined();
  });

  it("offers own variants in the scope picker and disables what the role lacks", () => {
    const author = scopeOptions("write", FALLBACK_ROLE_SCOPES.author);
    expect(author).toEqual([
      { scope: "content:write:own", from: "content:write", disabled: false },
      { scope: "asset:upload", disabled: false },
      { scope: "asset:manage", disabled: true },
      { scope: "site:write", disabled: true },
      { scope: "preview:create", disabled: false },
      { scope: "schedules:write:own", from: "schedules:write", disabled: false },
    ]);
    expect(scopeOptions("release", FALLBACK_ROLE_SCOPES.contributor)).toEqual([
      { scope: "site:publish", disabled: true },
      { scope: "releases:publish", disabled: true },
      { scope: "site:rollback", disabled: true },
    ]);
  });
});

describe("rank rule (RFC-0005 §3, I4)", () => {
  const admin = { userId: "a", canManage: true };
  it("refuses self, the Owner and non-managers", () => {
    expect(roleChangeProblem(admin, member("a", "administrator"))).toBe("self");
    expect(roleChangeProblem(admin, member("o", "owner"))).toBe("target_is_owner");
    expect(roleChangeProblem({ userId: "e", canManage: false }, member("x", "author"))).toBe(
      "not_allowed",
    );
    expect(roleChangeProblem(admin, member("b", "administrator"))).toBeUndefined();
    expect(removalProblem(admin, member("c", "contributor"))).toBeUndefined();
  });
  it("lists the Owner first, then by rank and name", () => {
    const sorted = sortMembers([
      member("c", "contributor", "Cem"),
      member("e2", "editor", "Zeynep"),
      member("o", "owner", "Halil"),
      member("e1", "editor", "Ece"),
    ]);
    expect(sorted.map((m) => m.name)).toEqual(["Halil", "Ece", "Zeynep", "Cem"]);
  });
});

describe("invites (RFC-0005 §7)", () => {
  const rules = inviteRules();
  it("caps Administrator invites at 72 hours and defaults within the bounds", () => {
    expect(inviteMaxHours(rules, "administrator")).toBe(72);
    expect(invitePresets(rules, "administrator")).toEqual([1, 24, 72]);
    expect(inviteDefaultHours(rules, "administrator")).toBe(72);
    expect(invitePresets(rules, "editor")).toEqual([1, 24, 72, 168, 336]);
    expect(inviteDefaultHours(rules, "author")).toBe(168);
  });
  it("says when a link expires in its largest unit, rounded", () => {
    const now = Date.parse("2026-10-08T10:00:00Z");
    const at = (ms: number) => new Date(now + ms).toISOString();
    expect(expiresIn(at(7 * 86_400_000 - 5_000), "en", now)).toBe("in 7 days");
    expect(expiresIn(at(3_600_000 - 1_000), "en", now)).toBe("in 1 hour");
    expect(expiresIn(at(24 * 3_600_000 - 1_000), "tr", now)).toBe("yarın");
  });
  it("validates emails like the server", () => {
    expect(validEmail("ada@example.com")).toBe(true);
    expect(validEmail(" ada@example.com ")).toBe(true);
    expect(validEmail("ada@")).toBe(false);
    expect(validEmail("")).toBe(false);
  });
});

describe("link tokens in the fragment (RFC-0005 §7.1)", () => {
  afterEach(() => {
    forgetHashToken(INVITE_TOKEN_PREFIX);
    forgetHashToken(RESET_TOKEN_PREFIX);
    window.history.replaceState(null, "", "/");
  });
  it("takes the token and strips it from the address bar at once", () => {
    window.history.replaceState(null, "", "/invite?lang=tr#chinv_abc123");
    expect(takeHashToken(INVITE_TOKEN_PREFIX)).toBe("chinv_abc123");
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("chinv_");
    expect(window.location.search).toBe("?lang=tr");
    // a re-render takes it again from memory, never from the URL
    expect(takeHashToken(INVITE_TOKEN_PREFIX)).toBe("chinv_abc123");
  });
  it("ignores other fragments and other token kinds", () => {
    window.history.replaceState(null, "", "/reset-password#chinv_wrongkind");
    expect(takeHashToken(RESET_TOKEN_PREFIX)).toBeUndefined();
    expect(window.location.hash).toBe("#chinv_wrongkind");
  });
});

describe("own work (RFC-0005 §4)", () => {
  const self = { actorId: "user_me", agentIds: new Set(["agent_mine"]) };
  const entry = (author: string, status: "draft" | "review" | "published", published = false) => ({
    author: { kind: "human" as const, id: author },
    status,
    ...(published ? { publishedAt: "2026-10-01T10:00:00Z" } : {}),
  });
  it("lets Editors change anything, Authors their own, Contributors their unpublished own", () => {
    const editor = { editAny: true, editOwnPublished: true };
    const author = { editAny: false, editOwnPublished: true };
    const contributor = { editAny: false, editOwnPublished: false };
    expect(entryAccess(entry("user_other", "published", true), editor, self)).toBe("edit");
    expect(entryAccess(entry("user_other", "draft"), author, self)).toBe("notOwn");
    expect(entryAccess(entry("user_me", "published", true), author, self)).toBe("edit");
    expect(entryAccess(entry("agent_mine", "draft"), contributor, self)).toBe("edit");
    expect(entryAccess(entry("user_me", "review", true), contributor, self)).toBe("published");
  });
  it("guesses own-only publishes from what changed since the live snapshot", () => {
    const liveAt = "2026-10-08T10:00:00Z";
    const later = "2026-10-08T11:00:00Z";
    const mine = { ...entry("user_me", "published", true), updatedAt: later };
    const theirs = { ...entry("user_other", "published", true), updatedAt: later };
    const draft = { ...entry("user_other", "draft"), updatedAt: later };
    expect(ownOnlyGuess({ liveAt, entries: [mine, draft], structure: [], self })).toBe(true);
    expect(ownOnlyGuess({ liveAt, entries: [mine, theirs], structure: [], self })).toBe(false);
    expect(ownOnlyGuess({ liveAt, entries: [mine], structure: [{ updatedAt: later }], self })).toBe(
      false,
    );
    // nothing live yet: the first publish carries pages too
    expect(ownOnlyGuess({ liveAt: undefined, entries: [mine], structure: [], self })).toBe(false);
  });
});

describe("helpers", () => {
  it("rates passwords for guidance", () => {
    expect(passwordStrength("")).toBe("empty");
    expect(passwordStrength("short")).toBe("tooShort");
    expect(passwordStrength("abcdefgh")).toBe("weak");
    expect(passwordStrength("abcdefgh1!")).toBe("fair");
    expect(passwordStrength("correct horse battery")).toBe("strong");
  });
  it("reads API error codes and details", () => {
    const e = new ApiRequestError(403, {
      error: "rank",
      message: "no",
      details: { problem: "self" },
    });
    expect(errorCode(e)).toBe("rank");
    expect(errorDetail(e, "problem")).toBe("self");
    expect(errorCode(new Error("x"))).toBeUndefined();
  });
  it("normalises publish answers: live, or a request (202)", () => {
    const site = { id: "site_1" } as never;
    const request = { id: "appr_1" } as never;
    expect(publishResultOf(site)).toEqual({ kind: "published", site });
    expect(publishResultOf({ request, reason: "r" })).toMatchObject({
      kind: "requested",
      request,
    });
    expect(
      publishResultOf({ snapshot: { id: "snap_1" } as never, site, request, reason: "r" }),
    ).toMatchObject({ kind: "requested", snapshot: { id: "snap_1" } });
  });
});

import { describe, expect, it } from "vitest";
import {
  describeUserAgent,
  initials,
  passwordServerError,
  sortSessions,
  toIso,
  validateName,
  validatePasswordChange,
} from "../src/lib/account.ts";
import { ApiRequestError, type Approval } from "../src/lib/api.ts";
import {
  argument,
  expiresSoon,
  formatArguments,
  isNoLongerPending,
  needsConfirmation,
  publishDiffRange,
  splitApprovals,
} from "../src/lib/approvals.ts";
import {
  addDomain,
  HOSTNAME_PATTERN,
  makePrimary,
  normalizeHostname,
  normalizePreviewPath,
  primaryHostname,
  removeDomain,
  sortDomains,
  ttlSeconds,
  validateHostname,
} from "../src/lib/site-settings.ts";
import { isAgentScope, orderSkillScopes, skillCallSnippet } from "../src/lib/skills.ts";

describe("hostnames (Site contract)", () => {
  it("normalises what people paste", () => {
    expect(normalizeHostname("  https://Blog.Example.com/about?x=1 ")).toBe("blog.example.com");
    expect(normalizeHostname("example.com.")).toBe("example.com");
    expect(normalizeHostname("WWW.EXAMPLE.ORG#top")).toBe("www.example.org");
  });

  it("validates exactly like site.schema.json", () => {
    expect(HOSTNAME_PATTERN.source).toBe(
      "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
    );
    expect(validateHostname("")).toBe("required");
    expect(validateHostname("localhost")).toBe("invalid");
    expect(validateHostname("example.com:8080")).toBe("invalid");
    expect(validateHostname("-bad.example.com")).toBe("invalid");
    expect(
      validateHostname(
        `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`,
      ),
    ).toBe("tooLong");
    expect(
      validateHostname("blog.example.com", [{ hostname: "blog.example.com", primary: true }]),
    ).toBe("duplicate");
    expect(validateHostname("blog.example.com")).toBeUndefined();
  });

  it("keeps exactly one primary domain", () => {
    const one = addDomain([], "a.example.com");
    expect(one).toEqual([{ hostname: "a.example.com", primary: true }]);
    const two = addDomain(one, "b.example.com");
    expect(two[1]).toEqual({ hostname: "b.example.com", primary: false });
    const switched = makePrimary(two, "b.example.com");
    expect(switched.filter((d) => d.primary).map((d) => d.hostname)).toEqual(["b.example.com"]);
    // Removing the primary promotes the next one.
    expect(removeDomain(switched, "b.example.com")).toEqual([
      { hostname: "a.example.com", primary: true },
    ]);
    expect(removeDomain(one, "a.example.com")).toEqual([]);
    expect(sortDomains(switched)[0]?.hostname).toBe("b.example.com");
    expect(primaryHostname(switched)).toBe("b.example.com");
    expect(primaryHostname([])).toBeUndefined();
  });
});

describe("preview links", () => {
  it("accepts site paths, adds the leading slash and rejects URLs", () => {
    expect(normalizePreviewPath("")).toEqual({ path: "/" });
    expect(normalizePreviewPath("blog/hello")).toEqual({ path: "/blog/hello" });
    expect(normalizePreviewPath("/about")).toEqual({ path: "/about" });
    expect(normalizePreviewPath("https://evil.example/")).toEqual({ error: "invalid" });
    expect(normalizePreviewPath("//evil.example")).toEqual({ error: "invalid" });
    expect(normalizePreviewPath("/a b")).toEqual({ error: "invalid" });
  });
  it("maps lifetimes to seconds within the server's 1 minute … 7 days", () => {
    expect(ttlSeconds("1h")).toBe(3600);
    expect(ttlSeconds("1d")).toBe(86_400);
    expect(ttlSeconds("7d")).toBe(604_800);
  });
});

describe("account helpers", () => {
  it("makes avatar initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("ada", "x@y.z")).toBe("A");
    expect(initials("  ", "zeynep@example.com")).toBe("Z");
    expect(initials("Çağla Öztürk Yılmaz")).toBe("ÇY");
    expect(initials("", "")).toBe("?");
  });

  it("validates names against the contract limit", () => {
    expect(validateName(" ")).toBe("required");
    expect(validateName("x".repeat(201))).toBe("tooLong");
    expect(validateName("Ada")).toBeUndefined();
  });

  it("checks a password change before calling the server", () => {
    expect(validatePasswordChange({ current: "", next: "", confirm: "" })).toEqual({
      current: "required",
      next: "required",
      confirm: "required",
    });
    expect(
      validatePasswordChange({ current: "old-pass", next: "short", confirm: "short" }),
    ).toEqual({ next: "tooShort" });
    expect(
      validatePasswordChange({ current: "same-pass", next: "same-pass", confirm: "same-pass" }),
    ).toEqual({ next: "same" });
    expect(
      validatePasswordChange({ current: "old-pass", next: "new-pass-1", confirm: "new-pass-2" }),
    ).toEqual({ confirm: "mismatch" });
    expect(
      validatePasswordChange({ current: "old-pass", next: "new-pass-1", confirm: "new-pass-1" }),
    ).toEqual({});
  });

  it("maps Better Auth error codes onto fields", () => {
    expect(passwordServerError("INVALID_PASSWORD")).toEqual({ current: "wrong" });
    expect(passwordServerError("PASSWORD_TOO_SHORT")).toEqual({ next: "tooShort" });
    expect(passwordServerError("SOMETHING_ELSE")).toBeUndefined();
  });

  it("recognises devices from user agents", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toEqual({ kind: "desktop", browser: "Chrome", os: "macOS" });
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ kind: "mobile", browser: "Safari", os: "iOS" });
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
      ),
    ).toMatchObject({ browser: "Edge", os: "Windows" });
    expect(describeUserAgent("curl/8.7.1")).toEqual({ kind: "cli", browser: "curl" });
    expect(describeUserAgent(null)).toEqual({ kind: "unknown" });
  });

  it("puts the current session first, then the most recently active", () => {
    const rows = [
      { token: "a", updatedAt: "2026-10-01T00:00:00Z" },
      { token: "b", updatedAt: "2026-10-07T00:00:00Z" },
      { token: "c", updatedAt: new Date("2026-10-05T00:00:00Z") },
    ];
    expect(sortSessions(rows, "a").map((s) => s.token)).toEqual(["a", "b", "c"]);
    expect(toIso(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05T00:00:00.000Z");
    expect(toIso("not a date")).toBeUndefined();
  });
});

describe("skills", () => {
  it("orders known scopes like agent keys and keeps unknown ones", () => {
    expect(isAgentScope("site:publish")).toBe(true);
    expect(isAgentScope("billing:read")).toBe(false);
    expect(orderSkillScopes(["site:publish", "billing:read", "site:read"])).toEqual([
      "site:read",
      "site:publish",
      "billing:read",
    ]);
  });
  it("builds a tools/call that names the skill in _meta", () => {
    const call = JSON.parse(skillCallSnippet({ name: "publish-article", approval: ["publish"] }));
    expect(call.method).toBe("tools/call");
    expect(call.params.name).toBe("publish");
    expect(call.params._meta).toEqual({ "cloudhal.skill": "publish-article" });
  });
});

const approval = (over: Partial<Approval>): Approval => ({
  id: "appr_1",
  tool: "publish",
  actor: { kind: "agent", id: "agent_abc123", name: "Bot" },
  prompt: "Publish?",
  status: "pending",
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: "2026-10-09T10:00:00Z",
  ...over,
});

describe("approvals", () => {
  it("confirms only the tools that change what visitors see or delete content", () => {
    expect(["publish", "rollback", "delete_page", "delete_entry"].every(needsConfirmation)).toBe(
      true,
    );
    expect(needsConfirmation("update_page")).toBe(false);
  });

  it("splits pending (next to expire first) from history (newest first)", () => {
    const { pending, history } = splitApprovals([
      approval({ id: "late", expiresAt: "2026-10-09T12:00:00Z" }),
      approval({ id: "soon", expiresAt: "2026-10-08T11:00:00Z" }),
      approval({ id: "old", status: "denied", decidedAt: "2026-10-08T10:05:00Z" }),
      approval({ id: "new", status: "consumed", decidedAt: "2026-10-08T11:05:00Z" }),
    ]);
    expect(pending.map((a) => a.id)).toEqual(["soon", "late"]);
    expect(history.map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("knows when a request is about to lapse", () => {
    const now = Date.parse("2026-10-08T10:00:00Z");
    expect(expiresSoon("2026-10-08T10:30:00Z", now)).toBe(true);
    expect(expiresSoon("2026-10-08T12:00:00Z", now)).toBe(false);
  });

  it("formats arguments and reads targets", () => {
    expect(formatArguments(undefined)).toBeUndefined();
    expect(formatArguments({})).toBeUndefined();
    expect(formatArguments({ siteId: "s" })).toBe('{\n  "siteId": "s"\n}');
    expect(argument({ snapshotId: "snap_1" }, "snapshotId")).toBe("snap_1");
    expect(argument({ snapshotId: 4 }, "snapshotId")).toBeUndefined();
  });

  it("treats 409 as 'no longer pending'", () => {
    expect(isNoLongerPending(new ApiRequestError(409, { error: "conflict", message: "x" }))).toBe(
      true,
    );
    expect(isNoLongerPending(new ApiRequestError(500, { error: "x", message: "y" }))).toBe(false);
  });

  it("approximates a publish as live → newest snapshot", () => {
    const snaps = [
      { id: "snap_old", createdAt: "2026-10-01T00:00:00Z" },
      { id: "snap_new", createdAt: "2026-10-07T00:00:00Z" },
    ];
    expect(publishDiffRange({ publishedSnapshotId: "snap_old" }, snaps)).toEqual({
      kind: "range",
      from: "snap_old",
      to: "snap_new",
    });
    expect(publishDiffRange({ publishedSnapshotId: "snap_new" }, snaps)).toEqual({
      kind: "up-to-date",
    });
    expect(publishDiffRange({}, snaps)).toEqual({ kind: "first" });
    expect(publishDiffRange(undefined, snaps)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  filterActivity,
  formatInput,
  isFiltered,
  isKnownTool,
  NO_FILTER,
  relativeTime,
} from "../src/lib/activity.ts";
import {
  ALL_GRANTABLE,
  ALWAYS_GATED_TOOLS,
  autoApprovalCount,
  autoCheckHeldBack,
  DEFAULT_MODE,
  isAutoApproved,
  isKeyMode,
  isManualModeRequest,
  KEY_MODES,
  MODE_RISK,
  MODE_RULES,
  mcpSnippet,
  modeRules,
  modeVariant,
  sameScopes,
  scopesForMode,
  scopeVariant,
  snippetLang,
  sortScopes,
} from "../src/lib/agents.ts";
import type { AuditRow } from "../src/lib/api.ts";
import { diffBases, diffRows } from "../src/lib/diff.ts";
import { isDirty } from "../src/lib/util.ts";

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: 1,
  at: "2026-10-08T10:00:00Z",
  actor: { kind: "agent", id: "agent_writer01", name: "Writer bot" },
  tool: "update_page",
  decision: "allow",
  ...over,
});

describe("activity", () => {
  const rows = [
    row({ id: 3, tool: "publish", decision: "approval-required" }),
    row({ id: 2, tool: "delete_page", decision: "deny", skill: "safe-edit" }),
    row({ id: 1, actor: { kind: "human", id: "user_ada000001", name: "Ada" } }),
  ];

  it("filters by actor kind, decision and free text (incl. localised tool labels)", () => {
    expect(filterActivity(rows, { ...NO_FILTER, kind: "human" }).map((r) => r.id)).toEqual([1]);
    expect(filterActivity(rows, { ...NO_FILTER, decision: "deny" }).map((r) => r.id)).toEqual([2]);
    expect(filterActivity(rows, { ...NO_FILTER, search: "SAFE" }).map((r) => r.id)).toEqual([2]);
    const label = (tool: string) => (tool === "publish" ? "Siteyi yayınla" : tool);
    expect(
      filterActivity(rows, { ...NO_FILTER, search: "yayınla" }, label).map((r) => r.id),
    ).toEqual([3]);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, search: "  " })).toBe(false);
  });

  it("formats relative time in the active locale", () => {
    const now = Date.parse("2026-10-08T10:05:00Z");
    expect(relativeTime("2026-10-08T10:00:00Z", "en", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-10-08T10:04:50Z", "en", now)).toBe("now");
    expect(relativeTime("2026-10-07T10:00:00Z", "tr", now)).toBe("dün");
  });

  it("knows the MCP tool names and pretty-prints input", () => {
    expect(isKnownTool("rollback")).toBe(true);
    expect(isKnownTool("drop_database")).toBe(false);
    expect(formatInput({ siteId: "s" })).toBe('{\n  "siteId": "s"\n}');
    expect(formatInput(undefined)).toBeUndefined();
  });
});

describe("agent modes (ADR-0015)", () => {
  it("offers the four key modes, never bypass, with edits as the default", () => {
    expect(KEY_MODES).toEqual(["plan", "manual", "edits", "auto"]);
    expect(DEFAULT_MODE).toBe("edits");
    expect(isKeyMode("auto")).toBe(true);
    expect(isKeyMode("bypass")).toBe(false);
    expect(isKeyMode(undefined)).toBe(false);
  });

  it("prefills scopes like the server's scopesForMode", () => {
    // RFC-0006: analytics:read is read-only and in every mode's defaults, plan included.
    expect(scopesForMode("plan")).toEqual([
      "site:read",
      "content:read",
      "preview:create",
      "analytics:read",
      "comments:read",
      "schedules:read",
      "content:propose",
    ]);
    for (const mode of ["manual", "edits", "auto"] as const) {
      expect(scopesForMode(mode)).toEqual([
        "site:read",
        "content:read",
        "preview:create",
        "analytics:read",
        "comments:read",
        "schedules:read",
        "content:write",
        "asset:upload",
        "site:publish",
        "site:rollback",
        "schedules:write",
      ]);
    }
    expect(sameScopes(["content:read", "site:read"], ["site:read", "content:read"])).toBe(true);
    expect(sameScopes(["site:read"], ["site:read", "content:read"])).toBe(false);
    expect(ALL_GRANTABLE).not.toContain("*");
  });

  it("ranks risk and tone by autonomy and documents what waits", () => {
    expect(MODE_RISK).toMatchObject({
      plan: "safest",
      manual: "safest",
      edits: "recommended",
      auto: "caution",
    });
    expect(KEY_MODES.map(modeVariant)).toEqual(["secondary", "success", "info", "warning"]);
    expect(MODE_RULES.auto).toEqual({ edits: "free", publish: "lowRisk", rollback: "waits" });
    expect(MODE_RULES.manual.edits).toBe("waits");
    expect(MODE_RULES.plan.edits).toBe("denied");
    expect(ALWAYS_GATED_TOOLS).not.toContain("publish");
  });

  it("recognises auto-approved publishes and manual-mode requests", () => {
    const check = {
      rule: "low-risk-publish" as const,
      lowRisk: true,
      code: "low-risk" as const,
      changes: 3,
      limit: 20,
    };
    // structured rows (current servers)
    const auto = { decision: "allow" as const, reason: "anything", autoCheck: check };
    expect(isAutoApproved(auto)).toBe(true);
    expect(autoApprovalCount(auto)).toBe(3);
    expect(isAutoApproved({ ...auto, decision: "deny" })).toBe(false);
    expect(
      isAutoApproved({
        decision: "allow",
        autoCheck: { ...check, lowRisk: false, code: "structure" },
      }),
    ).toBe(false);
    // older rows: only the English reason
    const legacy = {
      decision: "allow" as const,
      reason: "auto mode: published without approval (2 article change(s) only)",
    };
    expect(isAutoApproved(legacy)).toBe(true);
    expect(autoApprovalCount(legacy)).toBe(2);
    expect(autoApprovalCount({ reason: "auto mode: published without approval" })).toBeUndefined();
    expect(
      isAutoApproved({
        decision: "approval-required",
        reason: "auto mode waits for a person: it removes content",
      }),
    ).toBe(false);
    expect(isAutoApproved({ decision: "allow" })).toBe(false);

    expect(isManualModeRequest({ prompt: "Create article?", cause: "manual-mode" })).toBe(true);
    expect(isManualModeRequest({ prompt: "manual mode: x", cause: "tool" })).toBe(false);
    expect(
      isManualModeRequest({ prompt: "manual mode: update_entry needs a person's approval" }),
    ).toBe(true);
    expect(isManualModeRequest({ prompt: 'Publish "Sprint 7"?' })).toBe(false);

    expect(autoCheckHeldBack({ autoCheck: check })).toBeUndefined();
    expect(
      autoCheckHeldBack({ autoCheck: { ...check, lowRisk: false, code: "too-many", changes: 25 } }),
    ).toMatchObject({ code: "too-many", changes: 25 });
    expect(autoCheckHeldBack({})).toBeUndefined();
  });

  it("uses the server's mode rules when it reports them", () => {
    const local = modeRules();
    expect(local.modes).toEqual(KEY_MODES);
    expect(local.defaultMode).toBe("edits");
    expect(local.autoPublishLimit).toBe(20);
    expect(local.scopesFor("plan")).toEqual(scopesForMode("plan"));
    const server = modeRules({
      modes: ["plan", "edits", "bypass"],
      default: "plan",
      scopes: { plan: ["site:read", "*"], edits: ["site:read", "content:write"] },
      autoPublishLimit: 5,
    });
    expect(server.modes).toEqual(["plan", "edits"]); // bypass is never offered for a key
    expect(server.defaultMode).toBe("plan");
    expect(server.scopesFor("plan")).toEqual(["site:read"]); // only grantable scopes
    expect(server.scopesFor("edits")).toEqual(["site:read", "content:write"]);
    expect(server.scopesFor("auto")).toEqual(scopesForMode("auto")); // not reported → local copy
    expect(server.autoPublishLimit).toBe(5);
    expect(
      modeRules({ modes: [], default: "bypass", scopes: {}, autoPublishLimit: 20 }),
    ).toMatchObject({
      modes: KEY_MODES,
      defaultMode: "edits",
    });
  });

  it("searches activity by mode", () => {
    const rows = [row({ id: 1, mode: "auto" }), row({ id: 2, mode: "plan" })];
    expect(filterActivity(rows, { ...NO_FILTER, search: "auto" }).map((r) => r.id)).toEqual([1]);
  });
});

describe("agent scopes", () => {
  it("orders and colours scopes by group", () => {
    expect(sortScopes(["site:publish", "content:read", "*", "content:write"])).toEqual([
      "*",
      "content:read",
      "content:write",
      "site:publish",
    ]);
    expect(scopeVariant("site:read")).toBe("secondary");
    expect(scopeVariant("preview:create")).toBe("info");
    expect(scopeVariant("site:rollback")).toBe("warning");
  });

  it("fills a fresh key into each client's setup, placeholder otherwise", () => {
    const url = "https://x.dev/mcp";
    const cursor = JSON.parse(mcpSnippet("cursor", url, "k_123"));
    expect(cursor.mcpServers.cloudhal).toEqual({ url, headers: { Authorization: "Bearer k_123" } });
    const generic = JSON.parse(mcpSnippet("generic", url, "k_123"));
    expect(generic.mcpServers.cloudhal).toEqual({
      type: "http",
      url,
      headers: { Authorization: "Bearer k_123" },
    });
    // VS Code prompts for the key: the file never holds it.
    const vscode = mcpSnippet("vscode", url, "k_123");
    expect(vscode).not.toContain("k_123");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code's own input variable
    expect(JSON.parse(vscode).servers.cloudhal.headers.Authorization).toBe(
      "Bearer ${input:cloudhal-key}",
    );
    expect(mcpSnippet("codex", url, "k_123")).toBe(
      'export CLOUDHAL_API_KEY="k_123"\ncodex mcp add cloudhal --url https://x.dev/mcp \\\n  --bearer-token-env-var CLOUDHAL_API_KEY',
    );
    expect(mcpSnippet("claude", url)).toContain('"Authorization: Bearer <your agent key>"');
    expect(mcpSnippet("stdio", url)).toContain("cloudhal mcp --mode edits");
    expect(snippetLang("codex")).toBe("bash");
    expect(snippetLang("vscode")).toBe("json");
  });
});

describe("snapshot diff", () => {
  const ref = (id: string, kind: "site" | "page" | "contentEntry", rev: number) => ({
    id,
    kind,
    rev,
    hash: "0".repeat(64),
  });

  it("groups by change and orders site → pages → articles", () => {
    const groups = diffRows({
      added: [ref("entry_b", "contentEntry", 0), ref("page_a", "page", 0)],
      changed: [{ before: ref("site_1", "site", 1), after: ref("site_1", "site", 2) }],
      removed: [ref("page_z", "page", 4)],
    });
    expect(groups.added.map((r) => r.id)).toEqual(["page_a", "entry_b"]);
    expect(groups.changed[0]).toMatchObject({ id: "site_1", from: 1, to: 2 });
    expect(groups.removed[0]).toMatchObject({ id: "page_z", from: 4 });
  });

  it("offers the predecessor and the live snapshot as bases", () => {
    expect(diffBases({ id: "s2", parentId: "s1" }, "s0")).toEqual({ previous: "s1", live: "s0" });
    expect(diffBases({ id: "s2", parentId: "s1" }, "s2")).toEqual({ previous: "s1" });
    expect(diffBases({ id: "s1" }, undefined)).toEqual({});
  });
});

describe("isDirty", () => {
  it("compares the edited copy with the saved one", () => {
    expect(isDirty({ a: 1 }, { a: 1 })).toBe(false);
    expect(isDirty({ a: 2 }, { a: 1 })).toBe(true);
    expect(isDirty(undefined, { a: 1 })).toBe(false);
  });
});

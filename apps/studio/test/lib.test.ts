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
  canRelease,
  DEFAULT_SCOPES,
  mcpSnippet,
  scopeVariant,
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

describe("agent scopes", () => {
  it("starts read-only and flags publish/rollback keys", () => {
    expect(DEFAULT_SCOPES).toEqual(["site:read", "content:read"]);
    expect(canRelease(DEFAULT_SCOPES)).toBe(false);
    expect(canRelease(["content:write", "site:rollback"])).toBe(true);
    expect(canRelease(["*"])).toBe(true);
    expect(ALL_GRANTABLE).not.toContain("*");
  });

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

  it("fills a fresh key into the client config, placeholder otherwise", () => {
    const json = JSON.parse(mcpSnippet("json", "https://x.dev/mcp", "k_123"));
    expect(json.mcpServers.cloudhal).toEqual({
      type: "http",
      url: "https://x.dev/mcp",
      headers: { "x-api-key": "k_123" },
    });
    expect(mcpSnippet("claude", "https://x.dev/mcp")).toContain('"x-api-key: <your agent key>"');
    expect(mcpSnippet("stdio", "https://x.dev/mcp")).toContain("cloudhal mcp");
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

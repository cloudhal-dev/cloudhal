import { afterEach, describe, expect, it, vi } from "vitest";
import { splitHref } from "../src/components/AppLink.tsx";
import { ApiRequestError, api, isNotEnabled, mcpEndpoint, query } from "../src/lib/api.ts";

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("query()", () => {
  it("keeps only set values and encodes them", () => {
    expect(query({ limit: 50, before: null, actorId: undefined, q: "" })).toBe("?limit=50");
    expect(query({ actorId: "agent x&y" })).toBe("?actorId=agent+x%26y");
    expect(query({})).toBe("");
  });
});

describe("api.activity", () => {
  it("pages with the nextBefore cursor and filters by actor", async () => {
    const fetch = mockFetch({ items: [], nextBefore: null });
    await api.activity.list("site_1", { limit: 50 });
    await api.activity.list("site_1", { limit: 50, before: 120, actorId: "agent_abc123" });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/sites/site_1/activity?limit=50",
      "/api/sites/site_1/activity?limit=50&before=120&actorId=agent_abc123",
    ]);
  });

  it("reports a server without an audit log as 'not enabled'", async () => {
    mockFetch({ error: "not_found", message: "activity is not enabled on this server" }, 404);
    const error = await api.activity.list("site_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(isNotEnabled(error)).toBe(true);
    expect(isNotEnabled(new ApiRequestError(500, { error: "x", message: "y" }))).toBe(false);
  });
});

describe("api.agentKeys", () => {
  it("creates with name + scopes and returns the one-time key", async () => {
    const fetch = mockFetch({ id: "k1", name: "Bot", key: "secret", scopes: ["site:read"] }, 201);
    const created = await api.agentKeys.create({ name: "Bot", scopes: ["site:read"] });
    expect(created.key).toBe("secret");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/agent-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Bot", scopes: ["site:read"] });
  });

  it("revokes by id (204, no body)", async () => {
    const fetch = mockFetch(null, 204);
    await expect(api.agentKeys.remove("a/b")).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/agent-keys/a%2Fb");
    expect(init.method).toBe("DELETE");
  });
});

describe("api.snapshots / preview", () => {
  it("diffs from the base snapshot to the one being inspected", async () => {
    const fetch = mockFetch({ added: [], removed: [], changed: [] });
    await api.snapshots.diff("site_1", "snap_base", "snap_new");
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/sites/site_1/snapshots/snap_base/diff/snap_new");
  });

  it("builds same-origin preview document URLs", () => {
    expect(api.preview.page("site_1", "page_1")).toBe("/api/sites/site_1/pages/page_1/preview");
    expect(api.preview.entry("site_1", "entry_1")).toBe(
      "/api/sites/site_1/entries/entry_1/preview",
    );
  });

  it("derives the MCP endpoint from the origin", () => {
    expect(mcpEndpoint("https://studio.example.com/")).toBe("https://studio.example.com/mcp");
  });
});

describe("splitHref (Kumo href → TanStack Router)", () => {
  it("separates the search string so links can carry ?diff=", () => {
    expect(splitHref("/sites/s1/snapshots?diff=snap_1")).toEqual({
      to: "/sites/s1/snapshots",
      search: { diff: "snap_1" },
    });
    expect(splitHref("/agents")).toEqual({ to: "/agents" });
  });
});

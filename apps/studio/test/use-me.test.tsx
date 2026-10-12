/**
 * The shared identity hooks survive a server that answers a list route with something other than a
 * list: `cloudhal studio --no-auth` used to answer GET /api/agent-keys with the Studio's HTML page
 * (200), and `(keys.data ?? []).map` crashed every screen.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMemberRoles, useSelf } from "../src/components/useMe.ts";
import { api, listOf } from "../src/lib/api.ts";
import { ACTOR_IDS, asRole, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HTML = "<!doctype html><title>Studio</title><div id=root></div>";

/** Every request answers 200 with `body` as `type`, except /api/me. */
function answerEverything(body: string, type: string) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/me")) return new Response("{}", { status: 401 });
    return new Response(body, { status: 200, headers: { "content-type": type } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("listOf", () => {
  it("keeps lists and drops anything else", () => {
    expect(listOf([1, 2])).toEqual([1, 2]);
    expect(listOf(undefined)).toEqual([]);
    expect(listOf(null)).toEqual([]);
    expect(listOf(HTML as never)).toEqual([]);
    expect(listOf({ error: "invalid_json" } as never)).toEqual([]);
  });
});

describe("useSelf and useMemberRoles with a non-list answer", () => {
  for (const [label, body, type] of [
    ["the Studio's HTML page", HTML, "text/html"],
    ["a JSON string", JSON.stringify(HTML), "application/json"],
    ["a JSON object", JSON.stringify({ items: "nope" }), "application/json"],
  ] as const) {
    it(`reads ${label} as no keys and no members`, async () => {
      const fetch = answerEverything(body, type);
      const self = renderHook(() => useSelf(), { wrapper: ({ children }) => wrap(children) });
      const roles = renderHook(() => useMemberRoles(), {
        wrapper: ({ children }) => wrap(children),
      });
      await waitFor(() =>
        expect(fetch.mock.calls.map(([u]) => String(u))).toEqual(
          expect.arrayContaining(["/api/agent-keys", "/api/members"]),
        ),
      );
      await expect(api.agentKeys.list()).resolves.toEqual([]);
      await expect(api.members.list()).resolves.toEqual([]);
      expect(self.result.current.agentIds.size).toBe(0);
      expect(roles.result.current.size).toBe(0);
    });
  }

  it("still reads real lists", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/agent-keys", {
        status: 200,
        body: [{ id: "k1", name: "Bot", agentId: "agent_bot1", scopes: [], createdAt: "x" }],
      }),
      on("GET", "/api/members", {
        status: 200,
        body: {
          items: [
            {
              userId: "u_owner",
              actorId: ACTOR_IDS.owner,
              name: "Halil",
              role: "owner",
              joinedAt: "2026-10-01T10:00:00Z",
            },
          ],
        },
      }),
    );
    const self = renderHook(() => useSelf(), { wrapper: ({ children }) => wrap(children) });
    const roles = renderHook(() => useMemberRoles(), {
      wrapper: ({ children }) => wrap(children),
    });
    await waitFor(() => expect(self.result.current.agentIds).toEqual(new Set(["agent_bot1"])));
    await waitFor(() => expect(roles.result.current.get(ACTOR_IDS.owner)).toBe("owner"));
    expect(self.result.current.actorId).toBe(ACTOR_IDS.owner);
  });
});

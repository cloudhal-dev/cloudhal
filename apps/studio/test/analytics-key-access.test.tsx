/**
 * Agent keys › "Allow analytics" (RFC-0006 §9.1, open question 4; DESIGN.md §2v): keys made before
 * `analytics:read` say so and offer the one-click action, gated by the person's (or, for someone
 * else's key, the creator's) right to read analytics.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKeySummary, AgentScope, Role } from "../src/lib/api.ts";
import { AgentsPage } from "../src/routes/AgentsPage.tsx";
import { asRole, bodyOf, NAMES, on, serve, USER_IDS, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  useParams: () => ({ siteId: "site_1" }),
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OLDER: AgentScope[] = ["site:read", "content:read", "preview:create"];

const key = (
  id: string,
  owner: Role,
  scopes: AgentScope[] = OLDER,
  extra: Partial<AgentKeySummary> = {},
): AgentKeySummary => ({
  id,
  name: `${NAMES[owner]}'s agent`,
  start: "ab",
  scopes,
  mode: "plan",
  createdAt: "2026-09-01T10:00:00Z",
  expiresAt: null,
  enabled: true,
  agentId: `agent_${id}`,
  owner: { userId: USER_IDS[owner], name: NAMES[owner], role: owner },
  ...extra,
});

const rowOf = (id: string) =>
  waitFor(() => {
    const r = document.querySelector(`[data-key-id="${id}"]`);
    if (!r) throw new Error(`no row ${id}`);
    return r as HTMLElement;
  });

describe("Allow analytics", { timeout: 30_000 }, () => {
  it("offers it on an older key, adds only analytics:read and confirms with a toast", async () => {
    let keys = [
      key("k_old", "author"),
      key("k_new", "author", [...OLDER, "analytics:read"]),
      key("k_off", "author", OLDER, { enabled: false }),
    ];
    const fetch = serve(
      ...asRole("author"),
      on("PATCH", "/api/agent-keys/k_old", () => {
        keys = keys.map((k) =>
          k.id === "k_old" ? { ...k, scopes: [...OLDER, "analytics:read"] } : k,
        );
        return { status: 200, body: keys[0] };
      }),
      on("GET", "/api/agent-keys", () => ({ status: 200, body: keys })),
      on("GET", "/api/sites", { status: 200, body: [] }),
    );
    render(wrap(<AgentsPage />));
    const old = await rowOf("k_old");
    expect(within(old).getByText("No analytics")).toBeInTheDocument();
    // a key that holds it, or a disabled one, offers nothing
    expect((await rowOf("k_new")).querySelector("[data-analytics-access]")).toBeNull();
    expect((await rowOf("k_off")).querySelector("[data-analytics-access]")).toBeNull();

    fireEvent.click(within(old).getByRole("button", { name: "Allow analytics" }));
    expect(await screen.findByText("Analytics allowed")).toBeInTheDocument();
    expect(
      screen.getByText("Arda's agent can read site analytics from its next call."),
    ).toBeInTheDocument();
    expect(bodyOf(fetch, "PATCH", "/api/agent-keys/k_old")).toEqual({
      addScopes: ["analytics:read"],
    });
    await waitFor(() =>
      expect(document.querySelector('[data-key-id="k_old"] [data-analytics-access]')).toBeNull(),
    );
  });

  it("says when the server refuses", async () => {
    serve(
      ...asRole("author"),
      on("PATCH", "/api/agent-keys/k_old", {
        status: 400,
        body: { error: "scope_above_role", message: "your role cannot give a key analytics:read" },
      }),
      on("GET", "/api/agent-keys", { status: 200, body: [key("k_old", "author")] }),
      on("GET", "/api/sites", { status: 200, body: [] }),
    );
    render(wrap(<AgentsPage />));
    fireEvent.click(within(await rowOf("k_old")).getByRole("button", { name: "Allow analytics" }));
    expect(await screen.findByText("Couldn't allow analytics")).toBeInTheDocument();
    expect(screen.getByText("your role cannot give a key analytics:read")).toBeInTheDocument();
  });

  it("is disabled for a Contributor's own keys: their role can't read analytics", async () => {
    const fetch = serve(
      ...asRole("contributor"),
      on("GET", "/api/agent-keys", { status: 200, body: [key("k_c", "contributor")] }),
      on("GET", "/api/sites", { status: 200, body: [] }),
    );
    render(wrap(<AgentsPage />));
    const row = await rowOf("k_c");
    await waitFor(() =>
      expect(within(row).getByRole("button", { name: "Allow analytics" })).toBeDisabled(),
    );
    expect(
      fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "PATCH"),
    ).toBe(false);
  });

  it("lets an Administrator allow it on others' keys only when the creator can read analytics", async () => {
    const all = [key("k_author", "author"), key("k_contrib", "contributor")];
    const fetch = serve(
      ...asRole("administrator"),
      (url) => (url === "/api/agent-keys?all=1" ? { status: 200, body: all } : undefined),
      on("PATCH", "/api/agent-keys/k_author", {
        status: 200,
        body: { ...all[0], scopes: [...OLDER, "analytics:read"] },
      }),
      on("GET", "/api/agent-keys", { status: 200, body: [] }),
      on("GET", "/api/sites", { status: 200, body: [] }),
    );
    render(wrap(<AgentsPage />));
    fireEvent.click(await screen.findByRole("tab", { name: "All keys" }));
    const contrib = await rowOf("k_contrib");
    expect(within(contrib).getByRole("button", { name: "Allow analytics" })).toBeDisabled();
    const author = await rowOf("k_author");
    const allow = within(author).getByRole("button", { name: "Allow analytics" });
    expect(allow).toBeEnabled();
    fireEvent.click(allow);
    expect(await screen.findByText("Analytics allowed")).toBeInTheDocument();
    expect(bodyOf(fetch, "PATCH", "/api/agent-keys/k_author")).toEqual({
      addScopes: ["analytics:read"],
    });
  });
});

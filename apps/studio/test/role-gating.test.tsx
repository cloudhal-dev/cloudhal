/**
 * Role-aware Studio (RFC-0005 §10.3, DESIGN.md §2s): the server decides, Studio disables what it
 * would refuse and says why — publishing, approvals, agent keys, activity and the bell.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateAgentKeyDialog } from "../src/components/CreateAgentKeyDialog.tsx";
import { NotificationsBell } from "../src/components/NotificationsBell.tsx";
import { SitePublish } from "../src/components/SitePublish.tsx";
import { StatusActions } from "../src/components/StatusActions.tsx";
import type { AgentKeySummary, Approval } from "../src/lib/api.ts";
import { ActivityPage } from "../src/routes/ActivityPage.tsx";
import { AgentsPage } from "../src/routes/AgentsPage.tsx";
import { ApprovalsPage } from "../src/routes/ApprovalsPage.tsx";
import { ACTOR_IDS, asRole, bodyOf, NAMES, on, serve, USER_IDS, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useParams: () => ({ siteId: "site_1" }),
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
});

const LIVE_AT = "2026-10-08T10:00:00Z";
const LATER = "2026-10-08T11:00:00Z";
const siteRoutes = [
  on("GET", "/api/sites/site_1", {
    status: 200,
    body: { id: "site_1", name: "Madraka", publishedSnapshotId: "snap_live" },
  }),
  on("GET", "/api/sites/site_1/snapshots", {
    status: 200,
    body: [{ id: "snap_live", createdAt: LIVE_AT }],
  }),
  on("GET", "/api/sites/site_1/pages", { status: 200, body: [] }),
  on("GET", "/api/sites/site_1/terms", { status: 200, body: { items: [] } }),
  on("GET", "/api/sites/site_1/redirects", { status: 200, body: [] }),
  on("GET", "/api/agent-keys", { status: 200, body: [] }),
];
const entry = (author: string) => ({
  id: `e_${author}`,
  author: { kind: "human", id: author },
  status: "published",
  publishedAt: LIVE_AT,
  updatedAt: LATER,
});

describe("publishing follows the role (RFC-0005 §4, §6)", { timeout: 45_000 }, () => {
  it("a Contributor sees Publish disabled with the reason", async () => {
    const fetch = serve(...asRole("contributor"), ...siteRoutes);
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() =>
      expect(document.querySelector("[data-publish-mode]")).toHaveAttribute(
        "data-publish-mode",
        "none",
      ),
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    // nothing to guess for a Contributor: the entry lists are not fetched
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/entries"))).toBe(false);
  });

  it("an Author publishes when only their own articles changed", async () => {
    const fetch = serve(
      ...asRole("author"),
      ...siteRoutes,
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [entry(ACTOR_IDS.author)],
      }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    // Until the lists arrive the guess is "request"; wait for the answer the lists give.
    await waitFor(() => {
      expect(fetch.mock.calls.some(([u]) => String(u).includes("/entries"))).toBe(true);
      expect(document.querySelector("[data-publish-mode]")).toHaveAttribute(
        "data-publish-mode",
        "publish",
      );
      expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    });
  });

  it("an Author whose changes include others' work requests the publish (202)", async () => {
    const fetch = serve(
      ...asRole("author"),
      ...siteRoutes,
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [entry(ACTOR_IDS.author), entry(ACTOR_IDS.editor)],
      }),
      on("POST", "/api/sites/site_1/snapshots", {
        status: 202,
        body: {
          snapshot: { id: "snap_2" },
          site: { id: "site_1" },
          request: { id: "appr_role", status: "pending" },
          reason: "it includes 1 published article(s) by someone else, which needs an Editor",
        },
      }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    const button = await screen.findByRole("button", { name: "Request publish" });
    fireEvent.click(button);
    expect(await screen.findByText("Request a publish?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Publish requested")).toBeInTheDocument();
    expect(
      screen.getByText(/an Editor must approve the publish/, { exact: false }),
    ).toBeInTheDocument();
    expect(bodyOf(fetch, "POST", "/api/sites/site_1/snapshots")).toMatchObject({ publish: true });
  });

  it("an Editor publishes without Studio guessing", async () => {
    const fetch = serve(...asRole("editor"), ...siteRoutes);
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() =>
      expect(document.querySelector("[data-publish-mode]")).toHaveAttribute(
        "data-publish-mode",
        "publish",
      ),
    );
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/entries"))).toBe(false);
  });

  it("a Contributor submits articles for review and cannot publish them", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      wrap(
        <StatusActions
          status="draft"
          onChange={onChange}
          onPublish={() => {}}
          allowed={["draft", "review"]}
          publishReason="Only Authors and above can publish articles."
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(onChange).toHaveBeenCalledWith("review");
    rerender(
      wrap(
        <StatusActions
          status="review"
          onChange={onChange}
          onPublish={() => {}}
          allowed={["draft", "review"]}
          publishReason="Only Authors and above can publish articles."
        />,
      ),
    );
    expect(screen.getByTestId("publish")).toBeDisabled();
  });

  it("someone else's article is read-only, with the reason", () => {
    render(
      wrap(
        <StatusActions
          status="draft"
          onChange={() => {}}
          onPublish={() => {}}
          readOnlyReason="This article belongs to someone else."
        />,
      ),
    );
    expect(screen.getByRole("button", { name: "Send to review" })).toBeDisabled();
  });
});

const base = {
  siteId: "site_1",
  status: "pending" as const,
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: "2099-10-09T10:00:00Z",
};
const ROLE_REQUEST: Approval = {
  ...base,
  id: "appr_mine",
  tool: "publish",
  actor: { kind: "human", id: ACTOR_IDS.author, name: NAMES.author },
  prompt: 'Publish snapshot snap_2 of "Madraka" (requested by Arda: …)',
  cause: "role",
  reason: "it includes 2 published article(s) by someone else, which needs an Editor",
  input: { siteId: "site_1", snapshotId: "snap_2" },
  canDecide: false,
};
const AGENT_PUBLISH: Approval = {
  ...base,
  id: "appr_agent",
  tool: "publish",
  actor: { kind: "agent", id: "agent_desk01", name: "Desk" },
  prompt: "Publish the site?",
  canDecide: false,
};
const AGENT_UPDATE: Approval = {
  ...base,
  id: "appr_update",
  tool: "update_page",
  actor: { kind: "agent", id: "agent_desk01", name: "Desk" },
  prompt: "Update page About?",
  canDecide: true,
};

function approvalsServer(role: "author" | "editor", items: Approval[], decide?: unknown) {
  return serve(
    ...asRole(role),
    (url) =>
      url.startsWith("/api/sites/site_1/approvals?status=pending")
        ? { status: 200, body: { items } }
        : url === "/api/sites/site_1/approvals"
          ? { status: 200, body: { items } }
          : undefined,
    (url, init) =>
      init?.method === "POST" && url.startsWith("/api/sites/site_1/approvals/")
        ? { status: 200, body: decide ?? {} }
        : undefined,
    on("GET", "/api/members", {
      status: 200,
      body: {
        items: [
          {
            userId: USER_IDS.author,
            actorId: ACTOR_IDS.author,
            name: NAMES.author,
            role: "author",
            joinedAt: base.createdAt,
          },
        ],
      },
    }),
    ...siteRoutes,
  );
}
const rowOf = (id: string) =>
  waitFor(() => {
    const row = document.querySelector(`[data-approval-id="${id}"]`);
    if (!row) throw new Error(`no row ${id}`);
    return row as HTMLElement;
  });

describe("approvals follow the role (RFC-0005 §6)", { timeout: 45_000 }, () => {
  it("a person's own publish request waits for an Editor and can be withdrawn", async () => {
    const fetch = approvalsServer("author", [ROLE_REQUEST, AGENT_PUBLISH]);
    render(wrap(<ApprovalsPage />));
    const mine = await rowOf("appr_mine");
    await waitFor(() => expect(within(mine).getByText("Withdraw")).toBeInTheDocument());
    expect(within(mine).getByText("Waiting for an Editor")).toBeInTheDocument();
    expect(within(mine).getByText("Arda wants to publish the site.")).toBeInTheDocument();
    expect(
      within(mine).getByText(/includes 2 published article\(s\) by someone else/),
    ).toBeInTheDocument();
    expect(within(mine).queryByRole("button", { name: "Approve" })).toBeNull();
    // The requester's role is shown next to their name.
    expect(mine.querySelector('[data-role="author"]')).toBeTruthy();
    fireEvent.click(within(mine).getByRole("button", { name: "Withdraw" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([u]) => String(u) === "/api/sites/site_1/approvals/appr_mine/deny"),
      ).toBe(true),
    );
    expect(await screen.findByText("Request withdrawn")).toBeInTheDocument();
  });

  it("disables Approve where the person cannot decide, and says why", async () => {
    approvalsServer("author", [AGENT_PUBLISH, AGENT_UPDATE]);
    render(wrap(<ApprovalsPage />));
    const publish = await rowOf("appr_agent");
    expect(publish).toHaveAttribute("data-can-decide", "false");
    expect(within(publish).getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(within(publish).getByRole("button", { name: "Deny" })).toBeDisabled();
    expect(
      within(publish).getByText(
        "This includes work that isn't yours. An Editor or above decides it.",
      ),
    ).toBeInTheDocument();
    const update = await rowOf("appr_update");
    expect(within(update).getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("approving a person's publish request publishes it", async () => {
    approvalsServer("editor", [{ ...ROLE_REQUEST, canDecide: true }], {
      ...ROLE_REQUEST,
      status: "consumed",
      published: { site: { id: "site_1" }, snapshotId: "snap_2" },
    });
    render(wrap(<ApprovalsPage />));
    const row = await rowOf("appr_mine");
    fireEvent.click(within(row).getByRole("button", { name: "Approve" }));
    // publish requests confirm first (ApproveRequestDialog)
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved and published")).toBeInTheDocument();
  });
});

describe("agent keys follow the person's role (RFC-0005 §5)", { timeout: 45_000 }, () => {
  it("a Contributor's key stops at Edits and gets only own-draft scopes", async () => {
    const created = vi.fn();
    serve(
      ...asRole("contributor"),
      on("POST", "/api/agent-keys", (init) => {
        created(JSON.parse(String(init?.body)));
        return {
          status: 201,
          body: { id: "k", name: "x", key: "k_secret", scopes: [], mode: "edits" },
        };
      }),
    );
    render(wrap(<CreateAgentKeyDialog open onOpenChange={() => {}} endpoint="http://x/mcp" />));
    await waitFor(() => expect(screen.getByTestId("role-cap")).toBeInTheDocument());
    const step = screen.getByTestId("create-step-mode");
    expect(
      [...step.querySelectorAll("[data-mode-option]")].map((e) =>
        e.getAttribute("data-mode-option"),
      ),
    ).toEqual(["plan", "manual", "edits"]);
    expect(screen.getByTestId("role-cap")).toHaveTextContent(
      "Your role allows agent keys up to Edits mode.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByTestId("create-step-details");
    fireEvent.click(screen.getByRole("button", { name: /Advanced: scopes/ }));
    const scopes = await screen.findByTestId("advanced-scopes");
    expect(scopes).toHaveTextContent("content:draft:own");
    expect(scopes).toHaveTextContent("Your role gives content:write only for your own work.");
    const publish = within(scopes)
      .getByText("site:publish")
      .closest("label")
      ?.querySelector('[role="checkbox"]');
    expect(publish).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Drafts" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(created).toHaveBeenCalled());
    // the role-narrowed mode default is left to the server
    expect(created.mock.calls[0]?.[0]).toEqual({ name: "Drafts", mode: "edits" });
  });

  it("an Administrator sees every key with its owner, and may end or revoke but not elevate", async () => {
    const key = (
      id: string,
      owner: "author" | "administrator",
      extra: Partial<AgentKeySummary> = {},
    ): AgentKeySummary => ({
      id,
      name: `${NAMES[owner]}'s agent`,
      start: "ab",
      scopes: ["site:read", "content:read", "content:write", "site:publish"],
      effectiveScopes:
        owner === "author"
          ? ["site:read", "content:read", "content:write:own", "site:publish:own"]
          : undefined,
      mode: "edits",
      createdAt: base.createdAt,
      expiresAt: null,
      enabled: true,
      agentId: `agent_${id}`,
      owner: { userId: USER_IDS[owner], name: NAMES[owner], role: owner },
      ...extra,
    });
    serve(
      ...asRole("administrator"),
      (url) =>
        url === "/api/agent-keys?all=1"
          ? {
              status: 200,
              body: [
                key("k_author", "author", {
                  elevation: {
                    mode: "auto",
                    until: "2099-01-01T00:00:00Z",
                    grantedBy: "user_x",
                    grantedAt: base.createdAt,
                  },
                }),
                key("k_admin", "administrator"),
              ],
            }
          : undefined,
      on("GET", "/api/agent-keys", { status: 200, body: [key("k_admin", "administrator")] }),
      on("GET", "/api/sites", { status: 200, body: [] }),
    );
    render(wrap(<AgentsPage />));
    fireEvent.click(await screen.findByRole("tab", { name: "All keys" }));
    const row = await waitFor(() => {
      const r = document.querySelector('[data-key-id="k_author"]');
      if (!r) throw new Error("no row");
      return r as HTMLElement;
    });
    expect(row).toHaveTextContent("Arda");
    expect(row.querySelector('[data-role="author"]')).toBeTruthy();
    // stored scopes are wider than what the key does now
    expect(row.querySelector('[data-scopes="narrowed"]')).toHaveTextContent("content:write:own");
    expect(within(row).getByText("Narrowed by role")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Elevate temporarily" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "End elevation now" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Revoke" })).toBeInTheDocument();
  });
});

describe("activity and the bell", { timeout: 45_000 }, () => {
  it("tells someone without audit:read that they see their own activity", async () => {
    serve(
      ...asRole("author"),
      on("GET", "/api/sites/site_1/activity", {
        status: 200,
        body: { items: [], nextBefore: null },
      }),
    );
    render(wrap(<ActivityPage />));
    expect(await screen.findByText("Your activity")).toBeInTheDocument();
  });

  it("lists member-joined and role-changed notifications", async () => {
    serve(
      on("GET", "/api/notifications", {
        status: 200,
        body: {
          noticeMinutes: 10,
          items: [
            {
              id: "member-joined:inv_1",
              kind: "member-joined",
              inviteId: "inv_1",
              userId: "u_new",
              name: "Yeni",
              role: "author",
              at: base.createdAt,
            },
            {
              id: "role-changed:42",
              kind: "role-changed",
              from: "editor",
              to: "author",
              by: { kind: "human", id: ACTOR_IDS.owner, name: NAMES.owner },
              at: base.createdAt,
            },
          ],
        },
      }),
    );
    render(wrap(<NotificationsBell />));
    fireEvent.click(await screen.findByRole("button", { name: "Notifications (2)" }));
    expect(await screen.findByText("Yeni joined")).toBeInTheDocument();
    expect(screen.getByText("Your role is now Author")).toBeInTheDocument();
    expect(screen.getByText(/Halil changed it/)).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Open Team" }))
      expect(link).toHaveAttribute("href", "/team");
  });
});

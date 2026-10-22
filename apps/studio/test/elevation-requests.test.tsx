/**
 * Agents ask for an elevation (ADR-0016 addendum): how Approvals shows the request and its
 * history, the grant dialog (fixed mode, capped presets, Auto consent, 400/409), the Agents page
 * "Asks for Auto" badge and the Activity row of the grant.
 */
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { AgentKeySummary, Approval, AuditRow } from "../src/lib/api.ts";
import { ActivityPage } from "../src/routes/ActivityPage.tsx";
import { AgentsPage } from "../src/routes/AgentsPage.tsx";
import { ApprovalsPage } from "../src/routes/ApprovalsPage.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => vi.fn(),
}));

function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>
        <Toasty>{children}</Toasty>
      </QueryClientProvider>
    </I18nProvider>
  );
}

type Reply = { status: number; body: unknown };
type Handler = (url: string, init?: RequestInit) => Reply | undefined;
function serve(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init) ?? { status: 404, body: { error: "not_found", message: url } };
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const posts = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
    .map((c) => {
      const body = (c[1] as RequestInit).body;
      return body === undefined ? [c[0]] : [c[0], JSON.parse(String(body))];
    });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REASON = "Publish the <img src=x onerror=alert(1)> launch fixes";
const desk = { kind: "agent" as const, id: "agent_desk01", name: "Desk" };
const ELEVATE: Approval = {
  id: "appr_elev",
  siteId: "site_1",
  tool: "request_elevation",
  input: { mode: "auto", minutes: 60, reason: REASON, keyId: "key_desk" },
  actor: desk,
  prompt: `Desk asks to work in AUTO mode for 60 min (its own mode is EDITS): "${REASON}"`,
  mode: "edits",
  cause: "tool",
  status: "pending",
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: "2099-10-09T10:00:00Z",
};
const history = (id: string, status: Approval["status"], minutes = 60): Approval => ({
  ...ELEVATE,
  id,
  status,
  input: { mode: "auto", minutes, reason: "Old", keyId: "key_desk" },
  decidedAt: "2026-10-08T10:05:00Z",
  decidedBy: "user_owner01",
});
const KEY: AgentKeySummary = {
  id: "key_desk",
  name: "Desk",
  start: "chk_de",
  scopes: ["site:read", "content:read", "preview:create", "content:write"],
  // The key list is the current truth: its own mode changed to Manual since the agent asked.
  mode: "manual",
  effectiveMode: "manual",
  createdAt: "2026-10-08T09:00:00Z",
  expiresAt: null,
  enabled: true,
};

/** Approvals server: a mutable list, the key list, and a configurable answer to approve. */
function approvalsServer(
  options: { approve?: Reply; items?: Approval[]; keys?: AgentKeySummary[] } = {},
) {
  const state = { items: options.items ?? [ELEVATE] };
  const fetch = serve((url, init) => {
    if (init?.method === "POST" && url.endsWith("/approve"))
      return options.approve ?? { status: 200, body: { ...ELEVATE, status: "consumed" } };
    if (init?.method === "POST" && url.endsWith("/deny"))
      return { status: 200, body: { ...ELEVATE, status: "denied" } };
    if (url === "/api/sites/site_1/approvals") return { status: 200, body: { items: state.items } };
    if (url === "/api/sites/site_1/approvals?status=pending")
      return { status: 200, body: { items: state.items.filter((a) => a.status === "pending") } };
    if (url === "/api/agent-keys") return { status: 200, body: options.keys ?? [KEY] };
    if (url === "/api/me")
      return { status: 200, body: { actor: { kind: "human", id: "user_owner01" } } };
    return undefined;
  });
  return { fetch, state };
}

const findRow = (container: HTMLElement, id: string) =>
  waitFor(() => {
    const row = container.querySelector(`[data-approval-id="${id}"]`);
    if (!row) throw new Error(`no row ${id}`);
    return row as HTMLElement;
  });

async function openGrantDialog(container: HTMLElement) {
  const row = await findRow(container, "appr_elev");
  fireEvent.click(within(row).getByRole("button", { name: /approve/i }));
  return screen.findByTestId("approve-elevation");
}
const grantButton = () => screen.getByRole("button", { name: "Grant elevation" });
const consent = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByText(/can publish without my approval/));

describe("elevation requests in Approvals", () => {
  it("says what the agent asks in the person's language, with its reason as plain text", async () => {
    approvalsServer();
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_elev");
    await waitFor(() =>
      expect(row.querySelector("[data-transition]")).toHaveAttribute(
        "data-transition",
        "manual:auto",
      ),
    );
    expect(within(row).getByText("Elevation request")).toBeInTheDocument();
    expect(within(row).getByTestId("elevation-sentence")).toHaveTextContent(
      "Desk asks to work in Auto mode for 1 hour.",
    );
    // The agent's words are text, never markup; the server's English line is not shown.
    expect(within(row).getByTestId("elevation-reason").textContent).toBe(`“${REASON}”`);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("AUTO mode");
    expect(container.textContent).not.toContain("its own mode is");
    expect(within(row).getByTestId("elevation-until")).toHaveTextContent("If you approve now");
  });

  it("falls back to the prompt's own mode when the key list is unavailable", async () => {
    serve((url) =>
      url.startsWith("/api/sites/site_1/approvals")
        ? { status: 200, body: { items: [ELEVATE] } }
        : undefined,
    );
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_elev");
    await waitFor(() =>
      expect(row.querySelector("[data-transition]")).toHaveAttribute(
        "data-transition",
        "edits:auto",
      ),
    );
  });

  it("labels history rows by mode and duration; a used request reads as granted", async () => {
    approvalsServer({
      items: [
        history("appr_granted", "consumed"),
        history("appr_denied", "denied", 240),
        history("appr_expired", "expired", 15),
        {
          ...history("appr_short", "consumed"),
          grant: { from: "edits", mode: "auto", minutes: 15, until: "2026-10-08T10:20:00Z" },
        },
      ],
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const granted = await findRow(container, "appr_granted");
    expect(within(granted).getByText("Elevation to Auto · 1 hour")).toBeInTheDocument();
    expect(within(granted).getByText("Granted")).toBeInTheDocument();
    const denied = await findRow(container, "appr_denied");
    expect(within(denied).getByText("Elevation to Auto · 4 hours")).toBeInTheDocument();
    expect(denied.querySelector("[data-status]")).toHaveAttribute("data-status", "denied");
    expect(within(denied).getByText("Denied")).toBeInTheDocument();
    const expired = await findRow(container, "appr_expired");
    expect(within(expired).getByText("Elevation to Auto · 15 min")).toBeInTheDocument();
    expect(within(expired).getByText("Expired")).toBeInTheDocument();
    // granted shorter than asked: the time granted, and what was asked
    const short = await findRow(container, "appr_short");
    expect(
      within(short).getByText("Elevation to Auto · 15 min (asked 1 hour)"),
    ).toBeInTheDocument();
  });

  it("says when the key's own mode has caught up and nothing is left to grant", async () => {
    approvalsServer({ keys: [{ ...KEY, mode: "auto", effectiveMode: "auto" }] });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_elev");
    expect(await within(row).findByTestId("elevation-cannot-take")).toHaveTextContent(
      "Desk's key now works in Auto mode on its own, so there is nothing to grant.",
    );
    expect(within(row).queryByTestId("elevation-until")).toBeNull();
  });

  it("speaks Turkish", async () => {
    approvalsServer();
    const { container } = render(wrap(<ApprovalsPage />, "tr"));
    const row = await findRow(container, "appr_elev");
    expect(within(row).getByText("Yükseltme isteği")).toBeInTheDocument();
    expect(within(row).getByTestId("elevation-sentence")).toHaveTextContent(
      "Desk, 1 saat boyunca Otomatik modunda çalışmak istiyor.",
    );
    expect(within(row).getByText("Agent'ın gerekçesi")).toBeInTheDocument();
  });

  it("denies with one click", async () => {
    const { fetch } = approvalsServer();
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_elev");
    fireEvent.click(within(row).getByRole("button", { name: /deny/i }));
    await waitFor(() =>
      expect(posts(fetch)).toEqual([["/api/sites/site_1/approvals/appr_elev/deny"]]),
    );
    expect(screen.queryByTestId("approve-elevation")).toBeNull();
  });
});

describe("grant dialog", () => {
  it("fixes the mode, caps the presets at the request and needs Auto consent", async () => {
    const { fetch } = approvalsServer();
    const { container } = render(wrap(<ApprovalsPage />));
    const dialog = await openGrantDialog(container);
    // Approve never grants straight away.
    expect(posts(fetch)).toEqual([]);
    expect(
      within(dialog).getByTestId("elevation-mode").querySelector("[data-mode]"),
    ).toHaveAttribute("data-mode", "auto");
    expect(dialog.querySelector('[role="radio"]')).toBeNull();
    const presets = within(dialog).getByTestId("grant-presets");
    expect(
      within(presets)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["15 min", "1 hour", "Custom"]);
    expect(within(presets).getByRole("tab", { name: "1 hour" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(within(dialog).getByTestId("grant-summary-text")).toHaveTextContent(
        /^Desk works in Auto mode until .+, then back to Manual\.$/,
      ),
    );
    // Auto without the checkbox: nothing is sent.
    fireEvent.click(grantButton());
    expect(
      await screen.findByText("Confirm that you understand what Auto mode does"),
    ).toBeInTheDocument();
    expect(posts(fetch)).toEqual([]);
    consent(dialog);
    fireEvent.click(grantButton());
    // As requested: no body, the server grants what was asked.
    await waitFor(() =>
      expect(posts(fetch)).toEqual([["/api/sites/site_1/approvals/appr_elev/approve"]]),
    );
    expect(await screen.findByText("Elevation granted")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("approve-elevation")).toBeNull());
  });

  it("sends minutes only when shortened, and never more than requested", async () => {
    const { fetch } = approvalsServer();
    const { container } = render(wrap(<ApprovalsPage />));
    const dialog = await openGrantDialog(container);
    consent(dialog);
    const presets = within(dialog).getByTestId("grant-presets");
    fireEvent.click(within(presets).getByRole("tab", { name: "Custom" }));
    const custom = await within(dialog).findByLabelText("Custom duration");
    expect(within(dialog).getByTestId("grant-custom")).toHaveTextContent(
      "Between 5 minutes and 1 hour.",
    );
    fireEvent.change(custom, { target: { value: "90" } });
    expect(await within(dialog).findByText("At most 1 hour")).toBeInTheDocument();
    fireEvent.click(grantButton());
    expect(posts(fetch)).toEqual([]);
    fireEvent.click(within(presets).getByRole("tab", { name: "15 min" }));
    fireEvent.click(grantButton());
    await waitFor(() =>
      expect(posts(fetch)).toEqual([
        ["/api/sites/site_1/approvals/appr_elev/approve", { minutes: 15 }],
      ]),
    );
  });

  it("offers an odd request as its own preset, in the presets' words", async () => {
    approvalsServer({
      items: [
        { ...ELEVATE, input: { mode: "edits", minutes: 90, reason: "x", keyId: "key_desk" } },
      ],
      keys: [{ ...KEY, mode: "plan" }],
    });
    const { container } = render(wrap(<ApprovalsPage />, "tr"));
    const row = await findRow(container, "appr_elev");
    fireEvent.click(within(row).getByRole("button", { name: /onayla/i }));
    const dialog = await screen.findByTestId("approve-elevation");
    expect(
      within(within(dialog).getByTestId("grant-presets"))
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["15 dk", "1 saat", "1 sa 30 dk", "Özel"]);
    // Edits needs no Auto consent.
    expect(within(dialog).queryByTestId("auto-confirm")).toBeNull();
  });

  it("keeps a 400 in the dialog", async () => {
    approvalsServer({
      approve: {
        status: 400,
        body: { error: "bad_request", message: "an approver can shorten a request, not extend it" },
      },
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const dialog = await openGrantDialog(container);
    consent(dialog);
    fireEvent.click(grantButton());
    const error = await within(dialog).findByTestId("grant-error");
    expect(error).toHaveTextContent("an approver can shorten a request, not extend it");
    expect(error).not.toHaveAttribute("data-status");
    expect(screen.getByTestId("approve-elevation")).toBeInTheDocument();
  });

  it("shows the server's 409 and keeps a still-pending request listed after a refresh", async () => {
    const { fetch } = approvalsServer({
      approve: {
        status: 409,
        body: {
          error: "elevation_conflict",
          message: "the agent's key no longer exists, or it is not yours",
        },
      },
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const dialog = await openGrantDialog(container);
    const listCalls = () =>
      fetch.mock.calls.filter((c) => c[0] === "/api/sites/site_1/approvals").length;
    const before = listCalls();
    consent(dialog);
    fireEvent.click(grantButton());
    const error = await within(dialog).findByTestId("grant-error");
    expect(error).toHaveAttribute("data-status", "409");
    expect(error).toHaveTextContent("the agent's key no longer exists, or it is not yours");
    expect(error).toHaveTextContent("The request stays in the list while it is pending.");
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    expect(container.querySelector('[data-approval-id="appr_elev"]')).not.toBeNull();
    expect(screen.getByTestId("approve-elevation")).toBeInTheDocument();
  });

  it("closes when the server says the request was decided meanwhile", async () => {
    const server = approvalsServer({
      approve: {
        status: 409,
        body: { error: "conflict", message: "this request is denied; it can no longer be decided" },
      },
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const dialog = await openGrantDialog(container);
    consent(dialog);
    server.state.items = [{ ...ELEVATE, status: "denied" }];
    fireEvent.click(grantButton());
    expect(await screen.findByText("This request is no longer pending")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("approve-elevation")).toBeNull());
  });
});

describe("Agents page", () => {
  const agentsServer = (elevationRequests: boolean) =>
    serve((url) => {
      if (url === "/api/agent-keys") return { status: 200, body: [KEY] };
      if (url === "/api/instance")
        return {
          status: 200,
          body: {
            signUp: "first-user",
            features: {
              agentKeys: true,
              mcp: true,
              activity: true,
              previewLinks: false,
              deployTransfer: false,
              approvals: true,
              elevationRequests,
            },
          },
        };
      if (url === "/api/sites") return { status: 200, body: [{ id: "site_1", name: "Blog" }] };
      if (url === "/api/sites/site_1/approvals?status=pending")
        return { status: 200, body: { items: [ELEVATE] } };
      return undefined;
    });

  it("marks a key whose agent asks for more autonomy, linking to that site's Approvals", async () => {
    agentsServer(true);
    const { container } = render(wrap(<AgentsPage />));
    const badge = await waitFor(() => {
      const el = container.querySelector('[data-key-id="key_desk"] [data-asks-for="auto"]');
      if (!el) throw new Error("no badge");
      return el as HTMLElement;
    });
    expect(badge).toHaveTextContent("Asks for Auto");
    expect(badge.querySelector("a")).toHaveAttribute("href", "/sites/site_1/approvals");
  });

  it("asks no site for approvals on servers without elevation requests", async () => {
    const fetch = agentsServer(false);
    const { container } = render(wrap(<AgentsPage />));
    await waitFor(() => expect(container.querySelector('[data-key-id="key_desk"]')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector("[data-asks-for]")).toBeNull();
    expect(fetch.mock.calls.some((c) => String(c[0]).includes("/approvals"))).toBe(false);
  });
});

describe("Activity", () => {
  const GRANT: AuditRow = {
    id: 42,
    at: "2026-10-08T10:06:00Z",
    actor: { kind: "human", id: "user_owner01", name: "Halil" },
    siteId: "site_1",
    tool: "agent-key.elevate",
    decision: "allow",
    outcome: "ok",
    reason:
      "Desk: edits → auto until 2026-10-08T11:06:00.000Z (60 min), requested by the agent (appr_elev)",
    mode: "auto",
    elevation: { from: "edits", until: "2026-10-08T11:06:00.000Z" },
  };

  it("renders a granted elevation with its modes and who asked for it", async () => {
    serve((url) =>
      url.startsWith("/api/sites/site_1/activity")
        ? { status: 200, body: { items: [GRANT], nextBefore: null } }
        : undefined,
    );
    const { container } = render(wrap(<ActivityPage />));
    const row = await waitFor(() => {
      const el = container.querySelector('[data-event-id="42"]');
      if (!el) throw new Error("no row");
      return el as HTMLElement;
    });
    expect(within(row).getByText("Elevate agent key")).toBeInTheDocument();
    const grant = row.querySelector("[data-elevation-grant]") as HTMLElement;
    expect(grant).toHaveAttribute("data-elevation-grant", "auto");
    expect(grant).toHaveAttribute("data-requested", "true");
    expect(grant.querySelector('[data-mode="edits"]')).not.toBeNull();
    expect(
      grant.querySelector('[data-mode="auto"] [data-testid="elevation-marker"]'),
    ).not.toBeNull();
    expect(within(row).getByText("Requested by the agent")).toBeInTheDocument();

    fireEvent.click(row);
    const detail = await screen.findByTestId("activity-elevation-grant");
    expect(detail).toHaveTextContent("then back to Edits.");
    expect(detail).toHaveTextContent("appr_elev");
  });
});

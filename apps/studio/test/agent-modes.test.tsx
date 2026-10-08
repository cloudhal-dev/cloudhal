/**
 * Agent modes in Studio (ADR-0015): the key list's mode badges, the change-mode flow, how audit
 * rows show the mode and auto-approved publishes, and manual-mode approval requests.
 */
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeAgentModeDialog } from "../src/components/ChangeAgentModeDialog.tsx";
import { CodeProvider } from "../src/components/CodeProvider.tsx";
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
        <CodeProvider>
          <Toasty>{children}</Toasty>
        </CodeProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const key = (over: Partial<AgentKeySummary>): AgentKeySummary => ({
  id: "key_docs",
  name: "Docs bot",
  start: "chk_ab",
  scopes: ["site:read", "content:read", "content:write"],
  mode: "edits",
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: null,
  enabled: true,
  ...over,
});

/** The radio control of one mode card inside `root`. */
function modeRadio(root: HTMLElement, mode: string): HTMLElement {
  const radio = root
    .querySelector(`[data-mode-option="${mode}"]`)
    ?.closest("label")
    ?.querySelector('[role="radio"]');
  if (!radio) throw new Error(`no ${mode} card`);
  return radio as HTMLElement;
}
const patches = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")
    .map((c) => [c[0], JSON.parse(String((c[1] as RequestInit).body))]);

describe("agent key list", () => {
  it("shows each key's mode as a toned badge and explains how modes work", async () => {
    serve((url) =>
      url === "/api/agent-keys"
        ? {
            status: 200,
            body: [
              key({
                id: "key_plan",
                name: "Reader",
                mode: "plan",
                scopes: ["preview:create", "site:read", "content:read"],
              }),
              key({ id: "key_auto", name: "Newsroom", mode: "auto" }),
              // A server that predates modes: reads as edits.
              { ...key({ id: "key_old", name: "Legacy" }), mode: undefined },
            ],
          }
        : undefined,
    );
    const { container } = render(wrap(<AgentsPage />));
    await screen.findByText("Newsroom");
    const modeOf = (id: string) =>
      container.querySelector(`[data-key-id="${id}"] [data-mode]`)?.getAttribute("data-mode");
    expect(modeOf("key_plan")).toBe("plan");
    expect(modeOf("key_auto")).toBe("auto");
    expect(modeOf("key_old")).toBe("edits");
    // Scopes that are exactly the mode's defaults collapse into one quiet badge.
    const scopesOf = (id: string) =>
      container.querySelector(`[data-key-id="${id}"] [data-scopes]`) as HTMLElement;
    expect(scopesOf("key_plan")).toHaveAttribute("data-scopes", "mode-default");
    expect(scopesOf("key_plan")).toHaveTextContent("Mode default · 3 scopes");
    expect(scopesOf("key_auto")).toHaveAttribute("data-scopes", "custom");
    expect(scopesOf("key_auto")).toHaveTextContent("content:write");

    const card = screen.getAllByTestId("how-modes")[0] as HTMLElement;
    expect(card).toHaveTextContent("How modes work");
    const rule = (mode: string, column: number) =>
      card
        .querySelector(`[data-mode-row="${mode}"]`)
        ?.querySelectorAll("[data-rule]")
        [column]?.getAttribute("data-rule");
    expect([rule("plan", 0), rule("manual", 0), rule("edits", 1), rule("auto", 1)]).toEqual([
      "denied",
      "waits",
      "waits",
      "lowRisk",
    ]);
    expect(rule("auto", 2)).toBe("waits");
    expect(card.querySelector('[data-mode-row="bypass"]')).toBeNull();
    expect(card).toHaveTextContent("cloudhal mcp --mode bypass");
  });

  it("changes a key's mode from the row menu, with a toast and a refreshed list", async () => {
    let current = key({});
    const fetch = serve((url, init) => {
      if (url === "/api/agent-keys") return { status: 200, body: [current] };
      if (url === "/api/agent-keys/key_docs" && init?.method === "PATCH") {
        current = { ...current, mode: JSON.parse(String(init.body)).mode };
        return { status: 200, body: current };
      }
      return undefined;
    });
    const { container } = render(wrap(<AgentsPage />));
    await screen.findByText("Docs bot");
    const listCalls = () => fetch.mock.calls.filter((c) => c[0] === "/api/agent-keys").length;

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change mode" }));
    const dialog = await screen.findByTestId("change-mode");
    const transition = within(dialog).getByTestId("mode-transition");
    expect(
      [...transition.querySelectorAll("[data-mode]")].map((b) => b.getAttribute("data-mode")),
    ).toEqual(["edits", "edits"]);
    expect(dialog).toHaveTextContent("Applies on the agent's next call");
    expect(dialog.querySelector('[data-mode-option="edits"]')).toHaveTextContent("Current");
    expect(dialog.querySelector('[data-mode-option="bypass"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Change mode" })).toBeDisabled();

    // Switching to auto needs explicit consent.
    fireEvent.click(modeRadio(dialog, "auto"));
    await waitFor(() =>
      expect(
        [...transition.querySelectorAll("[data-mode]")].map((b) => b.getAttribute("data-mode")),
      ).toEqual(["edits", "auto"]),
    );
    const consent = within(dialog).getByTestId("auto-confirm");
    expect(consent).toHaveTextContent("goes live right away");
    fireEvent.click(screen.getByRole("button", { name: "Change mode" }));
    expect(
      await screen.findByText("Confirm that you understand what Auto mode does"),
    ).toBeInTheDocument();
    expect(patches(fetch)).toEqual([]);

    const before = listCalls();
    fireEvent.click(within(consent).getByText(/can publish without my approval/));
    fireEvent.click(screen.getByRole("button", { name: "Change mode" }));
    await waitFor(() =>
      expect(patches(fetch)).toEqual([["/api/agent-keys/key_docs", { mode: "auto" }]]),
    );
    expect(await screen.findByText("Mode changed")).toBeInTheDocument();
    expect(screen.getByText("Docs bot now works in Auto mode.")).toBeInTheDocument();
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    await waitFor(() =>
      expect(
        container.querySelector('[data-key-id="key_docs"] [data-mode]')?.getAttribute("data-mode"),
      ).toBe("auto"),
    );
  });

  it("keeps the dialog open and shows the server's reason when the change is refused (400)", async () => {
    const fetch = serve((url, init) =>
      init?.method === "PATCH" && url === "/api/agent-keys/key_docs"
        ? {
            status: 400,
            body: {
              error: "bad_request",
              message: 'mode "plan" is not available for API keys (bypass is local only)',
            },
          }
        : undefined,
    );
    const onOpenChange = vi.fn();
    render(wrap(<ChangeAgentModeDialog agentKey={key({})} onOpenChange={onOpenChange} />));
    const dialog = await screen.findByTestId("change-mode");
    fireEvent.click(modeRadio(dialog, "plan"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change mode" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Change mode" }));
    expect(await screen.findByText("Couldn't change the mode")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("is not available for API keys");
    expect(patches(fetch)).toEqual([["/api/agent-keys/key_docs", { mode: "plan" }]]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("speaks Turkish", async () => {
    serve(() => undefined);
    render(wrap(<ChangeAgentModeDialog agentKey={key({})} onOpenChange={() => {}} />, "tr"));
    const dialog = await screen.findByTestId("change-mode");
    expect(dialog).toHaveTextContent("Agent'ın bir sonraki çağrısında geçerli olur");
    expect(dialog.querySelector('[data-mode-option="edits"]')).toHaveTextContent("Önerilen");
    expect(dialog.querySelector('[data-mode-option="auto"]')).toHaveTextContent("Otomatik");
  });
});

const agent = { kind: "agent" as const, id: "agent_news01", name: "Newsroom" };
const AUTO_PUBLISH: AuditRow = {
  id: 41,
  at: "2026-10-08T10:00:00Z",
  actor: agent,
  siteId: "site_1",
  tool: "publish",
  decision: "allow",
  outcome: "ok",
  mode: "auto",
  reason: "auto mode: published without approval (2 article change(s) only)",
  snapshotId: "snap_9",
};
const MANUAL_EDIT: AuditRow = {
  id: 40,
  at: "2026-10-08T09:59:00Z",
  actor: { ...agent, name: "Careful bot", id: "agent_care01" },
  siteId: "site_1",
  tool: "update_entry",
  decision: "approval-required",
  outcome: "pending",
  mode: "manual",
  reason: "manual mode: update_entry needs a person's approval",
};
const HUMAN: AuditRow = {
  id: 39,
  at: "2026-10-08T09:58:00Z",
  actor: { kind: "human", id: "user_owner01", name: "Owner" },
  siteId: "site_1",
  tool: "publish",
  decision: "allow",
  outcome: "ok",
};

describe("activity", () => {
  it("shows the mode in the actor cell and marks auto-approved publishes", async () => {
    serve((url) =>
      url.startsWith("/api/sites/site_1/activity")
        ? { status: 200, body: { items: [AUTO_PUBLISH, MANUAL_EDIT, HUMAN], nextBefore: null } }
        : undefined,
    );
    const { container } = render(wrap(<ActivityPage />));
    await screen.findByText("Careful bot");
    const row = (id: number) => container.querySelector(`[data-event-id="${id}"]`) as HTMLElement;
    expect(row(41).querySelector("[data-mode]")).toHaveAttribute("data-mode", "auto");
    expect(row(41).querySelector("[data-auto-approved]")).toHaveTextContent("Auto-approved");
    expect(row(40).querySelector("[data-mode]")).toHaveAttribute("data-mode", "manual");
    expect(row(40).querySelector("[data-auto-approved]")).toBeNull();
    // People have no mode, and a person's publish is never "auto-approved".
    expect(row(39).querySelector("[data-mode]")).toBeNull();
    expect(row(39).querySelector("[data-auto-approved]")).toBeNull();

    fireEvent.click(row(41));
    const detail = await screen.findByTestId("activity-detail");
    expect(detail).toHaveTextContent("Published without a person");
    expect(detail).toHaveTextContent("(2 in total)");
    expect(detail.querySelector("[data-mode]")).toHaveAttribute("data-mode", "auto");
  });
});

describe("approvals from manual-mode agents", () => {
  it("explains a content edit that waits only because of Manual mode, and approves it directly", async () => {
    const MANUAL: Approval = {
      id: "appr_man",
      siteId: "site_1",
      tool: "update_entry",
      input: { siteId: "site_1", entryId: "entry_1" },
      actor: { kind: "agent", id: "agent_care01", name: "Careful bot" },
      prompt: "manual mode: update_entry needs a person's approval",
      status: "pending",
      createdAt: "2026-10-08T10:00:00Z",
      expiresAt: "2099-10-09T10:00:00Z",
    };
    const fetch = serve((url, init) => {
      if (url === "/api/sites/site_1/approvals") return { status: 200, body: { items: [MANUAL] } };
      if (url === "/api/me") return { status: 200, body: { actor: { kind: "human", id: "u" } } };
      if (init?.method === "POST") return { status: 200, body: { ...MANUAL, status: "approved" } };
      return undefined;
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const pending = await screen.findByTestId("pending-approvals");
    const text = await within(pending).findByText(
      "Careful bot works in Manual mode, so this change waits for you: Update article.",
    );
    expect(text.closest("[data-manual-mode]")?.querySelector("[data-mode]")).toHaveAttribute(
      "data-mode",
      "manual",
    );
    // The raw policy line is not shown to the person.
    expect(container.textContent).not.toContain("needs a person's approval");
    fireEvent.click(within(pending).getByRole("button", { name: /approve/i }));
    await waitFor(() =>
      expect(
        fetch.mock.calls
          .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
          .map((c) => c[0]),
      ).toEqual(["/api/sites/site_1/approvals/appr_man/approve"]),
    );
  });
});

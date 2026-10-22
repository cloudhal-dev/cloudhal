import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityDetailDialog } from "../src/components/ActivityDetailDialog.tsx";
import { Decision, ToolCell } from "../src/components/Audit.tsx";
import { CreateAgentKeyDialog } from "../src/components/CreateAgentKeyDialog.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";

function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("audit cells", () => {
  it("localises decisions and tool names, keeping the raw MCP name visible", () => {
    render(
      wrap(
        <>
          <Decision decision="approval-required" />
          <ToolCell tool="rollback" />
        </>,
        "tr",
      ),
    );
    expect(screen.getByText("Onay bekliyor").closest("[data-decision]")).toHaveAttribute(
      "data-decision",
      "approval-required",
    );
    expect(screen.getByText("Siteyi geri al")).toBeInTheDocument();
    expect(screen.getByText("rollback")).toBeInTheDocument();
  });
});

/** Mocks `POST /api/agent-keys`; `/api/instance` answers like an older server unless `agentModes` is given. */
function createServer(agentModes?: unknown) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        id: "key_1",
        name: body.name,
        start: "abc123",
        mode: body.mode,
        scopes: body.scopes ?? [],
        createdAt: "2026-10-08T10:00:00Z",
        expiresAt: null,
        enabled: true,
        key: "abc123_secret_value",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
    // `/api/me` (the role caps, RFC-0005) answers like a server without roles.
    url === "/api/me"
      ? new Response(JSON.stringify({ error: "not_found", message: url }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      : url === "/api/instance"
        ? agentModes
          ? new Response(JSON.stringify({ signUp: "first-user", features: {}, agentModes }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response(JSON.stringify({ error: "not_found", message: url }), {
              status: 404,
              headers: { "content-type": "application/json" },
            })
        : fetch(url, init),
  );
  return fetch;
}

/** The radio control of one mode card (Kumo renders the card as a label around it). */
function modeRadio(mode: string): HTMLElement {
  const option = document.querySelector(`[data-mode-option="${mode}"]`);
  const radio = option?.closest("label")?.querySelector('[role="radio"]');
  if (!radio) throw new Error(`no ${mode} card`);
  return radio as HTMLElement;
}
const checkedMode = () =>
  document
    .querySelector('[role="radio"][aria-checked="true"]')
    ?.closest("label")
    ?.querySelector("[data-mode-option]")
    ?.getAttribute("data-mode-option");
const sentBody = (fetch: ReturnType<typeof createServer>, call = 0) =>
  JSON.parse(String((fetch.mock.calls[call] as [string, RequestInit])[1].body));

describe("CreateAgentKeyDialog", () => {
  it("starts on the mode step with Edits preselected and recommended; never offers bypass", async () => {
    createServer();
    render(wrap(<CreateAgentKeyDialog open onOpenChange={() => {}} endpoint="http://x/mcp" />));
    const step = await screen.findByTestId("create-step-mode");
    expect(step.querySelectorAll('[role="radio"]')).toHaveLength(4);
    expect(checkedMode()).toBe("edits");
    for (const mode of ["plan", "manual", "edits", "auto"]) modeRadio(mode);
    expect(step.querySelector('[data-mode-option="bypass"]')).toBeNull();
    // Risk: plan and manual safest, edits recommended, auto with a warning.
    const risk = (mode: string) =>
      step.querySelector(`[data-mode-option="${mode}"] [data-risk]`)?.getAttribute("data-risk");
    expect(["plan", "manual", "edits", "auto"].map(risk)).toEqual([
      "safest",
      "safest",
      "recommended",
      "caution",
    ]);
    expect(within(step).getByText("Recommended")).toBeInTheDocument();
    expect(
      within(step).getByText("Waits for you: publish, rollback and deletions"),
    ).toBeInTheDocument();
    // Bypass is only explained, with the local command.
    expect(screen.getByTestId("bypass-hint")).toHaveTextContent("cloudhal mcp --mode bypass");
  });

  it("validates, sends the mode (scopes left to the server) and reveals the key exactly once", async () => {
    const fetch = createServer();
    const onOpenChange = vi.fn();
    render(wrap(<CreateAgentKeyDialog open onOpenChange={onOpenChange} endpoint="http://x/mcp" />));

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    const details = await screen.findByTestId("create-step-details");
    expect(details.querySelector("[data-mode]")).toHaveAttribute("data-mode", "edits");
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByText("Give the key a name")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    // Advanced scopes are prefilled from the mode.
    fireEvent.click(screen.getByRole("button", { name: /Advanced: scopes/ }));
    const scopes = await screen.findByTestId("advanced-scopes");
    expect(scopes).toHaveTextContent("Prefilled for Edits mode");
    const box = (label: string) =>
      within(scopes).getByText(label).closest("label")?.querySelector('[role="checkbox"]');
    expect(box("Create, edit and delete pages and articles")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(box("Publish a snapshot to the live site")).toHaveAttribute("aria-checked", "true");
    expect(box("Change site settings")).toHaveAttribute("aria-checked", "false");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(sentBody(fetch)).toEqual({ name: "CI bot", mode: "edits" });

    const reveal = await screen.findByTestId("key-reveal");
    expect(reveal).toHaveTextContent("You won't see this key again");
    expect(reveal.innerHTML).toContain("abc123_secret_value");
    // Ready-to-copy setup for each client, starting with Claude Code.
    expect(within(reveal).getByTestId("mcp-client-setup")).toHaveAttribute("data-client", "claude");
    fireEvent.click(screen.getByRole("button", { name: "I've stored the key" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("re-fills scopes when the mode changes and sends them once customised", async () => {
    const fetch = createServer();
    render(wrap(<CreateAgentKeyDialog open onOpenChange={() => {}} endpoint="http://x/mcp" />));
    await screen.findByTestId("create-step-mode");
    fireEvent.click(modeRadio("plan"));
    await waitFor(() => expect(checkedMode()).toBe("plan"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByTestId("create-step-details");
    fireEvent.click(screen.getByRole("button", { name: /Advanced: scopes/ }));
    const scopes = await screen.findByTestId("advanced-scopes");
    const box = (label: string) =>
      within(scopes).getByText(label).closest("label")?.querySelector('[role="checkbox"]');
    expect(box("Create, edit and delete pages and articles")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(box("Render draft previews")).toHaveAttribute("aria-checked", "true");

    // Unticking a scope marks the set as customised; it must never submit on its own.
    fireEvent.click(within(scopes).getByText("Render draft previews"));
    expect(await screen.findByText("Customised")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(scopes).toHaveTextContent("Some of what this mode allows won't work");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reader" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(sentBody(fetch)).toEqual({
      name: "Reader",
      mode: "plan",
      scopes: [
        "site:read",
        "content:read",
        "analytics:read",
        "comments:read",
        "schedules:read",
        "content:propose",
      ],
    });
  });

  it("asks for explicit consent before an Auto key", async () => {
    const fetch = createServer();
    render(wrap(<CreateAgentKeyDialog open onOpenChange={() => {}} endpoint="http://x/mcp" />));
    await screen.findByTestId("create-step-mode");
    expect(screen.queryByTestId("auto-confirm")).toBeNull();
    fireEvent.click(modeRadio("auto"));
    const consent = await screen.findByTestId("auto-confirm");
    expect(consent).toHaveTextContent("Small publishes go live without you");
    expect(consent).toHaveTextContent("at most 20 changes");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Confirm that you understand what Auto mode does"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("create-step-details")).toBeNull();

    fireEvent.click(within(consent).getByText(/can publish without my approval/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByTestId("create-step-details");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Newsroom" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(sentBody(fetch)).toEqual({ name: "Newsroom", mode: "auto" });
  });

  it("follows the server's mode rules from /api/instance", async () => {
    const fetch = createServer({
      modes: ["plan", "manual", "edits", "auto"],
      default: "manual",
      scopes: { manual: ["site:read", "content:read", "content:write"] },
      autoPublishLimit: 5,
    });
    render(wrap(<CreateAgentKeyDialog open onOpenChange={() => {}} endpoint="http://x/mcp" />));
    await screen.findByTestId("create-step-mode");
    // the server's default is preselected once /api/instance answers
    await waitFor(() => expect(checkedMode()).toBe("manual"));
    // the server's limit reaches the auto consent copy
    fireEvent.click(modeRadio("auto"));
    expect(await screen.findByTestId("auto-confirm")).toHaveTextContent(/\b5\b/);
    fireEvent.click(modeRadio("manual"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByTestId("create-step-details");
    fireEvent.click(screen.getByRole("button", { name: /Advanced: scopes/ }));
    const scopes = await screen.findByTestId("advanced-scopes");
    const checked = Array.from(scopes.querySelectorAll('[role="checkbox"][aria-checked="true"]'));
    expect(checked).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Desk" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // the server's own default scopes for the mode → left to the server
    expect(sentBody(fetch)).toEqual({ name: "Desk", mode: "manual" });
  });
});

describe("ActivityDetailDialog", () => {
  it("explains a denial and shows the tool input", async () => {
    render(
      wrap(
        <ActivityDetailDialog
          siteId="site_1"
          onOpenChange={() => {}}
          row={{
            id: 8,
            at: "2026-10-08T10:00:00Z",
            actor: { kind: "agent", id: "agent_reader01", name: "Reader" },
            tool: "delete_page",
            decision: "deny",
            reason: "missing scope content:write",
            outcome: "error",
            snapshotId: "snap_1",
            input: { siteId: "site_1", pageId: "page_1" },
          }}
        />,
      ),
    );
    const detail = await screen.findByTestId("activity-detail");
    expect(detail).toHaveTextContent("missing scope content:write");
    expect(detail).toHaveTextContent('"pageId": "page_1"');
    expect(screen.getByRole("link", { name: /View changes/ })).toHaveAttribute(
      "href",
      "/sites/site_1/snapshots?diff=snap_1",
    );
  });
});

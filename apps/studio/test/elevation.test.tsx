/**
 * Time-boxed elevation in Studio (ADR-0016): the elevate dialog, the key list's timer badge and
 * summary banner, ending early, the change-mode notice, and how Activity marks elevated calls.
 */
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeAgentModeDialog } from "../src/components/ChangeAgentModeDialog.tsx";
import { CodeProvider } from "../src/components/CodeProvider.tsx";
import { ElevateAgentKeyDialog } from "../src/components/ElevateAgentKeyDialog.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { AgentKeySummary, AuditRow } from "../src/lib/api.ts";
import { ActivityPage } from "../src/routes/ActivityPage.tsx";
import { AgentsPage } from "../src/routes/AgentsPage.tsx";

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
  vi.useRealTimers();
});

const NOW = Date.parse("2026-10-08T12:00:00Z");
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

const key = (over: Partial<AgentKeySummary>): AgentKeySummary => ({
  id: "key_desk",
  name: "Desk",
  start: "chk_de",
  scopes: ["site:read", "content:read", "preview:create", "content:write"],
  mode: "edits",
  effectiveMode: "edits",
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: null,
  enabled: true,
  ...over,
});
const elevated = (minutesLeft: number, over: Partial<AgentKeySummary> = {}) =>
  key({
    effectiveMode: "auto",
    elevation: {
      mode: "auto",
      until: inMinutes(minutesLeft),
      grantedBy: "user_owner",
      grantedAt: inMinutes(minutesLeft - 60),
      reason: "Launch day",
    },
    ...over,
  });

const calls = (fetch: ReturnType<typeof serve>, method: string) =>
  fetch.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === method)
    .map((c) => {
      const body = (c[1] as RequestInit).body;
      return body === undefined ? [c[0]] : [c[0], JSON.parse(String(body))];
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
const offered = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-mode-option]")].map((e) => e.getAttribute("data-mode-option"));

describe("elevate dialog", () => {
  it("offers only the modes above the key's own, with presets and the summary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const fetch = serve((url, init) =>
      init?.method === "POST" && url === "/api/agent-keys/key_desk/elevation"
        ? { status: 200, body: elevated(240) }
        : undefined,
    );
    const onOpenChange = vi.fn();
    render(
      wrap(
        <ElevateAgentKeyDialog agentKey={key({ mode: "manual" })} onOpenChange={onOpenChange} />,
      ),
    );
    const dialog = await screen.findByTestId("elevate-key");
    // Manual → Edits or Auto; Plan and Manual itself have nothing to offer.
    expect(offered(dialog)).toEqual(["edits", "auto"]);
    expect(within(dialog).getByTestId("own-mode").querySelector("[data-mode]")).toHaveAttribute(
      "data-mode",
      "manual",
    );
    expect(dialog.querySelector('[data-mode-option="bypass"]')).toBeNull();
    // The next mode up is preselected, so no Auto consent is needed yet.
    expect(within(dialog).queryByTestId("auto-confirm")).toBeNull();
    expect(within(dialog).queryByTestId("elevation-replaces")).toBeNull();

    const presets = within(dialog).getByTestId("elevation-presets");
    expect(
      within(presets)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["15 min", "1 hour", "4 hours", "1 day", "Custom"]);
    expect(within(dialog).getByTestId("elevation-summary-text")).toHaveTextContent(
      "(in 1 hour), then back to Manual.",
    );
    fireEvent.click(within(presets).getByRole("tab", { name: "4 hours" }));
    await waitFor(() =>
      expect(within(dialog).getByTestId("elevation-summary-text")).toHaveTextContent(
        "(in 4 hours), then back to Manual.",
      ),
    );
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "  Launch day  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Elevate" }));
    await waitFor(() =>
      expect(calls(fetch, "POST")).toEqual([
        [
          "/api/agent-keys/key_desk/elevation",
          { mode: "edits", minutes: 240, reason: "Launch day" },
        ],
      ]),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await screen.findByText("Key elevated")).toBeInTheDocument();
  });

  it("asks for consent before Auto and validates a custom duration against the bounds", async () => {
    const fetch = serve((url, init) => {
      if (url === "/api/instance")
        return {
          status: 200,
          body: {
            signUp: "first-user",
            features: {},
            agentModes: {
              modes: ["plan", "manual", "edits", "auto", "bypass"],
              default: "edits",
              scopes: {},
              autoPublishLimit: 20,
              elevation: { minMinutes: 10, maxMinutes: 120 },
            },
          },
        };
      if (init?.method === "POST") return { status: 200, body: elevated(90) };
      return undefined;
    });
    render(wrap(<ElevateAgentKeyDialog agentKey={key({})} onOpenChange={() => {}} />));
    const dialog = await screen.findByTestId("elevate-key");
    expect(offered(dialog)).toEqual(["auto"]);
    const consent = within(dialog).getByTestId("auto-confirm");
    // Presets outside the server's bounds are not offered.
    const presets = within(dialog).getByTestId("elevation-presets");
    await waitFor(() =>
      expect(
        within(presets)
          .getAllByRole("tab")
          .map((t) => t.textContent),
      ).toEqual(["15 min", "1 hour", "Custom"]),
    );

    fireEvent.click(within(presets).getByRole("tab", { name: "Custom" }));
    const custom = await within(dialog).findByLabelText("Custom duration");
    expect(within(dialog).getByTestId("elevation-custom")).toHaveTextContent(
      "Between 10 minutes and 2 hours.",
    );
    fireEvent.change(custom, { target: { value: "5" } });
    expect(await within(dialog).findByText("At least 10 minutes")).toBeInTheDocument();
    fireEvent.change(custom, { target: { value: "500" } });
    expect(await within(dialog).findByText("At most 2 hours")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("elevation-summary-text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elevate" }));
    expect(calls(fetch, "POST")).toEqual([]);

    fireEvent.change(custom, { target: { value: "90" } });
    await waitFor(() =>
      expect(within(dialog).getByTestId("elevation-summary-text")).toHaveTextContent(
        "(in 1 hour 30 minutes), then back to Edits.",
      ),
    );
    // Auto without the checkbox: nothing is sent.
    fireEvent.click(screen.getByRole("button", { name: "Elevate" }));
    expect(
      await screen.findByText("Confirm that you understand what Auto mode does"),
    ).toBeInTheDocument();
    expect(calls(fetch, "POST")).toEqual([]);

    fireEvent.click(within(consent).getByText(/can publish without my approval/));
    fireEvent.click(screen.getByRole("button", { name: "Elevate" }));
    await waitFor(() =>
      expect(calls(fetch, "POST")).toEqual([
        ["/api/agent-keys/key_desk/elevation", { mode: "auto", minutes: 90 }],
      ]),
    );
  });

  it("says it replaces the elevation in force, and keeps the dialog open on a 400", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const fetch = serve((_url, init) =>
      init?.method === "POST"
        ? {
            status: 400,
            body: {
              error: "auth",
              message: "an elevation must be more autonomous than the key's own mode (manual)",
            },
          }
        : undefined,
    );
    const onOpenChange = vi.fn();
    render(
      wrap(
        <ElevateAgentKeyDialog
          agentKey={elevated(42, { mode: "manual", effectiveMode: "auto" })}
          onOpenChange={onOpenChange}
        />,
      ),
    );
    const dialog = await screen.findByTestId("elevate-key");
    expect(within(dialog).getByTestId("elevation-replaces")).toHaveTextContent(
      "This replaces the elevation in force",
    );
    expect(within(dialog).getByTestId("elevation-replaces")).toHaveTextContent(
      "“Desk” works in Auto mode until",
    );
    fireEvent.click(screen.getByRole("button", { name: "Elevate" }));
    expect(await screen.findByText("Couldn't elevate the key")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("must be more autonomous than the key's own mode");
    expect(calls(fetch, "POST")).toEqual([
      ["/api/agent-keys/key_desk/elevation", { mode: "edits", minutes: 60 }],
    ]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("speaks Turkish", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve(() => undefined);
    render(wrap(<ElevateAgentKeyDialog agentKey={key({})} onOpenChange={() => {}} />, "tr"));
    const dialog = await screen.findByTestId("elevate-key");
    expect(dialog).toHaveTextContent("Yükseltilecek mod");
    expect(within(dialog).getByRole("tab", { name: "1 gün" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("elevation-summary-text")).toHaveTextContent(
      "(1 saat sonra). Ardından yeniden Düzenleme modunda çalışır.",
    );
    expect(screen.getByRole("button", { name: "Yükselt" })).toBeInTheDocument();
  });
});

describe("key list while elevated", () => {
  it("shows the elevated badge with time left, ticks, and flips back when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    let current = elevated(2);
    const fetch = serve((url) => {
      if (url === "/api/agent-keys") return { status: 200, body: [current] };
      if (url === "/api/me")
        return { status: 200, body: { actor: { kind: "human", id: "user_owner" } } };
      return undefined;
    });
    const { container } = render(wrap(<AgentsPage />));
    await screen.findByText("Desk");
    const row = () => container.querySelector('[data-key-id="key_desk"]') as HTMLElement;
    expect(row().querySelector("[data-mode]")).toHaveAttribute("data-mode", "auto");
    expect(row().querySelector("[data-own-mode]")).toHaveTextContent("Own mode: Edits");
    expect(within(row()).getByTestId("elevation-remaining")).toHaveTextContent("2 min left");
    const banner = screen.getByTestId("elevated-keys-banner");
    expect(banner).toHaveTextContent("1 agent key is elevated");
    expect(banner).toHaveTextContent("Desk: Edits → Auto until");

    // A minute later the label has aged without a refetch.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(within(row()).getByTestId("elevation-remaining")).toHaveTextContent("1 min left");

    // At the end the list refetches; the server no longer reports the elevation.
    const lists = () => fetch.mock.calls.filter((c) => c[0] === "/api/agent-keys").length;
    const before = lists();
    current = key({});
    await act(async () => {
      vi.advanceTimersByTime(62_000);
    });
    await waitFor(() => expect(lists()).toBeGreaterThan(before));
    await waitFor(() =>
      expect(row().querySelector("[data-mode]")).toHaveAttribute("data-mode", "edits"),
    );
    expect(within(row()).queryByTestId("elevation-remaining")).toBeNull();
    expect(screen.queryByTestId("elevated-keys-banner")).toBeNull();
  });

  it("flips back on the clock alone, even before the server answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve((url) => (url === "/api/agent-keys" ? { status: 200, body: [elevated(1)] } : undefined));
    const { container } = render(wrap(<AgentsPage />));
    await screen.findByText("Desk");
    const row = () => container.querySelector('[data-key-id="key_desk"]') as HTMLElement;
    expect(row().querySelector("[data-mode]")).toHaveAttribute("data-mode", "auto");
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    // The (stale) list still carries the elevation, but its time is up.
    await waitFor(() =>
      expect(row().querySelector("[data-mode]")).toHaveAttribute("data-mode", "edits"),
    );
  });

  it("ends an elevation from the row menu without a confirmation, with a toast", async () => {
    // Pinned clock: `elevated(30)` is relative to NOW, not to the wall clock.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    let current = elevated(30);
    const fetch = serve((url, init) => {
      if (url === "/api/agent-keys") return { status: 200, body: [current] };
      if (url === "/api/agent-keys/key_desk/elevation" && init?.method === "DELETE") {
        current = key({});
        return { status: 200, body: current };
      }
      return undefined;
    });
    const { container } = render(wrap(<AgentsPage />));
    await screen.findByText("Desk");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "End elevation now" }));
    await waitFor(() =>
      expect(calls(fetch, "DELETE")).toEqual([["/api/agent-keys/key_desk/elevation"]]),
    );
    expect(await screen.findByText("Elevation ended")).toBeInTheDocument();
    expect(screen.getByText("Desk is back in Edits mode.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        container.querySelector('[data-key-id="key_desk"] [data-mode]')?.getAttribute("data-mode"),
      ).toBe("edits"),
    );
  });

  it("ends every elevation from the summary banner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    let keys = [
      elevated(30),
      elevated(10, {
        id: "key_news",
        name: "Newsroom",
        mode: "manual",
        effectiveMode: "edits",
        elevation: {
          mode: "edits",
          until: new Date(Date.now() + 600_000).toISOString(),
          grantedBy: "user_owner",
          grantedAt: new Date().toISOString(),
        },
      }),
    ];
    const fetch = serve((url, init) => {
      if (url === "/api/agent-keys") return { status: 200, body: keys };
      const id = /^\/api\/agent-keys\/(\w+)\/elevation$/.exec(url)?.[1];
      if (id && init?.method === "DELETE") {
        const k = keys.find((x) => x.id === id) as AgentKeySummary;
        const ended = { ...k, effectiveMode: k.mode, elevation: undefined };
        keys = keys.map((x) => (x.id === id ? ended : x));
        return { status: 200, body: ended };
      }
      return undefined;
    });
    render(wrap(<AgentsPage />));
    const banner = await screen.findByTestId("elevated-keys-banner");
    expect(banner).toHaveTextContent("2 agent keys are elevated");
    expect(banner.querySelectorAll("[data-elevated-key]")).toHaveLength(2);
    expect(banner).toHaveTextContent("Newsroom: Manual → Edits until");
    fireEvent.click(within(banner).getByRole("button", { name: "End all now" }));
    await waitFor(() =>
      expect(
        calls(fetch, "DELETE")
          .map((c) => c[0])
          .sort(),
      ).toEqual(["/api/agent-keys/key_desk/elevation", "/api/agent-keys/key_news/elevation"]),
    );
    await waitFor(() => expect(screen.queryByTestId("elevated-keys-banner")).toBeNull());
  });

  it("disables elevation for a key already in Auto", async () => {
    serve((url) =>
      url === "/api/agent-keys"
        ? { status: 200, body: [key({ mode: "auto", effectiveMode: "auto" })] }
        : undefined,
    );
    render(wrap(<AgentsPage />));
    await screen.findByText("Desk");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = await screen.findByRole("menuitem", { name: "Elevate temporarily" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("menuitem", { name: "End elevation now" })).toBeNull();
  });
});

describe("change mode while elevated", () => {
  it("says whether the elevation stays or ends with the new own mode", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve(() => undefined);
    render(
      wrap(
        <ChangeAgentModeDialog
          agentKey={elevated(42, { mode: "manual" })}
          onOpenChange={() => {}}
        />,
      ),
    );
    const dialog = await screen.findByTestId("change-mode");
    const notice = within(dialog).getByTestId("change-mode-elevation");
    expect(notice).toHaveTextContent("Elevated to Auto until");
    expect(notice).toHaveAttribute("data-elevation-outcome", "keeps");
    expect(notice).toHaveTextContent("then the key works in Manual mode");

    fireEvent.click(modeRadio(dialog, "edits"));
    await waitFor(() => expect(notice).toHaveTextContent("then the key works in Edits mode"));
    expect(notice).toHaveAttribute("data-elevation-outcome", "keeps");

    fireEvent.click(modeRadio(dialog, "auto"));
    await waitFor(() => expect(notice).toHaveAttribute("data-elevation-outcome", "ends"));
    expect(notice).toHaveTextContent("Auto reaches the elevated mode, so this change ends");
  });

  it("shows no notice without an elevation in force", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve(() => undefined);
    // Expired a minute ago: no longer in force.
    render(wrap(<ChangeAgentModeDialog agentKey={elevated(-1)} onOpenChange={() => {}} />));
    const dialog = await screen.findByTestId("change-mode");
    expect(within(dialog).queryByTestId("change-mode-elevation")).toBeNull();
  });
});

describe("activity", () => {
  const ELEVATED: AuditRow = {
    id: 51,
    at: "2026-10-08T10:00:00Z",
    actor: { kind: "agent", id: "agent_desk01", name: "Desk" },
    siteId: "site_1",
    tool: "create_entry",
    decision: "allow",
    outcome: "ok",
    mode: "auto",
    elevation: { from: "edits", until: "2026-10-08T11:00:00Z" },
  };
  const PLAIN: AuditRow = { ...ELEVATED, id: 50, mode: "edits", elevation: undefined };

  it("marks calls made under an elevation and explains it in the detail", async () => {
    serve((url) =>
      url.startsWith("/api/sites/site_1/activity")
        ? { status: 200, body: { items: [ELEVATED, PLAIN], nextBefore: null } }
        : undefined,
    );
    const { container } = render(wrap(<ActivityPage />));
    await waitFor(() => expect(container.querySelector('[data-event-id="51"]')).not.toBeNull());
    const row = (id: number) => container.querySelector(`[data-event-id="${id}"]`) as HTMLElement;
    const badge = row(51).querySelector("[data-mode]") as HTMLElement;
    expect(badge).toHaveAttribute("data-mode", "auto");
    expect(badge).toHaveAttribute("data-elevated", "true");
    expect(within(badge).getByRole("img", { name: "Temporarily elevated" })).toBeInTheDocument();
    expect(row(50).querySelector("[data-elevated]")).toBeNull();
    expect(row(50).querySelector('[data-testid="elevation-marker"]')).toBeNull();

    fireEvent.click(row(51));
    const detail = await screen.findByTestId("activity-detail");
    const fact = within(detail).getByTestId("activity-elevation");
    expect(fact).toHaveTextContent("Temporarily elevated from Edits until");
    expect(fact).toHaveTextContent("The key's own mode is Edits.");
    expect(detail.querySelector("[data-mode]")).toHaveAttribute("data-elevated", "true");
  });
});

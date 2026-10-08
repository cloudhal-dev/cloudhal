/**
 * Notifications in Studio (ADR-0016 addendum "told before it ends", DESIGN.md §2n): the header
 * bell and its panel, extend / end from there, polling, one-time toasts, browser notifications,
 * the Account opt-in, and the Agents banner's "Extend 1 hour".
 */
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => navigate,
}));

import { CodeProvider } from "../src/components/CodeProvider.tsx";
import { NotificationSettings } from "../src/components/NotificationSettings.tsx";
import { NotificationsBell } from "../src/components/NotificationsBell.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type {
  AgentKeySummary,
  ElevationEndingNotification,
  ElevationRequestNotification,
  StudioNotification,
} from "../src/lib/api.ts";
import {
  BROWSER_PREF_STORAGE_KEY,
  readShownIds,
  SHOWN_STORAGE_KEY,
} from "../src/lib/notifications.ts";
import { AgentsPage } from "../src/routes/AgentsPage.tsx";

function wrap(children: ReactNode, options: { locale?: Locale; qc?: QueryClient } = {}) {
  const qc = options.qc ?? newClient();
  return (
    <I18nProvider initialLocale={options.locale ?? "en"}>
      <QueryClientProvider client={qc}>
        <CodeProvider>
          <Toasty>{children}</Toasty>
        </CodeProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
const calls = (fetch: ReturnType<typeof serve>, method: string) =>
  fetch.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === method)
    .map((c) => {
      const body = (c[1] as RequestInit).body;
      return body === undefined ? [c[0]] : [c[0], JSON.parse(String(body))];
    });
const polls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter((c) => c[0] === "/api/notifications").length;

const NOW = Date.parse("2026-10-08T12:00:00Z");
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const ending = (over: Partial<ElevationEndingNotification> = {}): ElevationEndingNotification => {
  const until = over.until ?? inMinutes(8);
  return {
    id: `elevation-ending:key_desk:${until}`,
    kind: "elevation-ending",
    keyId: "key_desk",
    keyName: "Desk",
    mode: "auto",
    from: "edits",
    until,
    minutesLeft: 8,
    ...over,
  };
};
const asking = (
  over: Partial<ElevationRequestNotification> = {},
): ElevationRequestNotification => ({
  id: "elevation-request:appr_1",
  kind: "elevation-request",
  approvalId: "appr_1",
  siteId: "site_1",
  agent: { kind: "agent", id: "agent_planner", name: "Planner" },
  keyId: "key_plan",
  mode: "edits",
  minutes: 30,
  reason: "Fix <b>typos</b> <script>alert(1)</script>",
  createdAt: inMinutes(-2),
  expiresAt: inMinutes(60 * 24),
  ...over,
});
const page = (items: StudioNotification[]) => ({ status: 200, body: { items, noticeMinutes: 10 } });

const desk = (until: string | undefined): AgentKeySummary => ({
  id: "key_desk",
  name: "Desk",
  start: "chk_de",
  scopes: ["site:read", "content:read", "preview:create", "content:write"],
  mode: "edits",
  effectiveMode: until ? "auto" : "edits",
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: null,
  enabled: true,
  ...(until
    ? {
        elevation: { mode: "auto", until, grantedBy: "user_owner", grantedAt: inMinutes(-50) },
      }
    : {}),
});

/** A stand-in for the browser's `Notification`, installed on `window`. */
function fakeNotifications(permission: NotificationPermission, answer?: NotificationPermission) {
  const created: Array<{ title: string; options: NotificationOptions; onclick: unknown }> = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      if (answer) FakeNotification.permission = answer;
      return FakeNotification.permission;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    title: string;
    options: NotificationOptions;
    constructor(title: string, options: NotificationOptions) {
      this.title = title;
      this.options = options;
      created.push(this);
    }
  }
  Object.defineProperty(window, "Notification", {
    configurable: true,
    writable: true,
    value: FakeNotification,
  });
  return { created, FakeNotification };
}
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  delete (window as { Notification?: unknown }).Notification;
  setVisibility("visible");
});

describe("the header bell", () => {
  it("counts what needs you and lists it, the agent's reason as plain text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve((url) => (url === "/api/notifications" ? page([ending(), asking()]) : undefined));
    render(wrap(<NotificationsBell />));
    const bell = await screen.findByRole("button", { name: "Notifications (2)" });
    expect(bell).toHaveAttribute("data-notification-count", "2");
    fireEvent.click(bell);

    const endingItem = await screen.findByText(
      /^Desk's Auto mode ends in 8 min \(.+\), then back to Edits\.$/,
    );
    const item = endingItem.closest("[data-notification]") as HTMLElement;
    expect(item.querySelector('[data-mode="auto"]')).not.toBeNull();
    expect(within(item).getByText("8 min left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extend 1 hour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Agents" })).toHaveAttribute("href", "/agents");

    expect(screen.getByText("Planner asks for Edits · 30 min")).toBeInTheDocument();
    const reason = screen.getByTestId("notification-reason");
    expect(reason.textContent).toBe("“Fix <b>typos</b> <script>alert(1)</script>”");
    expect(reason.querySelector("b, script")).toBeNull();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/sites/site_1/approvals",
    );
  });

  it("shows an empty state, and stays empty on a server without notifications", async () => {
    serve(() => undefined); // 404 everywhere
    render(wrap(<NotificationsBell />));
    const bell = await screen.findByRole("button", { name: "Notifications" });
    expect(bell).toHaveAttribute("data-notification-count", "0");
    fireEvent.click(bell);
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notification settings" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/account", hash: "notifications" });
  });

  it("extends by the default hour or a picked preset, re-posting the mode in force", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const until = inMinutes(8);
    const fetch = serve((url, init) => {
      if (url === "/api/notifications") return page([ending({ until })]);
      if (url === "/api/agent-keys") return { status: 200, body: [desk(until)] };
      if (url === "/api/agent-keys/key_desk/elevation" && init?.method === "POST")
        return { status: 200, body: desk(inMinutes(60)) };
      return undefined;
    });
    render(wrap(<NotificationsBell />));
    fireEvent.click(await screen.findByRole("button", { name: "Notifications (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Extend 1 hour" }));
    await waitFor(() =>
      expect(calls(fetch, "POST")).toEqual([
        ["/api/agent-keys/key_desk/elevation", { mode: "auto", minutes: 60 }],
      ]),
    );
    expect(await screen.findByText("Elevation extended")).toBeInTheDocument();
    expect(
      screen.getByText(/^Desk works in Auto mode until .+, then back to Edits\.$/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Other durations" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^4 hours · until / }));
    await waitFor(() => expect(calls(fetch, "POST")).toHaveLength(2));
    expect(calls(fetch, "POST")[1]).toEqual([
      "/api/agent-keys/key_desk/elevation",
      { mode: "auto", minutes: 240 },
    ]);
  });

  it("refuses to extend an elevation that ended meanwhile (that would be a new grant)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const fetch = serve((url) => {
      if (url === "/api/notifications") return page([ending()]);
      if (url === "/api/agent-keys") return { status: 200, body: [desk(undefined)] };
      return undefined;
    });
    render(wrap(<NotificationsBell />));
    fireEvent.click(await screen.findByRole("button", { name: "Notifications (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Extend 1 hour" }));
    expect(await screen.findByText("This elevation has already ended")).toBeInTheDocument();
    expect(calls(fetch, "POST")).toEqual([]);
  });

  it("ends an elevation early through the shared helper", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    let items: StudioNotification[] = [ending()];
    const fetch = serve((url, init) => {
      if (url === "/api/notifications") return page(items);
      if (url === "/api/agent-keys/key_desk/elevation" && init?.method === "DELETE") {
        items = [];
        return { status: 200, body: desk(undefined) };
      }
      return undefined;
    });
    render(wrap(<NotificationsBell />));
    fireEvent.click(await screen.findByRole("button", { name: "Notifications (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "End now" }));
    await waitFor(() =>
      expect(calls(fetch, "DELETE")).toEqual([["/api/agent-keys/key_desk/elevation"]]),
    );
    expect(await screen.findByText("Desk is back in Edits mode.")).toBeInTheDocument();
    // The bell is read again right away.
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it("speaks Turkish", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve((url) => (url === "/api/notifications" ? page([ending(), asking()]) : undefined));
    render(wrap(<NotificationsBell />, { locale: "tr" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bildirimler (2)" }));
    expect(
      await screen.findByText(
        /^Desk: Otomatik modu 8 dk\.? sonra bitiyor \(.+\)\. Ardından yeniden Düzenleme moduna döner\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 saat uzat" })).toBeInTheDocument();
    expect(screen.getByText("Planner, Düzenleme modu istiyor · 30 dk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İncele" })).toBeInTheDocument();
  });
});

describe("polling", () => {
  it("asks every minute, and every 15 s while an elevation is ending", async () => {
    vi.useFakeTimers({ now: NOW });
    let items: StudioNotification[] = [];
    const fetch = serve((url) => (url === "/api/notifications" ? page(items) : undefined));
    render(wrap(<NotificationsBell />));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(polls(fetch)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(polls(fetch)).toBe(1);
    items = [ending()];
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(polls(fetch)).toBe(2);
    // Now an elevation is ending: four times a minute.
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(polls(fetch)).toBe(3);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(polls(fetch)).toBe(4);
  });

  it("stops for good after a 404 (an older server)", async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = serve(() => undefined);
    const qc = newClient();
    const { unmount } = render(wrap(<NotificationsBell />, { qc }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(polls(fetch)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(polls(fetch)).toBe(1);
    // Not on remount either (the app frame remounts between surfaces).
    unmount();
    render(wrap(<NotificationsBell />, { qc }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(polls(fetch)).toBe(1);
  });
});

describe("one-time toasts", () => {
  it("toasts a new id once, not what was there on the first load, not again after a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const e = ending();
    const a = asking();
    let items: StudioNotification[] = [e];
    serve((url) => (url === "/api/notifications" ? page(items) : undefined));
    const qc = newClient();
    const first = render(wrap(<NotificationsBell />, { qc }));
    await screen.findByRole("button", { name: "Notifications (1)" });
    // Already there on the first load: the bell has it, no toast.
    expect(screen.queryByText("Desk's Auto mode ends in 8 min")).toBeNull();
    expect(readShownIds().has(e.id)).toBe(true);

    items = [e, a];
    await act(() => qc.refetchQueries({ queryKey: ["notifications"] }));
    const toast = await screen.findByText("Planner asks for Edits · 30 min");
    expect(toast).toBeInTheDocument();
    // Its reason and its action come with it.
    expect(screen.getByText("“Fix <b>typos</b> <script>alert(1)</script>”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/sites/site_1/approvals" });

    // The action closed the toast; rerenders and later polls do not bring it back.
    await waitFor(() =>
      expect(screen.queryAllByText("Planner asks for Edits · 30 min")).toHaveLength(0),
    );
    first.rerender(wrap(<NotificationsBell />, { qc }));
    await act(() => qc.refetchQueries({ queryKey: ["notifications"] }));
    expect(screen.queryAllByText("Planner asks for Edits · 30 min")).toHaveLength(0);
    first.unmount();

    // A reload (new client, new session) whose first answer is empty, then the same ids return:
    // they were announced in this browser already.
    items = [];
    const reloaded = newClient();
    render(wrap(<NotificationsBell />, { qc: reloaded }));
    await screen.findByRole("button", { name: "Notifications" });
    items = [e, a];
    await act(() => reloaded.refetchQueries({ queryKey: ["notifications"] }));
    await screen.findByRole("button", { name: "Notifications (2)" });
    expect(screen.queryByText("Planner asks for Edits · 30 min")).toBeNull();
    expect(screen.queryByText("Desk's Auto mode ends in 8 min")).toBeNull();
    expect(JSON.parse(localStorage.getItem(SHOWN_STORAGE_KEY) ?? "[]")).toEqual([e.id, a.id]);
  });

  it("puts Extend 1 hour into an ending elevation's toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const until = inMinutes(8);
    let items: StudioNotification[] = [];
    const fetch = serve((url, init) => {
      if (url === "/api/notifications") return page(items);
      if (url === "/api/agent-keys") return { status: 200, body: [desk(until)] };
      if (url === "/api/agent-keys/key_desk/elevation" && init?.method === "POST")
        return { status: 200, body: desk(inMinutes(60)) };
      return undefined;
    });
    const qc = newClient();
    render(wrap(<NotificationsBell />, { qc }));
    await screen.findByRole("button", { name: "Notifications" });
    items = [ending({ until })];
    await act(() => qc.refetchQueries({ queryKey: ["notifications"] }));
    expect(await screen.findByText("Desk's Auto mode ends in 8 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Extend 1 hour" }));
    await waitFor(() =>
      expect(calls(fetch, "POST")).toEqual([
        ["/api/agent-keys/key_desk/elevation", { mode: "auto", minutes: 60 }],
      ]),
    );
  });
});

describe("browser notifications", () => {
  async function announce(options: {
    permission: NotificationPermission;
    enabled: boolean;
    visibility: DocumentVisibilityState;
  }) {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const fake = fakeNotifications(options.permission);
    if (options.enabled) localStorage.setItem(BROWSER_PREF_STORAGE_KEY, "on");
    let items: StudioNotification[] = [];
    serve((url) => (url === "/api/notifications" ? page(items) : undefined));
    const qc = newClient();
    render(wrap(<NotificationsBell />, { qc }));
    await screen.findByRole("button", { name: "Notifications" });
    setVisibility(options.visibility);
    items = [asking()];
    await act(() => qc.refetchQueries({ queryKey: ["notifications"] }));
    await screen.findByRole("button", { name: "Notifications (1)" });
    return fake.created;
  }

  it("raises one for a new id while Studio is in the background; a click opens Approvals", async () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    const created = await announce({ permission: "granted", enabled: true, visibility: "hidden" });
    expect(created).toHaveLength(1);
    const [n] = created as [{ title: string; options: NotificationOptions; onclick: () => void }];
    expect(n.title).toBe("Planner asks for Edits · 30 min");
    expect(n.options).toEqual({
      body: "“Fix <b>typos</b> <script>alert(1)</script>”",
      tag: "elevation-request:appr_1",
    });
    n.onclick();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/sites/site_1/approvals" });
  });

  it.each([
    ["Studio is on screen", { permission: "granted", enabled: true, visibility: "visible" }],
    ["the person did not opt in", { permission: "granted", enabled: false, visibility: "hidden" }],
    ["the browser blocks it", { permission: "denied", enabled: true, visibility: "hidden" }],
    ["nobody was asked yet", { permission: "default", enabled: true, visibility: "hidden" }],
  ] as const)("stays quiet when %s", async (_why, options) => {
    const created = await announce(options);
    expect(created).toHaveLength(0);
    // The toast still tells whoever looks.
    expect(await screen.findByText("Planner asks for Edits · 30 min")).toBeInTheDocument();
  });
});

describe("Account › Notifications", () => {
  it("hides the switch in a browser without notifications", async () => {
    render(wrap(<NotificationSettings />));
    expect(await screen.findByTestId("notifications-note")).toHaveTextContent(
      "This browser can't show notifications.",
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("asks for permission from the switch and remembers the choice", async () => {
    const { FakeNotification } = fakeNotifications("default", "granted");
    render(wrap(<NotificationSettings />));
    const toggle = await screen.findByRole("switch", { name: /Notify me in this browser/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Not asked yet")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(localStorage.getItem(BROWSER_PREF_STORAGE_KEY)).toBe("on");
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a test notification" })).toBeInTheDocument();
    // Off again without asking the browser.
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(localStorage.getItem(BROWSER_PREF_STORAGE_KEY)).toBeNull();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("explains how to re-enable notifications the browser blocks", async () => {
    const { FakeNotification } = fakeNotifications("default", "denied");
    render(wrap(<NotificationSettings />));
    fireEvent.click(await screen.findByRole("switch", { name: /Notify me in this browser/ }));
    expect(await screen.findByText("Notifications are blocked for Studio")).toBeInTheDocument();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", { name: /Notify me in this browser/ })).toBeDisabled();
    expect(localStorage.getItem(BROWSER_PREF_STORAGE_KEY)).toBeNull();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });
});

describe("Agents page", () => {
  it("marks keys ending soon and extends them from the banner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const until = inMinutes(8);
    const fetch = serve((url, init) => {
      if (url === "/api/agent-keys") return { status: 200, body: [desk(until)] };
      if (url === "/api/agent-keys/key_desk/elevation" && init?.method === "POST")
        return { status: 200, body: desk(inMinutes(60)) };
      return undefined;
    });
    render(wrap(<AgentsPage />));
    const banner = await screen.findByTestId("elevated-keys-banner");
    expect(within(banner).getByText("Ends in 8 min")).toBeInTheDocument();
    expect(banner.querySelector('[data-ending-soon="key_desk"]')).not.toBeNull();
    fireEvent.click(within(banner).getByRole("button", { name: "Extend 1 hour" }));
    await waitFor(() =>
      expect(calls(fetch, "POST")).toEqual([
        ["/api/agent-keys/key_desk/elevation", { mode: "auto", minutes: 60 }],
      ]),
    );
    expect(await screen.findByText("Elevation extended")).toBeInTheDocument();
  });

  it("offers no extension while the end is still far away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    serve((url) =>
      url === "/api/agent-keys" ? { status: 200, body: [desk(inMinutes(45))] } : undefined,
    );
    render(wrap(<AgentsPage />));
    const banner = await screen.findByTestId("elevated-keys-banner");
    expect(within(banner).queryByRole("button", { name: "Extend 1 hour" })).toBeNull();
    expect(within(banner).getByRole("button", { name: "End now" })).toBeInTheDocument();
  });
});

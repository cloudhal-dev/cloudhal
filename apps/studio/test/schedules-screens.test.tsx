/**
 * Schedules in Studio (RFC-0008 §15, DESIGN.md §2x): the calendar route (agenda and month,
 * proposals dashed), filters in the URL, "Move to…" with the approval effect and Undo, the
 * "Schedule…" dialog, embargo and expiry as UTC instants, the locked banner's two ways out, the
 * automation editor, run findings, the notices' words; plus the pure helpers behind them.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationDialog } from "../src/components/AutomationDialog.tsx";
import { LockedBanner, ScheduleCard } from "../src/components/ScheduleCard.tsx";
import { ScheduleDialog } from "../src/components/ScheduleDialog.tsx";
import { ScheduleRunDialog } from "../src/components/ScheduleRunDialog.tsx";
import { translate } from "../src/i18n/index.tsx";
import {
  ApiRequestError,
  type CalendarItem,
  type InstanceInfo,
  type ReleaseView,
  type Role,
  type ScheduleNotification,
} from "../src/lib/api.ts";
import { isScheduleNotification, notificationHref } from "../src/lib/notifications.ts";
import { scheduleNotice } from "../src/lib/schedule-notices.ts";
import {
  entryOf,
  filtersOf,
  matchesFilters,
  monthPeriod,
  recurrenceValueOf,
  searchOfFilters,
  whenProblem,
  zonedToInstant,
  zoneLabel,
} from "../src/lib/schedules.ts";
import { validateSchedulesSearch } from "../src/lib/schedules-search.ts";
import { SchedulesPage } from "../src/routes/SchedulesPage.tsx";
import { bodyOf, INSTANCE, meFor, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
const search: { current: Record<string, string> } = { current: {} };
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", releaseId: "rel_sched01" }),
  useNavigate: () => navigate,
  useSearch: () => search.current,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
  search.current = {};
});

const S = "/api/sites/site_1";
const SCHEDULES: InstanceInfo = {
  ...INSTANCE,
  features: {
    ...INSTANCE.features,
    schedules: {
      available: true,
      scheduler: "cron",
      gates: true,
      automations: true,
      publishNow: true,
      limits: { maxItems: 100, horizonDays: 366, requestHorizonDays: 30, lateMinutes: 60 },
    },
  },
};
const SITE = {
  schemaVersion: 1,
  id: "site_1",
  name: "Newsroom",
  slug: "newsroom",
  defaultLocale: "en",
  locales: ["en"],
  domains: [],
  timeZone: "Europe/Istanbul",
  rev: 3,
};
const AT = "2099-01-15T06:00:00.000Z"; // 09:00 in Istanbul

function release(id: string, over: Partial<ReleaseView> = {}): ReleaseView {
  return {
    schemaVersion: 1,
    id,
    siteId: "site_1",
    title: "Election results",
    items: [
      {
        kind: "set",
        nodeId: "entry_election",
        nodeKind: "contentEntry",
        target: { rev: 3, hash: "h3" },
        base: { rev: 2, hash: "h2" },
      },
    ],
    when: { kind: "at", at: AT, timeZone: "Europe/Istanbul", localTime: "2099-01-15T09:00" },
    state: "scheduled",
    hash: "rl1:abc",
    approval: {
      kind: "person",
      by: { id: "user_editor001", name: "Ece" },
      at: "2098-12-01T00:00:00Z",
    },
    createdBy: { kind: "human", id: "user_editor001", name: "Ece" },
    createdAt: "2098-12-01T00:00:00Z",
    updatedAt: "2098-12-01T00:00:00Z",
    rev: 4,
    executeAt: AT,
    approvalState: "approved",
    view: {
      items: [
        {
          nodeId: "entry_election",
          nodeKind: "contentEntry",
          kind: "set",
          title: "Election results",
          path: "/posts/election",
          pinnedRev: 3,
          liveRev: 2,
          closure: false,
          overlaps: [],
        },
      ],
      closureAdded: [],
      lockedNodes: ["entry_election"],
    },
    ...over,
  } as ReleaseView;
}

const ITEMS: CalendarItem[] = [
  {
    id: "rel_sched01",
    kind: "release",
    at: AT,
    title: "Election results",
    target: { releaseId: "rel_sched01", nodeIds: ["entry_election"] },
    origin: "person",
    approval: "approved",
    state: "scheduled",
  },
  {
    id: "rel_agent01",
    kind: "release",
    at: "2099-01-16T07:00:00.000Z",
    title: "Budget day",
    target: { releaseId: "rel_agent01", nodeIds: ["entry_budget", "page_budget"] },
    origin: "agent",
    approval: "pending",
    state: "awaiting_approval",
  },
];

const AGENT_RELEASE = release("rel_agent01", {
  title: "Budget day",
  state: "awaiting_approval",
  approvalState: "pending",
  createdBy: { kind: "agent", id: "agent_desk01", name: "Desk" },
  executeAt: "2099-01-16T07:00:00.000Z",
});
delete (AGENT_RELEASE as { approval?: unknown }).approval;

function calendarServer(role: Role = "editor", extra: Route[] = []) {
  return serve(
    ...extra,
    on("GET", "/api/me", { status: 200, body: meFor(role) }),
    on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
    on("GET", S, { status: 200, body: SITE }),
    on("GET", `${S}/schedule`, {
      status: 200,
      body: { items: ITEMS, timeZone: "Europe/Istanbul" },
    }),
    on("GET", `${S}/releases`, {
      status: 200,
      body: { releases: [release("rel_sched01"), AGENT_RELEASE] },
    }),
    on("GET", `${S}/releases/rel_sched01`, { status: 200, body: release("rel_sched01") }),
    on("GET", `${S}/approvals`, { status: 200, body: { items: [] } }),
    on("GET", `${S}/schedule-settings`, {
      status: 200,
      body: { paused: false, dailyWriteCap: 200, rev: 0, writesToday: 3 },
    }),
    on("GET", "/api/scheduler", {
      status: 200,
      body: {
        mode: "cron",
        state: "running",
        healthy: true,
        lastTickAt: new Date().toISOString(),
        dueWithin24h: false,
        automations: true,
        lag: { p50: 2, p95: 9, runs: 4 },
      },
    }),
  );
}

describe("schedule helpers", () => {
  it("turns a wall-clock time in the site's zone into the UTC instant, across clock changes", () => {
    expect(zonedToInstant({ date: "2026-11-02", time: "09:00" }, "Europe/Istanbul")).toEqual({
      at: "2026-11-02T06:00:00.000Z",
    });
    // 02:30 does not exist on 28 March 2027 in Berlin: it runs at 03:30 (01:30 UTC).
    expect(zonedToInstant({ date: "2027-03-28", time: "02:30" }, "Europe/Berlin")).toEqual({
      at: "2027-03-28T01:30:00.000Z",
      gap: { runsAt: "03:30" },
    });
    // 02:30 happens twice on 25 October 2026 in Berlin: the first one.
    expect(zonedToInstant({ date: "2026-10-25", time: "02:30" }, "Europe/Berlin").at).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(zoneLabel("Europe/Istanbul", Date.parse(AT))).toBe("Istanbul (UTC+3)");
    expect(zoneLabel("UTC")).toBe("UTC");
  });

  it("says what is wrong with a time: past, too soon, a clock change", () => {
    const now = Date.parse("2099-01-15T06:00:00.000Z");
    expect(whenProblem({ date: "2099-01-15", time: "08:00" }, "Europe/Istanbul", { now })).toEqual({
      code: "past",
    });
    expect(
      whenProblem({ date: "2099-01-15", time: "09:03" }, "Europe/Istanbul", {
        now,
        leadMinutes: 5,
      }),
    ).toEqual({ code: "soon" });
    expect(whenProblem({ date: "2099-01-15" }, "Europe/Istanbul", { now })).toEqual({
      code: "incomplete",
    });
    expect(whenProblem({ date: "2099-03-29", time: "02:30" }, "Europe/Berlin", { now })?.code).toBe(
      "gap",
    );
  });

  it("keeps the calendar's URL well-formed and its facets to known values", () => {
    expect(
      validateSchedulesSearch({
        view: "month",
        date: "2099-01",
        kind: "publish,release",
        state: "<script>",
        q: "budget",
        v: "saved:abc",
        junk: "1",
      }),
    ).toEqual({
      view: "month",
      date: "2099-01",
      kind: "publish,release",
      q: "budget",
      v: "saved:abc",
    });
    expect(filtersOf({ kind: "publish,nope", origin: "agent" })).toEqual({
      kind: ["publish"],
      origin: ["agent"],
    });
    expect(searchOfFilters({ kind: ["publish", "release"], state: [] })).toEqual({
      kind: "publish,release",
    });
  });

  it("maps calendar items to entries: proposals, movability, hidden closed items", () => {
    const now = Date.parse("2099-01-01T00:00:00Z");
    const scheduled = entryOf("site_1", ITEMS[0] as CalendarItem, now);
    expect(scheduled).toMatchObject({ kind: "publish", movable: true, approval: "approved" });
    const proposed = entryOf("site_1", ITEMS[1] as CalendarItem, now);
    expect(proposed).toMatchObject({ kind: "release", approval: "waiting" });
    expect(proposed.href).toBe("/sites/site_1/schedules/releases/rel_agent01");
    const canceled = entryOf("site_1", { ...(ITEMS[0] as CalendarItem), state: "canceled" }, now);
    expect(matchesFilters(canceled, {})).toBe(false);
    expect(matchesFilters(canceled, { state: ["canceled"] })).toBe(true);
    expect(matchesFilters(proposed, { origin: ["agent"], state: ["waiting"] })).toBe(true);
  });

  it("fetches whole weeks of a month in the site's zone", () => {
    const p = monthPeriod("2026-10", 1, "Europe/Istanbul");
    expect(p.first).toBe("2026-09-28");
    expect(p.from).toBe("2026-09-27T21:00:00.000Z");
  });

  it("reads a stored rule back into the editor", () => {
    expect(
      recurrenceValueOf(
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=7",
        "weekdays",
        "2026-10-12T09:07",
      ),
    ).toMatchObject({ preset: "weekdays", time: "09:07" });
    expect(recurrenceValueOf(undefined, "once", "2026-10-12T10:00").preset).toBe("once");
  });
});

describe("Calendar", () => {
  it("lists the month as an agenda with proposals dashed and the aside", async () => {
    search.current = { date: "2099-01" };
    calendarServer();
    const { container } = render(wrap(<SchedulesPage />));
    expect(await screen.findByText("Budget day")).toBeInTheDocument();
    expect(screen.getByText("Election results")).toBeInTheDocument();
    expect(container.querySelector('[data-entry-id="rel_agent01"]')).toHaveAttribute(
      "data-look",
      "proposed",
    );
    expect(container.querySelector('[data-entry-id="rel_sched01"]')).toHaveAttribute(
      "data-look",
      "quiet",
    );
    expect(screen.getByText("Times are in Istanbul time (UTC+3)")).toBeInTheDocument();
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Automations" })).toBeInTheDocument();
  });

  it("draws the month grid with a dashed chip for the proposal", async () => {
    search.current = { date: "2099-01", view: "month" };
    calendarServer();
    const { container } = render(wrap(<SchedulesPage />));
    await waitFor(() =>
      expect(container.querySelector('button[data-entry-id="rel_agent01"]')).toHaveClass(
        "border-dashed",
      ),
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("keeps the filters in the URL", async () => {
    search.current = { date: "2099-01" };
    calendarServer();
    render(wrap(<SchedulesPage />));
    await screen.findByText("Budget day");
    fireEvent.click(screen.getByRole("button", { name: "Kind" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Release" }));
    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, string>) => Record<string, string>;
    };
    expect(call.search({ date: "2099-01" })).toEqual({ date: "2099-01", kind: "release" });
  });

  it("narrows to what the URL asks for", async () => {
    search.current = { date: "2099-01", origin: "agent" };
    calendarServer();
    render(wrap(<SchedulesPage />));
    expect(await screen.findByText("Budget day")).toBeInTheDocument();
    expect(screen.queryByText("Election results")).toBeNull();
  });

  it("moves a release through the dialog, keeps the approval, and offers Undo", async () => {
    search.current = { date: "2099-01" };
    const fetch = calendarServer("editor", [
      on("POST", `${S}/releases/rel_sched01/reschedule`, (init) => ({
        status: 200,
        body: {
          release: { ...release("rel_sched01"), rev: 5 },
          status: "scheduled",
          ...JSON.parse(String(init?.body ?? "{}")),
        },
      })),
    ]);
    render(wrap(<SchedulesPage />));
    await screen.findByText("Budget day");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Election results" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector('[data-approval-effect="kept"]')).not.toBeNull(),
    );
    const time = within(dialog).getByRole("textbox", { name: "New time" });
    fireEvent.change(time, { target: { value: "10:30" } });
    fireEvent.blur(time);
    const confirm = within(dialog).getByRole("button", { name: "Move" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", `${S}/releases/rel_sched01/reschedule`)).toEqual({
        rev: 4,
        when: { localTime: "2099-01-15T10:30", timeZone: "Europe/Istanbul" },
      }),
    );
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("says moving voids the approval for someone who may not approve it", async () => {
    search.current = { date: "2099-01" };
    const mine = release("rel_sched01", {
      createdBy: { kind: "human", id: "user_contrib01", name: "Cem" },
    });
    calendarServer("contributor", [
      on("GET", `${S}/releases/rel_sched01`, { status: 200, body: mine }),
      on("GET", `${S}/releases`, { status: 200, body: { releases: [mine, AGENT_RELEASE] } }),
    ]);
    render(wrap(<SchedulesPage />));
    await screen.findByText("Budget day");
    fireEvent.click(screen.getByRole("button", { name: "Actions for Election results" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector('[data-approval-effect="voided"]')).not.toBeNull(),
    );
  });
});

describe("Schedule… dialog", () => {
  const node = {
    id: "entry_election",
    kind: "contentEntry" as const,
    title: "Election results",
    status: "review" as const,
  };

  it("pins the article, schedules it in the site's zone, and saves first", async () => {
    const prepare = vi.fn(async () => undefined);
    const fetch = serve(
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
      on("GET", S, { status: 200, body: SITE }),
      on("POST", `${S}/releases`, {
        status: 201,
        body: {
          release: release("rel_new0001", { state: "draft", rev: 1 }),
          closureAdded: ["asset_cover01"],
        },
      }),
      on("POST", `${S}/releases/rel_new0001/schedule`, {
        status: 200,
        body: { release: release("rel_new0001", { rev: 2 }), status: "scheduled" },
      }),
    );
    render(
      wrap(
        <ScheduleDialog
          siteId="site_1"
          open
          onOpenChange={() => {}}
          nodes={[node]}
          prepare={prepare}
          dirty
        />,
      ),
    );
    const dialog = await screen.findByTestId("schedule-dialog");
    expect(within(dialog).getByText(/isn't marked Published yet/)).toBeInTheDocument();
    expect(dialog.querySelector('[data-approval-effect="self"]')).not.toBeNull();
    await within(dialog).findByText("Istanbul (UTC+3)");
    const time = within(dialog).getByRole("textbox", { name: "Publish at" });
    fireEvent.change(time, { target: { value: "10:15" } });
    fireEvent.blur(time);
    fireEvent.click(screen.getByTestId("schedule-confirm"));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", `${S}/releases/rel_new0001/schedule`)).toBeTruthy(),
    );
    expect(prepare).toHaveBeenCalled();
    expect(bodyOf(fetch, "POST", `${S}/releases`)).toEqual({ nodeIds: ["entry_election"] });
    const sent = bodyOf(fetch, "POST", `${S}/releases/rel_new0001/schedule`);
    expect(sent.rev).toBe(1);
    expect(sent.when.timeZone).toBe("Europe/Istanbul");
    expect(sent.when.localTime).toMatch(/^\d{4}-\d{2}-\d{2}T10:15$/);
    expect(await screen.findByText(/1 item it needs was added/)).toBeInTheDocument();
  });

  it("sends a Contributor's schedule for approval, and says so", async () => {
    serve(
      on("GET", "/api/me", { status: 200, body: meFor("contributor") }),
      on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
      on("GET", S, { status: 200, body: SITE }),
    );
    render(wrap(<ScheduleDialog siteId="site_1" open onOpenChange={() => {}} nodes={[node]} />));
    const dialog = await screen.findByTestId("schedule-dialog");
    await waitFor(() =>
      expect(dialog.querySelector('[data-approval-effect="request"]')).not.toBeNull(),
    );
    expect(screen.getByTestId("schedule-confirm")).toHaveTextContent("Send for approval");
  });
});

describe("Editors", () => {
  const baseServer = (extra: Route[] = [], instance = SCHEDULES) =>
    serve(
      ...extra,
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", "/api/instance", { status: 200, body: instance }),
      on("GET", S, { status: 200, body: SITE }),
      on("GET", `${S}/releases`, { status: 200, body: { releases: [] } }),
    );

  it("saves an embargo typed in the site's zone as a UTC instant", async () => {
    baseServer();
    const onChange = vi.fn();
    render(
      wrap(
        <ScheduleCard
          siteId="site_1"
          nodeId="entry_election"
          kind="contentEntry"
          availability={{ from: AT }}
          onChange={onChange}
        />,
      ),
    );
    const time = await screen.findByRole("textbox", { name: "Visible from" });
    await waitFor(() => expect(time).toHaveValue("9:00 AM"));
    fireEvent.change(time, { target: { value: "10:00" } });
    fireEvent.blur(time);
    expect(onChange).toHaveBeenLastCalledWith({ from: "2099-01-15T07:00:00.000Z" });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("words the server's refusals and a renderer without gates", async () => {
    baseServer();
    const { unmount } = render(
      wrap(
        <ScheduleCard
          siteId="site_1"
          nodeId="entry_election"
          kind="page"
          availability={undefined}
          onChange={() => {}}
          saveError={new ApiRequestError(409, { error: "gates_unsupported", message: "no" })}
        />,
      ),
    );
    expect(await screen.findByText("This site can't hold content back yet")).toBeInTheDocument();
    unmount();
    render(
      wrap(
        <ScheduleCard
          siteId="site_1"
          nodeId="entry_election"
          kind="page"
          availability={undefined}
          onChange={() => {}}
          gatesOff
        />,
      ),
    );
    expect(await screen.findByText("This site doesn't hold content back yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add an embargo" })).toBeDisabled();
  });

  it("locks held content and unschedules it for editing", async () => {
    const fetch = baseServer([
      on("GET", `${S}/releases`, { status: 200, body: { releases: [release("rel_sched01")] } }),
      on("POST", `${S}/releases/rel_sched01/unschedule`, {
        status: 200,
        body: { release: release("rel_sched01", { state: "draft", rev: 5 }), status: "draft" },
      }),
    ]);
    const onLockChange = vi.fn();
    render(
      wrap(
        <LockedBanner
          siteId="site_1"
          nodeId="entry_election"
          dirty={false}
          onLockChange={onLockChange}
        />,
      ),
    );
    const banner = await screen.findByTestId("locked-banner");
    expect(within(banner).getByText(/^Locked: publishes/)).toBeInTheDocument();
    await waitFor(() => expect(onLockChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByTestId("unschedule-and-edit"));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", `${S}/releases/rel_sched01/unschedule`)).toEqual({ rev: 4 }),
    );
  });

  it("edits and re-approves: unschedule now, re-pin with approval after saving", async () => {
    let releases = [release("rel_sched01")];
    const fetch = baseServer([
      on("GET", `${S}/releases`, () => ({ status: 200, body: { releases } })),
      on("POST", `${S}/releases/rel_sched01/unschedule`, () => {
        releases = [];
        return {
          status: 200,
          body: { release: release("rel_sched01", { state: "draft", rev: 5 }), status: "draft" },
        };
      }),
      on("GET", `${S}/releases/rel_sched01`, {
        status: 200,
        body: release("rel_sched01", { state: "draft", rev: 6 }),
      }),
      on("POST", `${S}/releases/rel_sched01/repin`, {
        status: 200,
        body: { release: release("rel_sched01", { rev: 7 }), status: "scheduled" },
      }),
    ]);
    const { rerender } = render(
      wrap(
        <LockedBanner
          siteId="site_1"
          nodeId="entry_election"
          dirty={false}
          onLockChange={() => {}}
        />,
      ),
    );
    fireEvent.click(await screen.findByTestId("edit-and-reapprove"));
    expect(await screen.findByTestId("lock-editing")).toBeInTheDocument();
    rerender(
      wrap(
        <LockedBanner
          siteId="site_1"
          nodeId="entry_election"
          dirty={false}
          onLockChange={() => {}}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Re-approve and schedule" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", `${S}/releases/rel_sched01/repin`)).toEqual({
        rev: 6,
        approve: true,
      }),
    );
  });
});

describe("Automations", () => {
  const preview = on("POST", `${S}/automations/preview-rule`, {
    status: 200,
    body: {
      occurrences: [{ at: "2099-01-16T06:07:00.000Z", local: "2099-01-16T09:07" }],
      dstAdjusted: [],
      text: "Every day at 09:07",
    },
  });

  it("creates a built-in job with a daily rule in the site's zone", async () => {
    const fetch = serve(
      preview,
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
      on("GET", S, { status: 200, body: SITE }),
      on("POST", `${S}/automations`, (init) => ({
        status: 201,
        body: { automation: { ...JSON.parse(String(init?.body)), id: "aut_links001", rev: 1 } },
      })),
    );
    const onOpenChange = vi.fn();
    render(wrap(<AutomationDialog siteId="site_1" open onOpenChange={onOpenChange} />));
    const dialog = await screen.findByTestId("automation-dialog");
    expect(await within(dialog).findByText("Every day at 09:07")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Link check" },
    });
    expect(within(dialog).getByTestId("automation-can")).toHaveTextContent("It changes nothing.");
    fireEvent.click(screen.getByTestId("automation-save"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const sent = bodyOf(fetch, "POST", `${S}/automations`);
    expect(sent.name).toBe("Link check");
    expect(sent.job).toEqual({ kind: "builtin", builtin: "broken-links" });
    expect(sent.recurrence).toMatchObject({
      preset: "daily",
      rule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=7",
      timeZone: "Europe/Istanbul",
    });
    expect(sent.recurrence.start).toMatch(/T09:07$/);
  });

  it("creates an agent task and shows its key once", async () => {
    const fetch = serve(
      preview,
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
      on("GET", S, { status: 200, body: SITE }),
      on("POST", `${S}/automations`, {
        status: 201,
        body: {
          automation: { id: "aut_triage01", name: "Triage", rev: 1 },
          key: { id: "key_1", secret: "chk_secret_value", scopes: ["comments:read"] },
        },
      }),
    );
    render(wrap(<AutomationDialog siteId="site_1" open onOpenChange={() => {}} />));
    const dialog = await screen.findByTestId("automation-dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Triage" },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Agent task/ }));
    fireEvent.click(within(dialog).getByRole("switch", { name: "Reads visitor text" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Instructions" }), {
      target: { value: "Label new comments." },
    });
    fireEvent.click(screen.getByTestId("automation-save"));
    expect(await screen.findByTestId("automation-key")).toHaveTextContent("chk_secret_value");
    const sent = bodyOf(fetch, "POST", `${S}/automations`);
    expect(sent.job).toMatchObject({
      kind: "agent-task",
      modeCap: "edits",
      readsUntrustedText: true,
      windowMinutes: 30,
      instructions: "Label new comments.",
    });
  });

  it("says why a mode cap cannot go above the automation's key", async () => {
    serve(
      preview,
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", "/api/instance", { status: 200, body: SCHEDULES }),
      on("GET", S, { status: 200, body: SITE }),
      on("PATCH", `${S}/automations/aut_triage01`, {
        status: 409,
        body: { error: "mode_cap_above_key", message: "no", details: { keyMode: "edits" } },
      }),
    );
    const automation = {
      schemaVersion: 1,
      id: "aut_triage01",
      siteId: "site_1",
      name: "Triage",
      job: {
        kind: "agent-task",
        keyId: "key_1",
        instructions: "Label.",
        modeCap: "edits",
        readsUntrustedText: false,
        windowMinutes: 30,
        budget: { maxToolCalls: 100, maxWrites: 20, maxApprovalRequests: 5, maxMinutes: 15 },
      },
      recurrence: {
        start: "2099-01-01T09:07",
        timeZone: "Europe/Istanbul",
        rule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=7",
        preset: "daily",
      },
      state: "active",
      consecutiveFailures: 0,
      owner: { id: "user_editor001" },
      createdAt: "2098-01-01T00:00:00Z",
      updatedAt: "2098-01-01T00:00:00Z",
      rev: 2,
    } as const;
    render(
      wrap(
        <AutomationDialog
          siteId="site_1"
          open
          onOpenChange={() => {}}
          automation={automation as never}
        />,
      ),
    );
    await screen.findByTestId("automation-dialog");
    fireEvent.click(screen.getByTestId("automation-save"));
    expect(await screen.findByText(/works in Edits mode at most/)).toBeInTheDocument();
  });
});

describe("History and notices", () => {
  it("shows a built-in run's findings, visitor text marked", async () => {
    serve(
      on("GET", "/api/me", { status: 200, body: meFor("editor") }),
      on("GET", S, { status: 200, body: SITE }),
      on("GET", `${S}/runs/run_links001`, {
        status: 200,
        body: {
          run: {
            id: "run_links001",
            state: "succeeded",
            outcome: "did-work",
            trigger: "cron",
            occurrenceAt: AT,
            summary: "Checked 12 references.",
            counts: { "broken-internal-link": 1 },
          },
          findings: [
            {
              code: "broken-internal-link",
              severity: "warning",
              nodeId: "entry_election",
              nodeKind: "contentEntry",
              field: "body",
              href: "/posts/missing",
            },
            {
              code: "not-found-path",
              severity: "info",
              path: "/old-page",
              status: 404,
              hits: 7,
              linkedFrom: [],
              lastSeen: null,
              proposal: { path: "/new-page", reason: "similar" },
              untrusted: true,
            },
          ],
          auditRowIds: [],
          snapshots: [],
        },
      }),
    );
    render(
      wrap(
        <ScheduleRunDialog
          siteId="site_1"
          run={{ id: "run_links001", state: "succeeded", occurrenceAt: AT } as never}
          title="Link check"
          onOpenChange={() => {}}
        />,
      ),
    );
    const findings = await screen.findByTestId("run-findings");
    expect(within(findings).getByText("Broken internal link")).toBeInTheDocument();
    expect(within(findings).getByText("/posts/missing")).toBeInTheDocument();
    expect(within(findings).getByText("From visitors")).toBeInTheDocument();
    expect(within(findings).getByText("Suggested redirect: /new-page")).toBeInTheDocument();
    expect(screen.getByTestId("run-summary")).toHaveTextContent("Checked 12 references.");
  });

  it("words the schedule notices and knows where they lead", () => {
    const t = ((key: string, params?: Record<string, string | number>) =>
      translate("en", key as never, params)) as never;
    const digest: ScheduleNotification = {
      id: "automation-digest:run_1",
      kind: "automation-digest",
      siteId: "site_1",
      automationId: "aut_digest01",
      name: "Weekly digest",
      counts: { published: 3, scheduled: 2, "needs-attention": 1, "open-findings": 4 },
      at: AT,
    };
    expect(isScheduleNotification(digest)).toBe(true);
    expect(scheduleNotice(t, "en", digest).body).toBe(
      "Published 3 · Scheduled 2 · Needs attention 1 · Open findings 4",
    );
    const missed: ScheduleNotification = {
      id: "schedule-missed:rel_1",
      kind: "schedule-missed",
      siteId: "site_1",
      releaseId: "rel_1",
      title: "Budget day",
      executeAt: AT,
      latenessSeconds: 5400,
      at: AT,
    };
    expect(scheduleNotice(t, "en", missed)).toMatchObject({
      title: "“Budget day” was missed",
      action: "Publish now",
      tone: "warning",
    });
    expect(notificationHref(missed)).toBe("/sites/site_1/schedules/releases/rel_1");
  });
});

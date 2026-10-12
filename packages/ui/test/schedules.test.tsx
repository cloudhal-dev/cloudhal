import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Table } from "@cloudflare/kumo";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgendaList,
  type AgendaListLabels,
  AUTOMATION_STATES,
  CalendarMonth,
  type CalendarMonthLabels,
  type CalendarMove,
  CalendarNav,
  type CalendarNavLabels,
  DateTimeField,
  type DateTimeFieldLabels,
  type DateTimeValue,
  DEFAULT_RECURRENCE,
  firstDayOfWeek,
  formatTimeOfDay,
  monthGrid,
  NextRuns,
  parseTimeOfDay,
  RELEASE_STATES,
  RecurrenceEditor,
  type RecurrenceEditorLabels,
  type RecurrenceValue,
  RescheduleDialog,
  type RescheduleDialogLabels,
  recurrenceProblems,
  recurrenceRule,
  SCHEDULE_APPROVAL_STATES,
  SCHEDULE_RUN_STATES,
  type ScheduleEntry,
  ScheduleFilters,
  type ScheduleFiltersLabels,
  type ScheduleFilterValue,
  ScheduleItem,
  ScheduleRunHeader,
  ScheduleRunRow,
  type ScheduleRunRowLabels,
  type ScheduleStatus,
  ScheduleStatusBadge,
  type ScheduleWords,
  scheduleLook,
  shiftMonth,
  TimezoneNote,
  zonedDay,
} from "../src/index.ts";

afterEach(() => cleanup());

const words: ScheduleWords = {
  kind: {
    publish: "Publish",
    expiry: "Expiry",
    embargo: "Embargo",
    release: "Release",
    automation: "Automation",
  },
  status: {
    release: {
      draft: "Draft",
      awaiting_approval: "Waiting for approval",
      scheduled: "Scheduled",
      running: "Publishing…",
      published: "Published",
      conflict: "Conflict",
      missed: "Missed",
      expired: "Expired",
      failed: "Failed",
      canceled: "Canceled",
    },
    automation: {
      active: "Active",
      paused: "Paused",
      "auto-paused": "Paused by Cloudhal",
      broken: "Needs repair",
      ended: "Ended",
    },
    run: {
      due: "Due",
      ready: "Window open",
      running: "Running",
      succeeded: "Ran",
      failed: "Failed",
      missed: "Missed",
      skipped: "Skipped",
      "budget-exceeded": "Over budget",
      killed: "Stopped",
    },
    approval: {
      waiting: "Waiting for approval",
      approved: "Approved",
      auto: "Automatic",
      denied: "Denied",
      expired: "Expired",
    },
  },
};

const IST = "Europe/Istanbul";
const TODAY = "2026-10-12"; // a Monday
const NOW = Date.parse("2026-10-12T09:30:00Z"); // 12:30 in Istanbul

const entry = (over: Partial<ScheduleEntry> & Pick<ScheduleEntry, "id" | "at">): ScheduleEntry => ({
  kind: "publish",
  title: `Item ${over.id}`,
  status: { subject: "release", state: "scheduled" },
  ...over,
});

const ENTRIES: ScheduleEntry[] = [
  entry({
    id: "a",
    at: "2026-10-12T06:00:00Z", // 09:00 Istanbul
    title: "Election results",
    status: { subject: "release", state: "awaiting_approval" },
    origin: "agent",
    originLabel: "proposed by Desk",
    timeLeft: "3 h left",
    movable: true,
  }),
  entry({
    id: "b",
    at: "2026-10-12T05:00:00Z",
    status: { subject: "release", state: "published" },
  }),
  entry({ id: "c", at: "2026-10-14T07:00:00Z", movable: true }),
  entry({ id: "d", at: "2026-10-14T08:00:00Z" }),
  entry({ id: "e", at: "2026-10-14T09:00:00Z" }),
  entry({ id: "f", at: "2026-10-14T10:00:00Z" }),
  // 23:30 UTC on the 20th is the 21st in Istanbul.
  entry({ id: "g", at: "2026-10-20T23:30:00Z", kind: "expiry" }),
];

const monthLabels: CalendarMonthLabels = {
  instructions: "Arrow keys move between days.",
  day: ({ date, today, entries }) => `${date}${today ? ", today" : ""}, ${entries.length} items`,
  more: (n) => `+${n} more`,
  emptyDay: "Nothing scheduled",
};

describe("schedule model", () => {
  it("lays out weeks from the locale's first day", () => {
    const monday = monthGrid("2026-10", 1);
    expect(monday[0]?.[0]).toBe("2026-09-28");
    expect(monday.at(-1)?.at(-1)).toBe("2026-11-01");
    const sunday = monthGrid("2026-10", 0);
    expect(sunday[0]?.[0]).toBe("2026-09-27");
    expect(sunday.every((w) => w.length === 7)).toBe(true);
    expect(firstDayOfWeek("tr-TR")).toBe(1);
    expect(firstDayOfWeek("en-US")).toBe(0);
  });

  it("places instants on the site zone's day and clamps months", () => {
    expect(zonedDay("2026-10-20T23:30:00Z", IST)).toBe("2026-10-21");
    expect(zonedDay("2026-10-20T23:30:00Z", "UTC")).toBe("2026-10-20");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("reads typed times, 24-hour in Turkish and with AM/PM in English", () => {
    expect(parseTimeOfDay("930", "tr-TR")).toBe("09:30");
    expect(parseTimeOfDay("9.30", "tr-TR")).toBe("09:30");
    expect(parseTimeOfDay("21:05", "tr-TR")).toBe("21:05");
    expect(parseTimeOfDay("9:30 pm", "en-US")).toBe("21:30");
    expect(parseTimeOfDay("12 am", "en-US")).toBe("00:00");
    expect(parseTimeOfDay("25:00", "tr-TR")).toBeUndefined();
    expect(parseTimeOfDay("soon", "en-US")).toBeUndefined();
    expect(formatTimeOfDay("21:05", "tr-TR")).toBe("21:05");
    expect(formatTimeOfDay("21:05", "en-US")).toMatch(/9:05\s?PM/);
  });
});

describe("ScheduleStatusBadge", () => {
  const all: ScheduleStatus[] = [
    ...RELEASE_STATES.map((state) => ({ subject: "release" as const, state })),
    ...AUTOMATION_STATES.map((state) => ({ subject: "automation" as const, state })),
    ...SCHEDULE_RUN_STATES.map((state) => ({ subject: "run" as const, state })),
    ...SCHEDULE_APPROVAL_STATES.map((state) => ({ subject: "approval" as const, state })),
  ];

  it.each(all.map((s) => [`${s.subject}:${s.state}`, s] as const))(
    "renders %s with an icon and its word",
    (_, status) => {
      const { container } = render(<ScheduleStatusBadge status={status} words={words} />);
      const root = container.querySelector(`[data-state="${status.state}"]`);
      expect(root).not.toBeNull();
      expect(root?.getAttribute("data-subject")).toBe(status.subject);
      // Never colour alone: an icon and the state's word.
      expect(root?.querySelector("svg")).not.toBeNull();
      const word = (words.status as Record<string, Record<string, string>>)[status.subject]?.[
        status.state
      ];
      expect(root?.textContent).toContain(word);
    },
  );

  it("marks running states as a status and adds the time left and reason", () => {
    render(
      <>
        <ScheduleStatusBadge status={{ subject: "release", state: "running" }} words={words} />
        <ScheduleStatusBadge
          status={{ subject: "release", state: "awaiting_approval" }}
          words={words}
          timeLeft="3 h left"
          reason="Desk asked at 08:12"
        />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Publishing…");
    expect(screen.getByText("3 h left")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Desk asked at 08:12");
  });
});

describe("ScheduleItem", () => {
  it("reads as one sentence and draws proposals dashed", () => {
    const onOpen = vi.fn();
    render(
      <ScheduleItem
        variant="chip"
        entry={ENTRIES[0] as ScheduleEntry}
        words={words}
        locale="en-GB"
        timeZone={IST}
        onOpen={onOpen}
      />,
    );
    const chip = screen.getByRole("button", {
      name: "09:00, Publish, Election results, proposed by Desk, Waiting for approval, 3 h left",
    });
    expect(chip).toHaveAttribute("data-look", "proposed");
    expect(chip.className).toContain("border-dashed");
    expect(chip.className).not.toMatch(/shadow/);
    // At least 24 px tall (WCAG 2.5.8).
    expect(chip.className).toContain("min-h-6");
    fireEvent.click(chip);
    expect(onOpen).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it("maps every state onto the visual language", () => {
    const look = (status: ScheduleStatus, extra: Partial<ScheduleEntry> = {}) =>
      scheduleLook({ status, ...extra });
    expect(look({ subject: "release", state: "scheduled" })).toBe("quiet");
    expect(look({ subject: "release", state: "scheduled" }, { approval: "auto" })).toBe("auto");
    expect(look({ subject: "release", state: "awaiting_approval" })).toBe("proposed");
    expect(look({ subject: "release", state: "conflict" })).toBe("danger");
    expect(look({ subject: "release", state: "missed" })).toBe("danger");
    expect(look({ subject: "release", state: "published" })).toBe("done");
    expect(look({ subject: "release", state: "canceled" })).toBe("struck");
    expect(look({ subject: "release", state: "scheduled" }, { approval: "denied" })).toBe("struck");
    expect(look({ subject: "automation", state: "active" })).toBe("ghost");
    expect(look({ subject: "automation", state: "paused" })).toBe("paused");
    expect(look({ subject: "run", state: "due" }, { recurring: true })).toBe("ghost");
    expect(look({ subject: "run", state: "running" })).toBe("running");
  });

  it("shows a row with its approval badge but no badge for the quiet state", () => {
    const { container } = render(
      <ScheduleItem
        variant="row"
        entry={entry({ id: "x", at: "2026-10-12T06:00:00Z", approval: "approved", href: "/x" })}
        words={words}
        locale="tr-TR"
        timeZone={IST}
        actions={<span data-testid="actions" />}
      />,
    );
    expect(container.querySelector('[data-state="scheduled"]')).toBeNull();
    expect(container.querySelector('[data-state="approved"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Item x" })).toHaveAttribute("href", "/x");
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByTestId("actions")).toBeInTheDocument();
  });
});

function Month(props: {
  onMove?: (m: CalendarMove) => void;
  onMonth?: (m: string) => void;
  density?: "auto" | "chips" | "dots";
  locale?: string;
  weekStartsOn?: 0 | 1;
}) {
  const [month, setMonth] = useState("2026-10");
  return (
    <CalendarMonth
      month={month}
      today={TODAY}
      entries={ENTRIES}
      locale={props.locale ?? "en-GB"}
      timeZone={IST}
      weekStartsOn={props.weekStartsOn ?? 1}
      words={words}
      labels={monthLabels}
      density={props.density ?? "chips"}
      onMonthChange={(m) => {
        props.onMonth?.(m);
        setMonth(m);
      }}
      onMove={props.onMove}
      renderActions={(e) => <span data-testid={`actions-${e.id}`} />}
    />
  );
}

const cell = (day: string) => document.querySelector(`[data-day="${day}"]`) as HTMLElement;

describe("CalendarMonth", () => {
  it("is a grid with one tab stop on today, weeks from Monday in Turkish", () => {
    render(<Month locale="tr-TR" />);
    const grid = screen.getByRole("grid");
    expect(grid).toHaveAccessibleName("Ekim 2026");
    const headers = within(grid).getAllByRole("columnheader");
    expect(headers[0]).toHaveTextContent("Pazartesi");
    const focusable = grid.querySelectorAll('[tabindex="0"]');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toBe(cell(TODAY));
    expect(cell(TODAY)).toHaveAttribute("aria-current", "date");
    expect(cell(TODAY)).toHaveAccessibleName(/12 Ekim Pazartesi, today, 2 items/);
  });

  it("starts weeks on Sunday in US English", () => {
    render(<Month locale="en-US" weekStartsOn={0} />);
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Sunday");
  });

  it("moves with arrows, Home/End and PageUp/PageDown (APG grid)", () => {
    const onMonth = vi.fn();
    render(<Month onMonth={onMonth} />);
    const start = cell(TODAY);
    act(() => start.focus());
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("2026-10-13"));
    expect(cell("2026-10-13")).toHaveAttribute("tabindex", "0");
    expect(start).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("2026-10-20"));
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(document.activeElement).toBe(cell("2026-10-19")); // Monday
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(document.activeElement).toBe(cell("2026-10-25")); // Sunday
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell("2026-10-18"));
    fireEvent.keyDown(document.activeElement as Element, { key: "PageDown" });
    expect(onMonth).toHaveBeenLastCalledWith("2026-11");
    expect(document.activeElement).toBe(cell("2026-11-18"));
    fireEvent.keyDown(document.activeElement as Element, { key: "PageUp", shiftKey: true });
    expect(onMonth).toHaveBeenLastCalledWith("2025-11");
    expect(document.activeElement).toBe(cell("2025-11-18"));
  });

  it("goes into a day's chips with Enter and back with Escape", () => {
    render(<Month />);
    const day = cell("2026-10-14");
    act(() => day.focus());
    fireEvent.keyDown(day, { key: "Enter" });
    const chips = within(day).getAllByRole("button");
    expect(document.activeElement).toBe(chips[0]);
    // Chips are never tab stops of their own.
    for (const c of chips) expect(c).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(chips[1]);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(document.activeElement).toBe(day);
  });

  it("shows three chips and +N more, and places late-UTC items on the zone's day", () => {
    render(<Month />);
    const busy = cell("2026-10-14");
    expect(busy.querySelectorAll("[data-entry-id]")).toHaveLength(3);
    expect(within(busy).getByRole("button", { name: "+1 more" })).toBeInTheDocument();
    expect(cell("2026-10-21").querySelector('[data-entry-id="g"]')).not.toBeNull();
    expect(cell("2026-10-20").querySelector('[data-entry-id="g"]')).toBeNull();
    // Past days and weekends are recessed.
    expect(cell("2026-10-11").className).toContain("bg-kumo-recessed");
    expect(cell("2026-10-17").className).toContain("bg-kumo-recessed");
    expect(cell("2026-10-15").className).not.toContain("bg-kumo-recessed");
  });

  it("moves a chip with Alt+arrow — the keyboard twin of dragging", () => {
    const onMove = vi.fn();
    render(<Month onMove={onMove} />);
    const day = cell("2026-10-14");
    act(() => day.focus());
    fireEvent.keyDown(day, { key: "Enter" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight", altKey: true });
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ fromDay: "2026-10-14", toDay: "2026-10-15", via: "keyboard" }),
    );
    expect((onMove.mock.calls[0] as [CalendarMove])[0].entry.id).toBe("c");
    // An entry that is not movable does not move.
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight", altKey: true });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("drops a dragged chip on another day without writing anything", () => {
    const onMove = vi.fn();
    render(<Month onMove={onMove} />);
    const chip = cell("2026-10-14").querySelector('[data-entry-id="c"]') as HTMLElement;
    expect(chip).toHaveAttribute("draggable", "true");
    const fixed = cell("2026-10-14").querySelector('[data-entry-id="d"]') as HTMLElement;
    expect(fixed).not.toHaveAttribute("draggable");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.dragOver(cell("2026-10-16"), { dataTransfer });
    expect(cell("2026-10-16")).toHaveAttribute("data-drop");
    fireEvent.drop(cell("2026-10-16"), { dataTransfer });
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ fromDay: "2026-10-14", toDay: "2026-10-16", via: "pointer" }),
    );
  });

  it("draws nothing draggable without onMove", () => {
    render(<Month />);
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  });

  it("becomes dots and a day list on phones", () => {
    render(<Month density="dots" />);
    expect(document.querySelector("[data-calendar-month]")).toHaveAttribute(
      "data-calendar-month",
      "dots",
    );
    expect(document.querySelectorAll("[data-entry-id]").length).toBe(
      // Only the chosen day's rows: today's two.
      2,
    );
    const busy = cell("2026-10-14");
    expect(busy.querySelectorAll("[data-dot]").length).toBe(3);
    expect(busy.querySelector("button")).toBeNull();
    // Today has a waiting item: the approval dot.
    expect(cell(TODAY).querySelector('[data-dot="approval"]')).not.toBeNull();
    const list = document.querySelector("[data-day-list]") as HTMLElement;
    expect(list).toHaveAttribute("data-day-list", TODAY);
    expect(within(list).getByText(/Today · Monday 12 October/)).toBeInTheDocument();
    fireEvent.click(busy);
    expect(document.querySelector("[data-day-list]")).toHaveAttribute(
      "data-day-list",
      "2026-10-14",
    );
    expect(busy).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("actions-c")).toBeInTheDocument();
    // An empty day says so.
    fireEvent.keyDown(busy, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument();
  });

  it("switches to dots by itself on a phone-sized screen", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("640"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      render(<Month density="auto" />);
      expect(document.querySelector("[data-calendar-month]")).toHaveAttribute(
        "data-calendar-month",
        "dots",
      );
    } finally {
      window.matchMedia = original;
    }
  });
});

const agendaLabels: AgendaListLabels = {
  list: "Agenda",
  now: "Now",
  doneToday: (n) => `${n} done today`,
  moreRuns: (n) => `${n} more automation runs`,
  loadMore: "Load more",
  loading: "Loading schedules",
  emptyTitle: "Nothing scheduled",
  emptyDescription: "Schedule a publish to see it here.",
};

describe("AgendaList", () => {
  it("groups by the zone's day under sticky headings with a Now rule", () => {
    const { container } = render(
      <AgendaList
        entries={ENTRIES}
        today={TODAY}
        now={NOW}
        locale="en-GB"
        timeZone={IST}
        words={words}
        labels={agendaLabels}
      />,
    );
    const days = [...container.querySelectorAll("[data-agenda-day]")].map((d) =>
      d.getAttribute("data-agenda-day"),
    );
    expect(days).toEqual([TODAY, "2026-10-14", "2026-10-21"]);
    const heading = screen.getByRole("heading", { name: "Today · Monday 12 October" });
    expect(heading.parentElement?.parentElement?.className).toMatch(/sticky.*border-b/);
    // Finished today: folded behind "1 done today"; the waiting item stays.
    const fold = screen.getByRole("button", { name: "1 done today" });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector('[data-entry-id="b"]')).toBeNull();
    fireEvent.click(fold);
    expect(container.querySelector('[data-entry-id="b"]')).not.toBeNull();
    // 09:00 Istanbul is before 12:30: the Now rule follows it.
    const today = container.querySelector(`[data-agenda-day="${TODAY}"]`) as HTMLElement;
    const order = [...today.querySelectorAll("[data-entry-id], [data-now-rule]")].map(
      (n) => n.getAttribute("data-entry-id") ?? "now",
    );
    expect(order).toEqual(["b", "a", "now"]);
  });

  it("folds recurring runs per day", () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      entry({
        id: `r${i}`,
        kind: "automation",
        at: `2026-10-15T0${i}:07:00Z`,
        recurring: true,
        status: { subject: "automation", state: "active" },
      }),
    );
    const { container } = render(
      <AgendaList
        entries={runs}
        today={TODAY}
        now={NOW}
        locale="en-GB"
        words={words}
        labels={agendaLabels}
      />,
    );
    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "3 more automation runs" }));
    expect(container.querySelectorAll("[data-entry-id]")).toHaveLength(6);
  });

  it("has empty, loading and load-more states", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <AgendaList entries={[]} today={TODAY} locale="en-GB" words={words} labels={agendaLabels} />,
    );
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument();
    rerender(
      <AgendaList
        entries={[]}
        loading
        today={TODAY}
        locale="en-GB"
        words={words}
        labels={agendaLabels}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading schedules");
    rerender(
      <AgendaList
        entries={ENTRIES.slice(2, 3)}
        hasMore
        onLoadMore={onLoadMore}
        today={TODAY}
        locale="en-GB"
        words={words}
        labels={agendaLabels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});

describe("CalendarNav and TimezoneNote", () => {
  const labels: CalendarNavLabels = {
    group: "Calendar navigation",
    previous: "Previous month",
    next: "Next month",
    today: "Today",
    view: "View",
    views: { agenda: "Agenda", month: "Month" },
    viewHint: "The agenda lists the same items as the month.",
  };

  it("steps, jumps to today and switches views", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onToday = vi.fn();
    const onViewChange = vi.fn();
    render(
      <CalendarNav
        rangeLabel="October 2026"
        onPrevious={onPrevious}
        onNext={onNext}
        onToday={onToday}
        view="agenda"
        onViewChange={onViewChange}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect([onPrevious, onNext, onToday].every((f) => f.mock.calls.length === 1)).toBe(true);
    expect(screen.getByText("October 2026").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    expect(onViewChange).toHaveBeenCalledWith("month");
  });

  it("names the zone and offers the viewer's time", () => {
    const onChange = vi.fn();
    render(
      <TimezoneNote
        label="Times are in Istanbul time (UTC+3)"
        detail="09:00 Istanbul · 08:00 your time, Berlin"
        toggle={{ label: "Show in my time", checked: false, onCheckedChange: onChange }}
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent(
      "Times are in Istanbul time (UTC+3). 09:00 Istanbul · 08:00 your time, Berlin",
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

const fieldLabels: DateTimeFieldLabels = {
  date: "Date",
  pickDate: "Pick a date",
  chooseDate: "Choose a date",
  calendar: {
    previousMonth: "Previous month",
    nextMonth: "Next month",
    navigation: "Months",
    day: (date) => date,
  },
  invalidTime: "Enter a time such as 09:30",
};

function Field(props: { locale: string; error?: string; onChange?: (v: DateTimeValue) => void }) {
  const [value, setValue] = useState<DateTimeValue>({ date: "2026-11-02", time: "09:00" });
  return (
    <DateTimeField
      label="Publish at"
      value={value}
      onChange={(v) => {
        props.onChange?.(v);
        setValue(v);
      }}
      locale={props.locale}
      timeZone={IST}
      zoneLabel="Istanbul (UTC+3)"
      labels={fieldLabels}
      error={props.error}
    />
  );
}

describe("DateTimeField", () => {
  it("writes 24-hour time in Turkish and emits HH:mm", () => {
    const onChange = vi.fn();
    render(<Field locale="tr-TR" onChange={onChange} />);
    const time = screen.getByRole("textbox", { name: "Publish at" });
    expect(time).toHaveValue("09:00");
    fireEvent.change(time, { target: { value: "2130" } });
    fireEvent.blur(time);
    expect(onChange).toHaveBeenCalledWith({ date: "2026-11-02", time: "21:30" });
    expect(time).toHaveValue("21:30");
    expect(screen.getByText("Istanbul (UTC+3)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Publish at, Date: 2 Kas 2026/ }),
    ).toBeInTheDocument();
  });

  it("reads AM/PM in English and says when a time cannot be read", () => {
    const onChange = vi.fn();
    render(<Field locale="en-US" onChange={onChange} />);
    const time = screen.getByRole("textbox", { name: "Publish at" });
    expect(time).toHaveValue(formatTimeOfDay("09:00", "en-US"));
    fireEvent.change(time, { target: { value: "9:15 pm" } });
    fireEvent.keyDown(time, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ date: "2026-11-02", time: "21:15" });
    fireEvent.change(time, { target: { value: "later" } });
    fireEvent.blur(time);
    expect(screen.getByText("Enter a time such as 09:30")).toBeInTheDocument();
  });

  it("shows the screen's validation message", () => {
    render(
      <Field locale="en-GB" error="02:30 does not exist on 29 March in Berlin; it runs at 03:30" />,
    );
    expect(screen.getByText(/does not exist on 29 March/)).toBeInTheDocument();
  });
});

const recurrenceLabels: RecurrenceEditorLabels = {
  legend: "Repeats",
  presets: {
    once: "Once",
    hourly: "Every hour",
    daily: "Every day",
    weekdays: "Weekdays",
    weekly: "Every week",
    monthly: "Every month",
    custom: "Custom",
  },
  time: "At",
  minute: "Minutes past the hour",
  weekday: "On",
  monthDay: "Day of the month",
  monthDayOption: (d) => `Day ${d}`,
  lastDay: "Last day",
  interval: "Every",
  frequency: "Unit",
  frequencies: {
    daily: (n) => (n === 1 ? "day" : "days"),
    weekly: (n) => (n === 1 ? "week" : "weeks"),
    monthly: (n) => (n === 1 ? "month" : "months"),
  },
  weekdays: "On these days",
  monthlyOn: "On",
  monthlyDay: "A day of the month",
  monthlyWeekday: "A weekday of the month",
  ordinal: "Which",
  ordinals: { "1": "First", "2": "Second", "3": "Third", "4": "Fourth", "-1": "Last" },
  end: "Ends",
  ends: { never: "Never", on: "On a date", after: "After a number of runs" },
  endDate: "End date",
  endCount: "Runs",
  avoidOnTheHour: "Pick a minute such as :07.",
  invalidTime: "Enter a time such as 09:30",
  summary: "Summary",
};

function Recurrence({ initial, locale = "tr-TR" }: { initial: RecurrenceValue; locale?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RecurrenceEditor
        value={value}
        onChange={setValue}
        locale={locale}
        weekStartsOn={firstDayOfWeek(locale)}
        labels={recurrenceLabels}
        sentence={`rule: ${recurrenceRule(value) ?? "once"}`}
      />
      <output data-testid="rule">{recurrenceRule(value) ?? "once"}</output>
    </>
  );
}

describe("RecurrenceEditor", () => {
  it("emits the RRULE subset for every preset", () => {
    const at = { ...DEFAULT_RECURRENCE, time: "09:07" };
    expect(recurrenceRule({ ...at, preset: "once" })).toBeUndefined();
    expect(recurrenceRule({ ...at, preset: "daily" })).toBe("FREQ=DAILY;BYHOUR=9;BYMINUTE=7");
    expect(recurrenceRule({ ...at, preset: "weekdays" })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=7",
    );
    expect(recurrenceRule({ ...at, preset: "hourly" })).toMatch(
      /^FREQ=DAILY;BYHOUR=0,1,2,.*,23;BYMINUTE=7$/,
    );
    expect(recurrenceRule({ ...at, preset: "weekly", weekdays: ["TU"] })).toBe(
      "FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=7",
    );
    expect(recurrenceRule({ ...at, preset: "monthly", monthDay: -1 })).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=9;BYMINUTE=7",
    );
    expect(
      recurrenceRule({
        ...at,
        preset: "custom",
        frequency: "monthly",
        interval: 2,
        monthly: "weekday",
        ordinal: 2,
        weekdays: ["TU"],
        end: { kind: "after", count: 6 },
      }),
    ).toBe("FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU;BYHOUR=9;BYMINUTE=7;COUNT=6");
    expect(
      recurrenceRule({
        ...at,
        preset: "custom",
        frequency: "weekly",
        weekdays: ["FR", "MO"],
        end: { kind: "on", date: "2027-03-01" },
      }),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9;BYMINUTE=7;UNTIL=20270301T235959");
    expect(
      recurrenceProblems({ ...at, preset: "custom", frequency: "weekly", weekdays: [] }),
    ).toEqual(["weekdays"]);
  });

  it("switches presets and shows weekday boxes in the locale's week order", () => {
    render(<Recurrence initial={DEFAULT_RECURRENCE} />);
    expect(screen.getByTestId("rule")).toHaveTextContent("FREQ=DAILY;BYHOUR=9;BYMINUTE=7");
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    const boxes = screen.getAllByRole("checkbox");
    // Turkish weeks start on Monday.
    expect(boxes[0]).toHaveAccessibleName(/Pazartesi/);
    expect(boxes[6]).toHaveAccessibleName(/Pazar$/);
    // Click the label, as a person does (happy-dom re-fires a click on the box through its label).
    fireEvent.click(screen.getByText("Çar"));
    expect(screen.getByTestId("rule")).toHaveTextContent("FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9");
    expect(screen.getByText(/^rule: FREQ=WEEKLY/)).toBeInTheDocument();
  });

  it("asks for a minute off the hour", () => {
    render(<Recurrence initial={{ ...DEFAULT_RECURRENCE, time: "09:00" }} />);
    expect(screen.getByText("Pick a minute such as :07.")).toBeInTheDocument();
  });
});

describe("NextRuns", () => {
  it("lists runs in the site zone and flags clock changes", () => {
    render(
      <NextRuns
        runs={[{ at: "2026-10-24T07:07:00Z" }, { at: "2026-10-25T08:07:00Z", clockChange: true }]}
        locale="en-GB"
        timeZone="Europe/Berlin"
        labels={{
          title: "Next runs",
          clockChange: "Clock change",
          empty: "No more runs",
          loading: "Working out the next runs",
        }}
      />,
    );
    expect(screen.getByText("Saturday 24 October")).toBeInTheDocument();
    // 07:07Z in summer time and 08:07Z after the change are both 09:07 in Berlin.
    expect(screen.getAllByText("09:07")).toHaveLength(2);
    expect(screen.getAllByText("Clock change")).toHaveLength(1);
  });
});

const rescheduleLabels: RescheduleDialogLabels = {
  title: "Move to…",
  now: "Now",
  next: "New",
  pickTime: "Pick a new time",
  approvalKept: "The approval is kept.",
  approvalVoided: "Moving voids the approval; it asks again.",
  confirm: "Move",
  cancel: "Cancel",
  close: "Close",
  field: fieldLabels,
  fieldLabel: "New time",
};

describe("RescheduleDialog", () => {
  const base = {
    open: true,
    onOpenChange: () => {},
    subject: "Election results",
    current: "Mon 2 Nov, 09:00",
    value: { date: "2026-11-03", time: "09:00" },
    onValueChange: () => {},
    locale: "en-GB",
    timeZone: IST,
    zoneLabel: "Istanbul (UTC+3)",
    labels: rescheduleLabels,
  };

  it("confirms the move and says the approval is kept (D4)", () => {
    const onConfirm = vi.fn();
    render(
      <RescheduleDialog
        {...base}
        nextLabel="Tue 3 Nov, 09:00"
        approvalEffect="kept"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("Mon 2 Nov, 09:00")).toBeInTheDocument();
    expect(screen.getByText("Tue 3 Nov, 09:00")).toBeInTheDocument();
    expect(document.querySelector('[data-approval-effect="kept"]')).toHaveTextContent(
      "The approval is kept.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("warns that an agent's move voids the approval and waits for a valid time", () => {
    render(
      <RescheduleDialog
        {...base}
        approvalEffect="voided"
        conflict="Another release publishes Budget at 09:00"
        onConfirm={() => {}}
      />,
    );
    expect(document.querySelector('[data-approval-effect="voided"]')).toHaveTextContent(
      "voids the approval",
    );
    expect(screen.getByText("Another release publishes Budget at 09:00")).toBeInTheDocument();
    expect(screen.getByText("Pick a new time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
  });
});

describe("ScheduleFilters", () => {
  const labels: ScheduleFiltersLabels = {
    toolbar: "Filter schedules",
    facet: {
      kind: "Kind",
      state: "State",
      origin: "Origin",
      approval: "Approval",
      collection: "Collection",
      term: "Category or tag",
      locale: "Language",
    },
    selected: (f, n) => `${f}, ${n} selected`,
    clear: "Clear filters",
    view: "View",
    builtinViews: "Built-in views",
    savedViews: "Saved views",
    saveView: "Save view…",
  };

  function Filters({ onChange }: { onChange: (v: ScheduleFilterValue) => void }) {
    const [value, setValue] = useState<ScheduleFilterValue>({ kind: ["publish"] });
    return (
      <ScheduleFilters
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        facets={[
          {
            facet: "kind",
            options: [
              { value: "publish", label: "Publish" },
              { value: "release", label: "Release" },
            ],
          },
          { facet: "origin", options: [{ value: "agent", label: "Agents" }] },
        ]}
        labels={labels}
        views={[
          { id: "all", label: "All", builtin: true },
          { id: "waiting", label: "Waiting for approval", builtin: true },
        ]}
        view="all"
        onViewChange={() => {}}
      />
    );
  }

  it("is controlled, multi-valued and clears", async () => {
    const onChange = vi.fn();
    render(<Filters onChange={onChange} />);
    expect(screen.getByRole("toolbar", { name: "Filter schedules" })).toBeInTheDocument();
    const kind = screen.getByRole("button", { name: "Kind, 1 selected" });
    fireEvent.click(kind);
    const release = await screen.findByRole("menuitemcheckbox", { name: "Release" });
    fireEvent.click(release);
    expect(onChange).toHaveBeenLastCalledWith({ kind: ["publish", "release"] });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenLastCalledWith({});
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(screen.getByRole("button", { name: "View: All" })).toBeInTheDocument();
  });
});

describe("ScheduleRunRow", () => {
  const labels: ScheduleRunRowLabels = {
    subject: { release: "Release", builtin: "Built-in job", agentTask: "Agent task" },
    trigger: { cron: "Cron", alarm: "Clock", request: "Request", node: "Timer", manual: "Run now" },
    outcome: {
      "did-work": "Did work",
      "nothing-to-do": "Nothing to do",
      proposed: "Proposed changes",
      "waiting-approval": "Waiting for approval",
    },
    onTime: "On time",
    late: (d) => `${d} late`,
    adjusted: { "dst-gap": "Moved past a clock change", tzdata: "Moved by new zone rules" },
    usage: (p) => `Calls ${p.toolCalls} · Writes ${p.writes} · Requests ${p.approvalRequests}`,
    overBudget: "Over budget",
    taint: "Read visitor text",
    taintHint: (tool, time) => `After ${tool} at ${time} it could only read, label and hide.`,
    none: "None",
  };
  const columns = {
    time: "Time",
    kind: "Kind",
    subject: "Subject",
    origin: "Origin",
    state: "State",
    outcome: "Outcome",
    lateness: "Lateness",
    usage: "Budget",
    links: "Links",
  };

  it.each(SCHEDULE_RUN_STATES.map((s) => [s]))("renders a %s run", (state) => {
    const { container } = render(
      <Table>
        <Table.Header>
          <ScheduleRunHeader labels={columns} />
        </Table.Header>
        <Table.Body>
          <ScheduleRunRow
            run={{
              id: "run_1",
              at: "2026-10-12T06:07:00Z",
              subject: "automation",
              job: "agent-task",
              title: "Hourly comment triage",
              state,
            }}
            words={words}
            labels={labels}
            locale="en-GB"
            timeZone={IST}
          />
        </Table.Body>
      </Table>,
    );
    expect(
      container.querySelector(`[data-run-state="${state}"] [data-state="${state}"]`),
    ).not.toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
    expect(screen.getAllByRole("cell")).toHaveLength(9);
  });

  it("shows lateness, budget use, the outcome and the taint marker", () => {
    render(
      <Table>
        <Table.Body>
          <ScheduleRunRow
            run={{
              id: "run_2",
              at: "2026-10-12T06:07:00Z",
              subject: "automation",
              job: "agent-task",
              title: "Hourly comment triage",
              href: "/automations/a1",
              state: "succeeded",
              outcome: "proposed",
              trigger: "cron",
              latenessSeconds: 180,
              usage: { toolCalls: 60, writes: 2, approvalRequests: 1 },
              budget: { maxToolCalls: 50, maxWrites: 10, maxApprovalRequests: 5 },
              taint: { at: "2026-10-12T06:08:00Z", tool: "get_comments" },
            }}
            words={words}
            labels={labels}
            locale="en-GB"
            timeZone={IST}
          />
        </Table.Body>
      </Table>,
    );
    expect(screen.getByText("09:07")).toBeInTheDocument();
    expect(document.querySelector('[data-lateness="180"]')).toHaveTextContent(/^3 min.* late$/);
    expect(screen.getByText("Proposed changes")).toBeInTheDocument();
    expect(screen.getByText("Calls 60/50 · Writes 2/10 · Requests 1/5")).toBeInTheDocument();
    expect(screen.getByText("Over budget")).toBeInTheDocument();
    expect(document.querySelector("[data-taint]")).toHaveTextContent(
      "After get_comments at 09:08 it could only read, label and hide.",
    );
    expect(screen.getByRole("link", { name: "Hourly comment triage" })).toHaveAttribute(
      "href",
      "/automations/a1",
    );
  });
});

describe("schedule blocks", () => {
  it("never hard-code English or inject HTML", () => {
    const files = [
      "AgendaList",
      "CalendarMonth",
      "CalendarNav",
      "DateTimeField",
      "NextRuns",
      "RecurrenceEditor",
      "RescheduleDialog",
      "ScheduleFilters",
      "ScheduleItem",
      "ScheduleRunRow",
      "ScheduleStatusBadge",
      "TimezoneNote",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), "src/blocks", `${f}.tsx`), "utf8");
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML/);
      // JSX text nodes with letters are words: they must come from props.
      expect(src.match(/>\s*[A-Za-z][A-Za-z ,.'!?-]{2,}\s*</g), f).toBeNull();
    }
  });
});

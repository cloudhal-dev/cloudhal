/**
 * Schedules in Studio (RFC-0008 §15, DESIGN.md §2x): pure helpers for the calendar, the release
 * page, the automation editor and the editors' Schedule card — wall-clock times in the site's zone
 * and the instants they stand for, the period a view fetches, calendar items as the blocks'
 * entries, filters and views, and what a release allows. No date library: zones go through `Intl`
 * (like the blocks' `schedule-model.ts`), recurrences are expanded by the server.
 *
 * Loads with the schedule screens only (`bundle-budget.ts` `LAZY_ONLY`).
 */

import type { Release } from "@cloudhal/core-contracts";
import { dateTimeFormat, numberFormat } from "@cloudhal/messages/format";
import {
  DEFAULT_RECURRENCE,
  dateToDay,
  dayToDate,
  hourCycleOf,
  monthGrid,
  offsetAt,
  type RecurrenceValue,
  type RecurrenceWeekday,
  type ScheduleApprovalState,
  type ScheduleEntry,
  type ScheduleFilterValue,
  type ScheduleKind,
  shiftDay,
  type WallClock,
  type WeekDay,
  zonedDay,
  zonedToInstant,
} from "@cloudhal/ui";
import type { CalendarItem, ReleaseApprovalState, ReleaseView } from "./api.ts";
import { entryHref } from "./entry-href.ts";
import type { CalendarSearch } from "./schedules-search.ts";

// ---------------------------------------------------------------------------------------------
// Wall-clock time in a zone ↔ instants
// ---------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// The wall clock ↔ instant conversions live with the blocks (`zoned-time.ts`), which typed
// `datetime` fields share (RFC-0041 §7); re-exported here for the schedule screens.
export { type WallClock, wallClockOf, zonedToInstant } from "@cloudhal/ui";

/** `YYYY-MM-DDTHH:mm`, the contract's `LocalDateTime`. */
export const localDateTime = (w: WallClock) => `${w.date}T${w.time}`;

/** Today in the site's zone. */
export function todayIn(timeZone: string, now: number = Date.now()): string {
  return zonedDay(new Date(now).toISOString(), timeZone);
}

/** The zone's city as people read it: `Europe/Istanbul` → "Istanbul"; UTC stays UTC. */
export function zoneCity(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
}

/** "UTC+3", "UTC−4:30", "UTC" at an instant. */
export function zoneOffset(timeZone: string, at: number = Date.now()): string {
  const minutes = Math.round(offsetAt(at, timeZone) / MINUTE_MS);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "Istanbul (UTC+3)"; plain "UTC" for UTC. */
export function zoneLabel(timeZone: string, at: number = Date.now()): string {
  const city = zoneCity(timeZone);
  return city === "UTC" ? "UTC" : `${city} (${zoneOffset(timeZone, at)})`;
}

/** The viewer's zone (the browser's), UTC when it cannot tell. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; // i18n-ignore: reads the zone, formats nothing
  } catch {
    return "UTC";
  }
}

/** Every IANA zone this browser knows, for the time-zone picker. */
export function knownZones(): string[] {
  try {
    const zones = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      "timeZone",
    );
    if (zones && zones.length > 0) return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {}
  return ["UTC", "Europe/Istanbul", "Europe/London", "Europe/Berlin", "America/New_York"];
}

export function isKnownZone(timeZone: string): boolean {
  try {
    dateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A day and time written out in the locale ("Mon 2 Nov, 09:00") in `timeZone`. */
export function formatWhen(
  at: string,
  locale: string,
  timeZone: string,
  style: "short" | "long" = "short",
): string {
  return dateTimeFormat(locale, {
    timeZone,
    ...(style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short" }),
    hour: hourCycleOf(locale) === "h23" ? "2-digit" : "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

/** "3 min", "2 hr", "1.5 days" from minutes, in the locale's short units. */
export function formatMinutes(minutes: number, locale: string): string {
  const m = Math.max(1, Math.round(minutes));
  const unit = m >= 1440 ? "day" : m >= 60 ? "hour" : "minute";
  const value = unit === "day" ? m / 1440 : unit === "hour" ? m / 60 : m;
  return numberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "minute" ? 0 : 1,
  }).format(value);
}

/** A moment in the reader's own zone ("12 Oct 2026, 14:02"). */
export function formatMoment(at: string, locale: string): string {
  return dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(at));
}

/** What is wrong with a wall-clock time the person picked (the screens word it). */
export type WhenProblem =
  | { code: "incomplete" }
  | { code: "past" }
  | { code: "soon" }
  | { code: "far"; days: number }
  | { code: "gap"; runsAt: string };

/** Releases run at least a minute ahead; Studio asks for five so the approval has time (§6.1.7). */
export const MIN_LEAD_MINUTES = 5;

/**
 * Checks a time for a release or a gate: complete, not in the past, at least five minutes away
 * (releases), within the server's horizon, and not inside a clock change (`gap` still saves; the
 * field says when it will run).
 */
export function whenProblem(
  value: Partial<WallClock> | undefined,
  timeZone: string,
  options: { now?: number; leadMinutes?: number; horizonDays?: number } = {},
): WhenProblem | undefined {
  if (!value?.date || !value.time) return { code: "incomplete" };
  const now = options.now ?? Date.now();
  const { at, gap } = zonedToInstant(value as WallClock, timeZone);
  const t = Date.parse(at);
  if (t <= now) return { code: "past" };
  if (options.leadMinutes && t - now < options.leadMinutes * MINUTE_MS) return { code: "soon" };
  if (options.horizonDays && t - now > options.horizonDays * DAY_MS)
    return { code: "far", days: options.horizonDays };
  if (gap) return { code: "gap", runsAt: gap.runsAt };
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The period a view shows
// ---------------------------------------------------------------------------------------------

/** The month a calendar URL shows (`date` is a month or a day); this month otherwise. */
export function monthOfSearch(date: string | undefined, today: string): string {
  return (date ?? today).slice(0, 7);
}

/**
 * The days a month view shows (whole weeks from `weekStartsOn`) and the instants bounding them in
 * the site's zone: what the calendar fetches (at most 42 days, inside the API's 62).
 */
export function monthPeriod(month: string, weekStartsOn: WeekDay, timeZone: string) {
  const weeks = monthGrid(month, weekStartsOn);
  const first = weeks[0]?.[0] ?? `${month}-01`;
  const last = weeks.at(-1)?.at(-1) ?? `${month}-28`;
  return {
    first,
    last,
    from: zonedToInstant({ date: first, time: "00:00" }, timeZone).at,
    to: zonedToInstant({ date: shiftDay(last, 1), time: "00:00" }, timeZone).at,
  };
}

/** The week that holds `day`, from `weekStartsOn`: its first and last day. */
export function weekOf(day: string, weekStartsOn: WeekDay): { first: string; last: string } {
  const back = (dayToDate(day).getUTCDay() - weekStartsOn + 7) % 7;
  const first = shiftDay(day, -back);
  return { first, last: shiftDay(first, 6) };
}

/** The first day of the month after (`+1`) or before (`-1`) `month`. */
export function stepMonth(month: string, step: number): string {
  const d = dayToDate(`${month}-01`);
  return dateToDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1))).slice(0, 7);
}

// ---------------------------------------------------------------------------------------------
// Calendar items as the blocks' entries
// ---------------------------------------------------------------------------------------------

/** The approval words of the blocks from the server's `approvalState`. */
export function approvalOf(state: ReleaseApprovalState): ScheduleApprovalState | undefined {
  switch (state) {
    case "pending":
      return "waiting";
    case "approved":
      return "approved";
    case "auto":
      return "auto";
    case "denied":
      return "denied";
    case "expired":
      return "expired";
    default:
      return undefined;
  }
}

/** The calendar's kind of an item: one-node releases are a "publish", gates an embargo or expiry. */
export function kindOf(item: Pick<CalendarItem, "kind" | "id" | "target">): ScheduleKind {
  if (item.kind === "automation") return "automation";
  if (item.kind === "gate") return item.id.endsWith(":until") ? "expiry" : "embargo";
  return (item.target.nodeIds?.length ?? 0) === 1 ? "publish" : "release";
}

/** Where a calendar item leads: the release page, the node's editor, the automation. */
export function itemHref(siteId: string, item: CalendarItem): string | undefined {
  const base = `/sites/${siteId}`;
  if (item.kind === "release" && item.target.releaseId)
    return `${base}/schedules/releases/${item.target.releaseId}`;
  if (item.kind === "gate" && item.target.nodeId)
    return item.target.nodeId.startsWith("page_")
      ? `${base}/pages/${item.target.nodeId}`
      : entryHref(siteId, item.target.nodeId);
  if (item.kind === "automation" && item.target.automationId)
    return `${base}/schedules/automations?edit=${item.target.automationId}`;
  return undefined;
}

/** Release states a person may still move (D12: future, not running, not in conflict). */
const MOVABLE: ReadonlySet<string> = new Set(["scheduled", "awaiting_approval"]);

/** One calendar item as an entry of the blocks (data only; the screen adds words and actions). */
export function entryOf(
  siteId: string,
  item: CalendarItem,
  now: number,
  options: { canMove?: boolean } = {},
): ScheduleEntry {
  const future = Date.parse(item.at) > now;
  const base: ScheduleEntry = {
    id: item.id,
    kind: kindOf(item),
    title: item.title,
    at: item.at,
    origin: item.origin,
    status: { subject: "release", state: "scheduled" },
  };
  const href = itemHref(siteId, item);
  if (href) base.href = href;
  if (item.kind === "release") {
    const approval = approvalOf(item.approval);
    return {
      ...base,
      status: { subject: "release", state: item.state as Release["state"] },
      ...(approval ? { approval } : {}),
      movable: options.canMove !== false && future && MOVABLE.has(item.state),
    };
  }
  if (item.kind === "gate")
    return { ...base, status: { subject: "release", state: future ? "scheduled" : "published" } };
  return {
    ...base,
    status: { subject: "run", state: future ? "due" : "succeeded" },
    recurring: future,
  };
}

// ---------------------------------------------------------------------------------------------
// Filters, built-in and saved views (§15.5)
// ---------------------------------------------------------------------------------------------

/** The state facet groups many states into what people ask for. */
export const STATE_GROUPS = {
  scheduled: ["scheduled", "running"],
  waiting: ["draft", "awaiting_approval"],
  attention: ["conflict", "failed", "missed"],
  done: ["published"],
  canceled: ["canceled", "expired"],
} as const satisfies Record<string, readonly string[]>;
export type StateGroup = keyof typeof STATE_GROUPS;
export const STATE_FACET = Object.keys(STATE_GROUPS) as StateGroup[];

/** The approval facet: none needed, waiting, approved, automatic, denied or expired. */
export const APPROVAL_FACET = ["none", "waiting", "approved", "auto", "closed"] as const;
export type ApprovalFacet = (typeof APPROVAL_FACET)[number];
export const ORIGIN_FACET = ["person", "agent"] as const;
export const KIND_FACET: readonly ScheduleKind[] = [
  "publish",
  "release",
  "embargo",
  "expiry",
  "automation",
];

/** Built-in views (v1, in code): RFC-0008 §15.5. */
export const BUILTIN_VIEWS = ["all", "waiting", "agents", "week", "attention", "mine"] as const;
export type BuiltinView = (typeof BUILTIN_VIEWS)[number];

const VIEW_FILTERS: Record<BuiltinView, ScheduleFilterValue> = {
  all: {},
  waiting: { approval: ["waiting"] },
  agents: { origin: ["agent"], state: ["waiting"] },
  week: {},
  attention: { state: ["attention"] },
  mine: {},
};

/** The filters a built-in view stands for. */
export function viewFilters(view: BuiltinView): ScheduleFilterValue {
  return VIEW_FILTERS[view];
}

export function isBuiltinView(v: unknown): v is BuiltinView {
  return typeof v === "string" && (BUILTIN_VIEWS as readonly string[]).includes(v);
}

const FACETS = ["kind", "state", "origin", "approval"] as const;
type Facet = (typeof FACETS)[number];
const ALLOWED: Record<Facet, readonly string[]> = {
  kind: KIND_FACET,
  state: STATE_FACET,
  origin: ORIGIN_FACET,
  approval: APPROVAL_FACET,
};

/** The facets in a calendar URL, with unknown values dropped. */
export function filtersOf(search: CalendarSearch): ScheduleFilterValue {
  const out: ScheduleFilterValue = {};
  for (const facet of FACETS) {
    const values = (search[facet] ?? "").split(",").filter((v) => v && ALLOWED[facet].includes(v));
    if (values.length > 0) out[facet] = [...new Set(values)];
  }
  return out;
}

/** The URL's facet params for a filter value (absent facets removed). */
export function searchOfFilters(value: ScheduleFilterValue): Pick<CalendarSearch, Facet> {
  const out: Pick<CalendarSearch, Facet> = {};
  for (const facet of FACETS) {
    const v = value[facet];
    if (v && v.length > 0) out[facet] = v.join(",");
  }
  return out;
}

/** True when two filter values narrow alike. */
export function sameFilters(a: ScheduleFilterValue, b: ScheduleFilterValue): boolean {
  return FACETS.every((f) => [...(a[f] ?? [])].sort().join() === [...(b[f] ?? [])].sort().join());
}

function approvalFacetOf(entry: ScheduleEntry): ApprovalFacet {
  switch (entry.approval) {
    case "waiting":
      return "waiting";
    case "approved":
      return "approved";
    case "auto":
      return "auto";
    case "denied":
    case "expired":
      return "closed";
    default:
      return entry.status.subject === "release" && entry.status.state === "awaiting_approval"
        ? "waiting"
        : "none";
  }
}

function stateGroupOf(entry: ScheduleEntry): StateGroup | undefined {
  const s = entry.status.state;
  for (const g of STATE_FACET) if ((STATE_GROUPS[g] as readonly string[]).includes(s)) return g;
  return entry.status.subject === "run" && s === "succeeded" ? "done" : undefined;
}

/** Hidden unless asked for: canceled, denied and expired (RFC-0008 §15.5 "Default"). */
function hiddenByDefault(entry: ScheduleEntry, filters: ScheduleFilterValue): boolean {
  const closed =
    entry.approval === "denied" ||
    entry.approval === "expired" ||
    (entry.status.subject === "release" &&
      (entry.status.state === "canceled" || entry.status.state === "expired"));
  if (!closed) return false;
  return !(filters.state?.includes("canceled") || filters.approval?.includes("closed"));
}

/** Whether an entry passes the filters (every facet that narrows must match). */
export function matchesFilters(
  entry: ScheduleEntry,
  filters: ScheduleFilterValue,
  extra: { text?: string; mine?: (entry: ScheduleEntry) => boolean } = {},
): boolean {
  if (hiddenByDefault(entry, filters)) return false;
  if (filters.kind?.length && !filters.kind.includes(entry.kind)) return false;
  if (filters.origin?.length && !filters.origin.includes(entry.origin ?? "person")) return false;
  if (filters.approval?.length && !filters.approval.includes(approvalFacetOf(entry))) return false;
  if (filters.state?.length) {
    const g = stateGroupOf(entry);
    if (!g || !filters.state.includes(g)) return false;
  }
  const q = extra.text?.trim().toLocaleLowerCase();
  if (q && !entry.title.toLocaleLowerCase().includes(q)) return false;
  if (extra.mine && !extra.mine(entry)) return false;
  return true;
}

/** Entries that need someone: conflicts, failures, missed runs (the attention banner). */
export function needsAttention(entry: Pick<ScheduleEntry, "status">): boolean {
  return (
    entry.status.subject === "release" &&
    (STATE_GROUPS.attention as readonly string[]).includes(entry.status.state)
  );
}

/** A view the person saved in this browser (server-stored and shared views are v1.1). */
export interface SavedView {
  id: string;
  label: string;
  filters: ScheduleFilterValue;
}

export const SAVED_VIEWS_KEY = "cloudhal.studio.schedules.views";

export function readSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (v): v is SavedView =>
          !!v &&
          typeof v.id === "string" &&
          typeof v.label === "string" &&
          typeof v.filters === "object",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function writeSavedViews(views: readonly SavedView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views.slice(0, 20)));
  } catch {}
}

// ---------------------------------------------------------------------------------------------
// What a release allows (§5.2, §13)
// ---------------------------------------------------------------------------------------------

export interface ReleaseAbilities {
  /** `schedules.write` (own) or `schedules.writeAny`, for this release. */
  write: boolean;
  /** `releases.approveAny`, or `releases.approve` on a release of one's own work. */
  approve: boolean;
}

export type ReleaseAction =
  | "schedule"
  | "reschedule"
  | "unschedule"
  | "cancel"
  | "publishNow"
  | "repin";

/** The actions a release's state allows (abilities aside). */
export function releaseActions(state: Release["state"]): ReleaseAction[] {
  switch (state) {
    case "draft":
      return ["schedule", "repin", "cancel"];
    case "awaiting_approval":
      return ["reschedule", "unschedule", "repin", "cancel"];
    case "scheduled":
      return ["reschedule", "unschedule", "publishNow", "repin", "cancel"];
    case "conflict":
      return ["repin", "cancel"];
    case "missed":
    case "expired":
      return ["publishNow", "cancel"];
    default:
      return [];
  }
}

/** Whether the person may take `action` on the release (the server decides anyway). */
export function mayTake(action: ReleaseAction, abilities: ReleaseAbilities): boolean {
  return action === "publishNow" ? abilities.approve : abilities.write;
}

/**
 * Moving keeps the approval when the release is scheduled and the person may approve it; anyone
 * else's move asks again (D4); nothing was approved yet otherwise.
 */
export function moveEffect(
  release: Pick<Release, "state">,
  canApprove: boolean,
): "kept" | "voided" | "none" {
  if (release.state !== "scheduled") return "none";
  return canApprove ? "kept" : "voided";
}

/** When a release runs: its stored execution time, else its `when`. */
export function releaseAt(
  r: { executeAt?: string | null; when?: Release["when"] } | undefined,
): string | undefined {
  return r?.executeAt ?? (r?.when?.kind === "at" ? r.when.at : undefined);
}

/** Releases that hold `nodeId` now (awaiting approval, scheduled or running): the node is locked. */
export function holdsOf(releases: readonly ReleaseView[], nodeId: string): ReleaseView[] {
  return releases.filter(
    (r) =>
      (r.state === "awaiting_approval" || r.state === "scheduled" || r.state === "running") &&
      r.items.some((i) => i.nodeId === nodeId),
  );
}

/** The `when` REST takes back from a stored one (to schedule a draft again at its own time). */
export function whenInputOf(
  when: Release["when"],
):
  | { localTime: string; timeZone: string }
  | { at: string; timeZone: string }
  | "on-approval"
  | undefined {
  if (!when) return undefined;
  if (when.kind === "on-approval") return "on-approval";
  return when.localTime
    ? { localTime: when.localTime, timeZone: when.timeZone }
    : { at: when.at, timeZone: when.timeZone };
}

// ---------------------------------------------------------------------------------------------
// Recurrence: a stored rule back into the editor's value
// ---------------------------------------------------------------------------------------------

const WEEKDAY_CODES: readonly RecurrenceWeekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * Reads a rule `recurrenceRule` wrote back into the editor's structured value (the RRULE subset of
 * D3). Rules it cannot read open as "Custom" with what could be read.
 */
export function recurrenceValueOf(
  rule: string | undefined,
  preset: RecurrenceValue["preset"],
  start: string,
): RecurrenceValue {
  const time = start.slice(11, 16) || DEFAULT_RECURRENCE.time;
  const value: RecurrenceValue = { ...DEFAULT_RECURRENCE, preset, time };
  if (!rule) return { ...value, preset: "once" };
  const parts = Object.fromEntries(
    rule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k ?? "", v ?? ""];
    }),
  );
  const hour = parts.BYHOUR?.split(",");
  const minute = parts.BYMINUTE ? Number(parts.BYMINUTE.split(",")[0]) : undefined;
  if (hour && hour.length === 1 && minute !== undefined)
    value.time = `${hour[0]?.padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (hour && hour.length > 1 && minute !== undefined)
    value.time = `00:${String(minute).padStart(2, "0")}`;
  const days = (parts.BYDAY ?? "")
    .split(",")
    .map((d) => d.replace(/^-?\d/, ""))
    .filter((d): d is RecurrenceWeekday => (WEEKDAY_CODES as readonly string[]).includes(d));
  if (days.length > 0) value.weekdays = days;
  if (parts.BYMONTHDAY) value.monthDay = Number(parts.BYMONTHDAY);
  if (parts.INTERVAL) value.interval = Number(parts.INTERVAL);
  const freq = parts.FREQ?.toLowerCase();
  if (freq === "daily" || freq === "weekly" || freq === "monthly") value.frequency = freq;
  const ordinal = /^(-?\d)[A-Z]{2}$/.exec(parts.BYDAY ?? "")?.[1];
  if (ordinal) {
    value.monthly = "weekday";
    value.ordinal = Number(ordinal) as RecurrenceValue["ordinal"];
  }
  if (parts.COUNT) value.end = { kind: "after", count: Number(parts.COUNT) };
  else if (parts.UNTIL) {
    const u = parts.UNTIL;
    value.end = { kind: "on", date: `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` };
  }
  return value;
}

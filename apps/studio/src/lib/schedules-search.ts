/**
 * The Schedules screens' URLs (RFC-0008 §15.5: "the URL is the state"). Apart from `schedules.ts`
 * because the router validates them and the router is in the entry chunk: this file only keeps
 * known keys with well-formed values; the screens read their meaning (`filtersOf` drops unknown
 * facet values).
 *
 * `/sites/:id/schedules?view=month&date=2026-10&kind=publish,release&origin=agent&approval=waiting`
 */

/** The calendar tab: view, period, facets, search, a built-in or saved view, a dialog to open. */
export interface CalendarSearch {
  /** `month`; the agenda is the default. */
  view?: "month";
  /** The month shown (`YYYY-MM`), or a day (`YYYY-MM-DD`) whose month is shown. */
  date?: string;
  kind?: string;
  state?: string;
  origin?: string;
  approval?: string;
  q?: string;
  /** A built-in view (`waiting`, `week` …) or a saved one (`saved:<id>`). */
  v?: string;
  /** Opens "New schedule": a publish, a release or an automation. */
  new?: "publish" | "release" | "automation";
}

/** The History tab: facets and one automation's or release's runs. */
export interface HistorySearch {
  state?: string;
  kind?: string;
  origin?: string;
  automation?: string;
  release?: string;
}

/** The Automations tab: an automation's editor, or a new one. */
export interface AutomationsSearch {
  edit?: string;
  new?: "1";
}

const RULES: Record<string, RegExp> = {
  view: /^month$/,
  date: /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/,
  v: /^(\w{2,12}|saved:[\w-]{1,40})$/,
  new: /^(publish|release|automation|1)$/,
  q: /^[^\n]{1,100}$/,
};
const LIST = /^[a-z][a-z_-]{0,30}(,[a-z][a-z_-]{0,30}){0,9}$/;
const ID = /^[a-z]+_\w{4,40}$/;

/** Keeps the keys the Schedules screens know, with well-formed values (all three tabs). */
export function validateSchedulesSearch(search: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) {
    const v = typeof value === "number" ? String(value) : value;
    if (typeof v !== "string") continue;
    const rule =
      RULES[key] ??
      (["kind", "state", "origin", "approval"].includes(key)
        ? LIST
        : ["automation", "release", "edit"].includes(key)
          ? ID
          : undefined);
    if (rule?.test(v)) out[key] = v;
  }
  return out;
}

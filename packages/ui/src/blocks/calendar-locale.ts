/**
 * Kumo's `DatePicker` (react-day-picker 9 inside) speaks English unless it is given a date-fns
 * locale. Instead of shipping one per language, Cloudhal localises it through the props the
 * picker exposes: `formatters` (month caption, weekday names) and `labels` (every accessible name)
 * through `Intl` in the Studio locale, `weekStartsOn` from the locale's week, and `lang` on the
 * calendar. Words that are not dates (previous/next month, today, selected) come from the caller,
 * like every block label (DESIGN.md §2v). Every `DatePicker` in Studio takes these props.
 */
import { dateTimeFormat } from "@cloudhal/messages/format";

export interface CalendarLabels {
  /** The navigation buttons ("Previous month", "Next month"). */
  previousMonth: string;
  nextMonth: string;
  /** The month navigation's name ("Months"). */
  navigation: string;
  /**
   * A day button's name from the date written out in the locale ("Monday, October 12, 2026"),
   * e.g. "Today, Monday, October 12, 2026, selected".
   */
  day: (date: string, state: { today: boolean; selected: boolean }) => string;
}

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** First day of the week in `locale` (0 = Sunday): `Intl.Locale` week info where the browser has it. */
export function firstDayOfWeek(locale: string): WeekDay {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = typeof l.getWeekInfo === "function" ? l.getWeekInfo() : l.weekInfo;
    if (info && Number.isInteger(info.firstDay)) return (info.firstDay % 7) as WeekDay;
    // No week info (Firefox): Sunday for US English, Monday elsewhere (ISO 8601).
    const region = l.maximize().region;
    return region === "US" || region === "CA" ? 0 : 1;
  } catch {
    return 1;
  }
}

/**
 * The props that make a Kumo `DatePicker` speak `locale`. `timeZone` is the zone the calendar's
 * days are in ("UTC" for analytics); names are formatted in it too.
 */
export function calendarLocaleProps(locale: string, labels: CalendarLabels, timeZone?: string) {
  const zone = timeZone ? { timeZone } : {};
  const caption = dateTimeFormat(locale, { month: "long", year: "numeric", ...zone });
  const weekdayShort = dateTimeFormat(locale, { weekday: "short", ...zone });
  const weekdayLong = dateTimeFormat(locale, { weekday: "long", ...zone });
  const full = dateTimeFormat(locale, { dateStyle: "full", ...zone });
  return {
    lang: locale,
    weekStartsOn: firstDayOfWeek(locale),
    ...zone,
    formatters: {
      formatCaption: (month: Date) => caption.format(month),
      formatWeekdayName: (weekday: Date) => weekdayShort.format(weekday),
    },
    labels: {
      labelPrevious: () => labels.previousMonth,
      labelNext: () => labels.nextMonth,
      labelNav: () => labels.navigation,
      labelGrid: (month: Date) => caption.format(month),
      labelWeekday: (weekday: Date) => weekdayLong.format(weekday),
      labelDayButton: (date: Date, modifiers: { today?: boolean; selected?: boolean }) =>
        labels.day(full.format(date), {
          today: modifiers.today === true,
          selected: modifiers.selected === true,
        }),
      labelGridcell: (date: Date, modifiers?: { today?: boolean }) =>
        labels.day(full.format(date), { today: modifiers?.today === true, selected: false }),
    },
  };
}

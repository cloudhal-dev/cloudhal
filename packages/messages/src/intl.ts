/**
 * The `Intl` formatting layer (the i18n review's Phase 2): every number, date, time, relative time,
 * list, display name and collation in Studio and its blocks comes from these factories, always
 * with an explicit locale (the Studio language, or a fixed one for machine formats such as the
 * `en-CA` day keys), never the browser's. Formatters are created once per locale and options and
 * cached, so a list of a thousand rows does not build a thousand formatters. Worker-safe.
 *
 * The i18n lint's `i18n-format` rule keeps screens and blocks on these: no `new Intl.*`, no
 * `toLocaleString()` without a locale.
 */

type Locales = string | readonly string[];

function cache<O, F>(make: (locales: string[], options?: O) => F) {
  const made = new Map<string, F>();
  return (locales: Locales, options?: O): F => {
    const list = typeof locales === "string" ? [locales] : [...locales];
    const id = `${list.join(",")}|${options === undefined ? "" : JSON.stringify(options)}`;
    let f = made.get(id);
    if (!f) {
      f = make(list, options);
      made.set(id, f);
    }
    return f;
  };
}

/** A cached `Intl.NumberFormat`. */
export const numberFormat = cache<Intl.NumberFormatOptions, Intl.NumberFormat>(
  (l, o) => new Intl.NumberFormat(l, o),
);
/** A cached `Intl.DateTimeFormat`. */
export const dateTimeFormat = cache<Intl.DateTimeFormatOptions, Intl.DateTimeFormat>(
  (l, o) => new Intl.DateTimeFormat(l, o),
);
/** A cached `Intl.RelativeTimeFormat`. */
export const relativeTimeFormat = cache<Intl.RelativeTimeFormatOptions, Intl.RelativeTimeFormat>(
  (l, o) => new Intl.RelativeTimeFormat(l, o),
);
/** A cached `Intl.DisplayNames` (its options are required by the API). */
export const displayNames = cache<Intl.DisplayNamesOptions, Intl.DisplayNames>(
  (l, o) => new Intl.DisplayNames(l, o as Intl.DisplayNamesOptions),
);
/** A cached `Intl.Collator`, for sorting names a person reads in their language's order. */
export const collator = cache<Intl.CollatorOptions, Intl.Collator>(
  (l, o) => new Intl.Collator(l, o),
);

/** What `date.toLocaleDateString(locale)` shows: the numeric date ("10/18/2026", "18.10.2026"). */
export const NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};
/** What `date.toLocaleString(locale)` shows: the numeric date and time, with seconds. */
export const NUMERIC_DATE_TIME: Intl.DateTimeFormatOptions = {
  ...NUMERIC_DATE,
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
};

/** A date, time or both in `locale`: `formatDate("tr", iso, { dateStyle: "medium" })`. */
export function formatDate(
  locale: Locales,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return dateTimeFormat(locale, options).format(value instanceof Date ? value : new Date(value));
}

/** "in 3 days", "yesterday" (`numeric: "auto"`), in `locale`. */
export function formatRelative(
  locale: Locales,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = { numeric: "auto" },
): string {
  return relativeTimeFormat(locale, options).format(value, unit);
}

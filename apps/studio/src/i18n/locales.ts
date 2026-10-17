/**
 * The languages Studio speaks (DESIGN.md §1 "Adding a language"). One entry per language; its
 * catalogs are found by file name (`./<locale>.ts`, `./lazy/<ns>.<locale>.ts`), so adding a
 * language is this entry plus its catalogs — no loader to write.
 *
 * The key is the language's BCP 47 tag, used as it is for `<html lang>`, `Intl` and the calendars
 * (`calendarLocaleProps`), so Studio formats dates and numbers in its own language, never the
 * browser's.
 */
export interface LocaleInfo {
  /** The language's name in itself, for the language menus. */
  name: string;
  /** Writing direction, set on `<html dir>` with `lang`. RTL needs the review's Phase 3 first. */
  dir: "ltr" | "rtl";
  /** Where a missing word is looked up next, in order; English (the source) ends every chain. */
  fallback: readonly string[];
  /**
   * Whether a person who speaks the language has reviewed its catalogs. `false` means machine
   * translation (AI) awaiting review; the language menus say so.
   */
  reviewed: boolean;
}

export const LOCALE_REGISTRY = {
  en: { name: "English", dir: "ltr", fallback: [], reviewed: true },
  tr: { name: "Türkçe", dir: "ltr", fallback: ["en"], reviewed: true },
  // Pilot (2026-10): AI-translated from English, awaiting a German speaker's review.
  de: { name: "Deutsch", dir: "ltr", fallback: ["en"], reviewed: false },
} as const satisfies Record<string, LocaleInfo>;

export type Locale = keyof typeof LOCALE_REGISTRY;
export const LOCALE_LIST = Object.keys(LOCALE_REGISTRY) as Locale[];
/** Native names by locale (`{ en: "English", tr: "Türkçe", … }`), for selects and tabs. */
export const LOCALES = Object.fromEntries(
  LOCALE_LIST.map((l) => [l, LOCALE_REGISTRY[l].name]),
) as Record<Locale, string>;

export const isLocale = (value: string): value is Locale => Object.hasOwn(LOCALE_REGISTRY, value);

/** `locale`, then its fallbacks, then English: where `translate` looks for a key. */
export function fallbackChain(locale: Locale): Locale[] {
  const chain = [locale, ...(LOCALE_REGISTRY[locale].fallback as readonly Locale[])];
  return chain.includes("en") ? chain : [...chain, "en"];
}

/**
 * The best registered locale for the browser's preferred languages (`navigator.languages`): an
 * exact tag, else the same language (`de-AT` → `de`), else English.
 */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    if (isLocale(tag)) return tag;
    let language: string;
    try {
      language = new Intl.Locale(tag).language;
    } catch {
      continue;
    }
    if (isLocale(language)) return language;
  }
  return "en";
}

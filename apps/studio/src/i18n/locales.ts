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
  /** Writing direction, set on `<html dir>` with `lang` (ADR-0033). */
  dir: "ltr" | "rtl";
  /** Where a missing word is looked up next, in order; English (the source) ends every chain. */
  fallback: readonly string[];
  /**
   * Whether a person who speaks the language has reviewed its catalogs. `false` is an AI draft
   * (the `translate` skill and a second consistency pass, ADR-0034) awaiting that review; the
   * language menus show only the name, so this stays a note for maintainers. Only a reviewer sets
   * it to `true`.
   */
  reviewed: boolean;
  /**
   * The tag `Intl` formats with, when it differs from the key (`@cloudhal/messages` `setIntlTags`):
   * Arabic and Persian use Western digits (ADR-0033, decided 2026-10-18; their own digits may
   * become a preference later).
   */
  intl?: string;
}

/*
 * English is the source; Turkish is maintained by the owner. Every other language is an AI
 * translation (machine translation) awaiting review by a person who speaks it: German since
 * 2026-10 (pilot), the others since 2026-10-18. They stay `reviewed: false` until that review.
 */
export const LOCALE_REGISTRY = {
  en: { name: "English", dir: "ltr", fallback: [], reviewed: true },
  tr: { name: "Türkçe", dir: "ltr", fallback: ["en"], reviewed: true },
  // AI translation, awaiting review.
  de: { name: "Deutsch", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  es: { name: "Español", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  fr: { name: "Français", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  it: { name: "Italiano", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  "pt-BR": { name: "Português (Brasil)", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  nl: { name: "Nederlands", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  pl: { name: "Polski", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  ru: { name: "Русский", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  uk: { name: "Українська", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  ja: { name: "日本語", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  ko: { name: "한국어", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  "zh-Hans": { name: "简体中文", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  hi: { name: "हिन्दी", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review.
  id: { name: "Bahasa Indonesia", dir: "ltr", fallback: ["en"], reviewed: false },
  // AI translation, awaiting review. The first right-to-left language (ADR-0033).
  ar: { name: "العربية", dir: "rtl", fallback: ["en"], reviewed: false, intl: "ar-u-nu-latn" },
  // AI translation, awaiting review.
  fa: { name: "فارسی", dir: "rtl", fallback: ["en"], reviewed: false, intl: "fa-u-nu-latn" },
  // AI translation, awaiting review.
  he: { name: "עברית", dir: "rtl", fallback: ["en"], reviewed: false },
} as const satisfies Record<string, LocaleInfo>;

/** The `Intl` tags that differ from their key (`{ ar: "ar-u-nu-latn", … }`), for `setIntlTags`. */
export const INTL_TAGS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LOCALE_REGISTRY as Record<string, LocaleInfo>).flatMap(([l, info]) =>
    info.intl ? [[l, info.intl]] : [],
  ),
);

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
 * exact tag, else the same language (`de-AT` → `de`, `pt-PT` → `pt-BR`, `zh-CN` → `zh-Hans`), else
 * English.
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
    const same = LOCALE_LIST.find((l) => l.split("-")[0] === language);
    if (same) return same;
  }
  return "en";
}

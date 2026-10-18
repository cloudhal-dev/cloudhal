/** A content language's name in the Studio language (`es` → "Spanish"); the tag when unknown. */
import { displayNames } from "@cloudhal/messages/format";

export function languageName(uiLocale: string, locale: string): string {
  try {
    return displayNames([uiLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/**
 * Languages a site is commonly published in (BCP 47), offered when a person adds one; any other
 * valid tag can still be typed. Regional variants only where readers expect them
 * (Brazilian and European Portuguese, Simplified and Traditional Chinese, Latin American Spanish).
 */
export const COMMON_LOCALES: readonly string[] = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "es-419",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "ga",
  "gl",
  "gu",
  "ha",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "ku",
  "ky",
  "lo",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "ne",
  "nl",
  "pa",
  "pl",
  "ps",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "si",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tk",
  "tr",
  "uk",
  "ur",
  "uz",
  "vi",
  "yo",
  "zh-Hans",
  "zh-Hant",
  "zu",
];

/** "Turkish · Türkçe · tr": the name in the Studio language, in itself, and the tag. */
export function languageOption(uiLocale: string, locale: string): string {
  const here = languageName(uiLocale, locale);
  const own = languageName(locale, locale);
  return [here, ...(own !== here ? [own] : []), locale].join(" · ");
}

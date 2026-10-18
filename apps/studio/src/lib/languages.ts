/** A content language's name in the Studio language (`es` → "Spanish"); the tag when unknown. */
import { displayNames } from "@cloudhal/messages/format";

export function languageName(uiLocale: string, locale: string): string {
  try {
    return displayNames([uiLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

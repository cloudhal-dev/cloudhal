/**
 * The working language (an internal review (2026-10) §4a): the content language
 * a person last chose on a site, remembered in this browser only. New pages and articles start in
 * it. Storage can be missing or throw (private windows, blocked site data): then it is forgotten.
 */
const key = (siteId: string) => `cloudhal.workingLanguage.${siteId}`;

export function readWorkingLanguage(siteId: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key(siteId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkingLanguage(siteId: string, locale: string): void {
  try {
    globalThis.localStorage?.setItem(key(siteId), locale);
  } catch {
    // Not remembered; the default language stays the fallback.
  }
}

/** The locale a new page or article starts in: the remembered one while the site still has it. */
export function newNodeLocale(
  site: { locales: readonly string[]; defaultLocale: string } | undefined,
  remembered: string | undefined,
): string {
  if (!site) return "en";
  return remembered && site.locales.includes(remembered) ? remembered : site.defaultLocale;
}

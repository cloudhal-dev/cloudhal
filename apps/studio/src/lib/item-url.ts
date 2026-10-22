/**
 * An item's public address (RFC-0033 §4): its graph path in its locale, through core-ts
 * `itemUrl` — the `/<locale>` prefix or the locale's own domain (`localization.domains`).
 * Only the editors and the list rows import this, so it loads with their lazy routes.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { itemUrl } from "@cloudhal/core-ts/locale-paths";

/** A page or an article. */
export type LiveItem = Page | ContentEntry;

/** The full URL of the item, or undefined while no domain serves its locale. */
export function absoluteItemUrl(
  site: Site | undefined,
  origin: string | undefined,
  item: LiveItem,
): string | undefined {
  if (!site) return undefined;
  const address = itemUrl(site, origin, item);
  return /^https?:\/\//.test(address) ? address : undefined;
}

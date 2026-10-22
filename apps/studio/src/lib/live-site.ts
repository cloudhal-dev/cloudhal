/**
 * Pure helpers for links to the live site: its origin (the primary domain; Studio does not know a
 * workers.dev address), full URLs, and whether an item's address is what the live snapshot serves.
 */
import { type Domain, primaryHostname } from "./site-settings.ts";

/** `https://<primary hostname>`, or undefined while the site has no domain. */
export function siteOrigin(domains: readonly Domain[] | undefined): string | undefined {
  const host = primaryHostname(domains ?? []);
  return host ? `https://${host}` : undefined;
}

/** The full URL of a site path (`/about`), or undefined without an origin. */
export function liveUrl(origin: string | undefined, path: string): string | undefined {
  if (!origin) return undefined;
  return path === "/" || path === ""
    ? `${origin}/`
    : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** The host part of an origin, for labels (`https://blog.example.com` → `blog.example.com`). */
export function originHost(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
}

/**
 * Whether an address is live: the live snapshot holds the item as published, at the same address.
 * `liveNode` is the item as the live snapshot holds it (undefined when it is not in there);
 * `addressOf` gives the full localized address (core-ts `itemUrl`), so a changed path, slug,
 * permalink or locale all count as a different address.
 */
export function servesAt<T extends { status: string }>(
  liveNode: T | undefined,
  addressOf: (node: T) => string,
  address: string,
): boolean {
  return liveNode?.status === "published" && addressOf(liveNode) === address;
}

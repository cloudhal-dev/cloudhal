/**
 * Pure helpers for site settings: hostnames (validated exactly like the Site contract), the
 * primary-domain rules, and preview-link inputs.
 */
import type { Site } from "@cloudhal/core-contracts";

export type Domain = Site["domains"][number];

/** `site.schema.json` → `$defs.Domain.hostname` (pattern + maxLength). Keep in sync with the contract. */
export const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const HOSTNAME_MAX = 253;

/**
 * What people paste is often a URL: drop the scheme, path, query and a trailing dot, and
 * lower-case it. `https://Blog.Example.com/about` → `blog.example.com`.
 */
export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export type HostnameError = "required" | "invalid" | "tooLong" | "duplicate";

export function validateHostname(
  hostname: string,
  existing: readonly Domain[] = [],
): HostnameError | undefined {
  if (!hostname) return "required";
  if (hostname.length > HOSTNAME_MAX) return "tooLong";
  if (!HOSTNAME_PATTERN.test(hostname)) return "invalid";
  if (existing.some((d) => d.hostname === hostname)) return "duplicate";
  return undefined;
}

/** Adds a hostname; the first domain (or the first after all primaries were removed) becomes primary. */
export function addDomain(domains: readonly Domain[], hostname: string): Domain[] {
  return [...domains, { hostname, primary: !domains.some((d) => d.primary) }];
}

/** Removes a hostname; when it was the primary, the next remaining domain takes over. */
export function removeDomain(domains: readonly Domain[], hostname: string): Domain[] {
  const rest = domains.filter((d) => d.hostname !== hostname);
  if (rest.length > 0 && !rest.some((d) => d.primary)) {
    return rest.map((d, i) => ({ ...d, primary: i === 0 }));
  }
  return rest;
}

/** Exactly one primary afterwards. */
export function makePrimary(domains: readonly Domain[], hostname: string): Domain[] {
  return domains.map((d) => ({ ...d, primary: d.hostname === hostname }));
}

/** Primary first, then alphabetical. */
export function sortDomains(domains: readonly Domain[]): Domain[] {
  return [...domains].sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.hostname.localeCompare(b.hostname),
  );
}

/** The primary hostname (or the first one), as the preview-link URL will use it. */
export function primaryHostname(domains: readonly Domain[]): string | undefined {
  return (domains.find((d) => d.primary) ?? domains[0])?.hostname;
}

/** Link lifetimes offered in Studio; the server clamps to 1 minute … 7 days. */
export const PREVIEW_TTLS = [
  { id: "1h", seconds: 3_600 },
  { id: "1d", seconds: 86_400 },
  { id: "7d", seconds: 604_800 },
] as const;
export type PreviewTtl = (typeof PREVIEW_TTLS)[number]["id"];

export function ttlSeconds(id: PreviewTtl): number {
  return (PREVIEW_TTLS.find((t) => t.id === id) ?? PREVIEW_TTLS[0]).seconds;
}

export type PathError = "invalid";

/**
 * The page a preview link opens. Empty means the home page; a missing leading slash is added.
 * Full URLs and whitespace are rejected (the host always comes from the site's primary domain).
 */
export function normalizePreviewPath(input: string): { path: string } | { error: PathError } {
  const trimmed = input.trim();
  if (!trimmed) return { path: "/" };
  if (/\s/.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return { error: "invalid" };
  }
  return { path: trimmed.startsWith("/") ? trimmed : `/${trimmed}` };
}

/** The general-settings fields a person can change here; everything else is kept as loaded. */
export interface GeneralSettings {
  name: string;
  defaultLocale: string;
  /** The site's clock for schedules (IANA, RFC-0008 §9.1); empty keeps UTC (the field is dropped). */
  timeZone?: string | undefined;
}

export function applyGeneral(site: Site, general: GeneralSettings): Site {
  const next: Site = { ...site, name: general.name.trim(), defaultLocale: general.defaultLocale };
  if (general.timeZone === undefined) return next;
  if (general.timeZone) next.timeZone = general.timeZone;
  else delete next.timeZone;
  return next;
}

/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * What a site's first-party analytics script sends to POST /__cloudhal/e (RFC-0006): JSON as text/plain, at most 2 KB. Everything in it is untrusted. The server keeps a beacon only after the same-origin, bot and rate checks, normalises the path and resolves it to a published route, reduces the referrer to a host, normalises UTM values, and derives everything else (node, country, device, visitor) itself. The script never sends an identifier, a cookie or a full URL.
 */
export type AnalyticsBeacon = AnalyticsPageviewBeacon | AnalyticsVitalsBeacon;
/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 */
export type SchemaVersion = 1;
/**
 * location.pathname as the browser reports it (no query string, no fragment).
 */
export type BeaconPath = string;
/**
 * A raw utm_* value from the page URL; the server lower-cases it and drops it unless it fits the stored alphabet.
 */
export type BeaconUtm = string;
export type BeaconMillis = number;

/**
 * Sent once per page view, when the page is first visible (after prerendering, and again on a back/forward cache restore).
 */
export interface AnalyticsPageviewBeacon {
  schemaVersion: SchemaVersion;
  kind: "pageview";
  path: BeaconPath;
  /**
   * The host of document.referrer only (the script drops scheme, path and query); empty or absent for direct visits.
   */
  referrer?: string;
  utmSource?: BeaconUtm;
  utmMedium?: BeaconUtm;
  utmCampaign?: BeaconUtm;
  navType?: "navigate" | "reload" | "back_forward" | "prerender" | "restore";
}
/**
 * Sent once, when a sampled page view is hidden, with the Core Web Vitals measured so far.
 */
export interface AnalyticsVitalsBeacon {
  schemaVersion: SchemaVersion;
  kind: "vitals";
  path: BeaconPath;
  lcp?: BeaconMillis;
  inp?: BeaconMillis;
  cls?: number;
  ttfb?: BeaconMillis;
  fcp?: BeaconMillis;
  /**
   * The vitals sampling the script was served with (one page view in N); the server checks it against the site's setting.
   */
  sampleOneIn: number;
}

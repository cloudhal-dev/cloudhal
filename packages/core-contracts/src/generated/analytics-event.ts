/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * One site analytics event as stored (RFC-0006): a page view or a Core Web Vitals sample reported by the site's first-party script, or a response the site Worker rendered itself (cache miss, redirect, 404, 410, 5xx). Written by the site Worker after it validated and enriched a beacon. The named fields are the columns of the local/self-host SQLite store; each one documents its fixed slot in a Workers Analytics Engine data point (index1 = siteId, blob1 = kind, blob2 = schemaVersion). Slots never move and new fields are only appended. Never carries an IP address, a user agent, a full referrer URL, a query string or a cookie.
 */
export type AnalyticsEvent = AnalyticsPageviewEvent | AnalyticsVitalsEvent | AnalyticsRenderEvent;
/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 */
export type SchemaVersion = 1;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 */
export type Timestamp = string;
/**
 * WAE blob5. The kind of node the path resolved to.
 */
export type AnalyticsNodeKind = "page" | "entry" | "archive";
/**
 * WAE blob6. Host of an external referrer: lower case, without www., port, path or query.
 */
export type AnalyticsHostname = string;
/**
 * WAE blob7. Where the view came from, classified by the server from the referrer host and utm_medium; internal = another page of this site.
 */
export type AnalyticsChannel =
  "direct" | "internal" | "search" | "social" | "ai" | "email" | "paid" | "referral";
/**
 * WAE blob11. ISO 3166-1 alpha-2 country from Cloudflare's request.cf.country (XX unknown, T1 Tor). Never a city or region.
 */
export type AnalyticsCountry = string;
/**
 * WAE blob12. Device class derived from the user agent and client hints, neither of which is stored.
 */
export type AnalyticsDevice = "desktop" | "mobile" | "tablet" | "bot" | "unknown";
/**
 * WAE blob13. Browser family, without version.
 */
export type AnalyticsBrowser =
  "chrome" | "edge" | "firefox" | "safari" | "samsung" | "opera" | "other";
/**
 * WAE blob14. Operating system family, without version.
 */
export type AnalyticsOs = "windows" | "macos" | "ios" | "android" | "linux" | "chromeos" | "other";
/**
 * WAE blob15. Present only when the site owner turned on unique visitors and the request carried no GPC or DNT signal: the first 64 bits of SHA-256(dailySalt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random, lives for one UTC day and is then deleted, so the hash can neither be recomputed nor linked across days.
 */
export type AnalyticsVisitorHash = string;
/**
 * WAE blob16. How the page was reached; restore = back/forward cache.
 */
export type AnalyticsNavType = "navigate" | "reload" | "back_forward" | "prerender" | "restore";
/**
 * WAE double9. One in this many events of this kind was recorded (vitals sampling; render events under a flood); 1 = every event. Counts weight each event by this number. An integer, so a rate never suffers rounding.
 */
export type AnalyticsSampleOneIn = number;
/**
 * WAE blob3. The requested path as received: percent-encoded printable ASCII, without query string or fragment, cut to 256 characters.
 */
export type AnalyticsRequestPath = string;
/**
 * WAE blob18. A known crawler identified from the user agent (e.g. googlebot, gptbot, claudebot, perplexitybot). The list and each crawler's class (search, AI, social, monitor) live in code.
 */
export type AnalyticsCrawlerName = string;

/**
 * A published page, article or archive was shown to a visitor (the site's script ran).
 */
export interface AnalyticsPageviewEvent {
  schemaVersion: SchemaVersion;
  kind: "pageview";
  /**
   * WAE index1.
   */
  siteId: string;
  timestamp: Timestamp;
  /**
   * WAE blob3. The published route the view resolved to; never a query string.
   */
  path: string;
  /**
   * WAE blob4. The page, entry or term the server resolved the path to, so stats survive slug changes.
   */
  nodeId: string;
  nodeKind: AnalyticsNodeKind;
  refHost?: AnalyticsHostname;
  channel: AnalyticsChannel;
  /**
   * WAE blob8.
   */
  utmSource?: string;
  /**
   * WAE blob9.
   */
  utmMedium?: string;
  /**
   * WAE blob10.
   */
  utmCampaign?: string;
  country?: AnalyticsCountry;
  device: AnalyticsDevice;
  browser: AnalyticsBrowser;
  os: AnalyticsOs;
  visitor?: AnalyticsVisitorHash;
  navType: AnalyticsNavType;
  /**
   * WAE blob17. Locale of the resolved node, not the visitor's Accept-Language.
   */
  locale?: string;
  /**
   * WAE double1 (1 or 0). The view starts a visit: the referrer is empty or another site, and the navigation is not a reload, back/forward or restore.
   */
  entrance: boolean;
}
/**
 * Core Web Vitals of one sampled page view, measured by the site's own script and sent when the page is hidden. Code checks that at least one metric is present (the schema subset has no cross-property rules).
 */
export interface AnalyticsVitalsEvent {
  schemaVersion: SchemaVersion;
  kind: "vitals";
  /**
   * WAE index1.
   */
  siteId: string;
  timestamp: Timestamp;
  /**
   * WAE blob3.
   */
  path: string;
  /**
   * WAE blob4.
   */
  nodeId: string;
  nodeKind: AnalyticsNodeKind;
  country?: AnalyticsCountry;
  device: AnalyticsDevice;
  browser?: AnalyticsBrowser;
  /**
   * WAE double3. Largest Contentful Paint.
   */
  lcp?: number;
  /**
   * WAE double4. Interaction to Next Paint.
   */
  inp?: number;
  /**
   * WAE double5, stored multiplied by 1000. Cumulative Layout Shift (unitless).
   */
  cls?: number;
  /**
   * WAE double6. Time to First Byte.
   */
  ttfb?: number;
  /**
   * WAE double7. First Contentful Paint.
   */
  fcp?: number;
  sampleOneIn: AnalyticsSampleOneIn;
}
/**
 * The site Worker answered a request itself (a cache miss, redirect, 404, 410 or error). Cache hits never run the Worker, so these are not page views. The requested path is visitor-controlled text and is always shown as such.
 */
export interface AnalyticsRenderEvent {
  schemaVersion: SchemaVersion;
  kind: "render";
  /**
   * WAE index1.
   */
  siteId: string;
  timestamp: Timestamp;
  path: AnalyticsRequestPath;
  /**
   * WAE double2. HTTP status the Worker answered with.
   */
  status: number;
  /**
   * WAE blob4. The node rendered or redirected from, when the path resolved to one.
   */
  nodeId?: string;
  nodeKind?: AnalyticsNodeKind;
  /**
   * WAE blob19. Target of a 301, 302 or 308: a site path or an https URL, without query string.
   */
  redirectTo?: string;
  refHost?: AnalyticsHostname;
  /**
   * WAE blob20. Same-site referrers only: the page that linked here, which finds broken internal links.
   */
  refPath?: string;
  country?: AnalyticsCountry;
  device: AnalyticsDevice;
  crawler?: AnalyticsCrawlerName;
  /**
   * WAE double8. Time the Worker spent answering.
   */
  renderMs?: number;
  sampleOneIn?: AnalyticsSampleOneIn;
}

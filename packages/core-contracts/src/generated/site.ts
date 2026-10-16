/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;
/**
 * Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Path".
 */
export type Path = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "TimeZone".
 */
export type TimeZone = string;

/**
 * Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently.
 */
export interface Site {
  schemaVersion: SchemaVersion;
  id: Id;
  projectId: Id;
  name: string;
  slug: Slug;
  defaultLocale: Locale;
  /**
   * @minItems 1
   */
  locales: [Locale, ...Locale[]];
  /**
   * Hostnames serving this site. Exactly one should be primary; the *.cloudhal.app subdomain is always present in Cloud.
   */
  domains: Domain[];
  pageIds: Id[];
  homePageId?: Id;
  theme: ThemeRef;
  design?: Design;
  brand?: Brand;
  chrome?: Chrome;
  /**
   * The site's time zone (RFC-0008): Studio's calendar, schedules entered as wall-clock times and recurring automations use it. Absent means UTC.
   */
  timeZone?: string;
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  publishedSnapshotId?: string;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Domain".
 */
export interface Domain {
  hostname: string;
  primary: boolean;
}
/**
 * Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "ThemeRef".
 */
export interface ThemeRef {
  name: Slug;
  version?: string;
  config?: {
    [k: string]: unknown | undefined;
  };
}
/**
 * The site's design rules for people and agents (RFC-0021): Markdown that agents read with the theme's DESIGN.md before they build. Guidance only: it changes neither rendering nor permissions.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Design".
 */
export interface Design {
  markdown: string;
}
/**
 * The site's logo and social links (RFC-0025 §1), shared by the header, the footer and SEO.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Brand".
 */
export interface Brand {
  logo?: ImageRef;
  logoDark?: ImageRef;
  logoHeight?: "s" | "m" | "l";
  /**
   * @maxItems 8
   */
  social?:
    | []
    | [SocialLink]
    | [SocialLink, SocialLink]
    | [SocialLink, SocialLink, SocialLink]
    | [SocialLink, SocialLink, SocialLink, SocialLink]
    | [SocialLink, SocialLink, SocialLink, SocialLink, SocialLink]
    | [SocialLink, SocialLink, SocialLink, SocialLink, SocialLink, SocialLink]
    | [SocialLink, SocialLink, SocialLink, SocialLink, SocialLink, SocialLink, SocialLink]
    | [
        SocialLink,
        SocialLink,
        SocialLink,
        SocialLink,
        SocialLink,
        SocialLink,
        SocialLink,
        SocialLink,
      ];
}
/**
 * Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "ImageRef".
 */
export interface ImageRef {
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  assetId?: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "SocialLink".
 */
export interface SocialLink {
  network:
    | "x"
    | "bluesky"
    | "mastodon"
    | "github"
    | "linkedin"
    | "instagram"
    | "facebook"
    | "youtube"
    | "tiktok"
    | "threads"
    | "rss"
    | "email";
  href: string;
}
/**
 * The site's header, footer and bars as data (RFC-0025): enums, menu keys and short texts; the theme renders them with landmarks, focus and contrast guaranteed.
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Chrome".
 */
export interface Chrome {
  header?: ChromeHeader;
  footer?: ChromeFooter;
  announcement?: Announcement;
  consent?: Consent;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "ChromeHeader".
 */
export interface ChromeHeader {
  layout?: "logo-left" | "logo-left-nav-center" | "centered" | "split" | "minimal";
  behavior?: "static" | "sticky" | "hide-on-scroll" | "fixed";
  shrink?: boolean;
  overHero?: "solid" | "transparent";
  width?: "content" | "wide" | "full";
  surface?: "plain" | "muted" | "raised" | "inverse" | "brand";
  mobileStyle?: "dropdown" | "drawer-start" | "drawer-end" | "fullscreen";
  collapseAt?: "sm" | "md" | "lg" | "always";
  /**
   * Lower-case URL segment.
   */
  nav?: string;
  /**
   * Lower-case URL segment.
   */
  utility?: string;
  /**
   * @maxItems 3
   */
  actions?:
    [] | [HeaderAction] | [HeaderAction, HeaderAction] | [HeaderAction, HeaderAction, HeaderAction];
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "HeaderAction".
 */
export interface HeaderAction {
  kind: "button" | "search" | "locale" | "theme-toggle" | "motion-toggle";
  label?: string;
  href?: string;
  variant?: "primary" | "secondary";
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "ChromeFooter".
 */
export interface ChromeFooter {
  layout?: "simple" | "columns" | "cta-band" | "minimal";
  surface?: "plain" | "muted" | "inverse";
  tagline?: string;
  /**
   * @maxItems 5
   */
  columns?:
    | []
    | [FooterColumn]
    | [FooterColumn, FooterColumn]
    | [FooterColumn, FooterColumn, FooterColumn]
    | [FooterColumn, FooterColumn, FooterColumn, FooterColumn]
    | [FooterColumn, FooterColumn, FooterColumn, FooterColumn, FooterColumn];
  ctaHeading?: string;
  ctaLabel?: string;
  ctaHref?: string;
  social?: boolean;
  /**
   * The legal line; {year} and {site} are the only placeholders.
   */
  copyright?: string;
  /**
   * Lower-case URL segment.
   */
  legal?: string;
  /**
   * @maxItems 3
   */
  extras?:
    | []
    | ["locale" | "theme-toggle" | "motion-toggle"]
    | ["locale" | "theme-toggle" | "motion-toggle", "locale" | "theme-toggle" | "motion-toggle"]
    | [
        "locale" | "theme-toggle" | "motion-toggle",
        "locale" | "theme-toggle" | "motion-toggle",
        "locale" | "theme-toggle" | "motion-toggle",
      ];
  credit?: boolean;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "FooterColumn".
 */
export interface FooterColumn {
  heading: string;
  /**
   * Lower-case URL segment.
   */
  menu: string;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Announcement".
 */
export interface Announcement {
  /**
   * Change it when the text changes, so readers who dismissed the old one see the new one.
   */
  id: string;
  text: string;
  label?: string;
  href?: string;
  tone?: "info" | "brand" | "warning";
  dismissible?: boolean;
}
/**
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Consent".
 */
export interface Consent {
  mode: "none" | "notice" | "choices";
  policy?: Path;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}

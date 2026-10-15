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
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Site`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}

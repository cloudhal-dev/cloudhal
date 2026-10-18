/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;

/**
 * A site's translation glossary (RFC-0033 §2): terms with their approved translation per locale, and terms never to translate (brand and product names). Agents translating content read it as hard constraints; the checks flag drafts that break it. One per site, snapshotted like every node.
 */
export interface Glossary {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Unique by term (case-insensitive); order is the editor's.
   *
   * @maxItems 2000
   */
  entries: GlossaryEntry[];
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "GlossaryEntry".
 */
export interface GlossaryEntry {
  /**
   * The term as written in the site's default locale.
   */
  term: string;
  /**
   * Context for translators and agents: meaning, part of speech, where it appears.
   */
  note?: string;
  /**
   * Keep the term as written in every locale (brand, product or proper names). Such an entry has no translations.
   */
  doNotTranslate?: boolean;
  /**
   * Match the term only with this exact capitalisation.
   */
  caseSensitive?: boolean;
  /**
   * The approved translation per locale (never the default locale).
   */
  translations?: {
    [k: string]:
      | {
          text: string;
          note?: string;
        }
      | undefined;
  };
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Glossary`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}

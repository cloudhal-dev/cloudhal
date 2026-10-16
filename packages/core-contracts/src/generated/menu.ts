/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "MenuItem".
 */
export type MenuItem =
  PageMenuItem | EntryMenuItem | TermMenuItem | CollectionMenuItem | UrlMenuItem | GroupMenuItem;
/**
 * RFC-0025 25d (RFC-0003 amendment): how a top-level item with children opens in the header. `mega`: one wide panel, its children as columns (a group's children are the column's links).
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "MenuDisplay".
 */
export type MenuDisplay = "mega";
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;

/**
 * A named navigation menu of a site (e.g. 'primary', 'footer', 'sidebar'): an ordered tree of items. Items point at pages, entries and terms by id, so renames and slug changes never break them; an item whose target is gone, retired or unpublished is hidden by the renderer, never rendered as a dead link (RFC-0003).
 */
export interface Menu {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Where themes place the menu ('primary', 'footer', 'sidebar', …). Unique per site and immutable once created.
   */
  key: string;
  /**
   * Deepest level an item may sit at; top-level items are level 1. The store refuses deeper trees.
   */
  maxDepth: number;
  /**
   * Top-level items in display order. Empty means the site deliberately shows no items here (a missing menu means the theme's derived default).
   *
   * @maxItems 100
   */
  items: MenuItem[];
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * Links to a page by id; the label falls back to the page title.
 */
export interface PageMenuItem {
  id: Id;
  kind: "page";
  pageId: Id;
  labels?: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children?: [MenuItem, ...MenuItem[]];
}
/**
 * Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "MenuLabels".
 */
export interface MenuLabels {
  [k: string]: string | undefined;
}
/**
 * Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.
 */
export interface EntryMenuItem {
  id: Id;
  kind: "contentEntry";
  entryId: Id;
  labels?: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children?: [MenuItem, ...MenuItem[]];
}
/**
 * Links to a term's archive by term id; the label falls back to the term name in the locale.
 */
export interface TermMenuItem {
  id: Id;
  kind: "term";
  termId: Id;
  labels?: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children?: [MenuItem, ...MenuItem[]];
}
/**
 * Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.
 */
export interface CollectionMenuItem {
  id: Id;
  kind: "collection";
  collection: Slug;
  labels: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children?: [MenuItem, ...MenuItem[]];
}
/**
 * Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.
 */
export interface UrlMenuItem {
  id: Id;
  kind: "url";
  href: string;
  /**
   * Open in a new tab (rendered with rel="noopener noreferrer").
   */
  newTab?: boolean;
  labels: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children?: [MenuItem, ...MenuItem[]];
}
/**
 * A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.
 */
export interface GroupMenuItem {
  id: Id;
  kind: "group";
  labels: MenuLabels;
  display?: MenuDisplay;
  /**
   * @minItems 1
   * @maxItems 100
   */
  children: [MenuItem, ...MenuItem[]];
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Menu`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}

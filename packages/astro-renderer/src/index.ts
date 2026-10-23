/**
 * @cloudhal/astro-renderer — render a Site Graph with Astro.
 *
 * - `cloudhal()` integration (`./integration`) exposes the project config as `virtual:cloudhal/config`.
 * - `getSource(config)` (`./runtime`) returns a `GraphSource`: live nodes in dev, a snapshot in builds.
 * - `.astro` components (`./components`): `Sections` dispatcher + Hero/RichText/Image/ContentList,
 *   `EntryFields` (RFC-0041's typed fields; values from `./fields`).
 */
export * from "./archive.ts";
export * from "./cache-tags.ts";
export * from "./collection-feeds.ts";
export * from "./entry-query.ts";
export * from "./fields.ts";
export * from "./gates.ts";
export { type CloudhalRendererConfig, cloudhal } from "./integration.ts";
export { renderBody, renderEntryArticle, renderMarkdown, safeHref } from "./markdown.ts";
export * from "./navigation.ts";
export * from "./preview.ts";
export { getSource, resetSource } from "./runtime.ts";
export * from "./source.ts";
export {
  entryStructuredData,
  type StructuredDataOptions,
  withStructuredData,
} from "./structured-data.ts";
export * from "./taxonomy.ts";

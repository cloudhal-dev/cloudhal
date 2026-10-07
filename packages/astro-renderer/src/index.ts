/**
 * @cloudhal/astro-renderer — render a Site Graph with Astro.
 *
 * - `cloudhal()` integration (`./integration`) exposes the project config as `virtual:cloudhal/config`.
 * - `getSource(config)` (`./runtime`) returns a `GraphSource`: live nodes in dev, a snapshot in builds.
 * - `.astro` components (`./components`): `Sections` dispatcher + Hero/RichText/Image/ContentList.
 */
export { type CloudhalRendererConfig, cloudhal } from "./integration.ts";
export { renderBody, renderMarkdown } from "./markdown.ts";
export { getSource, resetSource } from "./runtime.ts";
export * from "./source.ts";

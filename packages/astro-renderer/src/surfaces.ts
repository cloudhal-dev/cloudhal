/**
 * Surfaces on the page (RFC-0020 §1–§4): a surface section becomes a resolved tree (bindings and
 * named functions applied, visibility evaluated against the initial data, entry sources loaded),
 * then HTML. `renderSurface` gives framework-free markup for previews and themes without their
 * own components; `Surface.astro` walks the same tree so a theme can draw any component itself.
 * Every value reaches the page escaped; nothing a model wrote is executed. Worker-safe.
 *
 * The public `@cloudhal/astro-renderer/surfaces` path: named re-exports of `./surfaces/*` only.
 */
export {
  blockNodeHtml,
  renderSurface,
  slideWrapper,
  surfaceScope,
  surfaceWrapper,
  visibilityWrapper,
} from "./surfaces/html.ts";
export { CHILDREN } from "./surfaces/markup.ts";
export { motionAttrs, splitHtml, withMotion } from "./surfaces/motion.ts";
export { primitiveHtml } from "./surfaces/primitives/index.ts";
export {
  loadSurfaceSources,
  pickEntries,
  type SurfaceContext,
  type SurfaceEntryCard,
  type SurfaceEntrySource,
  type SurfaceNode,
  type SurfaceTree,
  surfaceEntryCard,
  surfaceProblems,
  surfaceSources,
  surfaceTree,
} from "./surfaces/tree.ts";

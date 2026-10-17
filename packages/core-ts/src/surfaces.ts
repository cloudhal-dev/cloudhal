/**
 * Generative UI surfaces (RFC-0020): the catalog a surface may use, the checks the store and the
 * build pipeline run on it, bindings and named functions, deterministic repairs, RFC 6902 patches
 * and the model prompt generated from the catalog. Data only, no `eval`: Worker-safe.
 */
export { calculateExpression } from "./surfaces/bindings/functions.ts";
export { evaluateCondition, resolveProps, resolveValue } from "./surfaces/bindings/resolve.ts";
export {
  type CallValue,
  checkCondition,
  countCalls,
  getPointer,
  isCallValue,
  isPathValue,
  type PathValue,
  pointerSegments,
  type ResolveContext,
  SURFACE_FUNCTIONS,
  type SurfaceFunction,
} from "./surfaces/bindings/values.ts";
export {
  type BodySurface,
  bodySurfaces,
  checkBodySurfaces,
  isInteractive,
  parseSurfaceFence,
} from "./surfaces/body.ts";
export {
  type Catalog,
  type CatalogEntry,
  type CatalogOptions,
  createCatalog,
  PRIMITIVES,
} from "./surfaces/catalog/index.ts";
export {
  AMBIENT_KINDS,
  INPUT_COMPONENTS,
  INPUT_MODEL,
  OVERLAY_COMPONENTS,
  PARTICLE_PRESETS,
  type PrimitiveType,
  SURFACE_ACTIONS,
  SURFACE_STYLES,
  TONE_SURFACE,
} from "./surfaces/catalog/props.ts";
export { checkPageSurfaces, checkSurface, type SurfaceCheck } from "./surfaces/checks/index.ts";
export {
  MOTION_HOVERS,
  MOTION_LOOPS,
  MOTION_REVEALS,
  MOTION_SCROLLS,
  MOTION_SPEEDS,
  MOTION_STAGGER,
  repairMotion,
  surfaceLoops,
  usesMotion,
} from "./surfaces/motion.ts";
export { applyPatch, PatchError, type PatchOp } from "./surfaces/patch/json-patch.ts";
export {
  type PatchIssue,
  type PatchResult,
  patchPage,
  SurfacePatchError,
} from "./surfaces/patch/page.ts";
export { catalogPrompt } from "./surfaces/prompt.ts";
export { nearestComponent, repairComponent, repairValue } from "./surfaces/repair.ts";
export { SURFACE_LIMITS } from "./surfaces/shared.ts";

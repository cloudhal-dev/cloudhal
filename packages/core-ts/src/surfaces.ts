/**
 * Generative UI surfaces (RFC-0020): the catalog a surface may use, the checks the store and the
 * build pipeline run on it, bindings and named functions, deterministic repairs, RFC 6902 patches
 * and the model prompt generated from the catalog. Data only, no `eval`: Worker-safe.
 */
import type { Page, Section, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import {
  BLOCK_LIMITS,
  localized,
  type PropSchema,
  type PropsIssue,
  validateProps,
} from "./blocks.ts";
import { parseFilter } from "./filter.ts";
import { ICON_GROUPS, isIconNameValue, nearestIcon } from "./icon-names.ts";
import {
  checkCondition,
  checkDynamic,
  countCalls,
  isDynamic,
  isPathValue,
  pointerSegments,
  SURFACE_FUNCTIONS,
} from "./surfaces/bindings/values.ts";
import { type Catalog, type CatalogEntry, childRule } from "./surfaces/catalog/index.ts";
import {
  ICON_PROPS,
  INPUT_COMPONENTS,
  INPUT_MODEL,
  MODAL_OVERLAYS,
  OPENABLE,
  OVERLAY_COMPONENTS,
} from "./surfaces/catalog/props.ts";
import { checkMotion, MOTION_REVEALS, MOTION_STAGGER, repairMotion } from "./surfaces/motion.ts";
import { distance, isObj, SURFACE_LIMITS } from "./surfaces/shared.ts";

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
export { SURFACE_LIMITS } from "./surfaces/shared.ts";

const ACTION_NEEDS: Record<string, readonly string[]> = {
  set: ["path", "value"],
  toggle: ["path"],
  increment: ["path"],
  reset: [],
  navigate: ["href"],
  copy: ["value"],
  share: [],
  scrollTo: ["anchor"],
  append: ["path", "value"],
  open: ["target"],
  close: [],
};

function checkAction(a: Record<string, unknown>, path: string, out: PropsIssue[]): void {
  for (const key of ACTION_NEEDS[String(a.action)] ?? [])
    if (a[key] === undefined)
      out.push({ path: `${path}/${key}`, message: `${a.action} needs ${key}` });
  // RFC-0022: `set` and `append` may write a computed value (worked out when clicked).
  if ((a.action === "set" || a.action === "append") && isObj(a.value))
    checkDynamic(a.value, `${path}/value`, out);
  if (a.action === "append" && typeof a.value === "string" && a.value.length > 20)
    out.push({ path: `${path}/value`, message: "at most 20 characters at a time" });
}

// ── checking a surface ───────────────────────────────────────────────────────────────────────

export interface SurfaceCheck {
  /** Problems that make the surface invalid (paths are JSON Pointers into the section). */
  issues: PropsIssue[];
  /** Ids of components whose `component` the catalog does not have: kept, flagged, not rendered. */
  unknown: string[];
  /** Ids no path from `root` reaches (still arriving while streaming): kept, not rendered. */
  unreachable: string[];
}

const SOURCE_SORT = new Set(["newest", "oldest", "title"]);
const COLLECTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function checkData(data: unknown, out: PropsIssue[]): void {
  if (data === undefined) return;
  if (!isObj(data)) {
    out.push({ path: "/data", message: "an object" });
    return;
  }
  const size = new TextEncoder().encode(JSON.stringify(data)).length;
  if (size > SURFACE_LIMITS.dataBytes)
    out.push({ path: "/data", message: `at most ${SURFACE_LIMITS.dataBytes} bytes of JSON` });
  for (const [key, value] of Object.entries(data)) {
    if (!isObj(value) || !("$source" in value)) continue;
    const at = `/data/${key}`;
    if (value.$source !== "entries") {
      out.push({ path: `${at}/$source`, message: "entries" });
      continue;
    }
    const q = value.query;
    if (!isObj(q) || Object.keys(value).some((k) => k !== "$source" && k !== "query")) {
      out.push({
        path: at,
        message: "{ $source: entries, query: { collection, filter?, sort?, limit } }",
      });
      continue;
    }
    for (const k of Object.keys(q))
      if (!["collection", "filter", "sort", "limit"].includes(k))
        out.push({ path: `${at}/query/${k}`, message: "not a query field" });
    if (typeof q.collection !== "string" || !COLLECTION.test(q.collection))
      out.push({ path: `${at}/query/collection`, message: "a collection slug, such as posts" });
    if (q.filter !== undefined)
      try {
        if (typeof q.filter !== "string" || q.filter.length > 512) throw new Error("too long");
        parseFilter(q.filter);
      } catch (e) {
        out.push({
          path: `${at}/query/filter`,
          message: `not a valid filter (${(e as Error).message})`,
        });
      }
    if (q.sort !== undefined && !SOURCE_SORT.has(q.sort as string))
      out.push({ path: `${at}/query/sort`, message: "newest, oldest or title" });
    if (
      typeof q.limit !== "number" ||
      !Number.isInteger(q.limit) ||
      q.limit < 1 ||
      q.limit > SURFACE_LIMITS.sourceLimit
    )
      out.push({
        path: `${at}/query/limit`,
        message: `a whole number from 1 to ${SURFACE_LIMITS.sourceLimit}`,
      });
  }
}

/** Props problems with bindings allowed: bound props are checked as bindings, the rest as values. */
function checkProps(entry: CatalogEntry, props: unknown, path: string, out: PropsIssue[]): void {
  if (entry.kind === "block" && !entry.type.where.includes("section")) {
    out.push({ path, message: `${entry.name} is a body block, not a surface component` });
    return;
  }
  const given = isObj(props) ? props : props === undefined ? {} : props;
  if (!isObj(given)) {
    out.push({ path, message: "an object" });
    return;
  }
  const literal: Record<string, unknown> = {};
  const bound = new Set<string>();
  for (const [k, v] of Object.entries(given)) {
    if (isDynamic(v) && k in entry.schema.properties) {
      bound.add(k);
      checkDynamic(v, `${path}/${k}`, out);
    } else if (k === "onClick" && isObj(v) && isDynamic(v.value)) {
      // RFC-0022: an action's computed value is checked by `checkAction`, not as text.
      const { value: _computed, ...rest } = v;
      literal[k] = rest;
    } else literal[k] = v;
  }
  for (const issue of validateProps(entry.schema, literal)) {
    const key = issue.path.split("/")[0] ?? "";
    if (bound.has(key) && issue.message === "required") continue;
    out.push({ path: issue.path ? `${path}/${issue.path}` : path, message: issue.message });
  }
}

export function checkSurface(surface: SurfaceSection, catalog: Catalog): SurfaceCheck {
  const issues: PropsIssue[] = [];
  const unknown: string[] = [];
  const components = surface.components ?? [];
  if (components.length > SURFACE_LIMITS.components)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.components} components`,
    });
  const calls = countCalls(components.map((c) => [c.props, c.visible]));
  if (calls > SURFACE_LIMITS.callsPerSurface)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.callsPerSurface} function calls (this surface has ${calls})`,
    });
  const byId = new Map<string, { c: SurfaceComponent; i: number }>();
  /** A component's children when they are a list (anything else is reported below). */
  const kidsOf = (c: SurfaceComponent): string[] =>
    Array.isArray(c.children) ? (c.children as string[]) : [];
  components.forEach((c, i) => {
    if (typeof c.id !== "string" || !c.id)
      issues.push({ path: `/components/${i}/id`, message: "every component needs an id" });
    else if (byId.has(c.id))
      issues.push({ path: `/components/${i}/id`, message: `"${c.id}" is used twice` });
    else byId.set(c.id, { c, i });
    if (c.children !== undefined && !Array.isArray(c.children))
      issues.push({
        path: `/components/${i}/children`,
        message: "children is a list of component ids",
      });
  });
  if (!byId.has("root"))
    issues.push({ path: "/components", message: 'one component has id "root"' });
  const parentOf = new Map<string, string>();
  components.forEach((c, i) => {
    const at = `/components/${i}`;
    const entry = catalog.get(c.component);
    if (!entry) unknown.push(c.id);
    kidsOf(c).forEach((child, j) => {
      const target = byId.get(child);
      if (!target) issues.push({ path: `${at}/children/${j}`, message: `no component "${child}"` });
      else if (child === "root" || child === c.id)
        issues.push({ path: `${at}/children/${j}`, message: `"${child}" cannot be a child here` });
      else if (parentOf.has(child))
        issues.push({
          path: `${at}/children/${j}`,
          message: `"${child}" already belongs to "${parentOf.get(child)}"`,
        });
      else parentOf.set(child, c.id);
    });
    if (!entry) return;
    const rule = childRule(entry);
    const kids = kidsOf(c);
    if (rule === "none" && kids.length)
      issues.push({ path: `${at}/children`, message: `${c.component} has no children` });
    else if (Array.isArray(rule))
      kids.forEach((child, j) => {
        const k = byId.get(child)?.c.component;
        if (k && !rule.includes(k))
          issues.push({
            path: `${at}/children/${j}`,
            message: `${c.component} holds only ${rule.join(", ")}`,
          });
      });
    checkProps(entry, c.props, `${at}/props`, issues);
    // RFC-0022 §2: a local input writes to the surface's data, so its value is a binding.
    // RFC-0022 §4: so does a table.
    if (c.component === "Table" && !(isObj(c.props) && isPathValue(c.props.rows)))
      issues.push({
        path: `${at}/props/rows`,
        message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
      });
    // RFC-0022 §3: a chart reads its rows from the surface's data.
    if (c.component === "Chart" && !(isObj(c.props) && isPathValue(c.props.data)))
      issues.push({
        path: `${at}/props/data`,
        message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
      });
    const writes = INPUT_MODEL[c.component];
    if (writes && !(isObj(c.props) && isPathValue(c.props[writes])))
      issues.push({
        path: `${at}/props/${writes}`,
        message: `bind it to the surface's data: {"path":"/…"} (the reader's input is written there)`,
      });
    if (c.component === "Button" && isObj(c.props) && isObj(c.props.onClick))
      checkAction(c.props.onClick, `${at}/props/onClick`, issues);
    if (c.visible !== undefined) checkCondition(c.visible, `${at}/visible`, issues);
    if (c.motion !== undefined) checkMotion(c.motion, c.component, `${at}/motion`, issues);
    // RFC-0024 §4: a particle preset only for particles.
    const amb = isObj(c.props) && isObj(c.props.ambient) ? c.props.ambient : undefined;
    if (amb && amb.preset !== undefined && amb.kind !== "particles")
      issues.push({ path: `${at}/props/ambient/preset`, message: "only with kind particles" });
    // RFC-0024 24c: a marquee needs enough to move; rotating words need words; split text is short.
    if (c.component === "Marquee" && kidsOf(c).length < 3)
      issues.push({ path: `${at}/children`, message: "at least 3 children to scroll" });
    if (
      c.component === "Heading" &&
      isObj(c.props) &&
      c.props.effect === "rotate-words" &&
      !Array.isArray(c.props.words)
    )
      issues.push({
        path: `${at}/props/words`,
        message: "2 to 6 words that take turns where {words} stands",
      });
    if (
      isObj(c.motion) &&
      typeof c.motion.reveal === "string" &&
      c.motion.reveal.startsWith("split-")
    ) {
      const t = isObj(c.props) ? c.props.text : undefined;
      const max = c.motion.reveal === "split-chars" ? 60 : 300;
      if (typeof t !== "string")
        issues.push({
          path: `${at}/motion/reveal`,
          message: "split text needs a written text, not a binding",
        });
      else if (t.length > max)
        issues.push({
          path: `${at}/motion/reveal`,
          message: `split text is at most ${max} characters`,
        });
    }
    // RFC-0024 §3: a scroll story is one sticky child, then 2–12 steps; it writes the step read.
    if (c.component === "Scrolly") {
      if (!(isObj(c.props) && isPathValue(c.props.step)))
        issues.push({
          path: `${at}/props/step`,
          message:
            'bind it to the surface\'s data: {"path":"/step"} (the step being read is written there)',
        });
      const kids = kidsOf(c).map((k) => byId.get(k)?.c.component);
      if (kids.length < 3 || kids.length > 13)
        issues.push({
          path: `${at}/children`,
          message: "one child to keep in view, then 2 to 12 Steps",
        });
      else if (kids[0] === "Step" || kids.slice(1).some((k) => k !== "Step"))
        issues.push({
          path: `${at}/children`,
          message: "the first child stays in view (not a Step); every other child is a Step",
        });
    }
  });
  // RFC-0025 §3: overlays open from a reader's action on this surface, never inside another modal.
  const overlayAbove = (id: string): string | undefined => {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) {
      const k = byId.get(p)?.c.component;
      if (k && OPENABLE.has(k)) return p;
    }
    return undefined;
  };
  let overlays = 0;
  let tooltips = 0;
  components.forEach((c, i) => {
    const at = `/components/${i}`;
    const action =
      c.component === "Button" && isObj(c.props) && isObj(c.props.onClick)
        ? c.props.onClick
        : undefined;
    if (action && (action.action === "open" || action.action === "close")) {
      const target = typeof action.target === "string" ? action.target : undefined;
      const kind = target ? byId.get(target)?.c.component : undefined;
      if (target && !(kind && OPENABLE.has(kind)))
        issues.push({
          path: `${at}/props/onClick/target`,
          message: `"${target}" is not a Dialog, Drawer, Popover or Lightbox of this surface`,
        });
      else if (action.action === "close" && !target && !overlayAbove(c.id))
        issues.push({
          path: `${at}/props/onClick`,
          message:
            "close belongs inside a Dialog, Drawer, Popover or Lightbox, or names one (target)",
        });
    }
    if (c.component === "Tooltip") {
      tooltips++;
      const target = isObj(c.props) && typeof c.props.for === "string" ? c.props.for : undefined;
      const kind = target ? byId.get(target)?.c.component : undefined;
      if (target && kind !== "Button" && kind !== "Link")
        issues.push({ path: `${at}/props/for`, message: "names a Button or Link of this surface" });
    }
    if (OPENABLE.has(c.component)) {
      // A Lightbox's thumbnails are content on the page; its viewer does not count.
      if (c.component !== "Lightbox") overlays++;
      if (overlays > 3 && c.component !== "Lightbox")
        issues.push({ path: at, message: "at most 3 overlays per section; put the rest on pages" });
      if (c.id === "root")
        issues.push({ path: at, message: "an overlay opens from the section; it is not its root" });
      const above = overlayAbove(c.id);
      if (
        above &&
        MODAL_OVERLAYS.has(c.component) &&
        MODAL_OVERLAYS.has(byId.get(above)?.c.component ?? "")
      )
        issues.push({ path: at, message: "a dialog never opens inside another; close one first" });
    }
  });
  if (tooltips > 8) issues.push({ path: "/components", message: "at most 8 tooltips per section" });
  // RFC-0028: natural means no frame, so a ratio contradicts it.
  components.forEach((c, i) => {
    if (c.component !== "Image" || !isObj(c.props)) return;
    if (c.props.fit === "natural" && c.props.ratio !== undefined && c.props.ratio !== "auto")
      issues.push({
        path: `/components/${i}/props/fit`,
        message:
          "natural shows the image at its own shape; drop ratio, or choose cover, blur-fill, color-fill or contain",
      });
  });
  // RFC-0027: carousels the evidence allows — few hero slides, a frame size, nothing nested.
  components.forEach((c, i) => {
    if (c.component !== "Carousel") return;
    const at = `/components/${i}`;
    const p = isObj(c.props) ? c.props : {};
    const variant = ["hero", "gallery", "testimonials"].includes(String(p.variant))
      ? String(p.variant)
      : "rail";
    const kids = kidsOf(c);
    const [min, max] = variant === "hero" ? [2, 5] : variant === "gallery" ? [2, 24] : [2, 12];
    // Too few reads "needs at least" (a later build step may add the rest); too many is final.
    if (kids.length < min)
      issues.push({
        path: `${at}/children`,
        message: `a ${variant} carousel needs at least ${min} slides (it has ${kids.length})`,
      });
    else if (kids.length > max)
      issues.push({
        path: `${at}/children`,
        message: `a ${variant} carousel has ${min} to ${max} slides`,
      });
    if ((variant === "hero" || variant === "gallery") && p.aspect === undefined)
      issues.push({
        path: `${at}/props/aspect`,
        message: `a ${variant} carousel keeps one frame size: set aspect`,
      });
    if (p.loop === true && variant !== "hero")
      issues.push({
        path: `${at}/props/loop`,
        message: "only a hero loops; a rail keeps its ends",
      });
    if (p.autoplay !== undefined && p.autoplay !== "off") {
      if (variant !== "hero")
        issues.push({ path: `${at}/props/autoplay`, message: "only a hero may move on its own" });
      else {
        // Long enough to read every slide: about 3 words a second.
        const seconds = p.autoplay === "slow" ? 8 : 6;
        const words = (id: string, depth: number): number => {
          const n = byId.get(id)?.c;
          if (!n || depth > 6) return 0;
          const own = ["text", "label", "value", "summary", "title"]
            .map((k) =>
              isObj(n.props) && typeof n.props[k] === "string" ? (n.props[k] as string) : "",
            )
            .join(" ")
            .split(/\s+/)
            .filter(Boolean).length;
          return own + kidsOf(n).reduce((sum, k) => sum + words(k, depth + 1), 0);
        };
        const longest = Math.max(0, ...kids.map((k) => words(k, 0)));
        if (longest > seconds * 3)
          issues.push({
            path: `${at}/props/autoplay`,
            message: `a slide has ${longest} words; ${p.autoplay} (${seconds} s) suits ${seconds * 3} at most — shorten it, use slow, or turn autoplay off`,
          });
      }
    }
    if (p.markers === "thumbs" && variant !== "gallery")
      issues.push({ path: `${at}/props/markers`, message: "thumbs only on a gallery" });
    if (variant === "gallery")
      for (const k of kids) {
        const hasImage = (id: string, depth: number): boolean => {
          const n = byId.get(id)?.c;
          return (
            !!n &&
            (n.component === "Image" ||
              (depth < 3 && kidsOf(n).some((x) => hasImage(x, depth + 1))))
          );
        };
        if (!hasImage(k, 0))
          issues.push({ path: `${at}/children`, message: `gallery slide "${k}" has no Image` });
      }
    if (p.controls === "none" && !(variant === "rail" && p.peek !== undefined && p.peek !== "none"))
      issues.push({
        path: `${at}/props/controls`,
        message: "none only on a rail whose next slide peeks in",
      });
    if (typeof p.label === "string" && /carousel|karusel/i.test(p.label))
      issues.push({
        path: `${at}/props/label`,
        message:
          'name what it shows ("Customer stories"); assistive technology already says carousel',
      });
    for (const k of kids) {
      const kind = byId.get(k)?.c.component;
      if (kind && OVERLAY_COMPONENTS.has(kind))
        issues.push({
          path: `${at}/children`,
          message: `a ${kind} is not a slide; a slide's Button may open it`,
        });
    }
    for (let up = parentOf.get(c.id); up; up = parentOf.get(up)) {
      const kind = byId.get(up)?.c.component;
      if (kind === "Carousel" || kind === "Marquee" || kind === "Scrolly") {
        issues.push({ path: at, message: `a carousel never sits inside a ${kind}` });
        break;
      }
    }
  });
  // RFC-0024 §5: a morph key names one element on a page.
  const morphs = new Map<string, number>();
  components.forEach((c, i) => {
    const key = isObj(c.motion) && typeof c.motion.morph === "string" ? c.motion.morph : undefined;
    if (!key) return;
    if (morphs.has(key))
      issues.push({
        path: `/components/${i}/motion/morph`,
        message: `"${key}" is already used by another component here`,
      });
    else morphs.set(key, i);
  });
  // RFC-0024 §2: one moving background per surface; more competes for the eye.
  const ambients = components
    .map((c, i) => (isObj(c.props) && isObj(c.props.ambient) ? i : -1))
    .filter((i) => i >= 0);
  for (const i of ambients.slice(1))
    issues.push({
      path: `/components/${i}/props/ambient`,
      message: "one ambient background per section",
    });
  components.forEach((c, i) => {
    if (c.component === "Step" && byId.get(parentOf.get(c.id) ?? "")?.c.component !== "Scrolly")
      issues.push({ path: `/components/${i}`, message: "a Step belongs inside a Scrolly" });
  });
  // Reachability and depth from the root; `parentOf` already rules out shared children.
  const reached = new Set<string>();
  const walk = (id: string, depth: number, trail: Set<string>) => {
    if (trail.has(id)) return;
    reached.add(id);
    if (depth > SURFACE_LIMITS.depth) {
      const i = byId.get(id)?.i;
      issues.push({
        path: `/components/${i}`,
        message: `nested deeper than ${SURFACE_LIMITS.depth}`,
      });
      return;
    }
    const next = new Set(trail).add(id);
    const node = byId.get(id)?.c;
    for (const child of node ? kidsOf(node) : []) if (byId.has(child)) walk(child, depth + 1, next);
  };
  if (byId.has("root")) walk("root", 1, new Set());
  const unreachable = components.map((c) => c.id).filter((id) => !reached.has(id));
  checkData(surface.data, issues);
  return { issues, unknown, unreachable };
}

/** Problems with every surface on a page, paths prefixed with the section's place. */
export function checkPageSurfaces(sections: readonly Section[], catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const surfaces = sections.filter((s): s is SurfaceSection => s.kind === "surface");
  if (surfaces.length > SURFACE_LIMITS.surfacesPerPage)
    out.push({
      path: "/sections",
      message: `at most ${SURFACE_LIMITS.surfacesPerPage} surfaces per page`,
    });
  sections.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const issue of checkSurface(s, catalog).issues)
      out.push({ path: `/sections/${i}${issue.path}`, message: issue.message });
  });
  // RFC-0027 27d: one thing turning on its own per page, at most.
  let playing = 0;
  sections.forEach((s, i) => {
    if (s.kind !== "surface") return;
    s.components.forEach((c, j) => {
      const auto = c.component === "Carousel" && isObj(c.props) ? c.props.autoplay : undefined;
      if (auto === undefined || auto === "off") return;
      if (++playing > 1)
        out.push({
          path: `/sections/${i}/components/${j}/props/autoplay`,
          message: "one carousel per page may play on its own",
        });
    });
  });
  return out;
}

// ── repair (RFC-0020 §6, step 2) ─────────────────────────────────────────────────────────────
/** The catalog name a misspelt one most likely means: same letters ignoring case, else ≤ 2 edits. */
export function nearestComponent(name: string, catalog: Catalog): string | undefined {
  if (catalog.get(name)) return name;
  const names = catalog.names();
  const folded = names.find((n) => n.toLowerCase() === name.toLowerCase());
  if (folded) return folded;
  let best: string | undefined;
  let bestD = 3;
  let tie = false;
  for (const n of names) {
    const d = distance(n.toLowerCase(), name.toLowerCase());
    if (d < bestD) {
      best = n;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  return tie ? undefined : best;
}

const isComponentLike = (v: unknown): v is SurfaceComponent =>
  isObj(v) && typeof v.id === "string" && typeof v.component === "string";

/**
 * Deterministic repairs of one component a model wrote: the nearest catalog name, unknown props
 * dropped, missing required props from the type's example. Every repair is reported.
 */
export function repairComponent(
  c: SurfaceComponent,
  catalog: Catalog,
): { component: SurfaceComponent; notes: string[] } {
  const notes: string[] = [];
  let next: SurfaceComponent = c;
  // One child written as its id instead of a list of one.
  if (typeof (c.children as unknown) === "string") {
    next = { ...next, children: [c.children as unknown as string] };
    notes.push(`${c.id}: children "${c.children}" made a list`);
  }
  if (c.motion !== undefined) {
    const m = repairMotion(c.motion, c.id);
    if (m.notes.length) {
      next = { ...next, motion: m.motion as Record<string, unknown> };
      notes.push(...m.notes);
    }
  }
  const name = nearestComponent(c.component, catalog);
  if (name && name !== c.component) {
    notes.push(`${c.id}: component "${c.component}" → "${name}"`);
    next = { ...next, component: name };
  }
  const entry = catalog.get(next.component);
  if (!entry || (next.props !== undefined && !isObj(next.props))) return { component: next, notes };
  const props: Record<string, unknown> = { ...(next.props ?? {}) };
  let changed = false;
  // RFC-0026: icon names as models write them (`envelope`, `ArrowForward`) in the set's spelling.
  const iconKey = ICON_PROPS[next.component];
  const raw = iconKey ? props[iconKey] : undefined;
  const valid = (v: string) =>
    isIconNameValue(v) || (iconKey === "marker" && (v === "bullet" || v === "none"));
  if (iconKey && typeof raw === "string" && !valid(raw)) {
    const named = nearestIcon(raw);
    if (named) {
      props[iconKey] = named;
      notes.push(`${c.id}: icon "${raw}" → "${named}"`);
    } else if (iconKey !== "name") {
      delete props[iconKey];
      notes.push(`${c.id}: dropped icon "${raw}" (not in the set)`);
    }
    changed = changed || named !== undefined || iconKey !== "name";
  }
  for (const key of Object.keys(props))
    if (!(key in entry.schema.properties)) {
      delete props[key];
      changed = true;
      notes.push(`${c.id}: dropped unknown prop "${key}"`);
    }
  const example = entry.type.example.props as Record<string, unknown>;
  for (const key of entry.schema.required ?? [])
    if (props[key] === undefined && example[key] !== undefined) {
      props[key] = example[key];
      changed = true;
      notes.push(`${c.id}: filled required prop "${key}" from the example`);
    }
  if (changed) next = { ...next, props };
  return { component: next, notes };
}

/** Repairs every component inside a value an operation carries (a component, a list, a surface). */
export function repairValue(value: unknown, catalog: Catalog): { value: unknown; notes: string[] } {
  if (isComponentLike(value)) {
    const r = repairComponent(value, catalog);
    return { value: r.component, notes: r.notes };
  }
  if (Array.isArray(value)) {
    const notes: string[] = [];
    const out = value.map((v) => {
      const r = repairValue(v, catalog);
      notes.push(...r.notes);
      return r.value;
    });
    return { value: out, notes };
  }
  if (isObj(value) && value.kind === "surface" && Array.isArray(value.components)) {
    const r = repairValue(value.components, catalog);
    return { value: { ...value, components: r.value }, notes: r.notes };
  }
  return { value, notes: [] };
}

// ── RFC 6902 JSON Patch ──────────────────────────────────────────────────────────────────────

export interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export class PatchError extends Error {
  override readonly name = "PatchError";
  /** The operation's place in the list. */
  readonly index: number;
  readonly path: string;
  constructor(index: number, path: string, message: string) {
    super(`op ${index} (${path}): ${message}`);
    this.index = index;
    this.path = path;
  }
}

const OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function container(doc: unknown, segments: string[], index: number, path: string): unknown {
  let cur = doc;
  for (const s of segments) {
    if (Array.isArray(cur) && /^(0|[1-9]\d*)$/.test(s) && Number(s) < cur.length)
      cur = cur[Number(s)];
    else if (isObj(cur) && Object.hasOwn(cur, s)) cur = cur[s];
    else throw new PatchError(index, path, "the path does not exist");
  }
  return cur;
}

function split(path: string, index: number): { parent: string[]; key: string } {
  const segments = pointerSegments(path);
  if (!segments || segments.length === 0)
    throw new PatchError(index, path, "not a JSON Pointer to a member");
  if (segments.some((s) => FORBIDDEN_KEYS.has(s)))
    throw new PatchError(index, path, "reserved key");
  return { parent: segments.slice(0, -1), key: segments[segments.length - 1] as string };
}

function read(doc: unknown, path: string, index: number): unknown {
  const segments = pointerSegments(path);
  if (!segments) throw new PatchError(index, path, "not a JSON Pointer");
  return container(doc, segments, index, path);
}

function put(doc: unknown, path: string, value: unknown, index: number, replace: boolean): void {
  const { parent, key } = split(path, index);
  const target = container(doc, parent, index, path);
  if (Array.isArray(target)) {
    if (key === "-" && !replace) {
      target.push(value);
      return;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) throw new PatchError(index, path, "not an array index");
    const i = Number(key);
    if (replace ? i >= target.length : i > target.length)
      throw new PatchError(index, path, "index out of range");
    if (replace) target[i] = value;
    else target.splice(i, 0, value);
    return;
  }
  if (!isObj(target)) throw new PatchError(index, path, "the parent is not an object or array");
  if (replace && !Object.hasOwn(target, key))
    throw new PatchError(index, path, "the path does not exist");
  target[key] = value;
}

function remove(doc: unknown, path: string, index: number): unknown {
  const { parent, key } = split(path, index);
  const target = container(doc, parent, index, path);
  if (Array.isArray(target)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= target.length)
      throw new PatchError(index, path, "index out of range");
    return target.splice(Number(key), 1)[0];
  }
  if (!isObj(target) || !Object.hasOwn(target, key))
    throw new PatchError(index, path, "the path does not exist");
  const old = target[key];
  delete target[key];
  return old;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Applies RFC 6902 operations to a copy of `doc`; all or nothing. */
export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
  if (ops.length > SURFACE_LIMITS.opsPerCall)
    throw new PatchError(
      ops.length - 1,
      "",
      `at most ${SURFACE_LIMITS.opsPerCall} operations per call`,
    );
  const out = structuredClone(doc) as unknown;
  ops.forEach((o, i) => {
    if (!isObj(o) || !OPS.has(o.op as string) || typeof o.path !== "string")
      throw new PatchError(
        i,
        String((o as { path?: unknown })?.path ?? ""),
        "an op with op and path",
      );
    switch (o.op) {
      case "add":
        if (!("value" in o)) throw new PatchError(i, o.path, "add needs a value");
        put(out, o.path, structuredClone(o.value), i, false);
        return;
      case "replace":
        if (!("value" in o)) throw new PatchError(i, o.path, "replace needs a value");
        put(out, o.path, structuredClone(o.value), i, true);
        return;
      case "remove":
        remove(out, o.path, i);
        return;
      case "move": {
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "move needs from");
        if (o.path.startsWith(`${o.from}/`))
          throw new PatchError(i, o.path, "cannot move into itself");
        const v = remove(out, o.from, i);
        put(out, o.path, v, i, false);
        return;
      }
      case "copy":
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "copy needs from");
        put(out, o.path, structuredClone(read(out, o.from, i)), i, false);
        return;
      case "test":
        if (!same(read(out, o.path, i), o.value)) throw new PatchError(i, o.path, "test failed");
        return;
    }
  });
  return out as T;
}

// ── patching a page draft ────────────────────────────────────────────────────────────────────

/** What a build may change on a page: its title, sections and SEO (RFC-0020 §6). */
const PAGE_PATHS = /^\/(?:title|sections|seo)(?:\/|$)/;

export interface PatchResult<T> {
  value: T;
  /** Repairs made to what the operations carried. */
  notes: string[];
}

export interface PatchIssue {
  code: "VALIDATION_FAILED";
  /** JSON Pointer into the page. */
  path: string;
  message: string;
  /** The operation it came from, when known. */
  op?: number;
}

export class SurfacePatchError extends Error {
  override readonly name = "SurfacePatchError";
  readonly issues: readonly PatchIssue[];
  constructor(issues: readonly PatchIssue[]) {
    super(issues.map((i) => `${i.path || "/"}: ${i.message}`).join("; "));
    this.issues = issues;
  }
}

/**
 * The build pipeline for a page (RFC-0020 §6, steps 2–4): repair what the operations carry, apply
 * them, then check every surface on the result. Throws `SurfacePatchError` with A2UI-style
 * `VALIDATION_FAILED` issues; the caller writes the result through the store (policy, contract,
 * CAS).
 */
export function patchPage(
  page: Page,
  ops: readonly PatchOp[],
  catalog: Catalog,
): PatchResult<Page> {
  const notes: string[] = [];
  const repaired = ops.map((o, i) => {
    if (!isObj(o) || typeof o.path !== "string" || !PAGE_PATHS.test(o.path))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: typeof o?.path === "string" ? o.path : "",
          message: "a build may change /title, /sections and /seo only",
          op: i,
        },
      ]);
    if (typeof o.from === "string" && !PAGE_PATHS.test(o.from))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: o.from,
          message: "from must be under /title, /sections or /seo",
          op: i,
        },
      ]);
    if (!("value" in o)) return o;
    const r = repairValue(o.value, catalog);
    notes.push(...r.notes);
    return { ...o, value: r.value };
  });
  let value: Page | undefined;
  // An add into a children list past its end (models count ahead) becomes an append.
  for (let tries = 0; value === undefined; tries++) {
    try {
      value = applyPatch(page, repaired);
    } catch (e) {
      if (!(e instanceof PatchError)) throw e;
      const op = repaired[e.index];
      const appended = op?.path.replace(/\/children\/\d+$/, "/children/-");
      if (
        e.message.endsWith(": index out of range") &&
        op?.op === "add" &&
        appended !== op.path &&
        tries < repaired.length
      ) {
        notes.push(`${op.path} is past the end of its children; appended`);
        repaired[e.index] = { ...op, path: appended as string };
        continue;
      }
      throw new SurfacePatchError([
        { code: "VALIDATION_FAILED", path: e.path, message: e.message, op: e.index },
      ]);
    }
  }
  // A build changes the page's parts, never its shape: it keeps a title and a list of sections.
  if (!Array.isArray(value.sections) || typeof value.title !== "string")
    throw new SurfacePatchError([
      {
        code: "VALIDATION_FAILED",
        path: Array.isArray(value.sections) ? "/title" : "/sections",
        message: "the page keeps its title and its list of sections; change what is inside them",
        op: 0,
      },
    ]);
  const issues = checkPageSurfaces(value.sections ?? [], catalog).map(
    (i): PatchIssue => ({ code: "VALIDATION_FAILED", path: i.path, message: i.message }),
  );
  // Surfaces a build writes may not use components the catalog lacks: the store keeps those
  // (they may come from another theme), but a model writing them now has made a mistake.
  value.sections?.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const id of checkSurface(s, catalog).unknown) {
      const j = s.components.findIndex((c) => c.id === id);
      issues.push({
        code: "VALIDATION_FAILED",
        path: `/sections/${i}/components/${j}/component`,
        message: `"${s.components[j]?.component}" is not in the catalog (${catalog.id})`,
      });
    }
  });
  if (issues.length) throw new SurfacePatchError(issues);
  return { value, notes };
}

// ── surfaces in markdown bodies (RFC-0020 §5) ────────────────────────────────────────────────

/** A fence opening a surface: ```surface {"id":"pricing","catalog":"blog@1"} (or ~~~). */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/;
const SURFACE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const CATALOG_ID = /^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$/;

/** One ```surface fence of a body, parsed line by line. */
export interface BodySurface {
  /** The fence's `id` (unique in the body). */
  id: string;
  catalog: string;
  /** The fence as a surface; its `id` is the fence's. */
  section: SurfaceSection;
  /** Problems with the fence itself: its info string, lines that are not JSON, entry sources. */
  issues: PropsIssue[];
  /** False while the closing fence has not arrived (a body still streaming). */
  complete: boolean;
  /** 0-based line of the opening fence in the body. */
  line: number;
}

/**
 * A fence's lines as a surface: every line one component, or `{"data":{…}}` merged into the data
 * model. Only whole lines count; a body that is still streaming passes `complete: false`.
 */
export function parseSurfaceFence(
  info: string,
  lines: readonly string[],
  complete = true,
  line = 0,
): BodySurface {
  const issues: PropsIssue[] = [];
  let meta: Record<string, unknown> = {};
  try {
    const parsed = info.trim() ? (JSON.parse(info) as unknown) : {};
    if (isObj(parsed)) meta = parsed;
    else
      issues.push({
        path: "/info",
        message: 'an object such as {"id":"pricing","catalog":"blog@1"}',
      });
  } catch {
    issues.push({ path: "/info", message: 'JSON such as {"id":"pricing","catalog":"blog@1"}' });
  }
  const id = typeof meta.id === "string" ? meta.id : "";
  const catalog = typeof meta.catalog === "string" ? meta.catalog : "";
  if (!SURFACE_ID.test(id))
    issues.push({ path: "/info/id", message: "a lower-case id such as pricing" });
  if (!CATALOG_ID.test(catalog))
    issues.push({ path: "/info/catalog", message: "the catalog, such as blog@1 (get_catalog)" });
  const components: SurfaceComponent[] = [];
  const data: Record<string, unknown> = {};
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (!text) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      issues.push({ path: `/lines/${i}`, message: "not one JSON object" });
      return;
    }
    if (isObj(value) && Object.keys(value).length === 1 && isObj(value.data)) {
      for (const [k, v] of Object.entries(value.data)) {
        if (isObj(v) && "$source" in v)
          issues.push({
            path: `/lines/${i}/data/${k}`,
            message: "entry sources work in page surfaces only",
          });
        data[k] = v;
      }
    } else if (isObj(value)) components.push(value as unknown as SurfaceComponent);
    else issues.push({ path: `/lines/${i}`, message: 'a component or {"data":{…}}' });
  });
  const section = {
    id,
    kind: "surface",
    catalog,
    components,
    ...(Object.keys(data).length ? { data } : {}),
  } as unknown as SurfaceSection;
  return { id, catalog, section, issues, complete, line };
}

/**
 * Whether a surface needs the interaction runtime (RFC-0020 §4): it has an input, or a button
 * with an action. Everything else is complete as server-rendered HTML.
 */
export function isInteractive(surface: Pick<SurfaceSection, "components">): boolean {
  return surface.components.some(
    (c) =>
      INPUT_COMPONENTS.has(c.component) ||
      // Opening and closing overlays is the browser's (and the overlay module's), not the runtime's.
      (c.component === "Button" &&
        isObj(c.props) &&
        isObj(c.props.onClick) &&
        c.props.onClick.action !== "open" &&
        c.props.onClick.action !== "close") ||
      // RFC-0024 §3: a scroll story writes the step being read into the data.
      c.component === "Scrolly",
  );
}

/** Every ```surface fence of a markdown body, in order; fences inside other code blocks are not. */
export function bodySurfaces(markdown: string): BodySurface[] {
  if (!markdown.includes("surface")) return [];
  const lines = markdown.split(/\r?\n/);
  const out: BodySurface[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i] as string);
    if (!m) continue;
    const fence = m[1] as string;
    const closes = (l: string) =>
      new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`).test(l);
    let j = i + 1;
    while (j < lines.length && !closes(lines[j] as string)) j++;
    if (m[2] === "surface")
      out.push(parseSurfaceFence((m[3] ?? "").trim(), lines.slice(i + 1, j), j < lines.length, i));
    i = j;
  }
  return out;
}

/** Problems with a body's surfaces (paths start with the fence's id); unknown components pass. */
export function checkBodySurfaces(markdown: string, catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const seen = new Set<string>();
  for (const f of bodySurfaces(markdown)) {
    const at = `/surface/${f.id || `line-${f.line + 1}`}`;
    if (!f.complete) out.push({ path: at, message: "the fence is not closed" });
    if (f.id && seen.has(f.id))
      out.push({ path: `${at}/info/id`, message: "used by another fence" });
    seen.add(f.id);
    for (const i of f.issues) out.push({ path: `${at}${i.path}`, message: i.message });
    for (const i of checkSurface(f.section, catalog).issues)
      out.push({ path: `${at}${i.path}`, message: i.message });
  }
  return out;
}

// ── the model prompt (RFC-0020 §2) ───────────────────────────────────────────────────────────

function describeProp(name: string, s: PropSchema, required: boolean): string {
  const req = required ? " (required)" : "";
  switch (s.type) {
    case "string": {
      const parts = s.enum ? s.enum.join("|") : s.format ? `${s.format}` : "text";
      const max = s.maxLength ? `, ≤${s.maxLength}` : "";
      return `${name}: ${parts}${s.enum ? "" : max}${req}`;
    }
    case "integer":
    case "number": {
      const range =
        s.minimum !== undefined || s.maximum !== undefined
          ? ` ${s.minimum ?? ""}..${s.maximum ?? ""}`
          : "";
      return `${name}: ${s.type}${range}${req}`;
    }
    case "boolean":
      return `${name}: true|false${req}`;
    case "array": {
      const item =
        s.items.type === "object"
          ? `{ ${Object.entries(s.items.properties)
              .map(([k, v]) =>
                describeProp(
                  k,
                  v,
                  (s.items as { required?: readonly string[] }).required?.includes(k) ?? false,
                ),
              )
              .join("; ")} }`
          : describeProp("item", s.items, false).replace(/^item: /, "");
      return `${name}: list of ${item}, ≤${s.maxItems ?? BLOCK_LIMITS.arrayItems}${req}`;
    }
    case "object":
      return `${name}: { ${Object.entries(s.properties)
        .map(([k, v]) => describeProp(k, v, s.required?.includes(k) ?? false))
        .join("; ")} }${req}`;
  }
}

/**
 * Instructions for a model writing surfaces against this catalog: the format, bindings, limits
 * and every component with its props and an example. The same catalog validates what it writes.
 */
export function catalogPrompt(catalog: Catalog, locale = "en"): string {
  const lines: string[] = [
    `# Cloudhal surfaces — catalog ${catalog.id}`,
    "",
    "A surface is a page section that describes UI as data, never code:",
    `{"id":"sec_<6-32 letters or digits>","kind":"surface","catalog":"${catalog.id}","components":[…],"data":{…}}`,
    "",
    "## Rules",
    '- `components` is a flat list. One component has id "root". Ids match [a-z][a-z0-9-]{0,40} and are unique in the surface.',
    "- `children` lists ids of other components in the same surface; each component has at most one parent. Nest at most " +
      `${SURFACE_LIMITS.depth} deep; at most ${SURFACE_LIMITS.components} components.`,
    "- `props` follow the component's props below. Any prop may instead be bound to the data model: " +
      '{"path":"/json/pointer"}, or computed by a named function: {"call":"formatDate","args":{"value":{"path":"/d"},"style":"long"}}.',
    `- Functions: ${SURFACE_FUNCTIONS.join(", ")}.`,
    '- Inputs (NumberField, TextField, Checkbox, RadioGroup) write only to the surface\'s data in the reader\'s browser: bind value (checked for Checkbox) with {"path"}, start it in `data` ("" for an empty number), give every input a label, and show the computed result next to it. Buttons may `append` text to a value (keypads) or `set` a computed value, e.g. {"action":"set","path":"/display","value":{"call":"calculate","args":{"expression":{"path":"/display"}}}}.',
    '- Charts: a Chart draws rows from the surface\'s data, e.g. {"id":"c","component":"Chart","props":{"kind":"bar","title":"Readers per month","data":{"path":"/months"},"x":"month","series":[{"field":"readers","label":"Readers"}]}} with "data":{"months":[{"month":"Jan","readers":1200},…]}. Use one only when the numbers are the point; bar for comparing, line or area for change over time, donut for parts of a whole (one series, at most six parts).',
    '- Tables: a Table shows rows from the surface\'s data, e.g. {"id":"t","component":"Table","props":{"caption":"Plans compared","rows":{"path":"/plans"},"columns":[{"field":"name","label":"Plan"},{"field":"price","label":"Price","align":"end","format":"currency","currency":"USD"}],"highlight":{"field":"name","equals":"Pro"}}}. Formats: text, number, currency, percent, date. At most 8 columns; on phones each row becomes a card.',
    "- Compute, don't promise: a total, a price for N seats or a result from the reader's choices is a call, never text such as \"calculated at checkout\". " +
      "For any result with more than one step, write the formula with `calculate` and name its inputs in `vars` (paths into the data, numbers, or a `choose`): " +
      '{"call":"calculate","args":{"expression":"seats * price * (1 + vat)","vars":{"seats":{"path":"/seats"},"price":{"call":"choose","args":{"value":{"path":"/plan"},"cases":{"basic":9,"pro":19}}},"vat":0.2}}}. ' +
      "Formulas use + - * / % ^ and parentheses; names are letters, digits and _. Wrap the result in formatNumber or formatCurrency to show it: " +
      '{"call":"formatCurrency","args":{"currency":"USD","value":{"call":"calculate","args":{…}}}}. A blank input leaves the result empty until it is filled. ' +
      'A whole calculator: data {"kg":"","cm":""}; NumberFields {"label":"Weight","value":{"path":"/kg"},"unit":"kg"} and {"label":"Height","value":{"path":"/cm"},"unit":"cm"}; ' +
      'a Stat {"label":"BMI","value":{"call":"formatNumber","args":{"digits":1,"value":{"call":"calculate","args":{"expression":"kg / (cm/100)^2","vars":{"kg":{"path":"/kg"},"cm":{"path":"/cm"}}}}}}}. ' +
      "Other functions: add/multiply/min/max {values}, subtract/divide {a,b}, round/floor/ceil {value,digits}, power {base,exponent}, if {cond,ifTrue,ifFalse}, sum/average/count {list,field}.",
    '- `visible` (optional) shows a component only when a condition holds: {"path":"/x"}, {"eq":[a,b]}, {"ne":[a,b]}, {"gt":[a,b]}, {"lt":[a,b]}, {"gte":[a,b]}, {"lte":[a,b]}, {"and":[…]}, {"or":[…]}, {"not":…}.',
    // RFC-0024 §2: motion as presets, next to `visible`.
    `- \`motion\` (optional, next to \`visible\`) animates a component with presets, never CSS: {"reveal":"rise","speed":"normal","delay":1}. "reveal" plays once as it scrolls into view: ${MOTION_REVEALS.join(", ")}. "hover": lift, scale, glow; underline (Link, Button, Card, Heading); zoom-media (Card, Image); tilt (Card, Image); magnetic (Button, Link); spotlight (Card, Band). "stagger": true on ${MOTION_STAGGER.join("/")} reveals its children one after another. "delay" 0–4 stagger steps; "speed" fast|normal|slow; "replay": true reveals again on re-entry. "scroll" moves it with the page instead (not with "reveal"): parallax or pan with "depth" -3…3 (negative moves the other way), fade-through, scale-through, rotate-through — for images, cards and decorative parts, never for text people read. split-words, split-chars and split-lines reveal a Heading or a short Text piece by piece (once, as kinetic type). "loop" (alone, decorative only): float (Image, Badge, Stat, Card), pulse (Badge, Button, Stat), gradient-shift (Card, Band), spin-slow (Image, Badge).`,
    'Kinetic headings: Heading "effect" highlight (marks the words *between asterisks*, else the last word), gradient-text, or rotate-words with "words" (2–6) taking turns where {words} stands in the text ("Invoices that {words}" with ["chase themselves","never get lost"]). Marquee scrolls a row of 3+ children by itself (logos, quotes); Counter counts up to "value" once as it comes into view. Anything that loops gets a pause control from the renderer; use at most two per page.',
    'Ambient backgrounds: Band (or Card, CSS kinds only) "ambient": {"kind":"aurora"|"gradient-shift"|"grain"|"beams"|"particles","preset":"dots"|"links"|"stars"|"snow"|"bubbles"|"fireflies" (particles only),"density":"low"|"medium"|"high","colors":"brand"|"accent"|"brand-accent"|"neutral","interactive":true}. One per section, best on the hero; text keeps its contrast, and readers who pause motion or ask for less see a still version.',
    'Page transitions: when the site\'s pageTransition is morph, give the same "morph" key (motion {"morph":"plan-pro"}) to an element on two pages, a card image and the article cover, a pricing card and its plan page heading, and it moves from one to the other as the reader navigates. One key per element on a page.',
    'Scroll story: a Scrolly holds one child that stays in view (a Chart, a Stat, an Image or a Stack of them), then 2–12 Step children with the text; the step being read (1, 2, …) is written to its "step" binding, so the first child changes with it: {"visible":{"eq":[{"path":"/step"},2]}} or {"call":"choose","args":{"value":{"path":"/step"},"cases":{"1":…,"2":…}}}. Put the starting step in the data ({"step":1}). ScrollProgress shows how far the reader is (placement page or section).',
    "Carousel (RFC-0027): each child is a slide; give it a label naming what it shows. variant hero (2–5 full-width slides, aspect required, slide 1 matters most), rail (2–12 cards or logos, perView 1–4 or itemWidth, peek s so readers see there is more), gallery (up to 24 slides each with an Image, aspect required, markers thumbs) or testimonials (2–12 Quote slides, centred). Prefer a static hero (a Band); use a hero carousel only for 2–5 equally important messages; every slide's content must also be reachable elsewhere. A hero may loop; autoplay (slow 8 s, normal 6 s) stays off unless the owner asks — it then plays only where motion allows, stops for good when the reader touches it, and one per page.",
    `Icons (RFC-0026), by name only: an Icon component ({"name","size","tone","label" only when it stands alone}), "icon" on Button (with "iconPosition"), Badge and Stat, and List "marker". Interface: ${ICON_GROUPS.interface.join(", ")}. Actions: ${ICON_GROUPS.actions.join(", ")}. Content: ${ICON_GROUPS.content.join(", ")}. Social: ${ICON_GROUPS.social.join(", ")}. Icons decorate text; never use one as the only way to say something.`,
    'Overlays (Dialog, Drawer, Popover: at most 3 per section; and Lightbox) open only when the reader asks: a Button with "onClick":{"action":"open","target":"<overlay id>"}; a Button inside one with {"action":"close"} closes it. Never open one on load, on a timer or on leaving; content people read or link to belongs on a page. Dialog and Drawer need a title; give a Dialog a fallbackHref page when its content matters. A Tooltip ({"text","for":"<Button or Link id>"}) repeats what is on the page, never replaces it. A Lightbox shows images from items (asset and alt each).',
    "- Motion guides the eye: one entrance per section (a hero heading with rise and its buttons after it, a grid with stagger), hover on things people click, never on body text people are reading. The site's motion level and the reader's reduced-motion setting decide how much actually moves, and pages are complete without it.",
    `- \`data\` is JSON (≤ ${SURFACE_LIMITS.dataBytes / 1024} KB). A key may load entries: {"$source":"entries","query":{"collection":"posts","filter":"category:news","sort":"newest","limit":6}}.`,
    "- Images only from the media library: `asset:<id>`. Links: https, mailto, tel, /site-paths or #anchors.",
    "- Text props take markdown where marked `markdown`; never HTML.",
    "",
    "## In article bodies",
    'Inside markdown, write a surface as a fenced block: the info string holds its id and catalog, every line one component, or a {"data":{…}} line:',
    '```surface {"id":"pricing","catalog":"' + catalog.id + '"}',
    '{"data":{"billing":"monthly"}}',
    '{"id":"root","component":"Stack","children":["t"]}',
    '{"id":"t","component":"Text","props":{"text":"Hello"}}',
    "```",
    "Body surfaces cannot load entries ($source); page surfaces can.",
    "",
    "## Editing",
    "Change a page with RFC 6902 JSON Patch operations on /title, /sections and /seo, e.g.",
    '{"op":"add","path":"/sections/-","value":{…surface…}} or {"op":"add","path":"/sections/0/components/-","value":{…component…}} then add its id to a parent\'s children.',
    "Failed operations come back as VALIDATION_FAILED with a JSON Pointer; fix that part and send again.",
    "",
    "## Components",
  ];
  for (const e of catalog.entries()) {
    const rule = childRule(e);
    const kids =
      rule === "none"
        ? "no children"
        : rule === "any"
          ? "children: any"
          : `children: ${rule.join(", ")}`;
    const desc = localized(e.type.description, locale);
    lines.push(
      `### ${e.name} (${e.kind === "primitive" ? e.type.category : "block"}; ${kids})${desc ? ` — ${desc}` : ""}`,
    );
    const props = Object.entries(e.schema.properties).map(([k, v]) =>
      describeProp(k, v, e.schema.required?.includes(k) ?? false),
    );
    lines.push(props.length ? `props: ${props.join("; ")}` : "props: none");
    lines.push(
      `example: ${JSON.stringify({ id: e.name.toLowerCase(), component: e.name, props: e.type.example.props })}`,
    );
  }
  return lines.join("\n");
}

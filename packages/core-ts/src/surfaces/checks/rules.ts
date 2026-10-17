/** Rules across a surface's components: overlays and tooltips, images, morphs, ambients, steps. */
import { MODAL_OVERLAYS, OPENABLE } from "../catalog/props.ts";
import { isObj } from "../shared.ts";
import type { SurfaceGraph } from "./graph.ts";

/** RFC-0025 §3: overlays open from a reader's action on this surface, never inside another modal. */
export function checkOverlays(g: SurfaceGraph): void {
  const { byId, parentOf, issues } = g;
  const overlayAbove = (id: string): string | undefined => {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) {
      const k = byId.get(p)?.c.component;
      if (k && OPENABLE.has(k)) return p;
    }
    return undefined;
  };
  let overlays = 0;
  let tooltips = 0;
  g.components.forEach((c, i) => {
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
}

/** RFC-0028: natural means no frame, so a ratio contradicts it. */
export function checkImages(g: SurfaceGraph): void {
  g.components.forEach((c, i) => {
    if (c.component !== "Image" || !isObj(c.props)) return;
    if (c.props.fit === "natural" && c.props.ratio !== undefined && c.props.ratio !== "auto")
      g.issues.push({
        path: `/components/${i}/props/fit`,
        message:
          "natural shows the image at its own shape; drop ratio, or choose cover, blur-fill, color-fill or contain",
      });
  });
}

/**
 * RFC-0024 §5: a morph key names one element on a page. §2: one moving background per surface;
 * more competes for the eye. §3: a Step belongs to a Scrolly.
 */
export function checkMorphsAmbientsSteps(g: SurfaceGraph): void {
  const { components, byId, parentOf, issues } = g;
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
}

/** RFC-0027: carousels the evidence allows — few hero slides, a frame size, nothing nested. */
import type { SurfaceComponent } from "@cloudhal/core-contracts";
import { OVERLAY_COMPONENTS } from "../catalog/props.ts";
import { isObj } from "../shared.ts";
import { kidsOf, type SurfaceGraph } from "./graph.ts";

export function checkCarousels(g: SurfaceGraph): void {
  g.components.forEach((c, i) => {
    if (c.component === "Carousel") checkCarousel(g, c, `/components/${i}`);
  });
}

function checkCarousel(g: SurfaceGraph, c: SurfaceComponent, at: string): void {
  const { byId, parentOf, issues } = g;
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
    else checkAutoplay(g, kids, { autoplay: p.autoplay, at });
  }
  if (p.markers === "thumbs" && variant !== "gallery")
    issues.push({ path: `${at}/props/markers`, message: "thumbs only on a gallery" });
  if (variant === "gallery")
    for (const k of kids) {
      const hasImage = (id: string, depth: number): boolean => {
        const n = byId.get(id)?.c;
        return (
          !!n &&
          (n.component === "Image" || (depth < 3 && kidsOf(n).some((x) => hasImage(x, depth + 1))))
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
}

/** Long enough to read every slide: about 3 words a second. */
function checkAutoplay(
  g: SurfaceGraph,
  kids: readonly string[],
  { autoplay, at }: { autoplay: unknown; at: string },
): void {
  const seconds = autoplay === "slow" ? 8 : 6;
  const words = (id: string, depth: number): number => {
    const n = g.byId.get(id)?.c;
    if (!n || depth > 6) return 0;
    const own = ["text", "label", "value", "summary", "title"]
      .map((k) => (isObj(n.props) && typeof n.props[k] === "string" ? (n.props[k] as string) : ""))
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    return own + kidsOf(n).reduce((sum, k) => sum + words(k, depth + 1), 0);
  };
  const longest = Math.max(0, ...kids.map((k) => words(k, 0)));
  if (longest > seconds * 3)
    g.issues.push({
      path: `${at}/props/autoplay`,
      message: `a slide has ${longest} words; ${autoplay} (${seconds} s) suits ${seconds * 3} at most — shorten it, use slow, or turn autoplay off`,
    });
}

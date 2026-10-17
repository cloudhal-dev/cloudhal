/** Motion (RFC-0024 §2): reveals, hovers, scroll effects and loops; checks and repairs. */
import type { SurfaceSection } from "@cloudhal/core-contracts";
import type { PropsIssue } from "../blocks.ts";
import { INPUT_COMPONENTS } from "./catalog/props.ts";
import { distance, isObj } from "./shared.ts";

// ── motion (RFC-0024 §2) ─────────────────────────────────────────────────────────────────────

/** Reveals: once, as a component enters the viewport. */
export const MOTION_REVEALS = [
  "fade",
  "rise",
  "sink",
  "slide-start",
  "slide-end",
  "scale-in",
  "blur-in",
  "wipe-up",
  "wipe-start",
  "mask-rise",
  // RFC-0024 24c: kinetic type, on headings and short texts only.
  "split-words",
  "split-chars",
  "split-lines",
] as const;
/** Hover and focus effects; the pointer ones (`tilt`, `magnetic`, `spotlight`) need a fine pointer. */
export const MOTION_HOVERS = [
  "lift",
  "scale",
  "glow",
  "underline",
  "zoom-media",
  "tilt",
  "magnetic",
  "spotlight",
] as const;
export const MOTION_SPEEDS = ["fast", "normal", "slow"] as const;
/** Components that lay out children: `stagger` reveals their children one after another. */
export const MOTION_STAGGER = ["Stack", "Row", "Grid", "Columns", "Band", "Card"] as const;
/** Hover effects that only fit some components; the rest fit any. */
export const HOVER_FITS: Partial<Record<(typeof MOTION_HOVERS)[number], readonly string[]>> = {
  underline: ["Link", "Button", "Card", "Heading"],
  "zoom-media": ["Card", "Image"],
  tilt: ["Card", "Image"],
  magnetic: ["Button", "Link"],
  spotlight: ["Card", "Band"],
};
/** Scroll effects: continuous, tied to the component's place in the viewport (RFC-0024 §2). */
export const MOTION_SCROLLS = [
  "parallax",
  "fade-through",
  "scale-through",
  "rotate-through",
  "pan",
] as const;
/** Loops: decorative, slow, paused by the reader's pause control (RFC-0024 24c). */
export const MOTION_LOOPS = ["float", "pulse", "gradient-shift", "spin-slow"] as const;
/** Components a loop may decorate: never text people read. */
export const LOOP_FITS: Record<(typeof MOTION_LOOPS)[number], readonly string[]> = {
  float: ["Image", "Badge", "Stat", "Card"],
  pulse: ["Badge", "Button", "Stat"],
  "gradient-shift": ["Card", "Band"],
  "spin-slow": ["Image", "Badge"],
};
/** Fields later phases add: written now, they are refused with when they arrive. */
export const MOTION_LATER: Record<string, string> = {};
/** Names models often write for a preset, and the preset they mean. */
export const MOTION_ALIASES: Record<string, string> = {
  fadein: "fade",
  "fade-in": "fade",
  fadeinup: "rise",
  "fade-up": "rise",
  "fade-in-up": "rise",
  slideup: "rise",
  "slide-up": "rise",
  up: "rise",
  fadeindown: "sink",
  "fade-down": "sink",
  "slide-down": "sink",
  slideinleft: "slide-start",
  "slide-left": "slide-start",
  "slide-in-left": "slide-start",
  slideinright: "slide-end",
  "slide-right": "slide-end",
  "slide-in-right": "slide-end",
  zoomin: "scale-in",
  "zoom-in": "scale-in",
  zoom: "scale-in",
  blur: "blur-in",
  reveal: "wipe-up",
  wipe: "wipe-up",
  mask: "mask-rise",
  grow: "scale",
  raise: "lift",
  float: "lift",
  shadow: "lift",
  shine: "glow",
  "image-zoom": "zoom-media",
  "zoom-image": "zoom-media",
  "3d": "tilt",
  medium: "normal",
  quick: "fast",
  parallax: "parallax",
  "parallax-scroll": "parallax",
  "fade-scroll": "fade-through",
  "scroll-fade": "fade-through",
  "scale-scroll": "scale-through",
  "scroll-scale": "scale-through",
  "zoom-scroll": "scale-through",
  "rotate-scroll": "rotate-through",
  rotate: "rotate-through",
  "horizontal-scroll": "pan",
  slide: "pan",
  "split-text": "split-words",
  words: "split-words",
  letters: "split-chars",
  chars: "split-chars",
  typewriter: "split-chars",
  lines: "split-lines",
  bob: "float",
  floating: "float",
  breathe: "pulse",
  heartbeat: "pulse",
  spin: "spin-slow",
  rotating: "spin-slow",
  "gradient-animation": "gradient-shift",
};
/** Field names models write for a `motion` field. */
export const MOTION_FIELD_ALIASES: Record<string, string> = {
  entrance: "reveal",
  enter: "reveal",
  appear: "reveal",
  animation: "reveal",
  animate: "reveal",
  onhover: "hover",
  hovereffect: "hover",
  duration: "speed",
};

/** The motion fields a component may have, and what each takes. */
export function checkMotion(
  motion: unknown,
  component: string,
  at: string,
  issues: PropsIssue[],
): void {
  if (!isObj(motion)) {
    issues.push({ path: at, message: 'an object of presets, e.g. {"reveal":"rise"}' });
    return;
  }
  const oneOf = (key: string, allowed: readonly string[]) => {
    const v = motion[key];
    if (v !== undefined && !(typeof v === "string" && allowed.includes(v)))
      issues.push({ path: `${at}/${key}`, message: `one of ${allowed.join(", ")}` });
  };
  for (const key of Object.keys(motion)) {
    if (MOTION_LATER[key])
      issues.push({ path: `${at}/${key}`, message: `not available yet (${MOTION_LATER[key]})` });
    else if (
      ![
        "reveal",
        "hover",
        "speed",
        "delay",
        "stagger",
        "replay",
        "scroll",
        "depth",
        "loop",
        "morph",
      ].includes(key)
    )
      issues.push({ path: `${at}/${key}`, message: "unknown motion field" });
  }
  oneOf("reveal", MOTION_REVEALS);
  oneOf("hover", MOTION_HOVERS);
  oneOf("speed", MOTION_SPEEDS);
  oneOf("scroll", MOTION_SCROLLS);
  oneOf("loop", MOTION_LOOPS);
  // RFC-0024 §5: the same key on two pages morphs one element into the other on navigation.
  if (
    motion.morph !== undefined &&
    !(typeof motion.morph === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(motion.morph))
  )
    issues.push({
      path: `${at}/morph`,
      message: "a key like plan-pro: lowercase letters, digits and hyphens",
    });
  const loop = motion.loop as (typeof MOTION_LOOPS)[number] | undefined;
  if (loop && LOOP_FITS[loop] && !LOOP_FITS[loop].includes(component))
    issues.push({ path: `${at}/loop`, message: `${loop} fits ${LOOP_FITS[loop].join(", ")}` });
  if (loop && (motion.reveal !== undefined || motion.scroll !== undefined))
    issues.push({ path: `${at}/loop`, message: "a loop goes alone: no reveal or scroll with it" });
  const reveal = typeof motion.reveal === "string" ? motion.reveal : "";
  if (reveal.startsWith("split-") && component !== "Heading" && component !== "Text")
    issues.push({ path: `${at}/reveal`, message: `${reveal} fits Heading and Text` });
  // A component either reveals once or moves with the scroll: both would fight over the same
  // properties.
  if (motion.scroll !== undefined && motion.reveal !== undefined)
    issues.push({ path: `${at}/scroll`, message: "use reveal or scroll, not both" });
  if (motion.scroll !== undefined && INPUT_COMPONENTS.has(component))
    issues.push({ path: `${at}/scroll`, message: "form controls do not move with the scroll" });
  const depth = motion.depth;
  if (
    depth !== undefined &&
    !(Number.isInteger(depth) && (depth as number) !== 0 && Math.abs(depth as number) <= 3)
  )
    issues.push({ path: `${at}/depth`, message: "-3 to 3, not 0 (negative moves the other way)" });
  if (depth !== undefined && motion.scroll !== "parallax" && motion.scroll !== "pan")
    issues.push({ path: `${at}/depth`, message: "only with scroll parallax or pan" });
  const hover = motion.hover as (typeof MOTION_HOVERS)[number] | undefined;
  const fits = hover ? HOVER_FITS[hover] : undefined;
  if (fits && !fits.includes(component))
    issues.push({ path: `${at}/hover`, message: `${hover} fits ${fits.join(", ")}` });
  const delay = motion.delay;
  if (
    delay !== undefined &&
    !(Number.isInteger(delay) && (delay as number) >= 0 && (delay as number) <= 4)
  )
    issues.push({ path: `${at}/delay`, message: "steps of the stagger, 0 to 4" });
  for (const key of ["stagger", "replay"])
    if (motion[key] !== undefined && typeof motion[key] !== "boolean")
      issues.push({ path: `${at}/${key}`, message: "true or false" });
  if (motion.stagger === true && !(MOTION_STAGGER as readonly string[]).includes(component))
    issues.push({ path: `${at}/stagger`, message: `only on ${MOTION_STAGGER.join(", ")}` });
}

/** Whether a surface uses motion, so its page loads the motion module (RFC-0024 §7). */
export function usesMotion(section: Pick<SurfaceSection, "components">): boolean {
  return section.components.some(
    (c) =>
      (isObj(c.motion) && Object.keys(c.motion).length > 0) ||
      c.component === "Scrolly" ||
      c.component === "ScrollProgress" ||
      c.component === "Marquee" ||
      c.component === "Counter" ||
      (c.component === "Heading" && isObj(c.props) && c.props.effect === "rotate-words") ||
      (isObj(c.props) && isObj(c.props.ambient)),
  );
}

/**
 * Whether a surface moves on its own for more than 5 seconds (a marquee, rotating words, a loop),
 * so the renderer adds the reader's pause control next to it (RFC-0024 §1, WCAG 2.2.2).
 */
export function surfaceLoops(section: Pick<SurfaceSection, "components">): boolean {
  return section.components.some(
    (c) =>
      c.component === "Marquee" ||
      (c.component === "Heading" && isObj(c.props) && c.props.effect === "rotate-words") ||
      (isObj(c.motion) && typeof c.motion.loop === "string") ||
      (isObj(c.props) && isObj(c.props.ambient)),
  );
}

/**
 * Deterministic repairs of a component's `motion`: preset and field names snapped to the nearest
 * known one (`"fadeInUp"` → `rise`), a delay in milliseconds turned into stagger steps, fields
 * that are not motion dropped. Every repair is reported.
 */
export function repairMotion(motion: unknown, id: string): { motion: unknown; notes: string[] } {
  if (!isObj(motion)) return { motion, notes: [] };
  const notes: string[] = [];
  const out: Record<string, unknown> = {};
  const snap = (value: unknown, allowed: readonly string[]): unknown => {
    if (typeof value !== "string" || allowed.includes(value)) return value;
    const key = value.toLowerCase().replace(/[\s_]+/g, "-");
    const alias = MOTION_ALIASES[key] ?? MOTION_ALIASES[key.replace(/-/g, "")];
    if (alias && allowed.includes(alias)) return alias;
    let best: string | undefined;
    let bestD = 3;
    for (const a of allowed) {
      const d = distance(a, key);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    return best ?? value;
  };
  for (const [rawKey, value] of Object.entries(motion)) {
    const key = MOTION_FIELD_ALIASES[rawKey.toLowerCase()] ?? rawKey;
    if (key !== rawKey) notes.push(`${id}: motion "${rawKey}" → "${key}"`);
    let v: unknown = value;
    if (key === "reveal") v = snap(value, MOTION_REVEALS);
    else if (key === "hover") v = snap(value, MOTION_HOVERS);
    else if (key === "speed") v = snap(value, MOTION_SPEEDS);
    else if (key === "scroll") v = snap(value, MOTION_SCROLLS);
    else if (key === "loop") v = snap(value, MOTION_LOOPS);
    else if (key === "depth" && typeof value === "number" && Number.isFinite(value) && value !== 0)
      v = Math.max(-3, Math.min(3, Math.round(value) || Math.sign(value)));
    else if (key === "delay" && typeof value === "number" && value > 4)
      v = Math.min(4, Math.max(0, Math.round(value / 100)));
    if (v !== value)
      notes.push(`${id}: motion.${key} ${JSON.stringify(value)} → ${JSON.stringify(v)}`);
    out[key] = v;
  }
  return { motion: out, notes };
}

/**
 * Checks a surface against a catalog (RFC-0020 §1): ids, the tree, child rules, props, bindings,
 * conditions, data and limits. Unknown components and unreachable ones are reported, not refused.
 */

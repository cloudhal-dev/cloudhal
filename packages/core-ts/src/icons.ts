/**
 * `@cloudhal/core-ts/icons` (RFC-0026): the curated icon set as inline SVG strings, for themes'
 * `.astro` files and the surface renderer alike. Worker-safe constants; no request, no script.
 *
 * An icon follows the text (`1em`, `currentColor`) and is decorative unless given a label: an
 * icon-only control takes its name on the control (`aria-label`) and keeps the icon hidden.
 * Icons that point carry `data-ch-mirror`, which a theme flips under `[dir=rtl]`.
 *
 * 26c: a site picks a weight (`light`, `regular`, `bold`, `fill`; the theme setting `iconWeight`).
 * 26d: a theme may draw some or all names itself (`defineIconSet`, checked: geometry only).
 */
import { ICONS as BOLD } from "./generated/icons-bold.ts";
import { ICONS as FILL } from "./generated/icons-fill.ts";
import { ICONS as LIGHT } from "./generated/icons-light.ts";
import { ICONS as REGULAR } from "./generated/icons-regular.ts";
import {
  ICON_ALIASES,
  ICON_GROUPS,
  ICON_NAMES,
  ICON_SOURCES,
  type IconName,
  nearestIcon,
  normalizeIconName,
} from "./icon-names.ts";

export { ICON_ALIASES, ICON_GROUPS, ICON_NAMES, type IconName, nearestIcon, normalizeIconName };

export const ICON_WEIGHTS = ["light", "regular", "bold", "fill"] as const;
export type IconWeight = (typeof ICON_WEIGHTS)[number];
const BY_WEIGHT: Readonly<Record<IconWeight, typeof REGULAR>> = {
  light: LIGHT,
  regular: REGULAR,
  bold: BOLD,
  fill: FILL,
};

const NAMES = new Set<string>(ICON_NAMES);

export function isIconName(x: unknown): x is IconName {
  return typeof x === "string" && NAMES.has(x);
}

export function isIconWeight(x: unknown): x is IconWeight {
  return typeof x === "string" && (ICON_WEIGHTS as readonly string[]).includes(x);
}

/** A theme's own drawings (RFC-0026 26d), checked by `defineIconSet`. */
export interface IconSet {
  readonly [name: string]: { readonly viewBox: string; readonly body: string } | undefined;
}

export class IconSetError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`icon set is invalid:\n- ${issues.join("\n- ")}`);
    this.name = "IconSetError";
    this.issues = issues;
  }
}

/** Geometry only: shapes and groups with presentation attributes, nothing that loads or runs. */
const TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"]);
const ATTRS = new Set([
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
]);
const PAINT = /^(?:none|currentColor)$/;

/** The problems with one drawing's markup (empty when it is safe geometry). */
function checkBody(body: string): string[] {
  const out: string[] = [];
  if (body.length > 8000) out.push("at most 8,000 characters");
  const stripped = body.replace(
    /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z-]+="[^"<>]*")*)\s*(\/?)>/g,
    (_, close, tag, attrs) => {
      if (close) return "";
      if (!TAGS.has(tag)) out.push(`<${tag}> is not a shape`);
      for (const m of (attrs as string).matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
        const [, name, value] = m as unknown as [string, string, string];
        if (!ATTRS.has(name)) out.push(`${tag} ${name} is not a shape attribute`);
        else if ((name === "fill" || name === "stroke") && !PAINT.test(value))
          out.push(`${name} is none or currentColor (icons follow the text's color)`);
      }
      return "";
    },
  );
  if (stripped.trim()) out.push("text or markup outside shapes");
  return out;
}

/**
 * A theme's drawings for names of the set (all or some; the rest stay Phosphor's), checked so a
 * theme can never put markup, links, styles or scripts into pages through an icon.
 */
export function defineIconSet(
  icons: Readonly<Record<string, { viewBox: string; body: string }>>,
): IconSet {
  const issues: string[] = [];
  for (const [name, icon] of Object.entries(icons)) {
    if (!isIconName(name)) issues.push(`${name}: not a name of the set (RFC-0026)`);
    if (!/^0 0 \d{1,4}(?:\.\d+)? \d{1,4}(?:\.\d+)?$/.test(icon.viewBox))
      issues.push(`${name}: viewBox is "0 0 <width> <height>"`);
    for (const p of checkBody(icon.body)) issues.push(`${name}: ${p}`);
  }
  if (issues.length) throw new IconSetError(issues);
  return Object.freeze({ ...icons });
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface IconOptions {
  /** A meaningful icon on its own (no text next to it): `role="img"` with this name. */
  label?: string | undefined;
  /** More classes after `ch-icon` (letters, digits, `-` and `_` only). */
  className?: string | undefined;
  /** The site's weight (26c); `regular` when absent or unknown. */
  weight?: string | undefined;
  /** The theme's own drawings (26d), over the set's. */
  set?: IconSet | undefined;
}

/** The icon as an inline `<svg>`, or "" for a name outside the set. */
export function renderIcon(name: string, o: IconOptions = {}): string {
  if (!isIconName(name)) return "";
  const own = o.set?.[name];
  const base = BY_WEIGHT[isIconWeight(o.weight) ? o.weight : "regular"][name];
  const viewBox = own?.viewBox ?? base.v ?? "0 0 256 256";
  const body = own?.body ?? base.b;
  const mirror = "mirror" in ICON_SOURCES[name];
  const extra = (o.className ?? "").split(/\s+/).filter((c) => /^[A-Za-z0-9_-]{1,40}$/.test(c));
  const label = o.label?.trim();
  const a11y = label
    ? ` role="img" aria-label="${escapeAttr(label.slice(0, 120))}"`
    : ' aria-hidden="true"';
  return `<svg class="${["ch-icon", ...extra].join(" ")}" data-icon="${name}"${mirror ? " data-ch-mirror" : ""} viewBox="${viewBox}" width="1em" height="1em" fill="currentColor"${a11y} focusable="false">${body}</svg>`;
}

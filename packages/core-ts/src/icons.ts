/**
 * `@cloudhal/core-ts/icons` (RFC-0026): the curated icon set as inline SVG strings, for themes'
 * `.astro` files and the surface renderer alike. Worker-safe constants; no request, no script.
 *
 * An icon follows the text (`1em`, `currentColor`) and is decorative unless given a label: an
 * icon-only control takes its name on the control (`aria-label`) and keeps the icon hidden.
 * Icons that point carry `data-ch-mirror`, which a theme flips under `[dir=rtl]`.
 */

import { ICON_DATA } from "./generated/icons-data.ts";
import { ICON_GROUPS, ICON_NAMES, type IconName } from "./icon-names.ts";

export { ICON_GROUPS, ICON_NAMES, type IconName };

const NAMES = new Set<string>(ICON_NAMES);

export function isIconName(x: unknown): x is IconName {
  return typeof x === "string" && NAMES.has(x);
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface IconOptions {
  /** A meaningful icon on its own (no text next to it): `role="img"` with this name. */
  label?: string | undefined;
  /** More classes after `ch-icon` (letters, digits, `-` and `_` only). */
  className?: string | undefined;
}

/** The icon as an inline `<svg>`, or "" for a name outside the set. */
export function renderIcon(name: string, o: IconOptions = {}): string {
  if (!isIconName(name)) return "";
  const d = ICON_DATA[name];
  const extra = (o.className ?? "").split(/\s+/).filter((c) => /^[A-Za-z0-9_-]{1,40}$/.test(c));
  const label = o.label?.trim();
  const a11y = label
    ? ` role="img" aria-label="${escapeAttr(label.slice(0, 120))}"`
    : ' aria-hidden="true"';
  return `<svg class="${["ch-icon", ...extra].join(" ")}" data-icon="${name}"${d.m ? " data-ch-mirror" : ""} viewBox="${d.v ?? "0 0 256 256"}" width="1em" height="1em" fill="currentColor"${a11y} focusable="false">${d.b}</svg>`;
}

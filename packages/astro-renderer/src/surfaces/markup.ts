/**
 * Markup helpers the surface renderers share (RFC-0020): escaped values, allow-listed `data-*`
 * attributes, paint and ambient backgrounds, live bindings, field extras and icons. Worker-safe.
 */
import { type IconOptions, renderIcon } from "@cloudhal/core-ts/icons";
import {
  AMBIENT_KINDS,
  PARTICLE_PRESETS,
  SURFACE_STYLES,
  TONE_SURFACE,
} from "@cloudhal/core-ts/surfaces";
import { escapeHtml } from "../markdown.ts";
import type { MediaContext } from "../media.ts";
import type { SurfaceNode } from "./tree.ts";

/** What a primitive's renderer reads of its node. */
export type PrimitiveNode = Pick<SurfaceNode, "id" | "component" | "props" | "children"> &
  Partial<Pick<SurfaceNode, "raw" | "live" | "split" | "overlay" | "tip" | "priority">>;

/** Where a primitive draws: its HTML id (scoped, escaped), the surface's scope, the media. */
export interface PrimitiveContext {
  readonly id: string;
  readonly scope: string;
  readonly media?: MediaContext | undefined;
}

/** A primitive's markup around `CHILDREN`, from resolved props (escaped here). */
export type PrimitiveRenderer = (node: PrimitiveNode, ctx: PrimitiveContext) => string;

/** Where a primitive's children go in its markup. */
export const CHILDREN = "<!--ch-children-->";

export const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const attr = (name: string, v: unknown, allowed?: readonly string[]) => {
  const s = str(v);
  if (!s || (allowed && !allowed.includes(s))) return "";
  return ` data-${name}="${escapeHtml(s)}"`;
};
export const SPACE = ["none", "s", "m", "l", "xl"];
const TONE = ["surface", "muted", "brand", "inverse"];
/**
 * RFC-0023 §4: a band's or card's paint as `data-surface` (the theme draws it from the color
 * roles); an old `tone` maps to its surface and also stays as `data-tone` for themes that style it.
 */
export const paint = (p: Record<string, unknown>) => {
  const surface = str(p.surface);
  if (surface && (SURFACE_STYLES as readonly string[]).includes(surface))
    return ` data-surface="${surface}"`;
  const tone = str(p.tone);
  return tone && TONE.includes(tone)
    ? ` data-surface="${TONE_SURFACE[tone as keyof typeof TONE_SURFACE]}" data-tone="${tone}"`
    : "";
};
/**
 * RFC-0024 §4: a moving background as attributes the theme draws from the color roles, and for
 * particles the canvas the ambient module paints (hidden from assistive technology, under the
 * content). Only known values pass.
 */
export const ambientOf = (
  p: Record<string, unknown>,
  cards = false,
): { attrs: string; canvas: string } => {
  const a = p.ambient;
  if (typeof a !== "object" || a === null) return { attrs: "", canvas: "" };
  const amb = a as Record<string, unknown>;
  const kind = str(amb.kind);
  if (!(AMBIENT_KINDS as readonly string[]).includes(kind) || (cards && kind === "particles"))
    return { attrs: "", canvas: "" };
  const preset =
    kind === "particles" && (PARTICLE_PRESETS as readonly string[]).includes(str(amb.preset))
      ? str(amb.preset)
      : kind === "particles"
        ? "dots"
        : "";
  return {
    attrs: ` data-ch-ambient="${kind}"${preset ? ` data-ch-preset="${preset}"` : ""}${attr("ch-density", amb.density, ["low", "medium", "high"])}${attr("ch-colors", amb.colors, ["brand", "accent", "brand-accent", "neutral"])}${kind === "particles" && amb.interactive === true ? " data-ch-interactive" : ""}`,
    canvas: kind === "particles" ? '<canvas class="ch-ambient" aria-hidden="true"></canvas>' : "",
  };
};
/** An anchor for `#links`; never one of the ids the renderer makes itself (`ch-…`). */
export const anchor = (v: unknown) => {
  const s = str(v);
  return s && /^[a-z][a-z0-9-]{0,40}$/.test(s) && !s.startsWith("ch-") ? ` id="${s}"` : "";
};
export const ALIGN = ["start", "center", "end", "stretch"];

export const isBinding = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v) && ("path" in v || "call" in v);
export const json = (v: unknown) => escapeHtml(JSON.stringify(v));

/** A text prop: escaped, and kept live by the runtime when it is bound in a live surface. */
export function text(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live">>,
  name: string,
): string {
  const value = escapeHtml(str(node.props[name]));
  return node.live && isBinding(node.raw?.[name])
    ? `<span data-ch-text="${json(node.raw?.[name])}">${value}</span>`
    : value;
}

/** The pointer an input writes to (its `value` bound with {path}), in a live surface. */
export function model(node: Partial<Pick<SurfaceNode, "raw" | "live">>, prop = "value"): string {
  const v = node.raw?.[prop] as { path?: unknown } | undefined;
  return node.live && typeof v?.path === "string" ? ` data-ch-model="${escapeHtml(v.path)}"` : "";
}

/**
 * RFC-0022 §2: a field's help text (linked with `aria-describedby`) and its invalid state, which
 * the runtime keeps in step when `invalid` is bound or computed.
 */
export function fieldExtras(
  node: Pick<SurfaceNode, "props"> & Partial<Pick<SurfaceNode, "raw" | "live">>,
  id: string,
): { attrs: string; help: string } {
  const help = str(node.props.help);
  const raw = node.raw?.invalid;
  const invalid = node.props.invalid === true;
  return {
    attrs: `${help ? ` aria-describedby="${id}-help"` : ""}${invalid ? ' aria-invalid="true"' : ""}${
      node.live && isBinding(raw) ? ` data-ch-invalid="${json(raw)}"` : ""
    }`,
    help: help ? `<span class="ch-field__help" id="${id}-help">${escapeHtml(help)}</span>` : "",
  };
}

/** An overlay's close button (Invoker Commands; the overlay module where they are missing). */
export function closeButton(id: string, tr: boolean, media?: MediaContext): string {
  return `<button type="button" class="ch-dialog__close" command="close" commandfor="${id}" aria-label="${tr ? "Kapat" : "Close"}">${iconOf("close", media)}</button>`;
}

/** RFC-0026: an icon in the site's weight and the theme's drawings. */
export function iconOf(name: string, media?: MediaContext, o: IconOptions = {}): string {
  return renderIcon(name, { ...o, weight: media?.icons?.weight, set: media?.icons?.set });
}

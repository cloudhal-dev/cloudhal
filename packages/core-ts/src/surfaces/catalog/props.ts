/** Prop-schema building blocks for the built-in primitives: spacing, tones, icons, actions, overlays. */
import type { Localized, PropSchema, PropsSchema } from "../../blocks.ts";

// ── primitives ───────────────────────────────────────────────────────────────────────────────

/** A built-in catalog component (RFC-0020 §2): PascalCase, rendered by the theme. */
export interface PrimitiveType {
  name: string;
  title: Localized;
  description?: Localized;
  category: "layout" | "content" | "interactive";
  props: PropsSchema;
  /** `none`: a leaf; `any`: any components; a list: only those components. */
  children: "none" | "any" | readonly string[];
  example: { props: Readonly<Record<string, unknown>> };
}

export const SPACE = ["none", "s", "m", "l", "xl"] as const;
/** RFC-0026: an icon of the curated set, by name. */
export const icon = {
  type: "string" as const,
  format: "icon" as const,
  title: { en: "Icon", tr: "İkon" },
};
/** Which prop of a component names an icon (the repair maps model spellings to the set). */
export const ICON_PROPS: Readonly<Record<string, string>> = {
  Icon: "name",
  Button: "icon",
  Badge: "icon",
  Stat: "icon",
  List: "marker",
};
/** What a Button's `onClick` may do (RFC-0020 §4); Cloudhal's runtime implements each. */
export const SURFACE_ACTIONS = [
  "set",
  "toggle",
  "increment",
  "reset",
  "navigate",
  "copy",
  "share",
  "scrollTo",
  // RFC-0022 §2: add text to a string value (keypad calculators).
  "append",
  // RFC-0025 §3: open an overlay of the surface (`target`), or close one (its own, or `target`).
  "open",
  "close",
] as const;
/**
 * RFC-0025 §3: components that open over the page, in the top layer, only when the reader asks
 * (a Button's `open`, a Lightbox's thumbnails, a Tooltip's trigger): never on load or a timer.
 */
export const OVERLAY_COMPONENTS = new Set(["Dialog", "Drawer", "Popover", "Tooltip", "Lightbox"]);
/** The overlays a Button opens and closes (a Tooltip opens on interest in its trigger). */
export const OPENABLE = new Set(["Dialog", "Drawer", "Popover", "Lightbox"]);
/** The modal ones: they never open inside one another. */
export const MODAL_OVERLAYS = new Set(["Dialog", "Drawer", "Lightbox"]);
export const COMPONENT_ID = "^[a-z][a-z0-9-]{0,40}$";
/** Components whose values a reader changes: their surface loads the interaction runtime. */
export const INPUT_COMPONENTS = new Set([
  "Toggle",
  "Select",
  "Slider",
  "NumberField",
  "TextField",
  "Checkbox",
  "RadioGroup",
]);

/** RFC-0022 §2: the prop each local input writes to; it must be bound with {path}. */
export const INPUT_MODEL: Readonly<Record<string, string>> = {
  NumberField: "value",
  TextField: "value",
  Checkbox: "checked",
  RadioGroup: "value",
};
export const TONE = ["surface", "muted", "brand", "inverse"] as const;
export const ALIGN = ["start", "center", "end", "stretch"] as const;
export const space = (title: Localized) => ({ type: "string" as const, enum: SPACE, title });
export const tone = { type: "string" as const, enum: TONE, title: { en: "Tone", tr: "Ton" } };
/**
 * RFC-0023 §4: what a band or card is painted with, drawn by the theme from the color roles (never
 * by the agent). `surface` wins over `tone`, which stays for existing pages.
 */
export const SURFACE_STYLES = [
  "plain",
  "muted",
  "raised",
  "inverse",
  "brand",
  "accent",
  "gradient",
  "mesh",
  "dots",
  "grid",
  "noise",
] as const;
/** Old `tone` values as surfaces (`surface` is the page, so `plain`). */
export const TONE_SURFACE: Readonly<
  Record<(typeof TONE)[number], (typeof SURFACE_STYLES)[number]>
> = { surface: "plain", muted: "muted", brand: "brand", inverse: "inverse" };
export const surface = {
  type: "string" as const,
  enum: SURFACE_STYLES,
  title: { en: "Surface", tr: "Yüzey" },
};
/** RFC-0024 §4: a band's or card's moving background, drawn by the theme from the color roles. */
export const AMBIENT_KINDS = ["aurora", "gradient-shift", "grain", "beams", "particles"] as const;
export const PARTICLE_PRESETS = ["dots", "links", "stars", "snow", "bubbles", "fireflies"] as const;
export const ambient = (kinds: readonly string[]) => ({
  type: "object" as const,
  additionalProperties: false as const,
  required: ["kind"],
  properties: {
    kind: { type: "string" as const, enum: kinds },
    preset: { type: "string" as const, enum: PARTICLE_PRESETS },
    density: { type: "string" as const, enum: ["low", "medium", "high"] },
    colors: { type: "string" as const, enum: ["brand", "accent", "brand-accent", "neutral"] },
    interactive: { type: "boolean" as const },
  },
  title: { en: "Ambient background", tr: "Hareketli arka plan" },
});
export const align = {
  type: "string" as const,
  enum: ALIGN,
  title: { en: "Align", tr: "Hizalama" },
};
export const label = (max: number) => ({
  type: "string" as const,
  minLength: 1,
  maxLength: max,
  title: { en: "Label", tr: "Etiket" },
});
export const href = { type: "string" as const, format: "url" as const, maxLength: 2048 };
export const schema = (
  properties: Record<string, PropSchema>,
  required: readonly string[] = [],
): PropsSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

/** Cloudhal's primitives (RFC-0020 §2). Interactive ones here work without JavaScript. */

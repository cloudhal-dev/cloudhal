/**
 * This theme's design settings (RFC-0017 §1): what Studio's Appearance form, agents
 * (`get_theme_settings` / `set_theme_settings`) and the generator may change about its look.
 * The site's values live in `Site.theme.config`, are checked against this schema, and reach the
 * page as CSS variables and `data-ch-*` attributes (`themeVariables` in `layouts/Base.astro`,
 * used by `styles/global.css`). Defaults keep the starter's look.
 *
 * Keep this file data only, with type imports only (the CLI loads it on its own).
 */
import type { PropsSchema } from "@cloudhal/core-ts/blocks";

export const themeSettings: PropsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: {
      type: "string",
      format: "color",
      default: "#18181b",
      title: { en: "Brand color", tr: "Marka rengi" },
      description: { en: "Buttons and calls to action.", tr: "Butonlar ve çağrılar." },
    },
    link: {
      type: "string",
      format: "color",
      default: "#0369a1",
      title: { en: "Link color", tr: "Bağlantı rengi" },
    },
    surface: {
      type: "string",
      format: "color",
      default: "#ffffff",
      title: { en: "Background", tr: "Arka plan" },
    },
    text: {
      type: "string",
      format: "color",
      default: "#18181b",
      title: { en: "Text", tr: "Metin" },
    },
    font: {
      type: "string",
      enum: ["system", "serif", "humanist", "mono"],
      "x-labels": {
        system: { en: "System", tr: "Sistem" },
        serif: { en: "Serif", tr: "Tırnaklı" },
        humanist: { en: "Humanist", tr: "Hümanist" },
        mono: { en: "Monospace", tr: "Eş aralıklı" },
      },
      default: "system",
      "x-widget": "radio",
      title: { en: "Typeface", tr: "Yazı tipi" },
    },
    radius: {
      type: "string",
      enum: ["none", "small", "large"],
      "x-labels": {
        none: { en: "Square", tr: "Köşeli" },
        small: { en: "Slightly rounded", tr: "Hafif yuvarlak" },
        large: { en: "Rounded", tr: "Yuvarlak" },
      },
      default: "small",
      title: { en: "Corners", tr: "Köşeler" },
    },
  },
  // WCAG 2.2 AA: body text 4.5:1, links 4.5:1, buttons and other UI parts 3:1 against the page.
  "x-contrast": [
    ["text", "surface", 4.5],
    ["link", "surface", 4.5],
    ["brand", "surface", 3],
  ],
};

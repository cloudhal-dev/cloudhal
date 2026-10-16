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
    // RFC-0023 §1: one seed color and three choices; the color roles (and dark mode) follow.
    // Without a seed (and in light mode) the four colors below apply, as before.
    seed: {
      type: "string",
      format: "color",
      title: { en: "Seed color", tr: "Ana renk" },
      description: {
        en: "One color the whole palette is built from, light and dark, always readable.",
        tr: "Tüm paletin, açık ve koyu, okunaklı kalarak üretildiği tek renk.",
      },
    },
    scheme: {
      type: "string",
      enum: ["tonal", "vibrant", "neutral", "mono"],
      "x-labels": {
        tonal: { en: "Tonal", tr: "Tonlu" },
        vibrant: { en: "Vibrant", tr: "Canlı" },
        neutral: { en: "Neutral", tr: "Nötr" },
        mono: { en: "Monochrome", tr: "Tek renk" },
      },
      default: "tonal",
      "x-widget": "radio",
      title: { en: "Palette", tr: "Palet" },
    },
    contrast: {
      type: "string",
      enum: ["standard", "high"],
      "x-labels": {
        standard: { en: "Standard (AA)", tr: "Standart (AA)" },
        high: { en: "High (AAA)", tr: "Yüksek (AAA)" },
      },
      default: "standard",
      title: { en: "Contrast", tr: "Kontrast" },
    },
    mode: {
      type: "string",
      enum: ["light", "dark", "auto"],
      "x-labels": {
        light: { en: "Light", tr: "Açık" },
        dark: { en: "Dark", tr: "Koyu" },
        auto: { en: "Follow the reader", tr: "Okura göre" },
      },
      default: "light",
      "x-widget": "radio",
      title: { en: "Mode", tr: "Mod" },
    },
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
    // RFC-0023 §2: a curated font pairing (self-hosted in public/fonts) and a fluid type scale.
    // Without a pairing the typeface below applies; without a scale the sizes stay fixed.
    typePairing: {
      type: "string",
      enum: ["system", "editorial", "modern", "humanist", "technical", "classic"],
      "x-labels": {
        system: { en: "System", tr: "Sistem" },
        editorial: { en: "Editorial (Fraunces and Inter)", tr: "Editoryal (Fraunces ve Inter)" },
        modern: { en: "Modern (Space Grotesk and Inter)", tr: "Modern (Space Grotesk ve Inter)" },
        humanist: { en: "Humanist (Source Sans)", tr: "Hümanist (Source Sans)" },
        technical: {
          en: "Technical (JetBrains Mono and Inter)",
          tr: "Teknik (JetBrains Mono ve Inter)",
        },
        classic: { en: "Classic (Source Serif)", tr: "Klasik (Source Serif)" },
      },
      default: "system",
      title: { en: "Font pairing", tr: "Yazı tipi eşleşmesi" },
      description: {
        en: "Headings and text set in fonts that go together. System uses the typeface below.",
        tr: "Başlıklar ve metin birbirine uyan yazı tipleriyle. Sistem, aşağıdaki yazı tipini kullanır.",
      },
    },
    typeScale: {
      type: "string",
      enum: ["compact", "balanced", "dramatic"],
      "x-labels": {
        compact: { en: "Compact", tr: "Sıkı" },
        balanced: { en: "Balanced", tr: "Dengeli" },
        dramatic: { en: "Dramatic", tr: "Çarpıcı" },
      },
      "x-widget": "radio",
      title: { en: "Type scale", tr: "Yazı ölçeği" },
      description: {
        en: "How much bigger headings are than text; sizes adapt to the screen.",
        tr: "Başlıkların metinden ne kadar büyük olduğu; boyutlar ekrana uyar.",
      },
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

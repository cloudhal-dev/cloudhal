/**
 * English `appearanceColors.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): the
 * color roles under site settings' Appearance form (RFC-0023), loaded with the preview.
 * The source of truth for its keys; `appearanceColors.tr.ts` is typed against it.
 */
export const messages = {
  appearanceColors: {
    preview: "Color roles",
    light: "Light",
    dark: "Dark",
    heading: "A headline",
    body: "Body text reads like this, with a",
    link: "link",
    button: "Button",
    accent: "New",
    notes: "Adjusted for contrast",
    legacy:
      "These colors come from the theme's color fields. Pick a seed color to get a full palette with dark mode, checked for contrast.",
    lightened: "lightened",
    darkened: "darkened",
    repairPair: "{scheme}: {role} {direction} {steps} step(s) to read on {against} ({ratio}:1)",
    repairFill: "{scheme}: {role} {direction} {steps} step(s) so {against} reads on it ({ratio}:1)",
    roles: {
      surface: "Page",
      "surface-muted": "Muted surface",
      "surface-raised": "Raised surface",
      "surface-inverse": "Inverse surface",
      text: "Text",
      "text-muted": "Muted text",
      "text-subtle": "Subtle text",
      "text-inverse": "Inverse text",
      border: "Border",
      "border-strong": "Strong border",
      brand: "Brand",
      "on-brand": "Text on brand",
      accent: "Accent",
      "on-accent": "Text on accent",
      link: "Link",
      focus: "Focus ring",
      gradient: "Gradient end",
    },
  },
} as const;

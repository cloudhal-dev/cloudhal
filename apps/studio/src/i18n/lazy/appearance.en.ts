/**
 * English `appearance.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): the words of
 * site settings' Appearance group that load with the settings route — the color roles under the
 * Appearance form (RFC-0023) and the Header and footer section (`chrome`, RFC-0025).
 * The source of truth for its keys; `appearance.tr.ts` is typed against it.
 */
export const messages = {
  appearance: {
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
    chrome: {
      bars: "Bars",
      announcement: "Announcement",
      consent: "Privacy bar",
      title: "Header and footer",
      description:
        "The logo, the header and the footer every page shows. A page can hide them or make the header transparent over its first band.",
      brand: "Brand",
      header: "Header",
      footer: "Footer",
      chooseLogo: "Choose image",
      replaceLogo: "Replace",
      removeLogo: "Remove",
      noLogo: "No image: the site's name shows as text.",
      menus: "Menus you can name: {menus}.",
      saved: "Header and footer saved",
      failed: "The header and footer could not be saved",
      menusPublish: "Menus you can name: {menus}. Changes show on the site after the next publish.",
    },
  },
} as const;

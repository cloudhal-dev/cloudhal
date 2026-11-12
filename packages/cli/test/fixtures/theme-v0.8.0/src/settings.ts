/**
 * This theme's design settings (RFC-0017 §1): what Studio's Appearance form, agents
 * (`get_theme_settings` / `set_theme_settings`) and the generator may change about its look.
 * The site's values live in `Site.theme.config`, are checked against this schema, and reach the
 * page as CSS variables and `data-ch-*` attributes (`themeVariables` in `layouts/Base.astro`,
 * used by `styles/features/*.css`). Defaults keep the starter's look.
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
    // RFC-0023 §3: corners for buttons, fields, cards and bands, and how much room things get.
    radius: {
      type: "string",
      enum: ["none", "small", "medium", "large", "full"],
      "x-labels": {
        none: { en: "Square", tr: "Köşeli" },
        small: { en: "Slightly rounded", tr: "Hafif yuvarlak" },
        medium: { en: "Medium", tr: "Orta" },
        large: { en: "Rounded", tr: "Yuvarlak" },
        full: { en: "Pill buttons", tr: "Hap düğmeler" },
      },
      default: "small",
      title: { en: "Corners", tr: "Köşeler" },
    },
    density: {
      type: "string",
      enum: ["compact", "cozy", "airy"],
      "x-labels": {
        compact: { en: "Compact", tr: "Sıkı" },
        cozy: { en: "Cozy", tr: "Rahat" },
        airy: { en: "Airy", tr: "Ferah" },
      },
      default: "cozy",
      "x-widget": "radio",
      title: { en: "Spacing", tr: "Boşluk" },
      description: {
        en: "How much room sections, cards and buttons get.",
        tr: "Bölümlerin, kartların ve düğmelerin ne kadar yer kapladığı.",
      },
    },
    // RFC-0024 §1: how much the site moves; a page can set its own level, and readers who ask for
    // reduced motion always get less.
    motion: {
      type: "string",
      enum: ["none", "subtle", "standard", "expressive"],
      "x-labels": {
        none: { en: "Still", tr: "Durağan" },
        subtle: { en: "Subtle", tr: "İnce" },
        standard: { en: "Standard", tr: "Standart" },
        expressive: { en: "Expressive", tr: "Etkileyici" },
      },
      default: "none",
      "x-widget": "radio",
      title: { en: "Motion", tr: "Hareket" },
      description: {
        en: "How much sections move as people scroll and point. Readers who ask for reduced motion always see less.",
        tr: "Bölümlerin kaydırırken ve üzerine gelirken ne kadar hareket ettiği. Daha az hareket isteyen okurlar her zaman daha azını görür.",
      },
    },
    // RFC-0024 §5: how one page gives way to the next.
    pageTransition: {
      type: "string",
      enum: ["none", "crossfade", "slide", "morph"],
      "x-labels": {
        none: { en: "None", tr: "Yok" },
        crossfade: { en: "Crossfade", tr: "Geçişli solma" },
        slide: { en: "Slide", tr: "Kaydırma" },
        morph: { en: "Morph shared parts", tr: "Ortak öğeleri dönüştür" },
      },
      default: "none",
      "x-widget": "radio",
      title: { en: "Page transition", tr: "Sayfa geçişi" },
      description: {
        en: "How one page gives way to the next, in browsers that support it.",
        tr: "Bir sayfanın diğerine nasıl geçtiği (destekleyen tarayıcılarda).",
      },
    },
    // RFC-0026 26c: how heavy the site's icons are drawn.
    iconWeight: {
      type: "string",
      enum: ["light", "regular", "bold", "fill"],
      "x-labels": {
        light: { en: "Light", tr: "İnce" },
        regular: { en: "Regular", tr: "Normal" },
        bold: { en: "Bold", tr: "Kalın" },
        fill: { en: "Filled", tr: "Dolu" },
      },
      default: "regular",
      "x-widget": "radio",
      title: { en: "Icons", tr: "İkonlar" },
      description: {
        en: "Light suits airy, editorial sites; bold and filled read better small and on busy pages.",
        tr: "İnce, ferah ve editoryal sitelere uyar; kalın ve dolu, küçük boyutta ve kalabalık sayfalarda daha iyi okunur.",
      },
    },
    // RFC-0033 §4a: the theme's own words in a language it does not ship, or worded otherwise.
    strings: {
      type: "array",
      maxItems: 50,
      title: { en: "Theme words", tr: "Tema metinleri" },
      description: {
        en: "The theme's own words (notices, buttons, labels) in a language, over the theme's: one item per language. Agents can draft them; people review.",
        tr: "Temanın kendi metinleri (bildirimler, düğmeler, etiketler), bir dilde, temanınkilerin yerine: her dil için bir öğe. Agent'lar taslak hazırlayabilir; kişiler gözden geçirir.",
      },
      items: {
        type: "object",
        additionalProperties: false,
        required: ["locale"],
        properties: {
          locale: { type: "string", maxLength: 35, title: { en: "Language", tr: "Dil" } },
          machineTranslated: {
            type: "string",
            maxLength: 300,
            title: { en: "Machine translation notice", tr: "Makine çevirisi notu" },
          },
          machineReviewed: {
            type: "string",
            maxLength: 300,
            title: { en: "Reviewed translation notice", tr: "İncelenmiş çeviri notu" },
          },
          readOriginal: {
            type: "string",
            maxLength: 300,
            title: { en: "Read the original", tr: "Orijinalini oku" },
          },
          notTranslated: {
            type: "string",
            maxLength: 300,
            title: { en: "Not translated notice", tr: "Çevrilmemiş sayfa notu" },
          },
          languages: { type: "string", maxLength: 300, title: { en: "Languages", tr: "Diller" } },
          home: { type: "string", maxLength: 300, title: { en: "Home", tr: "Ana sayfa" } },
          menu: { type: "string", maxLength: 300, title: { en: "Menu", tr: "Menü" } },
          search: { type: "string", maxLength: 300, title: { en: "Search", tr: "Ara" } },
          searchLabel: {
            type: "string",
            maxLength: 300,
            title: { en: "Search label", tr: "Arama etiketi" },
          },
          searchPlaceholder: {
            type: "string",
            maxLength: 300,
            title: { en: "Search placeholder", tr: "Arama ipucu" },
          },
          related: {
            type: "string",
            maxLength: 300,
            title: { en: "Related posts", tr: "İlgili yazılar" },
          },
          skipToContent: {
            type: "string",
            maxLength: 300,
            title: { en: "Skip to content", tr: "İçeriğe geç" },
          },
          notFoundTitle: {
            type: "string",
            maxLength: 300,
            title: { en: "Not found: title", tr: "Bulunamadı: başlık" },
          },
          notFoundText: {
            type: "string",
            maxLength: 300,
            title: { en: "Not found: text", tr: "Bulunamadı: metin" },
          },
          notFoundHome: {
            type: "string",
            maxLength: 300,
            title: { en: "Not found: home link", tr: "Bulunamadı: ana sayfa bağlantısı" },
          },
          notFoundSearch: {
            type: "string",
            maxLength: 300,
            title: { en: "Not found: search prompt", tr: "Bulunamadı: arama çağrısı" },
          },
        },
      },
    },
  },
  // WCAG 2.2 AA: body text 4.5:1, links 4.5:1, buttons and other UI parts 3:1 against the page.
  "x-contrast": [
    ["text", "surface", 4.5],
    ["link", "surface", 4.5],
    ["brand", "surface", 3],
  ],
};

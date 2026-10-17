/** Content primitives: Heading … List. */
import {
  align,
  COMPONENT_ID,
  href,
  icon,
  label,
  type PrimitiveType,
  SURFACE_ACTIONS,
  schema,
} from "./props.ts";

export const CONTENT_PRIMITIVES: readonly PrimitiveType[] = [
  {
    name: "Heading",
    title: { en: "Heading", tr: "Başlık" },
    category: "content",
    props: schema(
      {
        text: { type: "string", minLength: 1, maxLength: 300 },
        level: { type: "integer", minimum: 1, maximum: 4 },
        align,
        // RFC-0024 24c: a highlighted phrase (*between asterisks*, else the last word), the text
        // in the brand gradient, or words that take turns where {words} stands.
        effect: { type: "string", enum: ["highlight", "gradient-text", "rotate-words"] },
        words: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: { type: "string", minLength: 1, maxLength: 40 },
        },
      },
      ["text"],
    ),
    children: "none",
    example: { props: { text: "Plans for every team", level: 2 } },
  },
  {
    name: "Text",
    title: { en: "Text", tr: "Metin" },
    description: { en: "A paragraph; inline markdown.", tr: "Bir paragraf." },
    category: "content",
    props: schema(
      {
        text: { type: "string", format: "markdown", minLength: 1, maxLength: 4000 },
        size: { type: "string", enum: ["s", "m", "l"] },
        muted: { type: "boolean" },
        align,
      },
      ["text"],
    ),
    children: "none",
    example: { props: { text: "Start free, upgrade when you grow.", size: "l" } },
  },
  {
    name: "Markdown",
    title: { en: "Markdown", tr: "Markdown" },
    description: { en: "Longer text with headings and lists.", tr: "Uzun metin." },
    category: "content",
    props: schema({ content: { type: "string", format: "markdown", minLength: 1 } }, ["content"]),
    children: "none",
    example: { props: { content: "## Why\n\n- Fast\n- Safe" } },
  },
  {
    name: "Image",
    title: { en: "Image", tr: "Görsel" },
    description: {
      en: "An image from the media library. fit (RFC-0028), when its shape differs from the frame: cover fills it (the default, cropped around the asset's focal point); blur-fill shows it whole with the sides filled by itself blurred (portraits in wide frames, galleries); color-fill shows it whole on its own colour (logos, transparent images); contain shows it whole on the page (screenshots); natural drops the frame.",
      tr: "Medya kitaplığından görsel. fit: cover çerçeveyi doldurur; blur-fill bütün gösterir, kenarları bulanık; color-fill kendi rengi üstünde; contain sayfa üstünde; natural çerçevesiz.",
    },
    category: "content",
    props: schema(
      {
        asset: { type: "string", format: "asset" },
        alt: { type: "string", maxLength: 300 },
        caption: { type: "string", maxLength: 300 },
        ratio: { type: "string", enum: ["auto", "16:9", "4:3", "1:1", "3:4"] },
        fit: { type: "string", enum: ["cover", "contain", "blur-fill", "color-fill", "natural"] },
      },
      ["asset"],
    ),
    children: "none",
    example: { props: { asset: "asset:ast_example01", alt: "", ratio: "16:9" } },
  },
  {
    name: "Button",
    title: { en: "Button", tr: "Düğme" },
    description: {
      en: "A link (href), or an action on the surface's data (onClick).",
      tr: "Bir bağlantı (href) ya da verideki bir işlem (onClick).",
    },
    category: "content",
    props: schema(
      {
        label: label(60),
        href,
        variant: { type: "string", enum: ["primary", "secondary", "ghost"] },
        icon,
        iconPosition: { type: "string", enum: ["start", "end"] },
        onClick: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: { type: "string", enum: SURFACE_ACTIONS },
            path: { type: "string", pattern: "^/[^\\s]{0,199}$" },
            value: { type: "string", maxLength: 500 },
            by: { type: "number", minimum: -1000000, maximum: 1000000 },
            href: { type: "string", format: "url", maxLength: 2048 },
            anchor: { type: "string", pattern: "^[a-z][a-z0-9-]{0,40}$" },
            target: { type: "string", pattern: COMPONENT_ID },
          },
        },
      },
      ["label"],
    ),
    children: "none",
    example: { props: { label: "Get started", href: "/start", variant: "primary" } },
  },
  {
    name: "Link",
    title: { en: "Link", tr: "Bağlantı" },
    category: "content",
    props: schema({ label: label(120), href }, ["label", "href"]),
    children: "none",
    example: { props: { label: "Read the guide", href: "/guide" } },
  },
  {
    name: "Badge",
    title: { en: "Badge", tr: "Rozet" },
    category: "content",
    props: schema(
      {
        label: label(40),
        tone: { type: "string", enum: ["neutral", "info", "success", "warning", "danger"] },
        icon,
      },
      ["label"],
    ),
    children: "none",
    example: { props: { label: "New", tone: "info" } },
  },
  {
    name: "Stat",
    title: { en: "Statistic", tr: "İstatistik" },
    description: { en: "A big number with a label.", tr: "Etiketli büyük bir sayı." },
    category: "content",
    props: schema(
      {
        value: { type: "string", minLength: 1, maxLength: 40 },
        label: label(80),
        detail: { type: "string", maxLength: 160 },
        icon,
      },
      ["value", "label"],
    ),
    children: "none",
    example: { props: { value: "99.9%", label: "Uptime" } },
  },
  // RFC-0026: an icon on its own (next to text it is decorative; alone it needs a label).
  {
    name: "Icon",
    title: { en: "Icon", tr: "İkon" },
    description: {
      en: "An icon of the curated set, by name. Next to text it is decoration; on its own, give it a label.",
      tr: "Seçili setten bir ikon. Metnin yanında süstür; tek başınaysa etiket verin.",
    },
    category: "content",
    props: schema(
      {
        name: icon,
        label: label(60),
        size: { type: "string", enum: ["s", "m", "l", "xl"] },
        tone: {
          type: "string",
          enum: ["neutral", "brand", "accent", "success", "warning", "danger"],
        },
      },
      ["name"],
    ),
    children: "none",
    example: { props: { name: "check", size: "m", tone: "brand" } },
  },
  {
    name: "Quote",
    title: { en: "Quote", tr: "Alıntı" },
    category: "content",
    props: schema(
      {
        text: { type: "string", format: "markdown", minLength: 1, maxLength: 2000 },
        cite: { type: "string", maxLength: 120 },
        role: { type: "string", maxLength: 120 },
      },
      ["text"],
    ),
    children: "none",
    example: { props: { text: "It just works.", cite: "Ayşe Yılmaz", role: "Editor" } },
  },
  {
    name: "List",
    title: { en: "List", tr: "Liste" },
    category: "content",
    props: schema(
      {
        items: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 500 },
          minItems: 1,
          maxItems: 50,
        },
        ordered: { type: "boolean" },
        // RFC-0026: any icon of the set as the bullet (decorative), besides a dot or none.
        marker: { type: "string", format: "marker" },
      },
      ["items"],
    ),
    children: "none",
    example: { props: { items: ["Unlimited pages", "Agent access"], marker: "check" } },
  },
];

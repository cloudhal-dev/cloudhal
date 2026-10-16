/**
 * Generative UI surfaces (RFC-0020): the catalog a surface may use, the checks the store and the
 * build pipeline run on it, bindings and named functions, deterministic repairs, RFC 6902 patches
 * and the model prompt generated from the catalog. Data only, no `eval`: Worker-safe.
 */
import type { Page, Section, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import {
  BLOCK_LIMITS,
  type BlockRegistry,
  type BlockType,
  createBlockRegistry,
  defineBlockTypes,
  type Localized,
  localized,
  type PropSchema,
  type PropsIssue,
  type PropsSchema,
  sectionSchema,
  validateProps,
} from "./blocks.ts";
import { parseFilter } from "./filter.ts";
import { ICON_GROUPS, isIconNameValue, nearestIcon } from "./icon-names.ts";

// ── limits ───────────────────────────────────────────────────────────────────────────────────

/** RFC-0020 §1 and §Security. */
export const SURFACE_LIMITS = {
  components: 200,
  depth: 8,
  dataBytes: 65_536,
  surfacesPerPage: 30,
  pointerLength: 200,
  pointerSegments: 16,
  conditionDepth: 4,
  conditionItems: 10,
  functionArgs: 8,
  listArgItems: 20,
  /** RFC-0022 §1: calls nest at most this deep, and a surface holds at most this many. */
  callDepth: 8,
  callsPerSurface: 500,
  /** Items `sum`, `average` and `count` read from a list in the data. */
  aggregateItems: 1_000,
  /** Characters in a `calculate` expression. */
  expressionLength: 200,
  /** Keys in a `choose` call's `cases`. */
  chooseCases: 20,
  opsPerCall: 500,
  sourceLimit: 50,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isScalar = (v: unknown) =>
  v === null || typeof v === "string" || typeof v === "boolean" || Number.isFinite(v);

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

const SPACE = ["none", "s", "m", "l", "xl"] as const;
/** RFC-0026: an icon of the curated set, by name. */
const icon = {
  type: "string" as const,
  format: "icon" as const,
  title: { en: "Icon", tr: "İkon" },
};
/** Which prop of a component names an icon (the repair maps model spellings to the set). */
const ICON_PROPS: Readonly<Record<string, string>> = {
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
const OPENABLE = new Set(["Dialog", "Drawer", "Popover", "Lightbox"]);
/** The modal ones: they never open inside one another. */
const MODAL_OVERLAYS = new Set(["Dialog", "Drawer", "Lightbox"]);
const COMPONENT_ID = "^[a-z][a-z0-9-]{0,40}$";
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
const TONE = ["surface", "muted", "brand", "inverse"] as const;
const ALIGN = ["start", "center", "end", "stretch"] as const;
const space = (title: Localized) => ({ type: "string" as const, enum: SPACE, title });
const tone = { type: "string" as const, enum: TONE, title: { en: "Tone", tr: "Ton" } };
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
const surface = {
  type: "string" as const,
  enum: SURFACE_STYLES,
  title: { en: "Surface", tr: "Yüzey" },
};
/** RFC-0024 §4: a band's or card's moving background, drawn by the theme from the color roles. */
export const AMBIENT_KINDS = ["aurora", "gradient-shift", "grain", "beams", "particles"] as const;
export const PARTICLE_PRESETS = ["dots", "links", "stars", "snow", "bubbles", "fireflies"] as const;
const ambient = (kinds: readonly string[]) => ({
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
const align = { type: "string" as const, enum: ALIGN, title: { en: "Align", tr: "Hizalama" } };
const label = (max: number) => ({
  type: "string" as const,
  minLength: 1,
  maxLength: max,
  title: { en: "Label", tr: "Etiket" },
});
const href = { type: "string" as const, format: "url" as const, maxLength: 2048 };
const schema = (
  properties: Record<string, PropSchema>,
  required: readonly string[] = [],
): PropsSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

/** Cloudhal's primitives (RFC-0020 §2). Interactive ones here work without JavaScript. */
export const PRIMITIVES: readonly PrimitiveType[] = [
  {
    name: "Stack",
    title: { en: "Stack", tr: "Yığın" },
    description: { en: "Children one under another.", tr: "Alt alta öğeler." },
    category: "layout",
    props: schema({ gap: space({ en: "Gap", tr: "Boşluk" }), align }),
    children: "any",
    example: { props: { gap: "m" } },
  },
  {
    name: "Row",
    title: { en: "Row", tr: "Satır" },
    description: { en: "Children side by side; wraps on small screens.", tr: "Yan yana öğeler." },
    category: "layout",
    props: schema({
      gap: space({ en: "Gap", tr: "Boşluk" }),
      align,
      justify: { type: "string", enum: ["start", "center", "end", "between"] },
      wrap: { type: "boolean" },
    }),
    children: "any",
    example: { props: { gap: "s", justify: "start", wrap: true } },
  },
  {
    name: "Grid",
    title: { en: "Grid", tr: "Izgara" },
    description: {
      en: "Children in equal columns (fewer on small screens).",
      tr: "Eşit sütunlarda öğeler.",
    },
    category: "layout",
    props: schema({
      columns: { type: "integer", minimum: 1, maximum: 6 },
      gap: space({ en: "Gap", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { columns: 3, gap: "m" } },
  },
  {
    name: "Columns",
    title: { en: "Columns", tr: "Sütunlar" },
    description: { en: "Each child is a column, sized by the ratio.", tr: "Her öğe bir sütun." },
    category: "layout",
    props: schema({
      ratio: { type: "string", enum: ["1-1", "2-1", "1-2", "1-1-1", "1-2-1"] },
      gap: space({ en: "Gap", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { ratio: "2-1", gap: "l" } },
  },
  {
    name: "Band",
    title: { en: "Band", tr: "Bant" },
    description: {
      en: "A full-width band with a surface: the building block of landing pages. `anchor` lets a link jump to it (#anchor).",
      tr: "Yüzeyli, tam genişlikte bir bant; `anchor` ile bağlantı verilebilir.",
    },
    category: "layout",
    props: schema({
      surface,
      tone,
      ambient: ambient(AMBIENT_KINDS),
      anchor: {
        type: "string",
        pattern: "^[a-z][a-z0-9-]{0,40}$",
        title: { en: "Anchor", tr: "Çapa" },
      },
      width: { type: "string", enum: ["narrow", "wide", "full"] },
      spacing: space({ en: "Spacing", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { surface: "muted", width: "wide", spacing: "xl", anchor: "features" } },
  },
  {
    name: "Card",
    title: { en: "Card", tr: "Kart" },
    description: { en: "A framed group; a link when `href` is set.", tr: "Çerçeveli bir grup." },
    category: "layout",
    // Cards take the CSS kinds only: particles belong to bands.
    props: schema({
      surface,
      tone,
      href,
      ambient: ambient(AMBIENT_KINDS.filter((k) => k !== "particles")),
    }),
    children: "any",
    example: { props: { surface: "raised" } },
  },
  {
    name: "Spacer",
    title: { en: "Spacer", tr: "Boşluk" },
    category: "layout",
    props: schema({ size: space({ en: "Size", tr: "Boyut" }) }),
    children: "none",
    example: { props: { size: "l" } },
  },
  {
    name: "Divider",
    title: { en: "Divider", tr: "Ayraç" },
    category: "layout",
    props: schema({}),
    children: "none",
    example: { props: {} },
  },
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
    description: { en: "An image from the media library.", tr: "Medya kitaplığından görsel." },
    category: "content",
    props: schema(
      {
        asset: { type: "string", format: "asset" },
        alt: { type: "string", maxLength: 300 },
        caption: { type: "string", maxLength: 300 },
        ratio: { type: "string", enum: ["auto", "16:9", "4:3", "1:1", "3:4"] },
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
  {
    name: "Toggle",
    title: { en: "Toggle", tr: "Seçici" },
    description: {
      en: "A row of choices; the chosen one is written to `value`'s path (bind it: {path}).",
      tr: "Seçenekler; seçilen, value'nun yoluna yazılır.",
    },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        options: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 60 },
          minItems: 2,
          maxItems: 8,
        },
        value: { type: "string", maxLength: 60 },
      },
      ["options", "value"],
    ),
    children: "none",
    example: { props: { label: "Billing", options: ["monthly", "yearly"], value: "monthly" } },
  },
  {
    name: "Select",
    title: { en: "Select", tr: "Açılır liste" },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        options: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
          minItems: 1,
          maxItems: 50,
        },
        value: { type: "string", maxLength: 80 },
      },
      ["label", "options", "value"],
    ),
    children: "none",
    example: { props: { label: "Team size", options: ["1–5", "6–20", "21+"], value: "1–5" } },
  },
  {
    name: "Slider",
    title: { en: "Slider", tr: "Kaydırıcı" },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        min: { type: "number" },
        max: { type: "number" },
        step: { type: "number", minimum: 0 },
        value: { type: "number" },
      },
      ["label", "min", "max", "value"],
    ),
    children: "none",
    example: { props: { label: "Seats", min: 1, max: 50, step: 1, value: 5 } },
  },
  // RFC-0022 §3: a chart drawn as SVG on the server, with its numbers as a table.
  {
    name: "Chart",
    title: { en: "Chart", tr: "Grafik" },
    description: {
      en: "Bar, line, area or donut chart of rows in the surface's data: data {path} to a list of objects, x the category field, series the number fields.",
      tr: "Yüzey verisindeki satırların çubuk, çizgi, alan veya halka grafiği.",
    },
    category: "content",
    props: schema(
      {
        kind: { type: "string", enum: ["bar", "line", "area", "donut"] },
        title: label(120),
        data: { type: "array", items: { type: "string" }, maxItems: 50 },
        x: { type: "string", minLength: 1, maxLength: 60 },
        series: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field"],
            properties: {
              field: { type: "string", minLength: 1, maxLength: 60 },
              label: { type: "string", maxLength: 60 },
            },
          },
        },
        unit: { type: "string", maxLength: 20 },
        stacked: { type: "boolean" },
        height: { type: "string", enum: ["s", "m", "l"] },
        caption: { type: "string", maxLength: 300 },
      },
      ["title", "data", "x", "series"],
    ),
    children: "none",
    example: {
      props: {
        kind: "bar",
        title: "Readers per month",
        data: { path: "/months" },
        x: "month",
        series: [{ field: "readers", label: "Readers" }],
      },
    },
  },
  // RFC-0022 §4: a real table; rows stack into cards on small screens.
  {
    name: "Table",
    title: { en: "Table", tr: "Tablo" },
    description: {
      en: "Rows of the surface's data as a table: rows {path} to a list of objects, columns the fields to show. On phones each row becomes a card.",
      tr: "Yüzey verisindeki satırlar tablo olarak; telefonda her satır bir karta dönüşür.",
    },
    category: "content",
    props: schema(
      {
        caption: label(160),
        rows: { type: "array", items: { type: "string" }, maxItems: 50 },
        columns: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "label"],
            properties: {
              field: { type: "string", minLength: 1, maxLength: 60 },
              label: { type: "string", minLength: 1, maxLength: 60 },
              align: { type: "string", enum: ["start", "end"] },
              format: { type: "string", enum: ["text", "number", "currency", "percent", "date"] },
              currency: { type: "string", pattern: "^[A-Z]{3}$" },
              digits: { type: "integer", minimum: 0, maximum: 6 },
            },
          },
        },
        highlight: {
          type: "object",
          additionalProperties: false,
          required: ["field", "equals"],
          properties: {
            field: { type: "string", minLength: 1, maxLength: 60 },
            equals: { type: "string", maxLength: 120 },
          },
        },
        striped: { type: "boolean" },
      },
      ["caption", "rows", "columns"],
    ),
    children: "none",
    example: {
      props: {
        caption: "Plans compared",
        rows: { path: "/plans" },
        columns: [
          { field: "name", label: "Plan" },
          { field: "price", label: "Price", align: "end", format: "currency", currency: "USD" },
        ],
        highlight: { field: "name", equals: "Pro" },
      },
    },
  },
  // RFC-0022 §2: local inputs. They write only to the surface's data, in the reader's browser.
  {
    name: "NumberField",
    title: { en: "Number field", tr: "Sayı alanı" },
    description: {
      en: "A number the reader types; bind value: {path}. Nothing is sent anywhere.",
      tr: "Okurun yazdığı sayı; value'yu {path} ile bağlayın. Hiçbir yere gönderilmez.",
    },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        value: { type: "number" },
        min: { type: "number" },
        max: { type: "number" },
        step: { type: "number", minimum: 0 },
        unit: { type: "string", maxLength: 20 },
        placeholder: { type: "string", maxLength: 60 },
        help: { type: "string", maxLength: 200 },
        invalid: { type: "boolean" },
      },
      ["label", "value"],
    ),
    children: "none",
    example: {
      props: { label: "Weight", value: { path: "/weight" }, min: 30, max: 250, unit: "kg" },
    },
  },
  {
    name: "TextField",
    title: { en: "Text field", tr: "Metin alanı" },
    description: {
      en: "One line of text the reader types; bind value: {path}. Nothing is sent anywhere.",
      tr: "Okurun yazdığı tek satır; value'yu {path} ile bağlayın. Hiçbir yere gönderilmez.",
    },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        value: { type: "string", maxLength: 500 },
        placeholder: { type: "string", maxLength: 60 },
        maxLength: { type: "integer", minimum: 1, maximum: 500 },
        kind: { type: "string", enum: ["text", "email"] },
        help: { type: "string", maxLength: 200 },
        invalid: { type: "boolean" },
      },
      ["label", "value"],
    ),
    children: "none",
    example: { props: { label: "Your name", value: { path: "/name" }, placeholder: "Ada" } },
  },
  {
    name: "Checkbox",
    title: { en: "Checkbox", tr: "Onay kutusu" },
    description: {
      en: "A yes/no the reader ticks; bind checked: {path}.",
      tr: "Okurun işaretlediği evet/hayır; checked'i {path} ile bağlayın.",
    },
    category: "interactive",
    props: schema({ label: label(120), checked: { type: "boolean" } }, ["label", "checked"]),
    children: "none",
    example: { props: { label: "Include VAT", checked: { path: "/vat" } } },
  },
  {
    name: "RadioGroup",
    title: { en: "Radio group", tr: "Seçenek grubu" },
    description: {
      en: "One choice from a few labelled options; bind value: {path}. variant buttons is a segmented control.",
      tr: "Birkaç etiketli seçenekten biri; value'yu {path} ile bağlayın. variant buttons bölümlü düğmelerdir.",
    },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        value: { type: "string", maxLength: 60 },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["value", "label"],
            properties: {
              value: { type: "string", minLength: 1, maxLength: 60 },
              label: { type: "string", minLength: 1, maxLength: 60 },
            },
          },
        },
        variant: { type: "string", enum: ["list", "buttons"] },
        help: { type: "string", maxLength: 200 },
      },
      ["label", "value", "options"],
    ),
    children: "none",
    example: {
      props: {
        label: "Activity",
        value: { path: "/activity" },
        variant: "buttons",
        options: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
      },
    },
  },
  {
    name: "Tabs",
    title: { en: "Tabs", tr: "Sekmeler" },
    description: {
      en: "One panel shown at a time; works without JavaScript.",
      tr: "Bir seferde bir panel.",
    },
    category: "interactive",
    props: schema({}),
    children: ["TabPanel"],
    example: { props: {} },
  },
  {
    name: "TabPanel",
    title: { en: "Tab", tr: "Sekme" },
    category: "interactive",
    props: schema({ label: label(60) }, ["label"]),
    children: "any",
    example: { props: { label: "Monthly" } },
  },
  {
    name: "Accordion",
    title: { en: "Accordion", tr: "Akordeon" },
    category: "interactive",
    props: schema({}),
    children: ["Disclosure"],
    example: { props: {} },
  },
  {
    name: "Disclosure",
    title: { en: "Disclosure", tr: "Açılır bölüm" },
    description: { en: "A summary that opens to show its children.", tr: "Açılan bir özet." },
    category: "interactive",
    props: schema({ summary: label(200), open: { type: "boolean" } }, ["summary"]),
    children: "any",
    example: { props: { summary: "Can I cancel any time?" } },
  },
  // RFC-0024 §3: scroll storytelling and progress.
  {
    name: "Scrolly",
    title: { en: "Scroll story", tr: "Kaydırmalı anlatım" },
    description: {
      en: "Scroll storytelling: the first child (a chart, a stat, an image) stays in view while the Step children scroll past, and the step being read is written to `step` (a binding), so the first child can change with it through `visible` conditions or `choose`.",
      tr: "Kaydırmalı anlatım: ilk öğe görünür kalır, Step'ler kayarken okunan adımın numarası `step` yoluna yazılır.",
    },
    category: "interactive",
    props: schema(
      {
        step: {
          type: "object",
          additionalProperties: false,
          required: ["path"],
          properties: { path: { type: "string", pattern: "^/[^\\s]{0,199}$" } },
          title: { en: "Step number", tr: "Adım numarası" },
        },
        side: { type: "string", enum: ["start", "end"] },
        ratio: { type: "string", enum: ["1-1", "2-1", "1-2"] },
      },
      ["step"],
    ),
    children: "any",
    example: { props: { step: { path: "/step" }, side: "start", ratio: "1-1" } },
  },
  {
    name: "Step",
    title: { en: "Step", tr: "Adım" },
    description: {
      en: "One step of a scroll story (inside Scrolly).",
      tr: "Kaydırmalı anlatımın bir adımı.",
    },
    category: "interactive",
    props: schema({}),
    children: "any",
    example: { props: {} },
  },
  {
    name: "ScrollProgress",
    title: { en: "Scroll progress", tr: "Okuma ilerlemesi" },
    description: {
      en: "A thin bar showing how far the reader is through the page (placement page) or this section.",
      tr: "Okurun sayfada ya da bu bölümde ne kadar ilerlediğini gösteren ince çubuk.",
    },
    category: "content",
    props: schema({
      placement: { type: "string", enum: ["page", "section"] },
      tone: { type: "string", enum: ["brand", "accent", "neutral"] },
    }),
    children: "none",
    example: { props: { placement: "page", tone: "brand" } },
  },
  // RFC-0024 §3: moving rows and counting numbers.
  {
    name: "Marquee",
    title: { en: "Marquee", tr: "Kayan şerit" },
    description: {
      en: "A row that scrolls by itself (logos, quotes, tags); at least 3 children. Readers can pause it; at low motion levels it is a still row.",
      tr: "Kendiliğinden kayan bir sıra (logolar, alıntılar); en az 3 öğe.",
    },
    category: "layout",
    props: schema({
      speed: { type: "string", enum: ["slow", "normal", "fast"] },
      direction: { type: "string", enum: ["start", "end"] },
      pauseOnHover: { type: "boolean" },
      gap: space({ en: "Gap", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { speed: "slow", direction: "start", pauseOnHover: true, gap: "l" } },
  },
  {
    name: "Counter",
    title: { en: "Counter", tr: "Sayaç" },
    description: {
      en: "A number that counts up once as it comes into view; the final number is in the page.",
      tr: "Görünür olunca bir kez sayan bir sayı; son değer sayfada yazılıdır.",
    },
    category: "content",
    props: schema(
      {
        value: { type: "number", minimum: -1e12, maximum: 1e12 },
        from: { type: "number", minimum: -1e12, maximum: 1e12 },
        decimals: { type: "integer", minimum: 0, maximum: 3 },
        prefix: { type: "string", maxLength: 8 },
        suffix: { type: "string", maxLength: 16 },
        label: label(80),
        duration: { type: "string", enum: ["fast", "normal", "slow"] },
      },
      ["value"],
    ),
    children: "none",
    example: { props: { value: 38000, prefix: "", suffix: "+", label: "Freelancers" } },
  },
  // RFC-0025 §3: overlays. Their children are their content; they open only from a reader's action.
  {
    name: "Dialog",
    title: { en: "Dialog", tr: "İletişim kutusu" },
    description: {
      en: 'Short, optional detail over the page (terms, a video, filters), opened by a Button with onClick {action:"open",target:"<this id>"}. fallbackHref is a page with the same content, for readers without JavaScript.',
      tr: "Sayfanın üstünde kısa, isteğe bağlı ayrıntı; bir Button'ın open eylemiyle açılır.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        size: { type: "string", enum: ["s", "m", "l"] },
        dismiss: { type: "string", enum: ["any", "closerequest", "explicit"] },
        fallbackHref: href,
      },
      ["title"],
    ),
    children: "any",
    example: { props: { title: "Pricing details", size: "m" } },
  },
  {
    name: "Drawer",
    title: { en: "Drawer", tr: "Çekmece" },
    description: {
      en: "A panel that slides in from an edge (filters, a cart, settings), opened like a Dialog.",
      tr: "Bir kenardan kayan panel; Dialog gibi açılır.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        placement: { type: "string", enum: ["start", "end", "bottom"] },
        size: { type: "string", enum: ["s", "m", "l"] },
      },
      ["title"],
    ),
    children: "any",
    example: { props: { title: "Filters", placement: "end" } },
  },
  {
    name: "Popover",
    title: { en: "Popover", tr: "Açılır kutu" },
    description: {
      en: "A small panel under the Button that opens it (a definition, a share menu); Escape or a click elsewhere closes it.",
      tr: "Açan düğmenin altında küçük bir panel.",
    },
    category: "interactive",
    props: schema({
      placement: { type: "string", enum: ["bottom", "top", "start", "end"] },
      width: { type: "string", enum: ["s", "m", "l"] },
    }),
    children: "any",
    example: { props: { placement: "bottom", width: "m" } },
  },
  {
    name: "Tooltip",
    title: { en: "Tooltip", tr: "İpucu" },
    description: {
      en: "A short text shown when the reader points at or focuses a Button or Link (`for`); never the only way to the information.",
      tr: "Bir Button veya Link'e gelince görünen kısa metin.",
    },
    category: "interactive",
    props: schema({ text: label(160), for: { type: "string", pattern: COMPONENT_ID } }, [
      "text",
      "for",
    ]),
    children: "none",
    example: { props: { text: "Billed yearly", for: "price-note" } },
  },
  {
    name: "Lightbox",
    title: { en: "Lightbox", tr: "Görsel galerisi" },
    description: {
      en: "Thumbnails of images that open large, one at a time, with previous and next; without JavaScript each thumbnail links to its image.",
      tr: "Büyük açılan küçük resimler; önceki ve sonraki ile gezilir.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        items: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["asset", "alt"],
            properties: {
              asset: { type: "string", format: "asset" },
              alt: { type: "string", maxLength: 300 },
              caption: { type: "string", maxLength: 300 },
            },
          },
        },
        start: { type: "integer", minimum: 0, maximum: 23 },
      },
      ["items"],
    ),
    children: "none",
    example: {
      props: {
        title: "The bakery",
        items: [{ asset: "asset:ast_example01", alt: "Loaves cooling on a rack" }],
      },
    },
  },
];

// Primitive props follow the same subset as block props; checked once at load. Bound example
// values ({path}, as inputs need) are bindings, not literals: left out, and not required.
const isBoundExample = (v: unknown) => isObj(v) && ("path" in v || "call" in v);
defineBlockTypes(
  PRIMITIVES.map((p) => {
    const bound = Object.keys(p.example.props).filter((k) => isBoundExample(p.example.props[k]));
    return {
      name: p.name.toLowerCase(),
      title: p.title,
      where: ["section"] as const,
      props: {
        ...p.props,
        ...(p.props.required
          ? { required: p.props.required.filter((k) => !bound.includes(k)) }
          : {}),
      },
      example: {
        props: Object.fromEntries(
          Object.entries(p.example.props).filter(([k]) => !bound.includes(k)),
        ),
      },
    };
  }) as BlockType[],
);

// ── the catalog ──────────────────────────────────────────────────────────────────────────────

export type CatalogEntry =
  | { kind: "primitive"; name: string; type: PrimitiveType; schema: PropsSchema }
  | { kind: "block"; name: string; type: BlockType; schema: PropsSchema };

export interface Catalog {
  /** `<theme>@<major>` (RFC-0018). */
  readonly id: string;
  get(name: string): CatalogEntry | undefined;
  /** Every component name, primitives first. */
  names(): string[];
  entries(): CatalogEntry[];
  readonly blocks: BlockRegistry;
}

export interface CatalogOptions {
  /** The theme's name; `Site.theme.name`. */
  readonly name?: string;
  readonly major?: number;
  /** The deployment's block registry (built-ins and the theme's types). */
  readonly blocks?: BlockRegistry;
  /** Primitives the theme does not render (RFC-0018 `catalog`). */
  readonly omit?: readonly string[];
}

/** The catalog surfaces are written for: Cloudhal's primitives plus the registry's section blocks. */
export function createCatalog(options: CatalogOptions = {}): Catalog {
  const blocks = options.blocks ?? createBlockRegistry();
  const omit = new Set(options.omit ?? []);
  const entries: CatalogEntry[] = [
    ...PRIMITIVES.filter((p) => !omit.has(p.name)).map(
      (type): CatalogEntry => ({ kind: "primitive", name: type.name, type, schema: type.props }),
    ),
    ...blocks.list("section").map(
      (type): CatalogEntry => ({
        kind: "block",
        name: type.name,
        type,
        schema: sectionSchema(type),
      }),
    ),
  ];
  const byName = new Map(entries.map((e) => [e.name, e]));
  return {
    id: `${options.name ?? "cloudhal"}@${options.major ?? 1}`,
    get: (name) => byName.get(name),
    names: () => entries.map((e) => e.name),
    entries: () => [...entries],
    blocks,
  };
}

const childRule = (e: CatalogEntry): PrimitiveType["children"] =>
  e.kind === "primitive" ? e.type.children : "none";

// ── bindings, functions, conditions ──────────────────────────────────────────────────────────

/** A value bound to the surface's data: `{ "path": "/json/pointer" }`. */
export interface PathValue {
  path: string;
}
/** A named function Cloudhal implements: `{ "call": "formatDate", "args": { … } }`. */
export interface CallValue {
  call: SurfaceFunction;
  args?: Record<string, unknown>;
}

export const SURFACE_FUNCTIONS = [
  "formatDate",
  "formatNumber",
  "formatCurrency",
  "pluralize",
  "concat",
  "length",
  "required",
  "minLength",
  "maxLength",
  "email",
  "range",
  // RFC-0022 §1: computed values.
  "add",
  "subtract",
  "multiply",
  "divide",
  "round",
  "floor",
  "ceil",
  "abs",
  "min",
  "max",
  "clamp",
  "power",
  "number",
  "if",
  "choose",
  "sum",
  "average",
  "count",
  "formatPercent",
  "calculate",
] as const;
export type SurfaceFunction = (typeof SURFACE_FUNCTIONS)[number];
const FUNCTIONS = new Set<string>(SURFACE_FUNCTIONS);

export const isPathValue = (v: unknown): v is PathValue =>
  isObj(v) && typeof v.path === "string" && Object.keys(v).length === 1;
export const isCallValue = (v: unknown): v is CallValue =>
  isObj(v) &&
  typeof v.call === "string" &&
  Object.keys(v).every((k) => k === "call" || k === "args");
const isDynamic = (v: unknown) => isPathValue(v) || isCallValue(v);

/** RFC 6901 pointer segments (`/a/b~1c` → `["a", "b/c"]`); `undefined` when malformed. */
export function pointerSegments(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  const parts = pointer.slice(1).split("/");
  if (parts.some((p) => /~[^01]|~$/.test(p))) return undefined;
  return parts.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function checkPointer(pointer: unknown, path: string, out: PropsIssue[]): void {
  const segments = typeof pointer === "string" ? pointerSegments(pointer) : undefined;
  if (
    typeof pointer !== "string" ||
    !pointer.startsWith("/") ||
    pointer.length > SURFACE_LIMITS.pointerLength ||
    !segments ||
    segments.length > SURFACE_LIMITS.pointerSegments
  )
    out.push({ path, message: "a JSON Pointer into the surface's data, such as /plans/0/price" });
}

function checkOperand(v: unknown, path: string, out: PropsIssue[]): void {
  if (isPathValue(v)) checkPointer(v.path, `${path}/path`, out);
  else if (!isScalar(v)) out.push({ path, message: "a text, number, true/false or {path}" });
}

/** A function argument: a value, a `{path}`, or another call (RFC-0022 §1). */
function checkArg(v: unknown, path: string, out: PropsIssue[], depth: number): void {
  if (isCallValue(v)) checkCall(v, path, out, depth + 1);
  else checkOperand(v, path, out);
}

function checkCall(v: CallValue, path: string, out: PropsIssue[], depth = 1): void {
  if (depth > SURFACE_LIMITS.callDepth) {
    out.push({ path, message: `calls nest at most ${SURFACE_LIMITS.callDepth} deep` });
    return;
  }
  if (!FUNCTIONS.has(v.call)) {
    out.push({ path: `${path}/call`, message: `one of ${SURFACE_FUNCTIONS.join(", ")}` });
    return;
  }
  if (v.args === undefined) return;
  if (!isObj(v.args) || Object.keys(v.args).length > SURFACE_LIMITS.functionArgs) {
    out.push({
      path: `${path}/args`,
      message: `an object of at most ${SURFACE_LIMITS.functionArgs} values`,
    });
    return;
  }
  for (const [k, a] of Object.entries(v.args)) {
    const at = `${path}/args/${k}`;
    // `if` takes a condition; `choose` a map from keys to values.
    if (v.call === "if" && k === "cond") checkCondition(a, at, out);
    else if (v.call === "choose" && k === "cases") {
      if (!isObj(a) || Object.keys(a).length > SURFACE_LIMITS.chooseCases)
        out.push({
          path: at,
          message: `an object of at most ${SURFACE_LIMITS.chooseCases} keys and their values`,
        });
      else
        for (const [key, x] of Object.entries(a))
          checkArg(x, `${at}/${escapePointer(key)}`, out, depth);
    } else if (v.call === "calculate" && k === "vars") {
      if (
        !isObj(a) ||
        Object.keys(a).length > SURFACE_LIMITS.chooseCases ||
        Object.keys(a).some((key) => !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key))
      )
        out.push({
          path: at,
          message: `an object of at most ${SURFACE_LIMITS.chooseCases} names (letters, digits, _) and their values`,
        });
      else for (const [key, x] of Object.entries(a)) checkArg(x, `${at}/${key}`, out, depth);
    } else if (Array.isArray(a)) {
      if (a.length > SURFACE_LIMITS.listArgItems)
        out.push({ path: at, message: `at most ${SURFACE_LIMITS.listArgItems} items` });
      a.forEach((x, i) => {
        checkArg(x, `${at}/${i}`, out, depth);
      });
    } else checkArg(a, at, out, depth);
  }
  if (
    v.call === "calculate" &&
    typeof v.args.expression === "string" &&
    v.args.expression.length > SURFACE_LIMITS.expressionLength
  )
    out.push({
      path: `${path}/args/expression`,
      message: `at most ${SURFACE_LIMITS.expressionLength} characters`,
    });
}

const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Function calls anywhere in a value (each `{call}` object, nested ones included). */
export function countCalls(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + countCalls(x), 0);
  if (!isObj(v)) return 0;
  let n = isCallValue(v) ? 1 : 0;
  for (const x of Object.values(v)) n += countCalls(x);
  return n;
}

/** A value that is a binding or a call: problems with its shape (not with what it resolves to). */
function checkDynamic(v: unknown, path: string, out: PropsIssue[]): void {
  if (isPathValue(v)) checkPointer(v.path, `${path}/path`, out);
  else if (isCallValue(v)) checkCall(v, path, out);
}

const COMPARE = ["eq", "ne", "gt", "lt", "gte", "lte"] as const;

/** A visibility condition (RFC-0020 §3): `{path}`, `eq|ne|gt|lt: [a, b]`, `and|or: [...]`, `not`. */
export function checkCondition(c: unknown, path: string, out: PropsIssue[], depth = 0): void {
  if (depth > SURFACE_LIMITS.conditionDepth) {
    out.push({ path, message: `nested at most ${SURFACE_LIMITS.conditionDepth} deep` });
    return;
  }
  if (isPathValue(c)) {
    checkPointer(c.path, `${path}/path`, out);
    return;
  }
  if (!isObj(c) || Object.keys(c).length !== 1) {
    out.push({ path, message: "one of {path}, eq, ne, gt, lt, gte, lte, and, or, not" });
    return;
  }
  const [op, arg] = Object.entries(c)[0] as [string, unknown];
  if ((COMPARE as readonly string[]).includes(op)) {
    if (!Array.isArray(arg) || arg.length !== 2)
      out.push({ path: `${path}/${op}`, message: "two operands" });
    else
      arg.forEach((x, i) => {
        checkOperand(x, `${path}/${op}/${i}`, out);
      });
  } else if (op === "and" || op === "or") {
    if (!Array.isArray(arg) || arg.length === 0 || arg.length > SURFACE_LIMITS.conditionItems)
      out.push({
        path: `${path}/${op}`,
        message: `1 to ${SURFACE_LIMITS.conditionItems} conditions`,
      });
    else
      arg.forEach((x, i) => {
        checkCondition(x, `${path}/${op}/${i}`, out, depth + 1);
      });
  } else if (op === "not") checkCondition(arg, `${path}/not`, out, depth + 1);
  else out.push({ path, message: "one of {path}, eq, ne, gt, lt, gte, lte, and, or, not" });
}

/** The value at a pointer in `data`, or `undefined`. */
export function getPointer(data: unknown, pointer: string): unknown {
  const segments = pointerSegments(pointer);
  if (!segments) return undefined;
  let cur: unknown = data;
  for (const s of segments) {
    if (Array.isArray(cur)) cur = /^\d+$/.test(s) ? cur[Number(s)] : undefined;
    else if (isObj(cur)) cur = Object.hasOwn(cur, s) ? cur[s] : undefined;
    else return undefined;
  }
  return cur;
}

export interface ResolveContext {
  readonly locale: string;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);
const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function runFunction(
  name: SurfaceFunction,
  args: Record<string, unknown>,
  ctx: ResolveContext,
): unknown {
  const value = args.value;
  switch (name) {
    case "formatDate": {
      const d = new Date(text(value));
      if (Number.isNaN(d.getTime())) return "";
      const style = ["short", "medium", "long", "full"].includes(text(args.style))
        ? (text(args.style) as "short" | "medium" | "long" | "full")
        : "medium";
      return new Intl.DateTimeFormat(ctx.locale, { dateStyle: style, timeZone: "UTC" }).format(d);
    }
    case "formatNumber": {
      // RFC-0022: a blank input shows blank, not 0.
      if (blank(value)) return "";
      const n = num(value);
      if (!Number.isFinite(n)) return "";
      const digits = Math.min(Math.max(0, Math.trunc(num(args.digits ?? 2)) || 0), 6);
      return new Intl.NumberFormat(ctx.locale, { maximumFractionDigits: digits }).format(n);
    }
    case "formatCurrency": {
      if (blank(value)) return "";
      const n = num(value);
      const currency = text(args.currency).toUpperCase();
      if (!Number.isFinite(n) || !/^[A-Z]{3}$/.test(currency)) return "";
      try {
        return new Intl.NumberFormat(ctx.locale, { style: "currency", currency }).format(n);
      } catch {
        return "";
      }
    }
    case "pluralize": {
      const n = num(args.count);
      const word = n === 1 ? text(args.one) : text(args.other);
      return word.replace(/#/g, Number.isFinite(n) ? String(n) : "");
    }
    case "concat":
      return (Array.isArray(args.parts) ? args.parts : []).map(text).join("");
    case "length":
      return Array.isArray(value) || typeof value === "string" ? value.length : 0;
    case "required":
      return !(
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    case "minLength":
      return text(value).length >= num(args.min);
    case "maxLength":
      return text(value).length <= num(args.max);
    case "email":
      return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/.test(text(value));
    case "range": {
      const n = num(value);
      return Number.isFinite(n) && n >= num(args.min) && n <= num(args.max);
    }
    // RFC-0022 §1: computed values. A blank or non-numeric input gives "" (shown as empty).
    case "add":
    case "multiply":
    case "min":
    case "max": {
      const ns = numbers(args.values);
      if (!ns) return "";
      if (name === "add") return finite(ns.reduce((a, b) => a + b, 0));
      if (name === "multiply") return finite(ns.reduce((a, b) => a * b, 1));
      return finite(name === "min" ? Math.min(...ns) : Math.max(...ns));
    }
    case "subtract": {
      const a = operand(args.a);
      const b = operand(args.b);
      return a === undefined || b === undefined ? "" : finite(a - b);
    }
    case "divide": {
      const a = operand(args.a);
      const b = operand(args.b);
      if (a === undefined || b === undefined) return "";
      return b === 0 ? (args.fallback ?? "") : finite(a / b);
    }
    case "round":
    case "floor":
    case "ceil": {
      const n = operand(value);
      if (n === undefined) return "";
      const f = 10 ** Math.min(Math.max(0, Math.trunc(num(args.digits ?? 0)) || 0), 6);
      return finite(Math[name](Number((n * f).toPrecision(12))) / f);
    }
    case "abs": {
      const n = operand(value);
      return n === undefined ? "" : finite(Math.abs(n));
    }
    case "clamp": {
      const n = operand(value);
      const lo = operand(args.min);
      const hi = operand(args.max);
      return n === undefined || lo === undefined || hi === undefined
        ? ""
        : finite(Math.min(Math.max(n, lo), hi));
    }
    case "number": {
      const n = operand(value);
      return n === undefined ? (args.fallback ?? "") : finite(n);
    }
    case "power": {
      const b = operand(args.base);
      const e = operand(args.exponent);
      return b === undefined || e === undefined || Math.abs(e) > 1000 ? "" : finite(b ** e);
    }
    case "sum":
    case "average":
    case "count": {
      const items = (Array.isArray(args.list) ? args.list : []).slice(
        0,
        SURFACE_LIMITS.aggregateItems,
      );
      const field = typeof args.field === "string" ? args.field : undefined;
      const picked = items
        .map((x) => (field === undefined ? x : isObj(x) ? x[field] : undefined))
        .filter((x) => !blank(x));
      if (name === "count") return picked.length;
      const ns = picked.map(toNumber).filter((n) => Number.isFinite(n));
      if (ns.length === 0) return name === "sum" ? 0 : "";
      const total = ns.reduce((a, b) => a + b, 0);
      return finite(name === "sum" ? total : total / ns.length);
    }
    case "formatPercent": {
      const n = operand(value);
      if (n === undefined) return "";
      const digits = Math.min(Math.max(0, Math.trunc(num(args.digits ?? 0)) || 0), 6);
      return new Intl.NumberFormat(ctx.locale, {
        style: "percent",
        maximumFractionDigits: digits,
      }).format(n);
    }
    case "calculate":
      return calculateExpression(text(args.expression), isObj(args.vars) ? args.vars : {});
    // Resolved by `resolveValue`, which needs the data.
    case "if":
    case "choose":
      return "";
  }
}

const blank = (v: unknown) => v === undefined || v === null || v === "";
/** A number from a value; "1,5" reads as 1.5 (a decimal comma, as typed in many locales). */
const toNumber = (v: unknown): number =>
  typeof v === "number"
    ? v
    : typeof v === "string"
      ? Number(/^\s*-?\d+,\d+\s*$/.test(v) ? v.replace(",", ".") : v)
      : Number.NaN;
const operand = (v: unknown): number | undefined => {
  if (blank(v)) return undefined;
  const n = toNumber(v);
  return Number.isFinite(n) ? n : undefined;
};
const numbers = (v: unknown): number[] | undefined => {
  const list = Array.isArray(v) ? v : [];
  if (list.length === 0) return undefined;
  const ns = list.map(operand);
  return ns.every((n) => n !== undefined) ? (ns as number[]) : undefined;
};
/** A finite result to 10 significant digits (0.1 + 0.2 shows 0.3); anything else is "". */
const finite = (n: number): number | "" => (Number.isFinite(n) ? Number(n.toPrecision(10)) : "");

/**
 * `calculate` (RFC-0022 §1.1): an arithmetic expression, read by a small grammar, never
 * evaluated as code: `+ - * / %`, `^` (power, exponent at most ±1000), parentheses, unary minus,
 * decimals, `×` and `÷`, and names bound in `vars` (a formula over the surface's data:
 * "10*w + 6.25*h"). A blank or non-numeric variable, an unknown name or a result that is not
 * finite gives "".
 */
export function calculateExpression(
  source: string,
  vars: Readonly<Record<string, unknown>> = {},
): number | "" {
  if (source.length > SURFACE_LIMITS.expressionLength) return "";
  const s = source.replace(/×/g, "*").replace(/÷/g, "/");
  let i = 0;
  let depth = 0;
  const fail = (): never => {
    throw new Error("calculate");
  };
  const skip = () => {
    while (s[i] === " " || s[i] === "\t" || s[i] === "\n") i++;
  };
  const peek = () => {
    skip();
    return s[i];
  };
  const atom = (): number => {
    if (++depth > 32) fail();
    let v: number;
    const c = peek();
    if (c === "(") {
      i++;
      v = expr();
      if (peek() !== ")") fail();
      i++;
    } else {
      const rest = s.slice(i);
      const n = /^\d+(?:\.\d+)?/.exec(rest);
      const name = n ? null : /^[A-Za-z_][A-Za-z0-9_]{0,31}/.exec(rest);
      if (n) {
        i += n[0].length;
        v = Number(n[0]);
      } else if (name && Object.hasOwn(vars, name[0])) {
        i += name[0].length;
        const got = operand(vars[name[0]]);
        if (got === undefined) return fail();
        v = got;
      } else return fail();
    }
    depth--;
    return v;
  };
  const unary = (): number => {
    if (peek() === "-") {
      i++;
      return -unary();
    }
    return power();
  };
  const power = (): number => {
    const base = atom();
    if (peek() !== "^") return base;
    i++;
    const exponent = unary();
    if (Math.abs(exponent) > 1000) fail();
    return base ** exponent;
  };
  const term = (): number => {
    let v = unary();
    for (let c = peek(); c === "*" || c === "/" || c === "%"; c = peek()) {
      i++;
      const r = unary();
      v = c === "*" ? v * r : c === "/" ? v / r : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) {
      i++;
      const r = term();
      v = c === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    if (!peek()) return "";
    const v = expr();
    return peek() === undefined ? finite(v) : "";
  } catch {
    return "";
  }
}

/** A prop value with its bindings and calls resolved against `data`. */
export function resolveValue(v: unknown, data: unknown, ctx: ResolveContext, depth = 0): unknown {
  if (isPathValue(v)) return getPointer(data, v.path);
  if (isCallValue(v) && FUNCTIONS.has(v.call)) {
    // RFC-0022 §1: past the nesting limit a call gives "" rather than running on.
    if (depth >= SURFACE_LIMITS.callDepth) return "";
    const raw = isObj(v.args) ? v.args : {};
    const at = (x: unknown) => resolveValue(x, data, ctx, depth + 1);
    if (v.call === "if")
      return (evaluateCondition(raw.cond, data) ? at(raw.ifTrue) : at(raw.ifFalse)) ?? "";
    // RFC-0022: a formula's variables are values, bindings or calls, resolved first.
    if (v.call === "calculate" && isObj(raw.vars)) {
      const vars: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(raw.vars)) vars[k] = at(x);
      return calculateExpression(text(at(raw.expression)), vars);
    }
    if (v.call === "choose") {
      const key = text(at(raw.value));
      const cases = isObj(raw.cases) ? raw.cases : {};
      return (Object.hasOwn(cases, key) ? at(cases[key]) : at(raw.default)) ?? "";
    }
    const args: Record<string, unknown> = {};
    for (const [k, a] of Object.entries(raw)) args[k] = Array.isArray(a) ? a.map(at) : at(a);
    return runFunction(v.call, args, ctx);
  }
  return v;
}

export function resolveProps(
  props: Readonly<Record<string, unknown>> | undefined,
  data: unknown,
  ctx: ResolveContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props ?? {})) out[k] = resolveValue(v, data, ctx);
  return out;
}

const truthy = (v: unknown) =>
  !(
    v === undefined ||
    v === null ||
    v === false ||
    v === 0 ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );

/** Whether a visibility condition holds for `data`; no condition is visible. */
export function evaluateCondition(c: unknown, data: unknown): boolean {
  if (c === undefined) return true;
  if (isPathValue(c)) return truthy(getPointer(data, c.path));
  if (!isObj(c)) return false;
  const [op, arg] = (Object.entries(c)[0] ?? []) as [string, unknown];
  const operand = (x: unknown) => (isPathValue(x) ? getPointer(data, x.path) : x);
  if ((COMPARE as readonly string[]).includes(op) && Array.isArray(arg)) {
    const a = operand(arg[0]);
    const b = operand(arg[1]);
    if (op === "eq") return a === b;
    if (op === "ne") return a !== b;
    if (typeof a !== typeof b || (typeof a !== "number" && typeof a !== "string")) return false;
    const x = a as number;
    const y = b as number;
    return op === "gt" ? x > y : op === "lt" ? x < y : op === "gte" ? x >= y : x <= y;
  }
  if (op === "and" && Array.isArray(arg)) return arg.every((x) => evaluateCondition(x, data));
  if (op === "or" && Array.isArray(arg)) return arg.some((x) => evaluateCondition(x, data));
  if (op === "not") return !evaluateCondition(arg, data);
  return false;
}

/** What each action needs besides its name (RFC-0020 §4). */
const ACTION_NEEDS: Record<string, readonly string[]> = {
  set: ["path", "value"],
  toggle: ["path"],
  increment: ["path"],
  reset: [],
  navigate: ["href"],
  copy: ["value"],
  share: [],
  scrollTo: ["anchor"],
  append: ["path", "value"],
  open: ["target"],
  close: [],
};

function checkAction(a: Record<string, unknown>, path: string, out: PropsIssue[]): void {
  for (const key of ACTION_NEEDS[String(a.action)] ?? [])
    if (a[key] === undefined)
      out.push({ path: `${path}/${key}`, message: `${a.action} needs ${key}` });
  // RFC-0022: `set` and `append` may write a computed value (worked out when clicked).
  if ((a.action === "set" || a.action === "append") && isObj(a.value))
    checkDynamic(a.value, `${path}/value`, out);
  if (a.action === "append" && typeof a.value === "string" && a.value.length > 20)
    out.push({ path: `${path}/value`, message: "at most 20 characters at a time" });
}

// ── checking a surface ───────────────────────────────────────────────────────────────────────

export interface SurfaceCheck {
  /** Problems that make the surface invalid (paths are JSON Pointers into the section). */
  issues: PropsIssue[];
  /** Ids of components whose `component` the catalog does not have: kept, flagged, not rendered. */
  unknown: string[];
  /** Ids no path from `root` reaches (still arriving while streaming): kept, not rendered. */
  unreachable: string[];
}

const SOURCE_SORT = new Set(["newest", "oldest", "title"]);
const COLLECTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function checkData(data: unknown, out: PropsIssue[]): void {
  if (data === undefined) return;
  if (!isObj(data)) {
    out.push({ path: "/data", message: "an object" });
    return;
  }
  const size = new TextEncoder().encode(JSON.stringify(data)).length;
  if (size > SURFACE_LIMITS.dataBytes)
    out.push({ path: "/data", message: `at most ${SURFACE_LIMITS.dataBytes} bytes of JSON` });
  for (const [key, value] of Object.entries(data)) {
    if (!isObj(value) || !("$source" in value)) continue;
    const at = `/data/${key}`;
    if (value.$source !== "entries") {
      out.push({ path: `${at}/$source`, message: "entries" });
      continue;
    }
    const q = value.query;
    if (!isObj(q) || Object.keys(value).some((k) => k !== "$source" && k !== "query")) {
      out.push({
        path: at,
        message: "{ $source: entries, query: { collection, filter?, sort?, limit } }",
      });
      continue;
    }
    for (const k of Object.keys(q))
      if (!["collection", "filter", "sort", "limit"].includes(k))
        out.push({ path: `${at}/query/${k}`, message: "not a query field" });
    if (typeof q.collection !== "string" || !COLLECTION.test(q.collection))
      out.push({ path: `${at}/query/collection`, message: "a collection slug, such as posts" });
    if (q.filter !== undefined)
      try {
        if (typeof q.filter !== "string" || q.filter.length > 512) throw new Error("too long");
        parseFilter(q.filter);
      } catch (e) {
        out.push({
          path: `${at}/query/filter`,
          message: `not a valid filter (${(e as Error).message})`,
        });
      }
    if (q.sort !== undefined && !SOURCE_SORT.has(q.sort as string))
      out.push({ path: `${at}/query/sort`, message: "newest, oldest or title" });
    if (
      typeof q.limit !== "number" ||
      !Number.isInteger(q.limit) ||
      q.limit < 1 ||
      q.limit > SURFACE_LIMITS.sourceLimit
    )
      out.push({
        path: `${at}/query/limit`,
        message: `a whole number from 1 to ${SURFACE_LIMITS.sourceLimit}`,
      });
  }
}

/** Props problems with bindings allowed: bound props are checked as bindings, the rest as values. */
function checkProps(entry: CatalogEntry, props: unknown, path: string, out: PropsIssue[]): void {
  if (entry.kind === "block" && !entry.type.where.includes("section")) {
    out.push({ path, message: `${entry.name} is a body block, not a surface component` });
    return;
  }
  const given = isObj(props) ? props : props === undefined ? {} : props;
  if (!isObj(given)) {
    out.push({ path, message: "an object" });
    return;
  }
  const literal: Record<string, unknown> = {};
  const bound = new Set<string>();
  for (const [k, v] of Object.entries(given)) {
    if (isDynamic(v) && k in entry.schema.properties) {
      bound.add(k);
      checkDynamic(v, `${path}/${k}`, out);
    } else if (k === "onClick" && isObj(v) && isDynamic(v.value)) {
      // RFC-0022: an action's computed value is checked by `checkAction`, not as text.
      const { value: _computed, ...rest } = v;
      literal[k] = rest;
    } else literal[k] = v;
  }
  for (const issue of validateProps(entry.schema, literal)) {
    const key = issue.path.split("/")[0] ?? "";
    if (bound.has(key) && issue.message === "required") continue;
    out.push({ path: issue.path ? `${path}/${issue.path}` : path, message: issue.message });
  }
}

// ── motion (RFC-0024 §2) ─────────────────────────────────────────────────────────────────────

/** Reveals: once, as a component enters the viewport. */
export const MOTION_REVEALS = [
  "fade",
  "rise",
  "sink",
  "slide-start",
  "slide-end",
  "scale-in",
  "blur-in",
  "wipe-up",
  "wipe-start",
  "mask-rise",
  // RFC-0024 24c: kinetic type, on headings and short texts only.
  "split-words",
  "split-chars",
  "split-lines",
] as const;
/** Hover and focus effects; the pointer ones (`tilt`, `magnetic`, `spotlight`) need a fine pointer. */
export const MOTION_HOVERS = [
  "lift",
  "scale",
  "glow",
  "underline",
  "zoom-media",
  "tilt",
  "magnetic",
  "spotlight",
] as const;
export const MOTION_SPEEDS = ["fast", "normal", "slow"] as const;
/** Components that lay out children: `stagger` reveals their children one after another. */
export const MOTION_STAGGER = ["Stack", "Row", "Grid", "Columns", "Band", "Card"] as const;
/** Hover effects that only fit some components; the rest fit any. */
const HOVER_FITS: Partial<Record<(typeof MOTION_HOVERS)[number], readonly string[]>> = {
  underline: ["Link", "Button", "Card", "Heading"],
  "zoom-media": ["Card", "Image"],
  tilt: ["Card", "Image"],
  magnetic: ["Button", "Link"],
  spotlight: ["Card", "Band"],
};
/** Scroll effects: continuous, tied to the component's place in the viewport (RFC-0024 §2). */
export const MOTION_SCROLLS = [
  "parallax",
  "fade-through",
  "scale-through",
  "rotate-through",
  "pan",
] as const;
/** Loops: decorative, slow, paused by the reader's pause control (RFC-0024 24c). */
export const MOTION_LOOPS = ["float", "pulse", "gradient-shift", "spin-slow"] as const;
/** Components a loop may decorate: never text people read. */
const LOOP_FITS: Record<(typeof MOTION_LOOPS)[number], readonly string[]> = {
  float: ["Image", "Badge", "Stat", "Card"],
  pulse: ["Badge", "Button", "Stat"],
  "gradient-shift": ["Card", "Band"],
  "spin-slow": ["Image", "Badge"],
};
/** Fields later phases add: written now, they are refused with when they arrive. */
const MOTION_LATER: Record<string, string> = {};
/** Names models often write for a preset, and the preset they mean. */
const MOTION_ALIASES: Record<string, string> = {
  fadein: "fade",
  "fade-in": "fade",
  fadeinup: "rise",
  "fade-up": "rise",
  "fade-in-up": "rise",
  slideup: "rise",
  "slide-up": "rise",
  up: "rise",
  fadeindown: "sink",
  "fade-down": "sink",
  "slide-down": "sink",
  slideinleft: "slide-start",
  "slide-left": "slide-start",
  "slide-in-left": "slide-start",
  slideinright: "slide-end",
  "slide-right": "slide-end",
  "slide-in-right": "slide-end",
  zoomin: "scale-in",
  "zoom-in": "scale-in",
  zoom: "scale-in",
  blur: "blur-in",
  reveal: "wipe-up",
  wipe: "wipe-up",
  mask: "mask-rise",
  grow: "scale",
  raise: "lift",
  float: "lift",
  shadow: "lift",
  shine: "glow",
  "image-zoom": "zoom-media",
  "zoom-image": "zoom-media",
  "3d": "tilt",
  medium: "normal",
  quick: "fast",
  parallax: "parallax",
  "parallax-scroll": "parallax",
  "fade-scroll": "fade-through",
  "scroll-fade": "fade-through",
  "scale-scroll": "scale-through",
  "scroll-scale": "scale-through",
  "zoom-scroll": "scale-through",
  "rotate-scroll": "rotate-through",
  rotate: "rotate-through",
  "horizontal-scroll": "pan",
  slide: "pan",
  "split-text": "split-words",
  words: "split-words",
  letters: "split-chars",
  chars: "split-chars",
  typewriter: "split-chars",
  lines: "split-lines",
  bob: "float",
  floating: "float",
  breathe: "pulse",
  heartbeat: "pulse",
  spin: "spin-slow",
  rotating: "spin-slow",
  "gradient-animation": "gradient-shift",
};
/** Field names models write for a `motion` field. */
const MOTION_FIELD_ALIASES: Record<string, string> = {
  entrance: "reveal",
  enter: "reveal",
  appear: "reveal",
  animation: "reveal",
  animate: "reveal",
  onhover: "hover",
  hovereffect: "hover",
  duration: "speed",
};

/** The motion fields a component may have, and what each takes. */
function checkMotion(motion: unknown, component: string, at: string, issues: PropsIssue[]): void {
  if (!isObj(motion)) {
    issues.push({ path: at, message: 'an object of presets, e.g. {"reveal":"rise"}' });
    return;
  }
  const oneOf = (key: string, allowed: readonly string[]) => {
    const v = motion[key];
    if (v !== undefined && !(typeof v === "string" && allowed.includes(v)))
      issues.push({ path: `${at}/${key}`, message: `one of ${allowed.join(", ")}` });
  };
  for (const key of Object.keys(motion)) {
    if (MOTION_LATER[key])
      issues.push({ path: `${at}/${key}`, message: `not available yet (${MOTION_LATER[key]})` });
    else if (
      ![
        "reveal",
        "hover",
        "speed",
        "delay",
        "stagger",
        "replay",
        "scroll",
        "depth",
        "loop",
        "morph",
      ].includes(key)
    )
      issues.push({ path: `${at}/${key}`, message: "unknown motion field" });
  }
  oneOf("reveal", MOTION_REVEALS);
  oneOf("hover", MOTION_HOVERS);
  oneOf("speed", MOTION_SPEEDS);
  oneOf("scroll", MOTION_SCROLLS);
  oneOf("loop", MOTION_LOOPS);
  // RFC-0024 §5: the same key on two pages morphs one element into the other on navigation.
  if (
    motion.morph !== undefined &&
    !(typeof motion.morph === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(motion.morph))
  )
    issues.push({
      path: `${at}/morph`,
      message: "a key like plan-pro: lowercase letters, digits and hyphens",
    });
  const loop = motion.loop as (typeof MOTION_LOOPS)[number] | undefined;
  if (loop && LOOP_FITS[loop] && !LOOP_FITS[loop].includes(component))
    issues.push({ path: `${at}/loop`, message: `${loop} fits ${LOOP_FITS[loop].join(", ")}` });
  if (loop && (motion.reveal !== undefined || motion.scroll !== undefined))
    issues.push({ path: `${at}/loop`, message: "a loop goes alone: no reveal or scroll with it" });
  const reveal = typeof motion.reveal === "string" ? motion.reveal : "";
  if (reveal.startsWith("split-") && component !== "Heading" && component !== "Text")
    issues.push({ path: `${at}/reveal`, message: `${reveal} fits Heading and Text` });
  // A component either reveals once or moves with the scroll: both would fight over the same
  // properties.
  if (motion.scroll !== undefined && motion.reveal !== undefined)
    issues.push({ path: `${at}/scroll`, message: "use reveal or scroll, not both" });
  if (motion.scroll !== undefined && INPUT_COMPONENTS.has(component))
    issues.push({ path: `${at}/scroll`, message: "form controls do not move with the scroll" });
  const depth = motion.depth;
  if (
    depth !== undefined &&
    !(Number.isInteger(depth) && (depth as number) !== 0 && Math.abs(depth as number) <= 3)
  )
    issues.push({ path: `${at}/depth`, message: "-3 to 3, not 0 (negative moves the other way)" });
  if (depth !== undefined && motion.scroll !== "parallax" && motion.scroll !== "pan")
    issues.push({ path: `${at}/depth`, message: "only with scroll parallax or pan" });
  const hover = motion.hover as (typeof MOTION_HOVERS)[number] | undefined;
  const fits = hover ? HOVER_FITS[hover] : undefined;
  if (fits && !fits.includes(component))
    issues.push({ path: `${at}/hover`, message: `${hover} fits ${fits.join(", ")}` });
  const delay = motion.delay;
  if (
    delay !== undefined &&
    !(Number.isInteger(delay) && (delay as number) >= 0 && (delay as number) <= 4)
  )
    issues.push({ path: `${at}/delay`, message: "steps of the stagger, 0 to 4" });
  for (const key of ["stagger", "replay"])
    if (motion[key] !== undefined && typeof motion[key] !== "boolean")
      issues.push({ path: `${at}/${key}`, message: "true or false" });
  if (motion.stagger === true && !(MOTION_STAGGER as readonly string[]).includes(component))
    issues.push({ path: `${at}/stagger`, message: `only on ${MOTION_STAGGER.join(", ")}` });
}

/** Whether a surface uses motion, so its page loads the motion module (RFC-0024 §7). */
export function usesMotion(section: Pick<SurfaceSection, "components">): boolean {
  return section.components.some(
    (c) =>
      (isObj(c.motion) && Object.keys(c.motion).length > 0) ||
      c.component === "Scrolly" ||
      c.component === "ScrollProgress" ||
      c.component === "Marquee" ||
      c.component === "Counter" ||
      (c.component === "Heading" && isObj(c.props) && c.props.effect === "rotate-words") ||
      (isObj(c.props) && isObj(c.props.ambient)),
  );
}

/**
 * Whether a surface moves on its own for more than 5 seconds (a marquee, rotating words, a loop),
 * so the renderer adds the reader's pause control next to it (RFC-0024 §1, WCAG 2.2.2).
 */
export function surfaceLoops(section: Pick<SurfaceSection, "components">): boolean {
  return section.components.some(
    (c) =>
      c.component === "Marquee" ||
      (c.component === "Heading" && isObj(c.props) && c.props.effect === "rotate-words") ||
      (isObj(c.motion) && typeof c.motion.loop === "string") ||
      (isObj(c.props) && isObj(c.props.ambient)),
  );
}

/**
 * Deterministic repairs of a component's `motion`: preset and field names snapped to the nearest
 * known one (`"fadeInUp"` → `rise`), a delay in milliseconds turned into stagger steps, fields
 * that are not motion dropped. Every repair is reported.
 */
export function repairMotion(motion: unknown, id: string): { motion: unknown; notes: string[] } {
  if (!isObj(motion)) return { motion, notes: [] };
  const notes: string[] = [];
  const out: Record<string, unknown> = {};
  const snap = (value: unknown, allowed: readonly string[]): unknown => {
    if (typeof value !== "string" || allowed.includes(value)) return value;
    const key = value.toLowerCase().replace(/[\s_]+/g, "-");
    const alias = MOTION_ALIASES[key] ?? MOTION_ALIASES[key.replace(/-/g, "")];
    if (alias && allowed.includes(alias)) return alias;
    let best: string | undefined;
    let bestD = 3;
    for (const a of allowed) {
      const d = distance(a, key);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    return best ?? value;
  };
  for (const [rawKey, value] of Object.entries(motion)) {
    const key = MOTION_FIELD_ALIASES[rawKey.toLowerCase()] ?? rawKey;
    if (key !== rawKey) notes.push(`${id}: motion "${rawKey}" → "${key}"`);
    let v: unknown = value;
    if (key === "reveal") v = snap(value, MOTION_REVEALS);
    else if (key === "hover") v = snap(value, MOTION_HOVERS);
    else if (key === "speed") v = snap(value, MOTION_SPEEDS);
    else if (key === "scroll") v = snap(value, MOTION_SCROLLS);
    else if (key === "loop") v = snap(value, MOTION_LOOPS);
    else if (key === "depth" && typeof value === "number" && Number.isFinite(value) && value !== 0)
      v = Math.max(-3, Math.min(3, Math.round(value) || Math.sign(value)));
    else if (key === "delay" && typeof value === "number" && value > 4)
      v = Math.min(4, Math.max(0, Math.round(value / 100)));
    if (v !== value)
      notes.push(`${id}: motion.${key} ${JSON.stringify(value)} → ${JSON.stringify(v)}`);
    out[key] = v;
  }
  return { motion: out, notes };
}

/**
 * Checks a surface against a catalog (RFC-0020 §1): ids, the tree, child rules, props, bindings,
 * conditions, data and limits. Unknown components and unreachable ones are reported, not refused.
 */
export function checkSurface(surface: SurfaceSection, catalog: Catalog): SurfaceCheck {
  const issues: PropsIssue[] = [];
  const unknown: string[] = [];
  const components = surface.components ?? [];
  if (components.length > SURFACE_LIMITS.components)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.components} components`,
    });
  const calls = countCalls(components.map((c) => [c.props, c.visible]));
  if (calls > SURFACE_LIMITS.callsPerSurface)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.callsPerSurface} function calls (this surface has ${calls})`,
    });
  const byId = new Map<string, { c: SurfaceComponent; i: number }>();
  /** A component's children when they are a list (anything else is reported below). */
  const kidsOf = (c: SurfaceComponent): string[] =>
    Array.isArray(c.children) ? (c.children as string[]) : [];
  components.forEach((c, i) => {
    if (typeof c.id !== "string" || !c.id)
      issues.push({ path: `/components/${i}/id`, message: "every component needs an id" });
    else if (byId.has(c.id))
      issues.push({ path: `/components/${i}/id`, message: `"${c.id}" is used twice` });
    else byId.set(c.id, { c, i });
    if (c.children !== undefined && !Array.isArray(c.children))
      issues.push({
        path: `/components/${i}/children`,
        message: "children is a list of component ids",
      });
  });
  if (!byId.has("root"))
    issues.push({ path: "/components", message: 'one component has id "root"' });
  const parentOf = new Map<string, string>();
  components.forEach((c, i) => {
    const at = `/components/${i}`;
    const entry = catalog.get(c.component);
    if (!entry) unknown.push(c.id);
    kidsOf(c).forEach((child, j) => {
      const target = byId.get(child);
      if (!target) issues.push({ path: `${at}/children/${j}`, message: `no component "${child}"` });
      else if (child === "root" || child === c.id)
        issues.push({ path: `${at}/children/${j}`, message: `"${child}" cannot be a child here` });
      else if (parentOf.has(child))
        issues.push({
          path: `${at}/children/${j}`,
          message: `"${child}" already belongs to "${parentOf.get(child)}"`,
        });
      else parentOf.set(child, c.id);
    });
    if (!entry) return;
    const rule = childRule(entry);
    const kids = kidsOf(c);
    if (rule === "none" && kids.length)
      issues.push({ path: `${at}/children`, message: `${c.component} has no children` });
    else if (Array.isArray(rule))
      kids.forEach((child, j) => {
        const k = byId.get(child)?.c.component;
        if (k && !rule.includes(k))
          issues.push({
            path: `${at}/children/${j}`,
            message: `${c.component} holds only ${rule.join(", ")}`,
          });
      });
    checkProps(entry, c.props, `${at}/props`, issues);
    // RFC-0022 §2: a local input writes to the surface's data, so its value is a binding.
    // RFC-0022 §4: so does a table.
    if (c.component === "Table" && !(isObj(c.props) && isPathValue(c.props.rows)))
      issues.push({
        path: `${at}/props/rows`,
        message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
      });
    // RFC-0022 §3: a chart reads its rows from the surface's data.
    if (c.component === "Chart" && !(isObj(c.props) && isPathValue(c.props.data)))
      issues.push({
        path: `${at}/props/data`,
        message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
      });
    const writes = INPUT_MODEL[c.component];
    if (writes && !(isObj(c.props) && isPathValue(c.props[writes])))
      issues.push({
        path: `${at}/props/${writes}`,
        message: `bind it to the surface's data: {"path":"/…"} (the reader's input is written there)`,
      });
    if (c.component === "Button" && isObj(c.props) && isObj(c.props.onClick))
      checkAction(c.props.onClick, `${at}/props/onClick`, issues);
    if (c.visible !== undefined) checkCondition(c.visible, `${at}/visible`, issues);
    if (c.motion !== undefined) checkMotion(c.motion, c.component, `${at}/motion`, issues);
    // RFC-0024 §4: a particle preset only for particles.
    const amb = isObj(c.props) && isObj(c.props.ambient) ? c.props.ambient : undefined;
    if (amb && amb.preset !== undefined && amb.kind !== "particles")
      issues.push({ path: `${at}/props/ambient/preset`, message: "only with kind particles" });
    // RFC-0024 24c: a marquee needs enough to move; rotating words need words; split text is short.
    if (c.component === "Marquee" && kidsOf(c).length < 3)
      issues.push({ path: `${at}/children`, message: "at least 3 children to scroll" });
    if (
      c.component === "Heading" &&
      isObj(c.props) &&
      c.props.effect === "rotate-words" &&
      !Array.isArray(c.props.words)
    )
      issues.push({
        path: `${at}/props/words`,
        message: "2 to 6 words that take turns where {words} stands",
      });
    if (
      isObj(c.motion) &&
      typeof c.motion.reveal === "string" &&
      c.motion.reveal.startsWith("split-")
    ) {
      const t = isObj(c.props) ? c.props.text : undefined;
      const max = c.motion.reveal === "split-chars" ? 60 : 300;
      if (typeof t !== "string")
        issues.push({
          path: `${at}/motion/reveal`,
          message: "split text needs a written text, not a binding",
        });
      else if (t.length > max)
        issues.push({
          path: `${at}/motion/reveal`,
          message: `split text is at most ${max} characters`,
        });
    }
    // RFC-0024 §3: a scroll story is one sticky child, then 2–12 steps; it writes the step read.
    if (c.component === "Scrolly") {
      if (!(isObj(c.props) && isPathValue(c.props.step)))
        issues.push({
          path: `${at}/props/step`,
          message:
            'bind it to the surface\'s data: {"path":"/step"} (the step being read is written there)',
        });
      const kids = kidsOf(c).map((k) => byId.get(k)?.c.component);
      if (kids.length < 3 || kids.length > 13)
        issues.push({
          path: `${at}/children`,
          message: "one child to keep in view, then 2 to 12 Steps",
        });
      else if (kids[0] === "Step" || kids.slice(1).some((k) => k !== "Step"))
        issues.push({
          path: `${at}/children`,
          message: "the first child stays in view (not a Step); every other child is a Step",
        });
    }
  });
  // RFC-0025 §3: overlays open from a reader's action on this surface, never inside another modal.
  const overlayAbove = (id: string): string | undefined => {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) {
      const k = byId.get(p)?.c.component;
      if (k && OPENABLE.has(k)) return p;
    }
    return undefined;
  };
  let overlays = 0;
  let tooltips = 0;
  components.forEach((c, i) => {
    const at = `/components/${i}`;
    const action =
      c.component === "Button" && isObj(c.props) && isObj(c.props.onClick)
        ? c.props.onClick
        : undefined;
    if (action && (action.action === "open" || action.action === "close")) {
      const target = typeof action.target === "string" ? action.target : undefined;
      const kind = target ? byId.get(target)?.c.component : undefined;
      if (target && !(kind && OPENABLE.has(kind)))
        issues.push({
          path: `${at}/props/onClick/target`,
          message: `"${target}" is not a Dialog, Drawer, Popover or Lightbox of this surface`,
        });
      else if (action.action === "close" && !target && !overlayAbove(c.id))
        issues.push({
          path: `${at}/props/onClick`,
          message:
            "close belongs inside a Dialog, Drawer, Popover or Lightbox, or names one (target)",
        });
    }
    if (c.component === "Tooltip") {
      tooltips++;
      const target = isObj(c.props) && typeof c.props.for === "string" ? c.props.for : undefined;
      const kind = target ? byId.get(target)?.c.component : undefined;
      if (target && kind !== "Button" && kind !== "Link")
        issues.push({ path: `${at}/props/for`, message: "names a Button or Link of this surface" });
    }
    if (OPENABLE.has(c.component)) {
      // A Lightbox's thumbnails are content on the page; its viewer does not count.
      if (c.component !== "Lightbox") overlays++;
      if (overlays > 3 && c.component !== "Lightbox")
        issues.push({ path: at, message: "at most 3 overlays per section; put the rest on pages" });
      if (c.id === "root")
        issues.push({ path: at, message: "an overlay opens from the section; it is not its root" });
      const above = overlayAbove(c.id);
      if (
        above &&
        MODAL_OVERLAYS.has(c.component) &&
        MODAL_OVERLAYS.has(byId.get(above)?.c.component ?? "")
      )
        issues.push({ path: at, message: "a dialog never opens inside another; close one first" });
    }
  });
  if (tooltips > 8) issues.push({ path: "/components", message: "at most 8 tooltips per section" });
  // RFC-0024 §5: a morph key names one element on a page.
  const morphs = new Map<string, number>();
  components.forEach((c, i) => {
    const key = isObj(c.motion) && typeof c.motion.morph === "string" ? c.motion.morph : undefined;
    if (!key) return;
    if (morphs.has(key))
      issues.push({
        path: `/components/${i}/motion/morph`,
        message: `"${key}" is already used by another component here`,
      });
    else morphs.set(key, i);
  });
  // RFC-0024 §2: one moving background per surface; more competes for the eye.
  const ambients = components
    .map((c, i) => (isObj(c.props) && isObj(c.props.ambient) ? i : -1))
    .filter((i) => i >= 0);
  for (const i of ambients.slice(1))
    issues.push({
      path: `/components/${i}/props/ambient`,
      message: "one ambient background per section",
    });
  components.forEach((c, i) => {
    if (c.component === "Step" && byId.get(parentOf.get(c.id) ?? "")?.c.component !== "Scrolly")
      issues.push({ path: `/components/${i}`, message: "a Step belongs inside a Scrolly" });
  });
  // Reachability and depth from the root; `parentOf` already rules out shared children.
  const reached = new Set<string>();
  const walk = (id: string, depth: number, trail: Set<string>) => {
    if (trail.has(id)) return;
    reached.add(id);
    if (depth > SURFACE_LIMITS.depth) {
      const i = byId.get(id)?.i;
      issues.push({
        path: `/components/${i}`,
        message: `nested deeper than ${SURFACE_LIMITS.depth}`,
      });
      return;
    }
    const next = new Set(trail).add(id);
    const node = byId.get(id)?.c;
    for (const child of node ? kidsOf(node) : []) if (byId.has(child)) walk(child, depth + 1, next);
  };
  if (byId.has("root")) walk("root", 1, new Set());
  const unreachable = components.map((c) => c.id).filter((id) => !reached.has(id));
  checkData(surface.data, issues);
  return { issues, unknown, unreachable };
}

/** Problems with every surface on a page, paths prefixed with the section's place. */
export function checkPageSurfaces(sections: readonly Section[], catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const surfaces = sections.filter((s): s is SurfaceSection => s.kind === "surface");
  if (surfaces.length > SURFACE_LIMITS.surfacesPerPage)
    out.push({
      path: "/sections",
      message: `at most ${SURFACE_LIMITS.surfacesPerPage} surfaces per page`,
    });
  sections.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const issue of checkSurface(s, catalog).issues)
      out.push({ path: `/sections/${i}${issue.path}`, message: issue.message });
  });
  return out;
}

// ── repair (RFC-0020 §6, step 2) ─────────────────────────────────────────────────────────────

function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[n] as number;
}

/** The catalog name a misspelt one most likely means: same letters ignoring case, else ≤ 2 edits. */
export function nearestComponent(name: string, catalog: Catalog): string | undefined {
  if (catalog.get(name)) return name;
  const names = catalog.names();
  const folded = names.find((n) => n.toLowerCase() === name.toLowerCase());
  if (folded) return folded;
  let best: string | undefined;
  let bestD = 3;
  let tie = false;
  for (const n of names) {
    const d = distance(n.toLowerCase(), name.toLowerCase());
    if (d < bestD) {
      best = n;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  return tie ? undefined : best;
}

const isComponentLike = (v: unknown): v is SurfaceComponent =>
  isObj(v) && typeof v.id === "string" && typeof v.component === "string";

/**
 * Deterministic repairs of one component a model wrote: the nearest catalog name, unknown props
 * dropped, missing required props from the type's example. Every repair is reported.
 */
export function repairComponent(
  c: SurfaceComponent,
  catalog: Catalog,
): { component: SurfaceComponent; notes: string[] } {
  const notes: string[] = [];
  let next: SurfaceComponent = c;
  // One child written as its id instead of a list of one.
  if (typeof (c.children as unknown) === "string") {
    next = { ...next, children: [c.children as unknown as string] };
    notes.push(`${c.id}: children "${c.children}" made a list`);
  }
  if (c.motion !== undefined) {
    const m = repairMotion(c.motion, c.id);
    if (m.notes.length) {
      next = { ...next, motion: m.motion as Record<string, unknown> };
      notes.push(...m.notes);
    }
  }
  const name = nearestComponent(c.component, catalog);
  if (name && name !== c.component) {
    notes.push(`${c.id}: component "${c.component}" → "${name}"`);
    next = { ...next, component: name };
  }
  const entry = catalog.get(next.component);
  if (!entry || (next.props !== undefined && !isObj(next.props))) return { component: next, notes };
  const props: Record<string, unknown> = { ...(next.props ?? {}) };
  let changed = false;
  // RFC-0026: icon names as models write them (`envelope`, `ArrowForward`) in the set's spelling.
  const iconKey = ICON_PROPS[next.component];
  const raw = iconKey ? props[iconKey] : undefined;
  const valid = (v: string) =>
    isIconNameValue(v) || (iconKey === "marker" && (v === "bullet" || v === "none"));
  if (iconKey && typeof raw === "string" && !valid(raw)) {
    const named = nearestIcon(raw);
    if (named) {
      props[iconKey] = named;
      notes.push(`${c.id}: icon "${raw}" → "${named}"`);
    } else if (iconKey !== "name") {
      delete props[iconKey];
      notes.push(`${c.id}: dropped icon "${raw}" (not in the set)`);
    }
    changed = changed || named !== undefined || iconKey !== "name";
  }
  for (const key of Object.keys(props))
    if (!(key in entry.schema.properties)) {
      delete props[key];
      changed = true;
      notes.push(`${c.id}: dropped unknown prop "${key}"`);
    }
  const example = entry.type.example.props as Record<string, unknown>;
  for (const key of entry.schema.required ?? [])
    if (props[key] === undefined && example[key] !== undefined) {
      props[key] = example[key];
      changed = true;
      notes.push(`${c.id}: filled required prop "${key}" from the example`);
    }
  if (changed) next = { ...next, props };
  return { component: next, notes };
}

/** Repairs every component inside a value an operation carries (a component, a list, a surface). */
export function repairValue(value: unknown, catalog: Catalog): { value: unknown; notes: string[] } {
  if (isComponentLike(value)) {
    const r = repairComponent(value, catalog);
    return { value: r.component, notes: r.notes };
  }
  if (Array.isArray(value)) {
    const notes: string[] = [];
    const out = value.map((v) => {
      const r = repairValue(v, catalog);
      notes.push(...r.notes);
      return r.value;
    });
    return { value: out, notes };
  }
  if (isObj(value) && value.kind === "surface" && Array.isArray(value.components)) {
    const r = repairValue(value.components, catalog);
    return { value: { ...value, components: r.value }, notes: r.notes };
  }
  return { value, notes: [] };
}

// ── RFC 6902 JSON Patch ──────────────────────────────────────────────────────────────────────

export interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export class PatchError extends Error {
  override readonly name = "PatchError";
  /** The operation's place in the list. */
  readonly index: number;
  readonly path: string;
  constructor(index: number, path: string, message: string) {
    super(`op ${index} (${path}): ${message}`);
    this.index = index;
    this.path = path;
  }
}

const OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function container(doc: unknown, segments: string[], index: number, path: string): unknown {
  let cur = doc;
  for (const s of segments) {
    if (Array.isArray(cur) && /^(0|[1-9]\d*)$/.test(s) && Number(s) < cur.length)
      cur = cur[Number(s)];
    else if (isObj(cur) && Object.hasOwn(cur, s)) cur = cur[s];
    else throw new PatchError(index, path, "the path does not exist");
  }
  return cur;
}

function split(path: string, index: number): { parent: string[]; key: string } {
  const segments = pointerSegments(path);
  if (!segments || segments.length === 0)
    throw new PatchError(index, path, "not a JSON Pointer to a member");
  if (segments.some((s) => FORBIDDEN_KEYS.has(s)))
    throw new PatchError(index, path, "reserved key");
  return { parent: segments.slice(0, -1), key: segments[segments.length - 1] as string };
}

function read(doc: unknown, path: string, index: number): unknown {
  const segments = pointerSegments(path);
  if (!segments) throw new PatchError(index, path, "not a JSON Pointer");
  return container(doc, segments, index, path);
}

function put(doc: unknown, path: string, value: unknown, index: number, replace: boolean): void {
  const { parent, key } = split(path, index);
  const target = container(doc, parent, index, path);
  if (Array.isArray(target)) {
    if (key === "-" && !replace) {
      target.push(value);
      return;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) throw new PatchError(index, path, "not an array index");
    const i = Number(key);
    if (replace ? i >= target.length : i > target.length)
      throw new PatchError(index, path, "index out of range");
    if (replace) target[i] = value;
    else target.splice(i, 0, value);
    return;
  }
  if (!isObj(target)) throw new PatchError(index, path, "the parent is not an object or array");
  if (replace && !Object.hasOwn(target, key))
    throw new PatchError(index, path, "the path does not exist");
  target[key] = value;
}

function remove(doc: unknown, path: string, index: number): unknown {
  const { parent, key } = split(path, index);
  const target = container(doc, parent, index, path);
  if (Array.isArray(target)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= target.length)
      throw new PatchError(index, path, "index out of range");
    return target.splice(Number(key), 1)[0];
  }
  if (!isObj(target) || !Object.hasOwn(target, key))
    throw new PatchError(index, path, "the path does not exist");
  const old = target[key];
  delete target[key];
  return old;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Applies RFC 6902 operations to a copy of `doc`; all or nothing. */
export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
  if (ops.length > SURFACE_LIMITS.opsPerCall)
    throw new PatchError(
      ops.length - 1,
      "",
      `at most ${SURFACE_LIMITS.opsPerCall} operations per call`,
    );
  const out = structuredClone(doc) as unknown;
  ops.forEach((o, i) => {
    if (!isObj(o) || !OPS.has(o.op as string) || typeof o.path !== "string")
      throw new PatchError(
        i,
        String((o as { path?: unknown })?.path ?? ""),
        "an op with op and path",
      );
    switch (o.op) {
      case "add":
        if (!("value" in o)) throw new PatchError(i, o.path, "add needs a value");
        put(out, o.path, structuredClone(o.value), i, false);
        return;
      case "replace":
        if (!("value" in o)) throw new PatchError(i, o.path, "replace needs a value");
        put(out, o.path, structuredClone(o.value), i, true);
        return;
      case "remove":
        remove(out, o.path, i);
        return;
      case "move": {
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "move needs from");
        if (o.path.startsWith(`${o.from}/`))
          throw new PatchError(i, o.path, "cannot move into itself");
        const v = remove(out, o.from, i);
        put(out, o.path, v, i, false);
        return;
      }
      case "copy":
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "copy needs from");
        put(out, o.path, structuredClone(read(out, o.from, i)), i, false);
        return;
      case "test":
        if (!same(read(out, o.path, i), o.value)) throw new PatchError(i, o.path, "test failed");
        return;
    }
  });
  return out as T;
}

// ── patching a page draft ────────────────────────────────────────────────────────────────────

/** What a build may change on a page: its title, sections and SEO (RFC-0020 §6). */
const PAGE_PATHS = /^\/(?:title|sections|seo)(?:\/|$)/;

export interface PatchResult<T> {
  value: T;
  /** Repairs made to what the operations carried. */
  notes: string[];
}

export interface PatchIssue {
  code: "VALIDATION_FAILED";
  /** JSON Pointer into the page. */
  path: string;
  message: string;
  /** The operation it came from, when known. */
  op?: number;
}

export class SurfacePatchError extends Error {
  override readonly name = "SurfacePatchError";
  readonly issues: readonly PatchIssue[];
  constructor(issues: readonly PatchIssue[]) {
    super(issues.map((i) => `${i.path || "/"}: ${i.message}`).join("; "));
    this.issues = issues;
  }
}

/**
 * The build pipeline for a page (RFC-0020 §6, steps 2–4): repair what the operations carry, apply
 * them, then check every surface on the result. Throws `SurfacePatchError` with A2UI-style
 * `VALIDATION_FAILED` issues; the caller writes the result through the store (policy, contract,
 * CAS).
 */
export function patchPage(
  page: Page,
  ops: readonly PatchOp[],
  catalog: Catalog,
): PatchResult<Page> {
  const notes: string[] = [];
  const repaired = ops.map((o, i) => {
    if (!isObj(o) || typeof o.path !== "string" || !PAGE_PATHS.test(o.path))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: typeof o?.path === "string" ? o.path : "",
          message: "a build may change /title, /sections and /seo only",
          op: i,
        },
      ]);
    if (typeof o.from === "string" && !PAGE_PATHS.test(o.from))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: o.from,
          message: "from must be under /title, /sections or /seo",
          op: i,
        },
      ]);
    if (!("value" in o)) return o;
    const r = repairValue(o.value, catalog);
    notes.push(...r.notes);
    return { ...o, value: r.value };
  });
  let value: Page;
  try {
    value = applyPatch(page, repaired);
  } catch (e) {
    if (e instanceof PatchError)
      throw new SurfacePatchError([
        { code: "VALIDATION_FAILED", path: e.path, message: e.message, op: e.index },
      ]);
    throw e;
  }
  // A build changes the page's parts, never its shape: it keeps a title and a list of sections.
  if (!Array.isArray(value.sections) || typeof value.title !== "string")
    throw new SurfacePatchError([
      {
        code: "VALIDATION_FAILED",
        path: Array.isArray(value.sections) ? "/title" : "/sections",
        message: "the page keeps its title and its list of sections; change what is inside them",
        op: 0,
      },
    ]);
  const issues = checkPageSurfaces(value.sections ?? [], catalog).map(
    (i): PatchIssue => ({ code: "VALIDATION_FAILED", path: i.path, message: i.message }),
  );
  // Surfaces a build writes may not use components the catalog lacks: the store keeps those
  // (they may come from another theme), but a model writing them now has made a mistake.
  value.sections?.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const id of checkSurface(s, catalog).unknown) {
      const j = s.components.findIndex((c) => c.id === id);
      issues.push({
        code: "VALIDATION_FAILED",
        path: `/sections/${i}/components/${j}/component`,
        message: `"${s.components[j]?.component}" is not in the catalog (${catalog.id})`,
      });
    }
  });
  if (issues.length) throw new SurfacePatchError(issues);
  return { value, notes };
}

// ── surfaces in markdown bodies (RFC-0020 §5) ────────────────────────────────────────────────

/** A fence opening a surface: ```surface {"id":"pricing","catalog":"blog@1"} (or ~~~). */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/;
const SURFACE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const CATALOG_ID = /^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$/;

/** One ```surface fence of a body, parsed line by line. */
export interface BodySurface {
  /** The fence's `id` (unique in the body). */
  id: string;
  catalog: string;
  /** The fence as a surface; its `id` is the fence's. */
  section: SurfaceSection;
  /** Problems with the fence itself: its info string, lines that are not JSON, entry sources. */
  issues: PropsIssue[];
  /** False while the closing fence has not arrived (a body still streaming). */
  complete: boolean;
  /** 0-based line of the opening fence in the body. */
  line: number;
}

/**
 * A fence's lines as a surface: every line one component, or `{"data":{…}}` merged into the data
 * model. Only whole lines count; a body that is still streaming passes `complete: false`.
 */
export function parseSurfaceFence(
  info: string,
  lines: readonly string[],
  complete = true,
  line = 0,
): BodySurface {
  const issues: PropsIssue[] = [];
  let meta: Record<string, unknown> = {};
  try {
    const parsed = info.trim() ? (JSON.parse(info) as unknown) : {};
    if (isObj(parsed)) meta = parsed;
    else
      issues.push({
        path: "/info",
        message: 'an object such as {"id":"pricing","catalog":"blog@1"}',
      });
  } catch {
    issues.push({ path: "/info", message: 'JSON such as {"id":"pricing","catalog":"blog@1"}' });
  }
  const id = typeof meta.id === "string" ? meta.id : "";
  const catalog = typeof meta.catalog === "string" ? meta.catalog : "";
  if (!SURFACE_ID.test(id))
    issues.push({ path: "/info/id", message: "a lower-case id such as pricing" });
  if (!CATALOG_ID.test(catalog))
    issues.push({ path: "/info/catalog", message: "the catalog, such as blog@1 (get_catalog)" });
  const components: SurfaceComponent[] = [];
  const data: Record<string, unknown> = {};
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (!text) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      issues.push({ path: `/lines/${i}`, message: "not one JSON object" });
      return;
    }
    if (isObj(value) && Object.keys(value).length === 1 && isObj(value.data)) {
      for (const [k, v] of Object.entries(value.data)) {
        if (isObj(v) && "$source" in v)
          issues.push({
            path: `/lines/${i}/data/${k}`,
            message: "entry sources work in page surfaces only",
          });
        data[k] = v;
      }
    } else if (isObj(value)) components.push(value as unknown as SurfaceComponent);
    else issues.push({ path: `/lines/${i}`, message: 'a component or {"data":{…}}' });
  });
  const section = {
    id,
    kind: "surface",
    catalog,
    components,
    ...(Object.keys(data).length ? { data } : {}),
  } as unknown as SurfaceSection;
  return { id, catalog, section, issues, complete, line };
}

/**
 * Whether a surface needs the interaction runtime (RFC-0020 §4): it has an input, or a button
 * with an action. Everything else is complete as server-rendered HTML.
 */
export function isInteractive(surface: Pick<SurfaceSection, "components">): boolean {
  return surface.components.some(
    (c) =>
      INPUT_COMPONENTS.has(c.component) ||
      // Opening and closing overlays is the browser's (and the overlay module's), not the runtime's.
      (c.component === "Button" &&
        isObj(c.props) &&
        isObj(c.props.onClick) &&
        c.props.onClick.action !== "open" &&
        c.props.onClick.action !== "close") ||
      // RFC-0024 §3: a scroll story writes the step being read into the data.
      c.component === "Scrolly",
  );
}

/** Every ```surface fence of a markdown body, in order; fences inside other code blocks are not. */
export function bodySurfaces(markdown: string): BodySurface[] {
  if (!markdown.includes("surface")) return [];
  const lines = markdown.split(/\r?\n/);
  const out: BodySurface[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i] as string);
    if (!m) continue;
    const fence = m[1] as string;
    const closes = (l: string) =>
      new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`).test(l);
    let j = i + 1;
    while (j < lines.length && !closes(lines[j] as string)) j++;
    if (m[2] === "surface")
      out.push(parseSurfaceFence((m[3] ?? "").trim(), lines.slice(i + 1, j), j < lines.length, i));
    i = j;
  }
  return out;
}

/** Problems with a body's surfaces (paths start with the fence's id); unknown components pass. */
export function checkBodySurfaces(markdown: string, catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const seen = new Set<string>();
  for (const f of bodySurfaces(markdown)) {
    const at = `/surface/${f.id || `line-${f.line + 1}`}`;
    if (!f.complete) out.push({ path: at, message: "the fence is not closed" });
    if (f.id && seen.has(f.id))
      out.push({ path: `${at}/info/id`, message: "used by another fence" });
    seen.add(f.id);
    for (const i of f.issues) out.push({ path: `${at}${i.path}`, message: i.message });
    for (const i of checkSurface(f.section, catalog).issues)
      out.push({ path: `${at}${i.path}`, message: i.message });
  }
  return out;
}

// ── the model prompt (RFC-0020 §2) ───────────────────────────────────────────────────────────

function describeProp(name: string, s: PropSchema, required: boolean): string {
  const req = required ? " (required)" : "";
  switch (s.type) {
    case "string": {
      const parts = s.enum ? s.enum.join("|") : s.format ? `${s.format}` : "text";
      const max = s.maxLength ? `, ≤${s.maxLength}` : "";
      return `${name}: ${parts}${s.enum ? "" : max}${req}`;
    }
    case "integer":
    case "number": {
      const range =
        s.minimum !== undefined || s.maximum !== undefined
          ? ` ${s.minimum ?? ""}..${s.maximum ?? ""}`
          : "";
      return `${name}: ${s.type}${range}${req}`;
    }
    case "boolean":
      return `${name}: true|false${req}`;
    case "array": {
      const item =
        s.items.type === "object"
          ? `{ ${Object.entries(s.items.properties)
              .map(([k, v]) =>
                describeProp(
                  k,
                  v,
                  (s.items as { required?: readonly string[] }).required?.includes(k) ?? false,
                ),
              )
              .join("; ")} }`
          : describeProp("item", s.items, false).replace(/^item: /, "");
      return `${name}: list of ${item}, ≤${s.maxItems ?? BLOCK_LIMITS.arrayItems}${req}`;
    }
    case "object":
      return `${name}: { ${Object.entries(s.properties)
        .map(([k, v]) => describeProp(k, v, s.required?.includes(k) ?? false))
        .join("; ")} }${req}`;
  }
}

/**
 * Instructions for a model writing surfaces against this catalog: the format, bindings, limits
 * and every component with its props and an example. The same catalog validates what it writes.
 */
export function catalogPrompt(catalog: Catalog, locale = "en"): string {
  const lines: string[] = [
    `# Cloudhal surfaces — catalog ${catalog.id}`,
    "",
    "A surface is a page section that describes UI as data, never code:",
    `{"id":"sec_<6-32 letters or digits>","kind":"surface","catalog":"${catalog.id}","components":[…],"data":{…}}`,
    "",
    "## Rules",
    '- `components` is a flat list. One component has id "root". Ids match [a-z][a-z0-9-]{0,40} and are unique in the surface.',
    "- `children` lists ids of other components in the same surface; each component has at most one parent. Nest at most " +
      `${SURFACE_LIMITS.depth} deep; at most ${SURFACE_LIMITS.components} components.`,
    "- `props` follow the component's props below. Any prop may instead be bound to the data model: " +
      '{"path":"/json/pointer"}, or computed by a named function: {"call":"formatDate","args":{"value":{"path":"/d"},"style":"long"}}.',
    `- Functions: ${SURFACE_FUNCTIONS.join(", ")}.`,
    '- Inputs (NumberField, TextField, Checkbox, RadioGroup) write only to the surface\'s data in the reader\'s browser: bind value (checked for Checkbox) with {"path"}, start it in `data` ("" for an empty number), give every input a label, and show the computed result next to it. Buttons may `append` text to a value (keypads) or `set` a computed value, e.g. {"action":"set","path":"/display","value":{"call":"calculate","args":{"expression":{"path":"/display"}}}}.',
    '- Charts: a Chart draws rows from the surface\'s data, e.g. {"id":"c","component":"Chart","props":{"kind":"bar","title":"Readers per month","data":{"path":"/months"},"x":"month","series":[{"field":"readers","label":"Readers"}]}} with "data":{"months":[{"month":"Jan","readers":1200},…]}. Use one only when the numbers are the point; bar for comparing, line or area for change over time, donut for parts of a whole (one series, at most six parts).',
    '- Tables: a Table shows rows from the surface\'s data, e.g. {"id":"t","component":"Table","props":{"caption":"Plans compared","rows":{"path":"/plans"},"columns":[{"field":"name","label":"Plan"},{"field":"price","label":"Price","align":"end","format":"currency","currency":"USD"}],"highlight":{"field":"name","equals":"Pro"}}}. Formats: text, number, currency, percent, date. At most 8 columns; on phones each row becomes a card.',
    "- Compute, don't promise: a total, a price for N seats or a result from the reader's choices is a call, never text such as \"calculated at checkout\". " +
      "For any result with more than one step, write the formula with `calculate` and name its inputs in `vars` (paths into the data, numbers, or a `choose`): " +
      '{"call":"calculate","args":{"expression":"seats * price * (1 + vat)","vars":{"seats":{"path":"/seats"},"price":{"call":"choose","args":{"value":{"path":"/plan"},"cases":{"basic":9,"pro":19}}},"vat":0.2}}}. ' +
      "Formulas use + - * / % ^ and parentheses; names are letters, digits and _. Wrap the result in formatNumber or formatCurrency to show it: " +
      '{"call":"formatCurrency","args":{"currency":"USD","value":{"call":"calculate","args":{…}}}}. A blank input leaves the result empty until it is filled. ' +
      'A whole calculator: data {"kg":"","cm":""}; NumberFields {"label":"Weight","value":{"path":"/kg"},"unit":"kg"} and {"label":"Height","value":{"path":"/cm"},"unit":"cm"}; ' +
      'a Stat {"label":"BMI","value":{"call":"formatNumber","args":{"digits":1,"value":{"call":"calculate","args":{"expression":"kg / (cm/100)^2","vars":{"kg":{"path":"/kg"},"cm":{"path":"/cm"}}}}}}}. ' +
      "Other functions: add/multiply/min/max {values}, subtract/divide {a,b}, round/floor/ceil {value,digits}, power {base,exponent}, if {cond,ifTrue,ifFalse}, sum/average/count {list,field}.",
    '- `visible` (optional) shows a component only when a condition holds: {"path":"/x"}, {"eq":[a,b]}, {"ne":[a,b]}, {"gt":[a,b]}, {"lt":[a,b]}, {"gte":[a,b]}, {"lte":[a,b]}, {"and":[…]}, {"or":[…]}, {"not":…}.',
    // RFC-0024 §2: motion as presets, next to `visible`.
    `- \`motion\` (optional, next to \`visible\`) animates a component with presets, never CSS: {"reveal":"rise","speed":"normal","delay":1}. "reveal" plays once as it scrolls into view: ${MOTION_REVEALS.join(", ")}. "hover": lift, scale, glow; underline (Link, Button, Card, Heading); zoom-media (Card, Image); tilt (Card, Image); magnetic (Button, Link); spotlight (Card, Band). "stagger": true on ${MOTION_STAGGER.join("/")} reveals its children one after another. "delay" 0–4 stagger steps; "speed" fast|normal|slow; "replay": true reveals again on re-entry. "scroll" moves it with the page instead (not with "reveal"): parallax or pan with "depth" -3…3 (negative moves the other way), fade-through, scale-through, rotate-through — for images, cards and decorative parts, never for text people read. split-words, split-chars and split-lines reveal a Heading or a short Text piece by piece (once, as kinetic type). "loop" (alone, decorative only): float (Image, Badge, Stat, Card), pulse (Badge, Button, Stat), gradient-shift (Card, Band), spin-slow (Image, Badge).`,
    'Kinetic headings: Heading "effect" highlight (marks the words *between asterisks*, else the last word), gradient-text, or rotate-words with "words" (2–6) taking turns where {words} stands in the text ("Invoices that {words}" with ["chase themselves","never get lost"]). Marquee scrolls a row of 3+ children by itself (logos, quotes); Counter counts up to "value" once as it comes into view. Anything that loops gets a pause control from the renderer; use at most two per page.',
    'Ambient backgrounds: Band (or Card, CSS kinds only) "ambient": {"kind":"aurora"|"gradient-shift"|"grain"|"beams"|"particles","preset":"dots"|"links"|"stars"|"snow"|"bubbles"|"fireflies" (particles only),"density":"low"|"medium"|"high","colors":"brand"|"accent"|"brand-accent"|"neutral","interactive":true}. One per section, best on the hero; text keeps its contrast, and readers who pause motion or ask for less see a still version.',
    'Page transitions: when the site\'s pageTransition is morph, give the same "morph" key (motion {"morph":"plan-pro"}) to an element on two pages, a card image and the article cover, a pricing card and its plan page heading, and it moves from one to the other as the reader navigates. One key per element on a page.',
    'Scroll story: a Scrolly holds one child that stays in view (a Chart, a Stat, an Image or a Stack of them), then 2–12 Step children with the text; the step being read (1, 2, …) is written to its "step" binding, so the first child changes with it: {"visible":{"eq":[{"path":"/step"},2]}} or {"call":"choose","args":{"value":{"path":"/step"},"cases":{"1":…,"2":…}}}. Put the starting step in the data ({"step":1}). ScrollProgress shows how far the reader is (placement page or section).',
    `Icons (RFC-0026), by name only: an Icon component ({"name","size","tone","label" only when it stands alone}), "icon" on Button (with "iconPosition"), Badge and Stat, and List "marker". Interface: ${ICON_GROUPS.interface.join(", ")}. Actions: ${ICON_GROUPS.actions.join(", ")}. Content: ${ICON_GROUPS.content.join(", ")}. Social: ${ICON_GROUPS.social.join(", ")}. Icons decorate text; never use one as the only way to say something.`,
    'Overlays (Dialog, Drawer, Popover: at most 3 per section; and Lightbox) open only when the reader asks: a Button with "onClick":{"action":"open","target":"<overlay id>"}; a Button inside one with {"action":"close"} closes it. Never open one on load, on a timer or on leaving; content people read or link to belongs on a page. Dialog and Drawer need a title; give a Dialog a fallbackHref page when its content matters. A Tooltip ({"text","for":"<Button or Link id>"}) repeats what is on the page, never replaces it. A Lightbox shows images from items (asset and alt each).',
    "- Motion guides the eye: one entrance per section (a hero heading with rise and its buttons after it, a grid with stagger), hover on things people click, never on body text people are reading. The site's motion level and the reader's reduced-motion setting decide how much actually moves, and pages are complete without it.",
    `- \`data\` is JSON (≤ ${SURFACE_LIMITS.dataBytes / 1024} KB). A key may load entries: {"$source":"entries","query":{"collection":"posts","filter":"category:news","sort":"newest","limit":6}}.`,
    "- Images only from the media library: `asset:<id>`. Links: https, mailto, tel, /site-paths or #anchors.",
    "- Text props take markdown where marked `markdown`; never HTML.",
    "",
    "## In article bodies",
    'Inside markdown, write a surface as a fenced block: the info string holds its id and catalog, every line one component, or a {"data":{…}} line:',
    '```surface {"id":"pricing","catalog":"' + catalog.id + '"}',
    '{"data":{"billing":"monthly"}}',
    '{"id":"root","component":"Stack","children":["t"]}',
    '{"id":"t","component":"Text","props":{"text":"Hello"}}',
    "```",
    "Body surfaces cannot load entries ($source); page surfaces can.",
    "",
    "## Editing",
    "Change a page with RFC 6902 JSON Patch operations on /title, /sections and /seo, e.g.",
    '{"op":"add","path":"/sections/-","value":{…surface…}} or {"op":"add","path":"/sections/0/components/-","value":{…component…}} then add its id to a parent\'s children.',
    "Failed operations come back as VALIDATION_FAILED with a JSON Pointer; fix that part and send again.",
    "",
    "## Components",
  ];
  for (const e of catalog.entries()) {
    const rule = childRule(e);
    const kids =
      rule === "none"
        ? "no children"
        : rule === "any"
          ? "children: any"
          : `children: ${rule.join(", ")}`;
    const desc = localized(e.type.description, locale);
    lines.push(
      `### ${e.name} (${e.kind === "primitive" ? e.type.category : "block"}; ${kids})${desc ? ` — ${desc}` : ""}`,
    );
    const props = Object.entries(e.schema.properties).map(([k, v]) =>
      describeProp(k, v, e.schema.required?.includes(k) ?? false),
    );
    lines.push(props.length ? `props: ${props.join("; ")}` : "props: none");
    lines.push(
      `example: ${JSON.stringify({ id: e.name.toLowerCase(), component: e.name, props: e.type.example.props })}`,
    );
  }
  return lines.join("\n");
}

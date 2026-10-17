/** Layout primitives: Stack, Row, Grid, Columns, Band, Card, Spacer, Divider. */
import {
  AMBIENT_KINDS,
  align,
  ambient,
  href,
  type PrimitiveType,
  schema,
  space,
  surface,
  tone,
} from "./props.ts";

export const LAYOUT_PRIMITIVES: readonly PrimitiveType[] = [
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
];

/** Input and data primitives: Toggle … RadioGroup, Chart, Table. */
import { label, type PrimitiveType, schema } from "./props.ts";

export const INPUT_PRIMITIVES: readonly PrimitiveType[] = [
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
];

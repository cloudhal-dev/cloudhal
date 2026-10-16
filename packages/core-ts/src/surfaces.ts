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
] as const;
/** Components whose values a reader changes: their surface loads the interaction runtime. */
export const INPUT_COMPONENTS = new Set(["Toggle", "Select", "Slider"]);
const TONE = ["surface", "muted", "brand", "inverse"] as const;
const ALIGN = ["start", "center", "end", "stretch"] as const;
const space = (title: Localized) => ({ type: "string" as const, enum: SPACE, title });
const tone = { type: "string" as const, enum: TONE, title: { en: "Tone", tr: "Ton" } };
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
      en: "A full-width band with a tone: the building block of landing pages.",
      tr: "Tonlu, tam genişlikte bir bant.",
    },
    category: "layout",
    props: schema({
      tone,
      width: { type: "string", enum: ["narrow", "wide", "full"] },
      spacing: space({ en: "Spacing", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { tone: "muted", width: "wide", spacing: "xl" } },
  },
  {
    name: "Card",
    title: { en: "Card", tr: "Kart" },
    description: { en: "A framed group; a link when `href` is set.", tr: "Çerçeveli bir grup." },
    category: "layout",
    props: schema({ tone, href }),
    children: "any",
    example: { props: { tone: "surface" } },
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
      },
      ["value", "label"],
    ),
    children: "none",
    example: { props: { value: "99.9%", label: "Uptime" } },
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
        marker: { type: "string", enum: ["bullet", "check", "none"] },
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
];

// Primitive props follow the same subset as block props; checked once at load.
defineBlockTypes(
  PRIMITIVES.map((p) => ({
    name: p.name.toLowerCase(),
    title: p.title,
    where: ["section"] as const,
    props: p.props,
    example: p.example,
  })) as BlockType[],
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
      const n = num(value);
      if (!Number.isFinite(n)) return "";
      const digits = Math.min(Math.max(0, Math.trunc(num(args.digits ?? 2)) || 0), 6);
      return new Intl.NumberFormat(ctx.locale, { maximumFractionDigits: digits }).format(n);
    }
    case "formatCurrency": {
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
      return calculateExpression(text(args.expression));
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
 * `calculate` (RFC-0022 §1.1): a typed arithmetic expression, read by a small grammar, never
 * evaluated as code. `+ - * / %`, parentheses, unary minus and decimals; `×` and `÷` too.
 * Anything else, or a result that is not finite, is "".
 */
export function calculateExpression(source: string): number | "" {
  if (source.length > SURFACE_LIMITS.expressionLength) return "";
  const s = source.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!s) return "";
  let i = 0;
  let depth = 0;
  const fail = (): never => {
    throw new Error("calculate");
  };
  const factor = (): number => {
    if (++depth > 32) fail();
    let v: number;
    if (s[i] === "-") {
      i++;
      v = -factor();
    } else if (s[i] === "(") {
      i++;
      v = expr();
      if (s[i++] !== ")") fail();
    } else {
      const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (!m) return fail();
      i += m[0].length;
      v = Number(m[0]);
    }
    depth--;
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (s[i] === "*" || s[i] === "/" || s[i] === "%") {
      const op = s[i++];
      const r = factor();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    return i === s.length ? finite(v) : "";
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
};

function checkAction(a: Record<string, unknown>, path: string, out: PropsIssue[]): void {
  for (const key of ACTION_NEEDS[String(a.action)] ?? [])
    if (a[key] === undefined)
      out.push({ path: `${path}/${key}`, message: `${a.action} needs ${key}` });
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
    } else literal[k] = v;
  }
  for (const issue of validateProps(entry.schema, literal)) {
    const key = issue.path.split("/")[0] ?? "";
    if (bound.has(key) && issue.message === "required") continue;
    out.push({ path: issue.path ? `${path}/${issue.path}` : path, message: issue.message });
  }
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
    if (c.component === "Button" && isObj(c.props) && isObj(c.props.onClick))
      checkAction(c.props.onClick, `${at}/props/onClick`, issues);
    if (c.visible !== undefined) checkCondition(c.visible, `${at}/visible`, issues);
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
  const name = nearestComponent(c.component, catalog);
  if (name && name !== c.component) {
    notes.push(`${c.id}: component "${c.component}" → "${name}"`);
    next = { ...next, component: name };
  }
  const entry = catalog.get(next.component);
  if (!entry || (next.props !== undefined && !isObj(next.props))) return { component: next, notes };
  const props: Record<string, unknown> = { ...(next.props ?? {}) };
  let changed = false;
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
      (c.component === "Button" && isObj(c.props) && isObj(c.props.onClick)),
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
    "- Compute, don't promise: a total, a price for N seats or a result from the reader's choices is a call, never text such as \"calculated at checkout\". Calls nest: an argument may be another call. " +
      '`add`/`multiply`/`min`/`max` take {"values":[…]}; `subtract`/`divide` take {"a","b"} (divide by 0 gives `fallback`); `round`/`floor`/`ceil` take {"value","digits"}; `choose` maps a value to a case: {"call":"choose","args":{"value":{"path":"/plan"},"cases":{"monthly":9,"yearly":90}}}; `if` takes {"cond":<condition>,"ifTrue","ifFalse"}; `sum`/`average`/`count` take {"list":{"path":"/rows"},"field":"price"}; `calculate` reads a typed expression such as "12*3+4". ' +
      'Example, seats × price: {"call":"formatCurrency","args":{"currency":"USD","value":{"call":"multiply","args":{"values":[{"path":"/seats"},{"call":"choose","args":{"value":{"path":"/billing"},"cases":{"monthly":9,"yearly":7.5}}}]}}}}. A blank input gives an empty result until it is filled.',
    '- `visible` (optional) shows a component only when a condition holds: {"path":"/x"}, {"eq":[a,b]}, {"ne":[a,b]}, {"gt":[a,b]}, {"lt":[a,b]}, {"gte":[a,b]}, {"lte":[a,b]}, {"and":[…]}, {"or":[…]}, {"not":…}.',
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

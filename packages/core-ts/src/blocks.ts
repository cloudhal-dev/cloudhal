/**
 * The block registry (RFC-0015, ADR-0030): typed blocks for page sections (`kind: "component"`)
 * and, from phase 6b, markdown body directives. A block type is data — a name, where it may
 * appear, a props schema and an example; its rendering lives in the renderer or the theme.
 *
 * Props schemas are a JSON Schema subset (RFC-0015 §3) checked here by a small interpreter: no
 * code generation and no `eval`, so the same checks run on Workers, in Studio and in Node, and
 * Studio builds its forms from the same schema. Type names are one global namespace of plain
 * English names (`callout`, `pricing-table`), never theme-prefixed (D7).
 *
 * Dependency-free and Worker-safe.
 */

/** A string, or one per UI locale (`en` required). */
export type Localized = string | Readonly<Record<string, string>>;

interface Annotations {
  title?: Localized;
  description?: Localized;
  /** Form prefill only; never applied silently. */
  default?: unknown;
  "x-widget"?: "textarea" | "radio" | "asset-picker";
}

export interface StringPropSchema extends Annotations {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: readonly string[];
  /** `url`: a safe link; `asset`: `asset:<id>`; `color`: `#rrggbb`; `markdown`: markdown text. */
  format?: "url" | "asset" | "color" | "markdown";
}

export interface NumberPropSchema extends Annotations {
  type: "number" | "integer";
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
}

export interface BooleanPropSchema extends Annotations {
  type: "boolean";
}

export type ScalarPropSchema = StringPropSchema | NumberPropSchema | BooleanPropSchema;

/** An object of scalars: an array item, or a nested object one level below the root. */
export interface FlatObjectPropSchema extends Annotations {
  type: "object";
  properties: Readonly<Record<string, ScalarPropSchema>>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface ArrayPropSchema extends Annotations {
  type: "array";
  items: ScalarPropSchema | FlatObjectPropSchema;
  minItems?: number;
  maxItems?: number;
}

export type PropSchema = ScalarPropSchema | ArrayPropSchema | FlatObjectPropSchema;

/** A block's props: the root object of the subset. */
export interface PropsSchema extends Annotations {
  type: "object";
  properties: Readonly<Record<string, PropSchema>>;
  required?: readonly string[];
  additionalProperties: false;
}

export type BlockPlace = "section" | "body";

export interface BlockType {
  /** `[a-z][a-z0-9-]{1,40}`: a plain English name in one global namespace (D7). */
  name: string;
  title: Localized;
  description?: Localized;
  /** A Phosphor icon name for Studio's menus. */
  icon?: string;
  category?: "text" | "media" | "layout" | "data";
  where: readonly BlockPlace[];
  props: PropsSchema;
  /**
   * `markdown`: the block wraps markdown — a body directive's inner text, or `props.content` in a
   * section (added to the schema by `sectionSchema`). `none` (default): no inner text.
   */
  content?: "markdown" | "none";
  example: { props: Readonly<Record<string, unknown>>; markdown?: string };
}

export const BLOCK_NAME = /^[a-z][a-z0-9-]{1,40}$/;
/** Limits of the subset (RFC-0015 §3 and §Security). */
export const BLOCK_LIMITS = {
  props: 64,
  stringLength: 10_000,
  content: 20_000,
  enumValues: 50,
  arrayItems: 50,
  patternLength: 200,
} as const;

/** One problem with a schema or a value, at a JSON-pointer-like path (`items/2/question`). */
export interface PropsIssue {
  path: string;
  message: string;
}

// ── checking a schema (registration) ─────────────────────────────────────────────────────────

const ANNOTATIONS = ["title", "description", "default", "x-widget"];
const KEYS: Record<string, readonly string[]> = {
  string: ["type", "minLength", "maxLength", "pattern", "enum", "format", ...ANNOTATIONS],
  number: ["type", "minimum", "maximum", "multipleOf", ...ANNOTATIONS],
  integer: ["type", "minimum", "maximum", "multipleOf", ...ANNOTATIONS],
  boolean: ["type", ...ANNOTATIONS],
  array: ["type", "items", "minItems", "maxItems", ...ANNOTATIONS],
  object: ["type", "properties", "required", "additionalProperties", ...ANNOTATIONS],
};
const FORMATS = new Set(["url", "asset", "color", "markdown"]);
const WIDGETS = new Set(["textarea", "radio", "asset-picker"]);
const PROP_NAME = /^[a-z][A-Za-z0-9]{0,40}$/;
/** Backreferences and lookaround: not linear-time, so not allowed in a theme's patterns. */
const UNSAFE_PATTERN = /\\[1-9]|\(\?[=!<]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

function checkLocalized(v: unknown, path: string, out: PropsIssue[]) {
  if (v === undefined || typeof v === "string") return;
  if (
    !isObj(v) ||
    typeof v.en !== "string" ||
    !Object.values(v).every((x) => typeof x === "string")
  )
    out.push({ path, message: "a string, or strings per locale with `en`" });
}

function checkSchema(
  s: unknown,
  path: string,
  /** `root`: the props object; `top`: one prop; `item`: an array's items; `leaf`: inside those. */
  depth: "root" | "top" | "item" | "leaf",
  out: PropsIssue[],
): void {
  if (!isObj(s)) {
    out.push({ path, message: "a schema object" });
    return;
  }
  const type = s.type;
  if (typeof type !== "string" || !(type in KEYS)) {
    out.push({ path, message: "type: string, integer, number, boolean, array or object" });
    return;
  }
  for (const key of Object.keys(s))
    if (!(KEYS[type] ?? []).includes(key))
      out.push({ path: `${path}/${key}`, message: `not in the props schema subset (${type})` });
  checkLocalized(s.title, `${path}/title`, out);
  checkLocalized(s.description, `${path}/description`, out);
  if (s["x-widget"] !== undefined && !WIDGETS.has(s["x-widget"] as string))
    out.push({ path: `${path}/x-widget`, message: "textarea, radio or asset-picker" });
  switch (type) {
    case "string": {
      if (
        s.maxLength !== undefined &&
        (!isCount(s.maxLength) || (s.maxLength as number) > BLOCK_LIMITS.stringLength)
      )
        out.push({ path: `${path}/maxLength`, message: `at most ${BLOCK_LIMITS.stringLength}` });
      if (s.minLength !== undefined && !isCount(s.minLength))
        out.push({ path: `${path}/minLength`, message: "a whole number" });
      if (s.format !== undefined && !FORMATS.has(s.format as string))
        out.push({ path: `${path}/format`, message: "url, asset, color or markdown" });
      if (s.enum !== undefined) {
        const values = s.enum;
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          values.length > BLOCK_LIMITS.enumValues ||
          !values.every((v) => typeof v === "string")
        )
          out.push({ path: `${path}/enum`, message: `1 to ${BLOCK_LIMITS.enumValues} strings` });
      }
      if (s.pattern !== undefined) {
        const p = s.pattern;
        if (
          typeof p !== "string" ||
          p.length > BLOCK_LIMITS.patternLength ||
          UNSAFE_PATTERN.test(p)
        )
          out.push({
            path: `${path}/pattern`,
            message: `a regular expression of at most ${BLOCK_LIMITS.patternLength} characters, without backreferences or lookaround`,
          });
        else
          try {
            new RegExp(p, "u");
          } catch {
            out.push({ path: `${path}/pattern`, message: "not a valid regular expression" });
          }
      }
      return;
    }
    case "number":
    case "integer":
      for (const key of ["minimum", "maximum", "multipleOf"])
        if (s[key] !== undefined && (typeof s[key] !== "number" || !Number.isFinite(s[key])))
          out.push({ path: `${path}/${key}`, message: "a number" });
      return;
    case "boolean":
      return;
    case "array":
      if (depth !== "top") {
        out.push({ path, message: "lists only at the top level of props" });
        return;
      }
      if (
        s.maxItems === undefined ||
        !isCount(s.maxItems) ||
        (s.maxItems as number) > BLOCK_LIMITS.arrayItems
      )
        out.push({
          path: `${path}/maxItems`,
          message: `required, at most ${BLOCK_LIMITS.arrayItems}`,
        });
      if (s.minItems !== undefined && !isCount(s.minItems))
        out.push({ path: `${path}/minItems`, message: "a whole number" });
      checkSchema(s.items, `${path}/items`, "item", out);
      return;
    case "object": {
      if (depth === "leaf") {
        out.push({ path, message: "scalars only one level down" });
        return;
      }
      if (s.additionalProperties !== false)
        out.push({ path: `${path}/additionalProperties`, message: "must be false" });
      const props = s.properties;
      if (!isObj(props)) {
        out.push({ path: `${path}/properties`, message: "an object of property schemas" });
        return;
      }
      const names = Object.keys(props);
      if (names.length > BLOCK_LIMITS.props)
        out.push({ path: `${path}/properties`, message: `at most ${BLOCK_LIMITS.props} props` });
      for (const name of names) {
        if (!PROP_NAME.test(name))
          out.push({ path: `${path}/properties/${name}`, message: "a camelCase name" });
        const child = props[name];
        if (
          depth !== "root" &&
          isObj(child) &&
          (child.type === "object" || child.type === "array")
        ) {
          out.push({ path: `${path}/properties/${name}`, message: "scalars only one level down" });
          continue;
        }
        checkSchema(child, `${path}/properties/${name}`, depth === "root" ? "top" : "leaf", out);
      }
      if (s.required !== undefined) {
        const required = s.required;
        if (!Array.isArray(required) || !required.every((r) => typeof r === "string" && r in props))
          out.push({ path: `${path}/required`, message: "names of declared properties" });
      }
      return;
    }
  }
}

/** Problems with a props schema (empty when it is inside the subset). */
export function checkPropsSchema(schema: unknown): PropsIssue[] {
  const out: PropsIssue[] = [];
  if (!isObj(schema) || schema.type !== "object") {
    out.push({ path: "", message: "the root of a props schema is an object" });
    return out;
  }
  checkSchema(schema, "", "root", out);
  return out;
}

// ── validating a value ──────────────────────────────────────────────────────────────────────

const ASSET = /^asset:[a-z]+_[A-Za-z0-9]{6,32}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const patterns = new Map<string, RegExp>();
const patternOf = (p: string) => {
  let re = patterns.get(p);
  if (!re) {
    re = new RegExp(p, "u");
    patterns.set(p, re);
  }
  return re;
};

/**
 * A link a block may carry: `https:`, `http:`, `mailto:`, `tel:`, a site-relative path or a
 * fragment, and `asset:<id>`. The renderer applies its own `safeHref` again when it renders.
 */
export function isBlockUrl(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 2048 || /\s/.test(v)) return false;
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 0x20) return false;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  if (v.startsWith("#")) return true;
  if (ASSET.test(v)) return true;
  return /^(https?:\/\/[^/\s]|mailto:|tel:)/i.test(v);
}

function validateScalar(s: ScalarPropSchema, v: unknown, path: string, out: PropsIssue[]) {
  switch (s.type) {
    case "string": {
      if (typeof v !== "string") {
        out.push({ path, message: "text" });
        return;
      }
      const max = Math.min(s.maxLength ?? BLOCK_LIMITS.stringLength, BLOCK_LIMITS.stringLength);
      if (v.length > max) out.push({ path, message: `at most ${max} characters` });
      if (s.minLength !== undefined && v.length < s.minLength)
        out.push({
          path,
          message: s.minLength === 1 ? "required" : `at least ${s.minLength} characters`,
        });
      if (s.enum && !s.enum.includes(v)) out.push({ path, message: `one of ${s.enum.join(", ")}` });
      if (s.pattern && !patternOf(s.pattern).test(v))
        out.push({ path, message: "not in the expected form" });
      if (s.format === "url" && v && !isBlockUrl(v)) out.push({ path, message: "a safe link" });
      if (s.format === "asset" && v && !ASSET.test(v))
        out.push({ path, message: "an asset:<id> reference" });
      if (s.format === "color" && v && !COLOR.test(v))
        out.push({ path, message: "a #rrggbb color" });
      return;
    }
    case "number":
    case "integer": {
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (s.type === "integer" && !Number.isInteger(v))
      ) {
        out.push({ path, message: s.type === "integer" ? "a whole number" : "a number" });
        return;
      }
      if (s.minimum !== undefined && v < s.minimum)
        out.push({ path, message: `at least ${s.minimum}` });
      if (s.maximum !== undefined && v > s.maximum)
        out.push({ path, message: `at most ${s.maximum}` });
      if (
        s.multipleOf !== undefined &&
        s.multipleOf > 0 &&
        Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9
      )
        out.push({ path, message: `a multiple of ${s.multipleOf}` });
      return;
    }
    case "boolean":
      if (typeof v !== "boolean") out.push({ path, message: "true or false" });
      return;
  }
}

function validateObject(
  s: PropsSchema | FlatObjectPropSchema,
  v: unknown,
  path: string,
  out: PropsIssue[],
) {
  if (!isObj(v)) {
    out.push({ path, message: "an object" });
    return;
  }
  const at = (key: string) => (path ? `${path}/${key}` : key);
  for (const key of Object.keys(v))
    if (!(key in s.properties)) out.push({ path: at(key), message: "not a prop of this block" });
  for (const key of s.required ?? [])
    if (v[key] === undefined) out.push({ path: at(key), message: "required" });
  for (const [key, child] of Object.entries(s.properties)) {
    const value = v[key];
    if (value === undefined) continue;
    if (child.type === "array") {
      if (!Array.isArray(value)) {
        out.push({ path: at(key), message: "a list" });
        continue;
      }
      const max = Math.min(child.maxItems ?? BLOCK_LIMITS.arrayItems, BLOCK_LIMITS.arrayItems);
      if (value.length > max) out.push({ path: at(key), message: `at most ${max} items` });
      if (child.minItems !== undefined && value.length < child.minItems)
        out.push({
          path: at(key),
          message: `at least ${child.minItems} ${child.minItems === 1 ? "item" : "items"}`,
        });
      value.slice(0, max).forEach((item, i) => {
        if (child.items.type === "object")
          validateObject(child.items, item, `${at(key)}/${i}`, out);
        else validateScalar(child.items, item, `${at(key)}/${i}`, out);
      });
    } else if (child.type === "object") validateObject(child, value, at(key), out);
    else validateScalar(child, value, at(key), out);
  }
}

/** Problems with `props` against `schema` (empty when valid). */
export function validateProps(schema: PropsSchema, props: unknown): PropsIssue[] {
  const out: PropsIssue[] = [];
  if (isObj(props) && Object.keys(props).length > BLOCK_LIMITS.props)
    out.push({ path: "", message: `at most ${BLOCK_LIMITS.props} props` });
  validateObject(schema, props, "", out);
  return out;
}

/** The schema a block's props follow in a page section: a container gains `content` (markdown). */
export function sectionSchema(type: BlockType): PropsSchema {
  if (type.content !== "markdown") return type.props;
  return {
    ...type.props,
    properties: {
      ...type.props.properties,
      content: {
        type: "string",
        format: "markdown",
        maxLength: BLOCK_LIMITS.stringLength,
        title: { en: "Content", tr: "İçerik" },
        "x-widget": "textarea",
      },
    },
  };
}

// ── defining types and the registry ─────────────────────────────────────────────────────────

export class BlockTypeError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`block types are invalid:\n- ${issues.join("\n- ")}`);
    this.name = "BlockTypeError";
    this.issues = issues;
  }
}

const SCALAR = new Set(["string", "number", "integer", "boolean"]);

/** Problems with one block type (name, places, schema, body-scalar rule, example). */
export function checkBlockType(t: unknown): string[] {
  const issues: string[] = [];
  if (!isObj(t)) return ["a block type is an object"];
  const name = typeof t.name === "string" ? t.name : "";
  const at = (m: string) => `${name || "(unnamed)"}: ${m}`;
  if (!BLOCK_NAME.test(name)) issues.push(at("name: lowercase English words joined by hyphens"));
  const loc: PropsIssue[] = [];
  checkLocalized(t.title, "title", loc);
  if (t.title === undefined) loc.push({ path: "title", message: "required" });
  checkLocalized(t.description, "description", loc);
  for (const i of loc) issues.push(at(`${i.path}: ${i.message}`));
  const where = t.where;
  if (
    !Array.isArray(where) ||
    where.length === 0 ||
    !where.every((w) => w === "section" || w === "body")
  )
    issues.push(at("where: section and/or body"));
  if (t.content !== undefined && t.content !== "markdown" && t.content !== "none")
    issues.push(at("content: markdown or none"));
  for (const i of checkPropsSchema(t.props)) issues.push(at(`props${i.path}: ${i.message}`));
  if (issues.length) return issues;
  const type = t as unknown as BlockType;
  if (type.content === "markdown" && "content" in type.props.properties)
    issues.push(at("props: `content` is reserved for the inner markdown"));
  if (type.where.includes("body"))
    for (const [prop, s] of Object.entries(type.props.properties))
      if (!SCALAR.has(s.type)) issues.push(at(`props/${prop}: body blocks take scalar props only`));
  if (!isObj(type.example) || !isObj(type.example.props)) issues.push(at("example: { props }"));
  else
    for (const i of validateProps(type.props, type.example.props))
      issues.push(at(`example/${i.path}: ${i.message}`));
  return issues;
}

/** Checks block types (a theme's `src/blocks.ts`) and returns them frozen; throws on problems. */
export function defineBlockTypes(types: readonly BlockType[]): readonly BlockType[] {
  const issues = types.flatMap(checkBlockType);
  const seen = new Set<string>();
  for (const t of types) {
    if (seen.has(t.name)) issues.push(`${t.name}: defined twice`);
    seen.add(t.name);
  }
  if (issues.length) throw new BlockTypeError(issues);
  return Object.freeze(types.map((t) => Object.freeze({ ...t })));
}

const TONES = ["info", "success", "warning", "danger"] as const;

/** Cloudhal's own block types (RFC-0015 §4). Their names are reserved (D7). */
export const BUILT_IN_BLOCK_TYPES: readonly BlockType[] = defineBlockTypes([
  {
    name: "callout",
    title: { en: "Callout", tr: "Bilgi kutusu" },
    description: {
      en: "A highlighted note, tip or warning.",
      tr: "Öne çıkan bir not, ipucu ya da uyarı.",
    },
    icon: "Info",
    category: "text",
    where: ["section", "body"],
    content: "markdown",
    props: {
      type: "object",
      additionalProperties: false,
      properties: {
        tone: {
          type: "string",
          enum: TONES,
          default: "info",
          title: { en: "Tone", tr: "Ton" },
          "x-widget": "radio",
        },
        title: { type: "string", maxLength: 120, title: { en: "Title", tr: "Başlık" } },
      },
    },
    example: { props: { tone: "info", title: "Good to know" }, markdown: "Write the note here." },
  },
  {
    name: "button",
    title: { en: "Button", tr: "Düğme" },
    description: { en: "A link styled as a button.", tr: "Düğme görünümünde bir bağlantı." },
    icon: "CursorClick",
    category: "layout",
    where: ["section", "body"],
    props: {
      type: "object",
      additionalProperties: false,
      required: ["label", "href"],
      properties: {
        label: {
          type: "string",
          minLength: 1,
          maxLength: 60,
          title: { en: "Label", tr: "Etiket" },
        },
        href: {
          type: "string",
          format: "url",
          maxLength: 2048,
          title: { en: "Link", tr: "Bağlantı" },
        },
        variant: {
          type: "string",
          enum: ["primary", "secondary"],
          default: "primary",
          title: { en: "Style", tr: "Stil" },
          "x-widget": "radio",
        },
      },
    },
    example: { props: { label: "Get started", href: "/start", variant: "primary" } },
  },
  {
    name: "embed",
    title: { en: "Video", tr: "Video" },
    description: {
      en: "A YouTube or Vimeo video, loaded only when the reader clicks Play.",
      tr: "Okur Oynat'a tıklayınca yüklenen bir YouTube ya da Vimeo videosu.",
    },
    icon: "Play",
    category: "media",
    where: ["section", "body"],
    props: {
      type: "object",
      additionalProperties: false,
      required: ["url", "title"],
      properties: {
        url: {
          type: "string",
          format: "url",
          maxLength: 2048,
          pattern:
            "^https://(www\\.|m\\.)?(youtube\\.com/watch\\?v=|youtu\\.be/|vimeo\\.com/)[A-Za-z0-9_-]+",
          title: { en: "Video address", tr: "Video adresi" },
          description: {
            en: "A YouTube or Vimeo link.",
            tr: "Bir YouTube ya da Vimeo bağlantısı.",
          },
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          title: { en: "Title", tr: "Başlık" },
          description: {
            en: "Read out by screen readers.",
            tr: "Ekran okuyucular bunu okur.",
          },
        },
      },
    },
    example: {
      props: { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", title: "Big Buck Bunny" },
    },
  },
  {
    name: "faq",
    title: { en: "Questions and answers", tr: "Sık sorulan sorular" },
    description: {
      en: "A list of questions with expandable answers.",
      tr: "Açılır yanıtlarıyla bir soru listesi.",
    },
    icon: "Question",
    category: "text",
    where: ["section"],
    props: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          title: { en: "Questions", tr: "Sorular" },
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "answer"],
            properties: {
              question: {
                type: "string",
                minLength: 1,
                maxLength: 300,
                title: { en: "Question", tr: "Soru" },
              },
              answer: {
                type: "string",
                minLength: 1,
                maxLength: 2000,
                format: "markdown",
                title: { en: "Answer", tr: "Yanıt" },
                "x-widget": "textarea",
              },
            },
          },
        },
      },
    },
    example: {
      props: { items: [{ question: "What is this?", answer: "A short answer." }] },
    },
  },
]);

export interface BlockRegistry {
  get(name: string): BlockType | undefined;
  /** Every type, built-ins first, optionally only those allowed in `where`. */
  list(where?: BlockPlace): BlockType[];
  /**
   * Problems with a component section's props: `undefined` when the type is not registered
   * (kept as is, D4), else the issues (empty when valid).
   */
  checkSection(type: string, props: unknown): PropsIssue[] | undefined;
}

/**
 * The deployment's registry: the built-ins and a theme's types. A theme type named like a
 * built-in, or two with one name, is an error (D7).
 */
export function createBlockRegistry(themeTypes: readonly BlockType[] = []): BlockRegistry {
  const byName = new Map(BUILT_IN_BLOCK_TYPES.map((t) => [t.name, t]));
  const issues: string[] = [];
  for (const t of defineBlockTypes(themeTypes)) {
    if (byName.has(t.name)) issues.push(`${t.name}: a built-in block type has this name`);
    else byName.set(t.name, t);
  }
  if (issues.length) throw new BlockTypeError(issues);
  const all = [...byName.values()];
  return {
    get: (name) => byName.get(name),
    list: (where) => (where ? all.filter((t) => t.where.includes(where)) : [...all]),
    checkSection(name, props) {
      const type = byName.get(name);
      if (!type) return undefined;
      if (!type.where.includes("section"))
        return [{ path: "", message: `${name} is a body block, not a section` }];
      return validateProps(sectionSchema(type), props);
    },
  };
}

/** A localized string in `locale`, else English, else the first one. */
export function localized(value: Localized | undefined, locale: string): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return (
    value[locale] ?? value[locale.split("-")[0] ?? ""] ?? value.en ?? Object.values(value)[0] ?? ""
  );
}

/**
 * The "no hard-coded words" rule (AGENTS.md hard rule 10, DESIGN.md §1): every word a person
 * reads in Studio or a `@cloudhal/ui` block comes from the message catalogs through `useT()`, or
 * from a prop the screen fills from them. Parsed, not grepped: the files go through oxc (Vite's
 * `parseAst`) and only strings in places a person reads are checked —
 * - JSX text and string children (`<span>Save</span>`, `{open ? "Hide" : "Show"}`);
 * - attributes and object properties that carry words (`aria-label`, `title`, `placeholder`,
 *   `alt`, `label`, `description`, `content`, and every `…Label`/`…Text`/`…Title`/… name);
 * - default values and fallbacks (`label = "Remove"`, `labels.compare ?? "Compare"`);
 * - toasts and browser dialogs (`toast.error("…")`, `confirm("…")`), `document.title`.
 * Ids, URLs, class names, data attributes, keys, protocol values and log text are never in those
 * places, or are not prose (no space, not capitalised: `primary`, `menus.save.title`).
 *
 * Legitimate literals: the `ALLOWED` list below (product names and symbols, with a reason), or an
 * `i18n-ignore: <reason>` comment on the line or the line above (one literal, reviewed in the PR).
 */
import { parseAst } from "vite";
import { messageRuleHits } from "./i18n-message-rules.ts";

export interface TextViolation {
  rule: "i18n" | "i18n-plural" | "i18n-concat" | "i18n-format";
  message: string;
  line: number;
  text: string;
}

/**
 * Strings that read the same in every language Studio ships. Keep this short and give a reason;
 * anything a translator might want to change belongs in the catalogs.
 */
export const ALLOWED: ReadonlyMap<string, string> = new Map([
  ["Cloudhal", "product name"],
  ["Cloudhal Studio", "product name"],
  ["Cloudflare", "company and product name"],
  ["GitHub", "product name"],
  ["Markdown", "format name"],
  ["JSON", "format name"],
  ["HTML", "format name"],
  ["RSS", "format name"],
]);

/**
 * Declarations whose strings are not shown to anyone: Kumo's variant tables (`kumo add` copies them
 * into `blocks/kumo/`) describe each variant for the Kumo CLI's docs.
 */
const SKIPPED_DECLARATIONS = /^KUMO_\w+_VARIANTS$/;

/** Attribute and property names whose value a person reads (plus the suffixes below). */
const WORD_NAMES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-valuetext",
  "aria-roledescription",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "content",
  "heading",
  "caption",
  "message",
  "hint",
  "tooltip",
  "summary",
  "subtitle",
  "legend",
]);
const WORD_SUFFIX =
  /(Label|Labels|Text|Title|Description|Placeholder|Message|Hint|Caption|Heading|Tooltip|Summary)$/;
/** Elements whose text is code or keys, not words. */
const CODE_ELEMENTS = new Set(["code", "kbd", "pre", "samp"]);
const TOAST_CALLS =
  /^(toast(\.(success|error|info|warning|message|add))?|confirm|alert|prompt|window\.(confirm|alert|prompt))$/;

const isWordName = (name: string) => WORD_NAMES.has(name) || WORD_SUFFIX.test(name);

/**
 * Whether a literal reads as words: has letters, is not an id, key, path, URL, email or class
 * list, and is not on the allow-list. `Save`, `Delete page`, `Loading…` are words;
 * `primary`, `menus.save.title`, `px-2 text-sm`, `/api/sites`, `OK`, `en` are not.
 */
export function isWords(raw: string): boolean {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!/\p{L}{2,}/u.test(s)) return false;
  if (ALLOWED.has(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\/|^mailto:|^[\w.+-]+@[\w-]+\.[\w.]+$/i.test(s)) return false;
  if (/^[/.#{<$@[(]|^--/.test(s)) return false;
  // One token without a capitalised word: ids, keys, slugs, enum values, acronyms (`URL`).
  if (!/\s/.test(s) && !/^\p{Lu}\p{Ll}/u.test(s)) return false;
  // Class lists and other space-separated tokens that are all lower-case code-ish words.
  if (/^[a-z0-9:_[\]/.%!-]+( [a-z0-9:_[\]/.%!-]+)+$/.test(s) && /[-:[]/.test(s)) return false;
  return true;
}

type Node = { type: string; start: number; end: number; [k: string]: unknown };
const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && typeof (v as Node).type === "string";

function nameOf(node: unknown): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name as string;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "MemberExpression" && !node.computed)
    return [nameOf(node.object), nameOf(node.property)].filter(Boolean).join(".");
  if (node.type === "JSXNamespacedName") return `${nameOf(node.namespace)}:${nameOf(node.name)}`;
  return undefined;
}

/** The string literals an expression evaluates to (not its call arguments or keys). */
function valueStrings(node: unknown, out: Node[] = []): Node[] {
  if (!isNode(node)) return out;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push(node);
      break;
    case "TemplateLiteral":
      for (const q of node.quasis as Node[]) out.push(q);
      break;
    case "ConditionalExpression":
      valueStrings(node.consequent, out);
      valueStrings(node.alternate, out);
      break;
    case "LogicalExpression":
    case "BinaryExpression":
      if (node.type === "LogicalExpression" || node.operator === "+") {
        valueStrings(node.left, out);
        valueStrings(node.right, out);
      }
      break;
    case "JSXExpressionContainer":
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      valueStrings(node.expression, out);
      break;
    case "ArrayExpression":
      for (const e of node.elements as unknown[]) valueStrings(e, out);
      break;
  }
  return out;
}

function textOf(node: Node): string {
  if (node.type === "TemplateElement") return (node.value as { cooked?: string }).cooked ?? "";
  return String(node.value ?? "");
}

/** Lints one file's source. `file` decides TSX vs TS parsing. */
export function lintText(file: string, source: string): TextViolation[] {
  const lang = file.endsWith(".tsx") ? "tsx" : "ts";
  const program = parseAst(source, { lang }) as unknown as Node;
  const lines = source.split("\n");
  const lineAt = (pos: number) => source.slice(0, pos).split("\n").length;
  const ignored = (line: number) =>
    /i18n-ignore\b/.test(lines[line - 1] ?? "") || /i18n-ignore\b/.test(lines[line - 2] ?? "");
  const out: TextViolation[] = [];
  const seen = new Set<number>();
  const report = (node: Node, where: string, text = textOf(node)) => {
    if (seen.has(node.start) || !isWords(text)) return;
    seen.add(node.start);
    const line = lineAt(node.start);
    if (ignored(line)) return;
    const shown = text.replace(/\s+/g, " ").trim().slice(0, 60);
    out.push({
      rule: "i18n",
      line,
      text: shown,
      message: `hard-coded words "${shown}" (${where}) — add a key to the catalogs (en and tr, DESIGN.md §1) and use t("…"); blocks take the words as props`,
    });
  };
  const values = (expr: unknown, where: string) => {
    for (const s of valueStrings(expr)) report(s, where);
  };

  // A table of words keyed by value (`{ draft: "Draft", review: "In review" }`): two or more
  // capitalised phrases side by side are labels, whatever the keys are called.
  const labelMap = (node: Node) => {
    const phrases = (node.properties as Node[])
      .filter((p) => p.type === "Property" && !p.computed)
      .map((p) => p.value as Node)
      .filter((v) => v.type === "Literal" && typeof v.value === "string")
      .filter((v) => isWords(v.value as string) && /^\p{Lu}\p{Ll}/u.test(v.value as string));
    if (phrases.length >= 2) for (const v of phrases) report(v, "table of labels");
  };

  const visit = (node: Node, parent: Node | undefined, codeDepth: number) => {
    switch (node.type) {
      case "JSXText":
        if (codeDepth === 0) report(node, "JSX text", node.value as string);
        break;
      case "JSXExpressionContainer":
        if (codeDepth === 0 && (parent?.type === "JSXElement" || parent?.type === "JSXFragment"))
          values(node.expression, "JSX child");
        break;
      case "JSXAttribute": {
        const name = nameOf(node.name) ?? "";
        if (isWordName(name)) values(node.value, `${name}=`);
        break;
      }
      case "Property": {
        const name = nameOf(node.key) ?? "";
        if (!node.computed && isWordName(name)) values(node.value, `${name}:`);
        break;
      }
      case "AssignmentPattern": {
        const name = nameOf(node.left) ?? "";
        if (isWordName(name)) values(node.right, `default ${name}`);
        break;
      }
      case "LogicalExpression":
        if (node.operator === "??" || node.operator === "||") {
          const right = node.right as Node;
          if (right.type === "Literal" || right.type === "TemplateLiteral")
            values(right, `fallback after ${node.operator}`);
        }
        break;
      case "AssignmentExpression":
        if (nameOf(node.left) === "document.title") values(node.right, "document.title");
        break;
      case "ObjectExpression":
        labelMap(node);
        break;
      case "VariableDeclarator":
        if (SKIPPED_DECLARATIONS.test(nameOf(node.id) ?? "")) return;
        break;
      case "CallExpression": {
        const callee = nameOf(node.callee) ?? "";
        if (TOAST_CALLS.test(callee))
          for (const a of node.arguments as Node[]) values(a, `${callee}()`);
        break;
      }
    }
    let depth = codeDepth;
    if (node.type === "JSXElement") {
      const tag = nameOf((node.openingElement as Node).name) ?? "";
      if (CODE_ELEMENTS.has(tag)) depth++;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      if (Array.isArray(value)) {
        for (const v of value) if (isNode(v)) visit(v, node, depth);
      } else if (isNode(value)) visit(value, node, depth);
    }
  };
  visit(program, undefined, 0);
  // RFC-0032 §5.5: plurals by hand, assembled sentences, comma-joined lists.
  for (const hit of messageRuleHits(program)) {
    const line = lineAt(hit.node.start);
    if (ignored(line)) continue;
    const text = source.slice(hit.node.start, hit.node.end).replace(/\s+/g, " ").slice(0, 60);
    out.push({ rule: hit.rule, line, text, message: `${text} — ${hit.message}` });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Whether the rule covers a file: Studio and `@cloudhal/ui` sources, not tests or catalogs. */
export function coversText(rel: string): boolean {
  if (!/\.(ts|tsx)$/.test(rel) || /\.d\.ts$/.test(rel)) return false;
  if (/(^|\/)(test|tests|__tests__)\//.test(rel) || /\.(test|spec|stories)\.tsx?$/.test(rel))
    return false;
  if (rel.startsWith("apps/studio/src/")) return !rel.startsWith("apps/studio/src/i18n/");
  return rel.startsWith("packages/ui/src/");
}

/**
 * Body directives (RFC-0015 §2, phase 6b): typed blocks inside markdown bodies, in the generic
 * directives syntax at block level.
 *
 * ```markdown
 * :::callout{tone="warning" title="Before you start"}
 * Back up your **database** first.
 * :::
 *
 * ::button{label="Start" href="/start"}
 * ```
 *
 * - A **container** opens with three or more colons, the type's name and its attributes on one
 *   line, wraps markdown, and closes with a line of exactly as many colons. A container inside
 *   another uses fewer colons than its parent (`::::outer` … `:::inner` … `:::` … `::::`).
 *   Fenced code inside a container never closes it.
 * - A **leaf** is two colons, the name and its attributes on one line.
 * - **Attributes** are `key="value"` (`\"` and `\\` escaped) or a bare `key` (true), separated by
 *   spaces. They are text, coerced by the type's schema (numbers, booleans); body blocks take
 *   scalar props only (D3).
 * - Anything that does not parse exactly is not a directive: it stays ordinary markdown, and the
 *   editor keeps it as written.
 *
 * Dependency-free and Worker-safe; `body-blocks.ts` teaches the splitter these blocks.
 */
import {
  BLOCK_LIMITS,
  type BlockRegistry,
  type BlockType,
  type PropsIssue,
  validateProps,
} from "./blocks.ts";

/** Attribute values as written: text, or `true` for a bare key. */
export type DirectiveAttrs = Record<string, string | true>;

export interface Directive {
  name: string;
  attrs: DirectiveAttrs;
  /** A container's inner markdown (without its fences); absent for a leaf. */
  content?: string;
  /** Colons in the fence: 2 for a leaf, 3 or more for a container. */
  fence: number;
}

const NAME = "[a-z][a-z0-9-]{1,40}";
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const OPEN = new RegExp(`^(:{2,})(${NAME})(?=[{\\s]|$)`);

/** Attributes from `{…}` text (without the braces' surroundings); `undefined` if malformed. */
function parseAttrs(text: string): { attrs: DirectiveAttrs; end: number } | undefined {
  // text starts at "{"
  const attrs: DirectiveAttrs = {};
  let i = 1;
  const space = () => {
    while (text[i] === " " || text[i] === "\t") i++;
  };
  for (;;) {
    space();
    if (text[i] === "}") return { attrs, end: i + 1 };
    const start = i;
    while (i < text.length && /[A-Za-z0-9_-]/.test(text[i] as string)) i++;
    const key = text.slice(start, i);
    if (!KEY.test(key) || Object.hasOwn(attrs, key)) return undefined;
    if (text[i] !== "=") {
      if (text[i] !== " " && text[i] !== "\t" && text[i] !== "}") return undefined;
      attrs[key] = true;
      continue;
    }
    i++;
    if (text[i] !== '"') return undefined;
    i++;
    let value = "";
    for (;;) {
      const c = text[i];
      if (c === undefined) return undefined;
      if (c === "\\") {
        const next = text[i + 1];
        if (next !== '"' && next !== "\\") return undefined;
        value += next;
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        break;
      }
      value += c;
      i++;
    }
    attrs[key] = value;
    const after = text[i];
    if (after !== " " && after !== "\t" && after !== "}") return undefined;
  }
}

/** The opening line: fence, name and attributes, or `undefined`. */
function parseOpening(
  line: string,
): { fence: number; name: string; attrs: DirectiveAttrs } | undefined {
  const m = OPEN.exec(line);
  if (!m) return undefined;
  const fence = (m[1] as string).length;
  const name = m[2] as string;
  let rest = line.slice(m[0].length);
  let attrs: DirectiveAttrs = {};
  if (rest.startsWith("{")) {
    const parsed = parseAttrs(rest);
    if (!parsed) return undefined;
    attrs = parsed.attrs;
    rest = rest.slice(parsed.end);
  }
  if (rest.trim() !== "") return undefined;
  return { fence, name, attrs };
}

const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A directive at the very start of `src` (a block boundary): the directive and its source,
 * without the newline that ends its last line. `undefined` when `src` does not start with one.
 */
export function matchDirective(src: string): { directive: Directive; raw: string } | undefined {
  if (!src.startsWith("::")) return undefined;
  const firstEnd = src.indexOf("\n");
  const first = firstEnd === -1 ? src : src.slice(0, firstEnd);
  const open = parseOpening(first);
  if (!open) return undefined;
  if (open.fence === 2)
    return { directive: { name: open.name, attrs: open.attrs, fence: 2 }, raw: first };
  if (firstEnd === -1) return undefined;
  // A container: find the line of exactly `fence` colons, skipping fenced code.
  const close = new RegExp(`^:{${open.fence}}[ \\t]*$`);
  let pos = firstEnd + 1;
  let code: string | undefined;
  while (pos <= src.length) {
    const end = src.indexOf("\n", pos);
    const line = end === -1 ? src.slice(pos) : src.slice(pos, end);
    const fence = CODE_FENCE.exec(line)?.[1];
    if (code) {
      if (fence && fence[0] === code[0] && fence.length >= code.length && line.trim() === fence)
        code = undefined;
    } else if (fence) code = fence;
    else if (close.test(line)) {
      const content = src.slice(firstEnd + 1, pos).replace(/\n$/, "");
      return {
        directive: { name: open.name, attrs: open.attrs, content, fence: open.fence },
        raw: src.slice(0, pos + line.length),
      };
    }
    if (end === -1) break;
    pos = end + 1;
  }
  return undefined;
}

/** A whole block's source as a directive, or `undefined` when it is not exactly one. */
export function parseDirective(markdown: string): Directive | undefined {
  const source = markdown.replace(/\s+$/, "");
  const m = matchDirective(source);
  return m && m.raw === source ? m.directive : undefined;
}

/**
 * Where a directive interrupts a paragraph in `src` (for `marked`, which passes the text after a
 * paragraph's first character): the start of the first later line that is a whole directive.
 */
export function directiveStart(src: string): number | undefined {
  for (let i = src.indexOf("\n::"); i !== -1; i = src.indexOf("\n::", i + 1))
    if (matchDirective(src.slice(i + 1))) return i + 1;
  return undefined;
}

// ── writing ──────────────────────────────────────────────────────────────────────────────────

const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** `{key="value" flag}` for scalar props, in their order; empty when there are none. */
export function directiveAttrsText(props: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (value === true) parts.push(key);
    else if (typeof value === "string") parts.push(`${key}=${quote(value)}`);
    else if (typeof value === "number" || typeof value === "boolean")
      parts.push(`${key}=${quote(String(value))}`);
  }
  return parts.length ? `{${parts.join(" ")}}` : "";
}

/**
 * A directive's markdown: a leaf when `content` is undefined, else a container whose fence has
 * more colons than any directive fence inside it (so the inner text can never close it early).
 */
export function writeDirective(
  name: string,
  props: Readonly<Record<string, unknown>>,
  content?: string,
): string {
  const attrs = directiveAttrsText(props);
  if (content === undefined) return `::${name}${attrs}`;
  const inner = content.replace(/\s+$/, "");
  let deepest = 2;
  for (const m of inner.matchAll(/^(:{3,})/gm))
    deepest = Math.max(deepest, (m[1] as string).length);
  const fence = ":".repeat(deepest + 1);
  return inner
    ? `${fence}${name}${attrs}\n${inner}\n${fence}`
    : `${fence}${name}${attrs}\n${fence}`;
}

// ── props ────────────────────────────────────────────────────────────────────────────────────

const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Attributes as props, coerced by the type's schema (numbers, booleans); others stay as given.
 * Values that are already typed (an editor's form) pass through.
 */
export function directiveProps(
  type: BlockType | undefined,
  attrs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(attrs)) {
    const schema = type?.props.properties[key];
    if (schema?.type === "boolean")
      props[key] = raw === "true" ? true : raw === "false" ? false : raw;
    else if ((schema?.type === "number" || schema?.type === "integer") && typeof raw === "string")
      props[key] = NUMBER.test(raw.trim()) ? Number(raw) : raw;
    else props[key] = raw;
  }
  return props;
}

/**
 * Problems with a body directive against the registry: `undefined` when its type is not
 * registered (kept as is), else the issues (empty when valid). A string prop is one line, since
 * attributes cannot hold line breaks.
 */
export function checkDirective(registry: BlockRegistry, d: Directive): PropsIssue[] | undefined {
  const type = registry.get(d.name);
  if (!type) return undefined;
  if (!type.where.includes("body"))
    return [{ path: "", message: `${d.name} is a section block, not a body block` }];
  const container = type.content === "markdown";
  if (container && d.content === undefined)
    return [{ path: "", message: `${d.name} wraps text: write it as :::${d.name} … :::` }];
  if (!container && d.content !== undefined)
    return [{ path: "", message: `${d.name} wraps no text: write it as ::${d.name}{…}` }];
  if (d.content !== undefined && d.content.length > BLOCK_LIMITS.content)
    return [{ path: "", message: `at most ${BLOCK_LIMITS.content} characters inside` }];
  const props = directiveProps(type, d.attrs);
  const issues = validateProps(type.props, props);
  for (const [key, value] of Object.entries(props))
    if (typeof value === "string" && /[\r\n]/.test(value))
      issues.push({ path: key, message: "one line" });
  return issues;
}

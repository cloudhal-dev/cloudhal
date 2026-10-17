/**
 * The message compiler (RFC-0032 §1–2): parses the ICU MessageFormat 1 subset Studio's catalogs
 * use and returns the data `format` renders. Build-time only — the Vite plugin, the type
 * generator and the catalog tests run it; no bundle ships it (`bundle-budget.ts`).
 *
 *   {name}                          {n, number}   {n, number, integer|percent|compact}
 *   {n, plural, =0 {…} one {…} other {…}}        `#` or `{n}` is the number in a branch
 *   {n, selectordinal, one {…} other {…}}        {k, select, a {…} other {…}}
 *
 * `other` is required in every choice. Quoting is ICU's "double optional" apostrophe mode: `''` is
 * an apostrophe; `'` starts quoted text only before `{`, `}`, `|` or (in a plural) `#`.
 */
import {
  type Arg,
  type Cases,
  type Compiled,
  type Message,
  NUMBER,
  type NumberStyle,
  ORDINAL,
  type Part,
  PLURAL,
  POUND,
  SELECT,
  SIMPLE,
} from "./model.ts";

export class MessageSyntaxError extends Error {
  override readonly name = "MessageSyntaxError";
  /** Offset in the source string where parsing stopped. */
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at ${offset})`);
    this.offset = offset;
  }
}

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const KEY = /=\d+|[A-Za-z_][A-Za-z0-9_-]*/y;
const STYLES: readonly NumberStyle[] = ["integer", "percent", "compact"];
const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);

class Parser {
  i = 0;
  readonly src: string;
  constructor(src: string) {
    this.src = src;
  }

  fail(what: string): never {
    throw new MessageSyntaxError(what, this.i);
  }
  ws() {
    while (/\s/.test(this.src[this.i] ?? "")) this.i++;
  }
  expect(ch: string) {
    this.ws();
    if (this.src[this.i] !== ch) this.fail(`expected "${ch}"`);
    this.i++;
  }
  match(re: RegExp, what: string): string {
    this.ws();
    re.lastIndex = this.i;
    const m = re.exec(this.src);
    if (!m) this.fail(`expected ${what}`);
    this.i += m[0].length;
    return m[0];
  }

  /** Text and arguments up to the end, or up to the `}` that closes a branch. */
  message(inPlural: boolean, nested: boolean): Part[] {
    const parts: Part[] = [];
    let text = "";
    const flush = () => {
      if (text) parts.push(text);
      text = "";
    };
    while (this.i < this.src.length) {
      const ch = this.src[this.i] as string;
      if (ch === "}") {
        if (nested) break;
        this.fail("unexpected \"}\" (quote a literal brace as '}')");
      }
      if (ch === "{") {
        flush();
        parts.push(this.argument());
      } else if (ch === "#" && inPlural) {
        flush();
        parts.push([POUND]);
        this.i++;
      } else if (ch === "'") text += this.quoted(inPlural);
      else {
        text += ch;
        this.i++;
      }
    }
    if (nested && this.src[this.i] !== "}") this.fail('missing "}" closing a branch');
    flush();
    return parts;
  }

  /** An apostrophe: `''`, quoted syntax characters, or a literal `'`. */
  quoted(inPlural: boolean): string {
    const next = this.src[this.i + 1];
    if (next === "'") {
      this.i += 2;
      return "'";
    }
    if (next !== "{" && next !== "}" && next !== "|" && !(next === "#" && inPlural)) {
      this.i++;
      return "'";
    }
    let out = "";
    this.i++;
    while (this.i < this.src.length) {
      const ch = this.src[this.i] as string;
      if (ch === "'") {
        if (this.src[this.i + 1] === "'") {
          out += "'";
          this.i += 2;
          continue;
        }
        this.i++;
        return out;
      }
      out += ch;
      this.i++;
    }
    return out;
  }

  argument(): Arg {
    this.i++; // {
    const name = this.match(NAME, "an argument name");
    this.ws();
    if (this.src[this.i] === "}") {
      this.i++;
      return [SIMPLE, name];
    }
    this.expect(",");
    const type = this.match(NAME, "number, plural, selectordinal or select");
    if (type === "number") return this.number(name);
    if (type !== "plural" && type !== "selectordinal" && type !== "select")
      this.fail(`unsupported argument type "${type}"`);
    this.expect(",");
    const cases = this.cases(type);
    this.expect("}");
    return type === "select"
      ? [SELECT, name, cases]
      : [type === "plural" ? PLURAL : ORDINAL, name, cases];
  }

  number(name: string): Arg {
    this.ws();
    if (this.src[this.i] === "}") {
      this.i++;
      return [NUMBER, name];
    }
    this.expect(",");
    const style = this.match(NAME, "a number style") as NumberStyle;
    if (!STYLES.includes(style)) this.fail(`unsupported number style "${style}"`);
    this.expect("}");
    return [NUMBER, name, style];
  }

  cases(type: string): Cases {
    const cases: Record<string, Message> = {};
    for (;;) {
      this.ws();
      if (this.src[this.i] === "}") break;
      const key = this.match(KEY, "a case key");
      if (type !== "select" && !key.startsWith("=") && !PLURAL_KEYS.has(key))
        this.fail(`"${key}" is not a CLDR plural category`);
      if (Object.hasOwn(cases, key)) this.fail(`duplicate case "${key}"`);
      this.expect("{");
      cases[key] = this.message(type !== "select", true);
      this.i++; // }
    }
    if (!Object.hasOwn(cases, "other")) this.fail(`a ${type} needs an "other" case`);
    return cases;
  }
}

/**
 * Compiles one catalog value. A message with only text and `{name}` arguments comes back as the
 * same kind of string the runtime substitutes directly; anything else as data (`Message`).
 * Throws `MessageSyntaxError` with the offset on invalid syntax.
 */
export function compileMessage(source: string): Compiled {
  const parts = new Parser(source).message(false, false);
  const simple = parts.every(
    (p) => (typeof p === "string" && !/[{}]/.test(p)) || (typeof p !== "string" && p[0] === SIMPLE),
  );
  if (!simple) return parts;
  return parts.map((p) => (typeof p === "string" ? p : `{${p[1]}}`)).join("");
}

/** What an argument is used as: drives the generated parameter types and the parity checks. */
export type ArgKind = "text" | "number" | "select";
export interface ArgInfo {
  kind: ArgKind;
  /** The select's explicit values (without `other`). */
  options?: string[];
  /** Every plural/selectordinal in the message that uses this argument, by type. */
  plurals?: { ordinal: boolean; keys: string[] }[];
}

/** Folds one use of an argument into what is known about it. */
function use(info: ArgInfo, part: Exclude<Part, string>): ArgInfo {
  const tag = part[0];
  if (tag === NUMBER) return info.kind === "select" ? info : { ...info, kind: "number" };
  if (tag === PLURAL || tag === ORDINAL) {
    const plural = { ordinal: tag === ORDINAL, keys: Object.keys(part[2]) };
    return { ...info, kind: "number", plurals: [...(info.plurals ?? []), plural] };
  }
  if (tag === SELECT) {
    const keys = Object.keys(part[2]).filter((k) => k !== "other");
    return { ...info, kind: "select", options: [...new Set([...(info.options ?? []), ...keys])] };
  }
  return info;
}

/** The arguments a compiled (or plain) message uses, by name. */
export function argumentsOf(message: Compiled): Map<string, ArgInfo> {
  const out = new Map<string, ArgInfo>();
  if (typeof message === "string") {
    for (const m of message.matchAll(/\{(\w+)\}/g)) out.set(m[1] as string, { kind: "text" });
    return out;
  }
  const visit = (parts: Message) => {
    for (const p of parts) {
      if (typeof p === "string" || p[0] === POUND) continue;
      out.set(p[1], use(out.get(p[1]) ?? { kind: "text" }, p));
      if (p[0] === PLURAL || p[0] === ORDINAL || p[0] === SELECT)
        for (const c of Object.values(p[2])) visit(c);
    }
  };
  visit(message);
  return out;
}

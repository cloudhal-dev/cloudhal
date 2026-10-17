/**
 * The message runtime (RFC-0032 §2): renders a compiled catalog value in a locale. Worker-safe and
 * dependency-free; `Intl.PluralRules` and `Intl.NumberFormat` are made once per locale and options.
 */
import {
  type Compiled,
  type Message,
  NUMBER,
  type NumberStyle,
  ORDINAL,
  PLURAL,
  POUND,
  SELECT,
  SIMPLE,
} from "./model.ts";

export type Params = Readonly<Record<string, string | number | undefined>>;

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function rules(locale: string, ordinal: boolean): Intl.PluralRules {
  const id = `${locale}|${ordinal ? "o" : "c"}`;
  let r = pluralRules.get(id);
  if (!r) {
    r = new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" });
    pluralRules.set(id, r);
  }
  return r;
}

const STYLE_OPTIONS: Record<NumberStyle | "default", Intl.NumberFormatOptions> = {
  default: {},
  integer: { maximumFractionDigits: 0 },
  percent: { style: "percent" },
  compact: { notation: "compact" },
};

/** `n` in `locale`, cached per locale and style. */
export function formatNumber(locale: string, n: number, style?: NumberStyle): string {
  const id = `${locale}|${style ?? "default"}`;
  let f = numberFormats.get(id);
  if (!f) {
    f = new Intl.NumberFormat(locale, STYLE_OPTIONS[style ?? "default"]);
    numberFormats.set(id, f);
  }
  return f.format(n);
}

const listFormats = new Map<string, Intl.ListFormat>();

/**
 * Items as a list in `locale` (`Intl.ListFormat`, cached): "a, b, and c", "a, b ve c", "a、b、c".
 * Never `items.join(", ")` in text a person reads (RFC-0032 §4f): the separator and the last "and"
 * are the language's.
 */
export function formatList(
  locale: string,
  items: readonly string[],
  type: "conjunction" | "disjunction" = "conjunction",
): string {
  const id = `${locale}|${type}`;
  let f = listFormats.get(id);
  if (!f) {
    f = new Intl.ListFormat(locale, { type, style: "long" });
    listFormats.set(id, f);
  }
  return f.format(items);
}

/** `{name}` substitution, as Studio has always done it: a missing value leaves the placeholder. */
function substitute(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (_m, name: string) => String(params[name] ?? `{${name}}`));
}

interface Frame {
  locale: string;
  params: Params;
  /** The innermost plural's argument and value, for `#` and `{n}` in its branches. */
  plural?: { name: string; value: number };
}

function render(parts: Message, frame: Frame): string {
  let out = "";
  for (const p of parts) {
    if (typeof p === "string") {
      out += p;
      continue;
    }
    switch (p[0]) {
      case SIMPLE: {
        const value = frame.params[p[1]];
        if (value === undefined) out += `{${p[1]}}`;
        else if (frame.plural?.name === p[1] && typeof value === "number")
          out += formatNumber(frame.locale, value);
        else out += String(value);
        break;
      }
      case POUND:
        out += frame.plural ? formatNumber(frame.locale, frame.plural.value) : "#";
        break;
      case NUMBER:
        out += formatNumber(frame.locale, Number(frame.params[p[1]] ?? Number.NaN), p[2]);
        break;
      case PLURAL:
      case ORDINAL: {
        const value = Number(frame.params[p[1]] ?? Number.NaN);
        const cases = p[2];
        const exact = cases[`=${value}`];
        const branch =
          exact ?? cases[rules(frame.locale, p[0] === ORDINAL).select(value)] ?? cases.other;
        out += render(branch ?? [], { ...frame, plural: { name: p[1], value } });
        break;
      }
      case SELECT: {
        const key = String(frame.params[p[1]] ?? "other");
        const cases = p[2];
        out += render(cases[key] ?? cases.other ?? [], frame);
        break;
      }
    }
  }
  return out;
}

/** Renders a compiled catalog value (a string or a `Message`) in `locale` with `params`. */
export function formatMessage(locale: string, message: Compiled, params: Params = {}): string {
  return typeof message === "string"
    ? substitute(message, params)
    : render(message, { locale, params });
}

export type { Compiled, Message } from "./model.ts";
export { isMessage } from "./model.ts";

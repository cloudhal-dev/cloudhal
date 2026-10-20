/** The fixed function set and `calculate` expressions; nothing a model wrote is evaluated. */
import { isObj, SURFACE_LIMITS } from "../shared.ts";
import { num, type ResolveContext, type SurfaceFunction, text } from "./values.ts";

export function runFunction(
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
      // `minDigits` keeps trailing zeros (9.6 → 9.60); it raises `digits` when larger.
      const min = Math.min(Math.max(0, Math.trunc(num(args.minDigits ?? 0)) || 0), 6);
      return new Intl.NumberFormat(ctx.locale, {
        minimumFractionDigits: min,
        maximumFractionDigits: Math.max(digits, min),
      }).format(n);
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

export const blank = (v: unknown) => v === undefined || v === null || v === "";
/** A number from a value; "1,5" reads as 1.5 (a decimal comma, as typed in many locales). */
export const toNumber = (v: unknown): number =>
  typeof v === "number"
    ? v
    : typeof v === "string"
      ? Number(/^\s*-?\d+,\d+\s*$/.test(v) ? v.replace(",", ".") : v)
      : Number.NaN;
export const operand = (v: unknown): number | undefined => {
  if (blank(v)) return undefined;
  const n = toNumber(v);
  return Number.isFinite(n) ? n : undefined;
};
export const numbers = (v: unknown): number[] | undefined => {
  const list = Array.isArray(v) ? v : [];
  if (list.length === 0) return undefined;
  const ns = list.map(operand);
  return ns.every((n) => n !== undefined) ? (ns as number[]) : undefined;
};
/** A finite result to 10 significant digits (0.1 + 0.2 shows 0.3); anything else is "". */
export const finite = (n: number): number | "" =>
  Number.isFinite(n) ? Number(n.toPrecision(10)) : "";

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

/** Resolving bound props and conditions against a surface's data. */
import { isObj, SURFACE_LIMITS } from "../shared.ts";
import { calculateExpression, runFunction } from "./functions.ts";
import {
  COMPARE,
  FUNCTIONS,
  getPointer,
  isCallValue,
  isDynamic,
  isPathValue,
  type ResolveContext,
  text,
} from "./values.ts";

export function resolveValue(v: unknown, data: unknown, ctx: ResolveContext, depth = 0): unknown {
  if (isPathValue(v)) return getPointer(data, v.path);
  if (isCallValue(v) && FUNCTIONS.has(v.call)) {
    // RFC-0022 §1: past the nesting limit a call gives "" rather than running on.
    if (depth >= SURFACE_LIMITS.callDepth) return "";
    const raw = isObj(v.args) ? v.args : {};
    const at = (x: unknown) => resolveValue(x, data, ctx, depth + 1);
    if (v.call === "if")
      return (
        (evaluateCondition(raw.cond, data, ctx, depth + 1) ? at(raw.ifTrue) : at(raw.ifFalse)) ?? ""
      );
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

export const truthy = (v: unknown) =>
  !(
    v === undefined ||
    v === null ||
    v === false ||
    v === 0 ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );

/**
 * Whether a visibility condition holds for `data`; no condition is visible. A call operand
 * (RFC-0022) resolves at `depth`, the depth of a call argument in its place.
 */
export function evaluateCondition(
  c: unknown,
  data: unknown,
  ctx: ResolveContext = { locale: "en" },
  depth = 0,
): boolean {
  if (c === undefined) return true;
  if (isPathValue(c)) return truthy(getPointer(data, c.path));
  if (!isObj(c)) return false;
  const [op, arg] = (Object.entries(c)[0] ?? []) as [string, unknown];
  const operand = (x: unknown) => (isDynamic(x) ? resolveValue(x, data, ctx, depth) : x);
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
  const sub = (x: unknown) => evaluateCondition(x, data, ctx, depth);
  if (op === "and" && Array.isArray(arg)) return arg.every(sub);
  if (op === "or" && Array.isArray(arg)) return arg.some(sub);
  if (op === "not") return !sub(arg);
  return false;
}

/** What each action needs besides its name (RFC-0020 §4). */

/** Bound values: paths and calls, JSON Pointers, conditions (RFC-0020 §3, RFC-0022 §1). */
import type { PropsIssue } from "../../blocks.ts";
import { isObj, isScalar, SURFACE_LIMITS } from "../shared.ts";

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
  "power",
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
export const FUNCTIONS = new Set<string>(SURFACE_FUNCTIONS);

export const isPathValue = (v: unknown): v is PathValue =>
  isObj(v) && typeof v.path === "string" && Object.keys(v).length === 1;
export const isCallValue = (v: unknown): v is CallValue =>
  isObj(v) &&
  typeof v.call === "string" &&
  Object.keys(v).every((k) => k === "call" || k === "args");
export const isDynamic = (v: unknown) => isPathValue(v) || isCallValue(v);

/** RFC 6901 pointer segments (`/a/b~1c` → `["a", "b/c"]`); `undefined` when malformed. */
export function pointerSegments(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  const parts = pointer.slice(1).split("/");
  if (parts.some((p) => /~[^01]|~$/.test(p))) return undefined;
  return parts.map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function checkPointer(pointer: unknown, path: string, out: PropsIssue[]): void {
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

export function checkOperand(v: unknown, path: string, out: PropsIssue[]): void {
  if (isPathValue(v)) checkPointer(v.path, `${path}/path`, out);
  else if (!isScalar(v)) out.push({ path, message: "a text, number, true/false or {path}" });
}

/** A function argument: a value, a `{path}`, or another call (RFC-0022 §1). */
export function checkArg(v: unknown, path: string, out: PropsIssue[], depth: number): void {
  if (isCallValue(v)) checkCall(v, path, out, depth + 1);
  else checkOperand(v, path, out);
}

export function checkCall(v: CallValue, path: string, out: PropsIssue[], depth = 1): void {
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
    } else if (v.call === "calculate" && k === "vars") {
      if (
        !isObj(a) ||
        Object.keys(a).length > SURFACE_LIMITS.chooseCases ||
        Object.keys(a).some((key) => !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key))
      )
        out.push({
          path: at,
          message: `an object of at most ${SURFACE_LIMITS.chooseCases} names (letters, digits, _) and their values`,
        });
      else for (const [key, x] of Object.entries(a)) checkArg(x, `${at}/${key}`, out, depth);
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

export const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Function calls anywhere in a value (each `{call}` object, nested ones included). */
export function countCalls(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + countCalls(x), 0);
  if (!isObj(v)) return 0;
  let n = isCallValue(v) ? 1 : 0;
  for (const x of Object.values(v)) n += countCalls(x);
  return n;
}

/** A value that is a binding or a call: problems with its shape (not with what it resolves to). */
export function checkDynamic(v: unknown, path: string, out: PropsIssue[]): void {
  if (isPathValue(v)) checkPointer(v.path, `${path}/path`, out);
  else if (isCallValue(v)) checkCall(v, path, out);
}

export const COMPARE = ["eq", "ne", "gt", "lt", "gte", "lte"] as const;

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

export const num = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
export const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));

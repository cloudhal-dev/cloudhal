/**
 * The data model of surface interop (RFC-0020 §9): JSON Pointer reads and writes over the data an
 * A2UI agent sends (`updateDataModel`) or a component binds. Pointers come from agent and MCP
 * input, so writes refuse the reserved keys `__proto__`, `constructor` and `prototype` at every
 * depth with an `InteropError`, step into arrays by index only, and read and write own properties
 * only (CodeQL js/prototype-polluting-assignment, alerts 42–44). Worker-safe: pure functions.
 */
import { isReservedKey } from "./names.ts";
import { isObj } from "./surfaces/shared.ts";

type Json = Record<string, unknown>;

/** A document that cannot be converted at all (not a wrong prop: those are notes or store issues). */
export class InteropError extends Error {
  override readonly name = "InteropError";
}

const ARRAY_INDEX = /^\d+$/;

/**
 * The data key an input with a literal value gets: its component id, with a suffix when the id
 * is a reserved key (an A2UI id such as "prototype"), so a valid document never fails on a path
 * it never wrote.
 */
export function dataKeyFor(id: string): string {
  const key = id.replace(/[^a-z0-9-]/g, "-");
  return isReservedKey(key) ? `${key}-value` : key;
}

/** RFC 6901 segments of `pointer` (`/a/b~1c` → `["a", "b/c"]`). */
const segmentsOf = (pointer: string): string[] =>
  pointer
    .replace(/^\//, "")
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));

/** The value at `pointer` in `data` (own properties only), or `undefined`. */
export function pointerGet(data: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return data;
  let cur = data;
  for (const seg of segmentsOf(pointer)) {
    if (Array.isArray(cur)) cur = ARRAY_INDEX.test(seg) ? cur[Number(seg)] : undefined;
    else if (isObj(cur) && Object.hasOwn(cur, seg)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

/** Defines `key` as an own data property: never a setter, never the prototype chain. */
function defineOwn(target: Json, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** Refuses a segment that would reach a prototype, or a non-index step into an array. */
function checkSegment(container: Json | unknown[], seg: string, pointer: string): void {
  // Compared inline at each step, so every write below sits behind the check.
  if (seg === "__proto__" || seg === "constructor" || seg === "prototype")
    throw new InteropError(`data path ${pointer} uses the reserved key "${seg}"`);
  if (Array.isArray(container) && !ARRAY_INDEX.test(seg))
    throw new InteropError(`data path ${pointer}: "${seg}" is not an array index`);
}

/** The child container at `seg`, created (an array when `nextSeg` is an index) when missing. */
function child(cur: Json | unknown[], seg: string, nextSeg: string): Json | unknown[] {
  const next: unknown = Array.isArray(cur)
    ? cur[Number(seg)]
    : Object.hasOwn(cur, seg)
      ? cur[seg]
      : undefined;
  if (isObj(next) || Array.isArray(next)) return next;
  const made: Json | unknown[] = ARRAY_INDEX.test(nextSeg) ? [] : {};
  if (Array.isArray(cur)) cur[Number(seg)] = made;
  else defineOwn(cur, seg, made);
  return made;
}

/** `data` with `value` written at `pointer` (deleted when `value` is undefined), on a copy. */
export function pointerSet(data: Json, pointer: string, value: unknown): Json {
  if (pointer === "" || pointer === "/") return isObj(value) ? structuredClone(value) : {};
  const segs = segmentsOf(pointer);
  const out = structuredClone(data);
  let cur: Json | unknown[] = out;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    checkSegment(cur, seg, pointer);
    cur = child(cur, seg, segs[i + 1] as string);
  }
  const last = segs.at(-1) as string;
  checkSegment(cur, last, pointer);
  if (Array.isArray(cur)) {
    if (value === undefined) cur.splice(Number(last), 1);
    else cur[Number(last)] = value;
  } else if (value !== undefined) defineOwn(cur, last, value);
  else if (Object.hasOwn(cur, last)) delete cur[last];
  return out;
}

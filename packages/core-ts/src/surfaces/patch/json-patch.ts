/** RFC 6902 JSON Patch over plain JSON, with forbidden keys refused. */
import { pointerSegments } from "../bindings/values.ts";
import { isObj, SURFACE_LIMITS } from "../shared.ts";

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

export const OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);
export const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function container(doc: unknown, segments: string[], index: number, path: string): unknown {
  let cur = doc;
  for (const s of segments) {
    if (Array.isArray(cur) && /^(0|[1-9]\d*)$/.test(s) && Number(s) < cur.length)
      cur = cur[Number(s)];
    else if (isObj(cur) && Object.hasOwn(cur, s)) cur = cur[s];
    else throw new PatchError(index, path, "the path does not exist");
  }
  return cur;
}

export function split(path: string, index: number): { parent: string[]; key: string } {
  const segments = pointerSegments(path);
  if (!segments || segments.length === 0)
    throw new PatchError(index, path, "not a JSON Pointer to a member");
  if (segments.some((s) => FORBIDDEN_KEYS.has(s)))
    throw new PatchError(index, path, "reserved key");
  return { parent: segments.slice(0, -1), key: segments[segments.length - 1] as string };
}

export function read(doc: unknown, path: string, index: number): unknown {
  const segments = pointerSegments(path);
  if (!segments) throw new PatchError(index, path, "not a JSON Pointer");
  return container(doc, segments, index, path);
}

function put(
  doc: unknown,
  path: string,
  value: unknown,
  { index, replace }: { index: number; replace: boolean },
): void {
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

export function remove(doc: unknown, path: string, index: number): unknown {
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

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
        put(out, o.path, structuredClone(o.value), { index: i, replace: false });
        return;
      case "replace":
        if (!("value" in o)) throw new PatchError(i, o.path, "replace needs a value");
        put(out, o.path, structuredClone(o.value), { index: i, replace: true });
        return;
      case "remove":
        remove(out, o.path, i);
        return;
      case "move": {
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "move needs from");
        if (o.path.startsWith(`${o.from}/`))
          throw new PatchError(i, o.path, "cannot move into itself");
        const v = remove(out, o.from, i);
        put(out, o.path, v, { index: i, replace: false });
        return;
      }
      case "copy":
        if (typeof o.from !== "string") throw new PatchError(i, o.path, "copy needs from");
        put(out, o.path, structuredClone(read(out, o.from, i)), { index: i, replace: false });
        return;
      case "test":
        if (!same(read(out, o.path, i), o.value)) throw new PatchError(i, o.path, "test failed");
        return;
    }
  });
  return out as T;
}

/** Schema rewrites applied to every tool's input and output schema. */

import type { JsonSchema } from "./common.ts";

/**
 * Contract schemas reference `#/$defs/...` relative to their own root. Once embedded inside a tool
 * schema those pointers must resolve from the tool schema's root instead, so nested `$defs` are
 * hoisted there (names are shared and identical across contracts).
 */
export function hoistDefs(schema: JsonSchema): JsonSchema {
  const defs: Record<string, unknown> = {};
  const walk = (node: unknown, isRoot: boolean): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, false));
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "$defs" && !isRoot) {
        for (const [name, def] of Object.entries(v as Record<string, unknown>))
          defs[name] = walk(def, false);
        continue;
      }
      out[k] = walk(v, false);
    }
    return out;
  };
  const root = walk(schema, true) as JsonSchema;
  const own = (root.$defs as Record<string, unknown> | undefined) ?? {};
  return Object.keys(defs).length || Object.keys(own).length
    ? { ...root, $defs: { ...defs, ...own } }
    : root;
}

const LOCAL_REF = "#/$defs/";

/** The `$defs` names `node` refers to directly (`#/$defs/<name>` only). */
function refsOf(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) for (const n of node) refsOf(n, out);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "$ref" && typeof v === "string" && v.startsWith(LOCAL_REF))
        out.add(v.slice(LOCAL_REF.length));
      else refsOf(v, out);
    }
  return out;
}

/**
 * RFC-0045 §6: the `$defs` of `schema` that `from` reaches, transitively through `#/$defs/*`
 * references: a `$defs` name (included itself) or a schema node of its own (not included). A tool
 * that embeds part of a contract carries exactly these, so no `$ref` dangles when a contract
 * change adds one (`hoistDefs` only hoists nested `$defs` and finds no missing ones). Throws on a
 * reference `schema` does not define.
 */
export function defsClosure(
  schema: JsonSchema,
  from: string | JsonSchema,
): Record<string, JsonSchema> {
  const defs = (schema.$defs ?? {}) as Record<string, JsonSchema>;
  const out: Record<string, JsonSchema> = {};
  const queue = typeof from === "string" ? [from] : [...refsOf(from, new Set())];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (Object.hasOwn(out, name)) continue;
    const def = defs[name];
    if (!def) throw new Error(`$defs has no ${name}`);
    out[name] = def;
    for (const next of refsOf(def, new Set())) if (!Object.hasOwn(out, next)) queue.push(next);
  }
  return out;
}

/**
 * Inputs may name an image by asset alone (`{ assetId, alt? }`, RFC-0004 §2.2): the store writes
 * `src`, `width` and `height`. So an input ImageRef needs `src` or `assetId`, and `alt` may be left
 * out; stored documents keep the contract's strict shape.
 */
export function relaxImageRefs(schema: JsonSchema): JsonSchema {
  const defs = schema.$defs as Record<string, JsonSchema> | undefined;
  const ref = defs?.ImageRef;
  if (!ref) return schema;
  const { required: _r, ...rest } = ref;
  return {
    ...schema,
    $defs: {
      ...defs,
      ImageRef: { ...rest, anyOf: [{ required: ["src"] }, { required: ["assetId"] }] },
    },
  };
}

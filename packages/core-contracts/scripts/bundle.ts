/**
 * Bundles each root schema into a self-contained file under schemas/.bundled/.
 *
 * Why: typify (Rust codegen) cannot resolve cross-file $refs, and we want one input for
 * both generators and both validators. Authoring stays DRY (shared $defs in
 * common.schema.json, Section referenced from Page); bundling is mechanical.
 *
 * Rules handled:
 *   "common.schema.json#/$defs/X"  -> "#/$defs/X"  (def hoisted, transitively)
 *   "section.schema.json"          -> "#/$defs/Section" (root of another schema hoisted)
 *   "#/$defs/X"                     -> unchanged
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMON_SCHEMA, ROOT_SCHEMAS } from "./schema-list.ts";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type SchemaObject = { [k: string]: Json };

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMAS_DIR = path.resolve(here, "../schemas");
export const BUNDLED_DIR = path.join(SCHEMAS_DIR, ".bundled");

async function loadSchema(name: string): Promise<SchemaObject> {
  const raw = await readFile(path.join(SCHEMAS_DIR, `${name}.schema.json`), "utf8");
  return JSON.parse(raw) as SchemaObject;
}

function isObject(v: Json | undefined): v is SchemaObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pascal(name: string): string {
  return name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export async function bundleAll(): Promise<Map<string, SchemaObject>> {
  const sources = new Map<string, SchemaObject>();
  sources.set(COMMON_SCHEMA, await loadSchema(COMMON_SCHEMA));
  for (const name of ROOT_SCHEMAS) sources.set(name, await loadSchema(name));

  const out = new Map<string, SchemaObject>();
  for (const name of ROOT_SCHEMAS) {
    out.set(name, bundleOne(name, sources));
  }
  return out;
}

function bundleOne(rootName: string, sources: Map<string, SchemaObject>): SchemaObject {
  const root = structuredClone(sources.get(rootName) as SchemaObject);
  const defs: SchemaObject = isObject(root.$defs) ? root.$defs : {};
  const pending: Array<{ file: string; def: string | null; targetName: string }> = [];
  const seen = new Set<string>();

  const rewrite = (node: Json, ownerFile: string): Json => {
    if (Array.isArray(node)) return node.map((n) => rewrite(n, ownerFile));
    if (!isObject(node)) return node;
    const copy: SchemaObject = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") {
        copy[k] = rewriteRef(v, ownerFile);
      } else if (k === "$id" || k === "$schema") {
        // keep only on the root; nested copies would change ref resolution
        if (node === root) copy[k] = v;
      } else {
        copy[k] = rewrite(v, ownerFile);
      }
    }
    return copy;
  };

  const rewriteRef = (ref: string, ownerFile: string): string => {
    if (ref.startsWith("#/$defs/")) {
      // local ref inside a hoisted file must be re-targeted to the bundled $defs
      if (ownerFile !== rootName) {
        const def = ref.slice("#/$defs/".length);
        const key = `${ownerFile}#${def}`;
        if (!seen.has(key)) {
          seen.add(key);
          pending.push({ file: ownerFile, def, targetName: def });
        }
      }
      return ref;
    }
    const hashIdx = ref.indexOf("#");
    const file = (hashIdx === -1 ? ref : ref.slice(0, hashIdx)).replace(/\.schema\.json$/, "");
    const frag = hashIdx === -1 ? "" : ref.slice(hashIdx + 1);
    if (!sources.has(file)) throw new Error(`${rootName}: unknown schema file in $ref "${ref}"`);
    if (frag === "" || frag === "/") {
      const targetName = pascal(file);
      const key = `${file}#`;
      if (!seen.has(key)) {
        seen.add(key);
        pending.push({ file, def: null, targetName });
      }
      return `#/$defs/${targetName}`;
    }
    if (!frag.startsWith("/$defs/")) throw new Error(`${rootName}: unsupported $ref "${ref}"`);
    const def = frag.slice("/$defs/".length);
    const key = `${file}#${def}`;
    if (!seen.has(key)) {
      seen.add(key);
      pending.push({ file, def, targetName: def });
    }
    return `#/$defs/${def}`;
  };

  // Rewrite the root body (excluding $defs, handled below so local defs are also scanned).
  const rewrittenRoot = rewrite(root, rootName) as SchemaObject;
  const rewrittenDefs: SchemaObject = {};
  for (const [k, v] of Object.entries(defs)) rewrittenDefs[k] = rewrite(v, rootName);

  while (pending.length > 0) {
    const item = pending.shift() as (typeof pending)[number];
    const src = sources.get(item.file) as SchemaObject;
    let def: Json;
    if (item.def === null) {
      const clone = structuredClone(src);
      delete clone.$id;
      delete clone.$schema;
      delete clone.$defs;
      def = clone;
      // hoist that file's own $defs too
      if (isObject(src.$defs)) {
        for (const k of Object.keys(src.$defs)) {
          const key = `${item.file}#${k}`;
          if (!seen.has(key)) {
            seen.add(key);
            pending.push({ file: item.file, def: k, targetName: k });
          }
        }
      }
    } else {
      const srcDefs = isObject(src.$defs) ? src.$defs : {};
      if (!(item.def in srcDefs)) throw new Error(`${item.file}: missing $defs/${item.def}`);
      def = srcDefs[item.def] as Json;
    }
    if (item.targetName in rewrittenDefs) {
      throw new Error(
        `${rootName}: $defs name collision on "${item.targetName}" from ${item.file}`,
      );
    }
    rewrittenDefs[item.targetName] = rewrite(def, item.file);
  }

  const { $defs: _ignored, ...body } = rewrittenRoot;
  const bundled: SchemaObject = { ...body };
  if (Object.keys(rewrittenDefs).length > 0) bundled.$defs = sortKeys(rewrittenDefs);
  return bundled;
}

function sortKeys(o: SchemaObject): SchemaObject {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export async function writeBundled(): Promise<Map<string, SchemaObject>> {
  const bundled = await bundleAll();
  await mkdir(BUNDLED_DIR, { recursive: true });
  for (const [name, schema] of bundled) {
    await writeFile(
      path.join(BUNDLED_DIR, `${name}.schema.json`),
      `${JSON.stringify(schema, null, 2)}\n`,
    );
  }
  return bundled;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundled = await writeBundled();
  console.log(`bundled ${bundled.size} schemas → ${path.relative(process.cwd(), BUNDLED_DIR)}`);
}

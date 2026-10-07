/**
 * Precompiles ajv validators (ajv standalone) for every root contract so runtime validation
 * works on Cloudflare Workers, where `new Function` is unavailable (ADR-0008).
 *
 * Outputs (committed, drift-checked):
 *   src/generated/schemas.ts     — bundled schemas as constants
 *   src/generated/validators.js  — standalone validator functions (ESM)
 *   src/generated/validators.d.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneModule from "ajv/dist/standalone/index.js";
import addFormatsModule from "ajv-formats";
import { writeBundled } from "./bundle.ts";
import { ROOT_SCHEMAS } from "./schema-list.ts";

const addFormats = addFormatsModule.default;
const standaloneCode = standaloneModule.default;

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../src/generated");

const BANNER = `/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run \`pnpm gen\`)
 */
`;

const pascal = (name: string) =>
  name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

const bundled = await writeBundled();
await mkdir(OUT_DIR, { recursive: true });

// 1. schemas.ts — constants, deterministic order.
const schemaLines: string[] = [BANNER];
for (const name of ROOT_SCHEMAS) {
  schemaLines.push(
    `export const ${pascal(name)}Schema = ${JSON.stringify(bundled.get(name), null, 2)} as const;`,
    "",
  );
}
schemaLines.push("export const schemas = {");
for (const name of ROOT_SCHEMAS) schemaLines.push(`  "${name}": ${pascal(name)}Schema,`);
schemaLines.push("} as const;", "");
await writeFile(path.join(OUT_DIR, "schemas.ts"), `${schemaLines.join("\n")}`);

// 2. validators.js — ajv standalone. `code.source` is required for standaloneCode.
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  code: { source: true, esm: true, lines: true },
});
addFormats(ajv);
const exportsMap: Record<string, string> = {};
for (const name of ROOT_SCHEMAS) {
  const schema = bundled.get(name) as { $id: string };
  ajv.addSchema(schema, name);
  exportsMap[`validate${pascal(name)}`] = schema.$id;
}
const code = toEsm(standaloneCode(ajv, exportsMap));
await writeFile(path.join(OUT_DIR, "validators.js"), `${BANNER}${code}\n`);

/**
 * ajv's standalone output still uses `require()` for its runtime helpers even in ESM mode.
 * Rewrite those into static imports (with explicit .js extensions for Node ESM resolution) so
 * the module runs under plain Node ESM and on Workers without a CommonJS shim.
 */
function toEsm(src: string): string {
  const imports: string[] = [];
  let n = 0;
  const body = src.replace(/require\("([^"]+)"\)/g, (_m, spec: string) => {
    const id = `__req${n++}`;
    const withExt = /\.[cm]?js$/.test(spec) ? spec : `${spec}.js`;
    imports.push(`import ${id} from "${withExt}";`);
    return id;
  });
  if (/\brequire\(/.test(body))
    throw new Error("gen-validators: unhandled require() in ajv standalone output");
  // CommonJS interop differs between Node ESM (default import = module.exports) and bundlers
  // (default import may already be `exports.default`); accept both.
  const interop = body.replace(/\b(__req\d+)\.default\b/g, "($1.default ?? $1)");
  return `${imports.join("\n")}\n${interop}`;
}

// 3. validators.d.ts — typed against the generated interfaces.
const dts: string[] = [BANNER];
dts.push(`import type { ErrorObject } from "ajv";`);
dts.push(
  `import type { ${ROOT_SCHEMAS.map(pascal).join(", ")} } from "./index.ts";`,
  "",
  "export interface StandaloneValidator<T> {",
  "  (data: unknown): data is T;",
  "  errors?: ErrorObject[] | null;",
  "}",
  "",
);
for (const name of ROOT_SCHEMAS) {
  dts.push(`export declare const validate${pascal(name)}: StandaloneValidator<${pascal(name)}>;`);
}
await writeFile(path.join(OUT_DIR, "validators.d.ts"), `${dts.join("\n")}\n`);
console.log(
  `generated schemas.ts + validators for ${ROOT_SCHEMAS.length} contracts → ${path.relative(process.cwd(), OUT_DIR)}`,
);

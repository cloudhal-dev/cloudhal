/**
 * JSON Schema → TypeScript via json-schema-to-typescript, from the bundled schemas.
 * Output is committed under src/generated/ and checked for drift in CI.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { writeBundled } from "./bundle.ts";
import { ROOT_SCHEMAS } from "./schema-list.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../src/generated");

const BANNER = `/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run \`pnpm gen\`)
 */
`;

const bundled = await writeBundled();
await mkdir(OUT_DIR, { recursive: true });

// Each generated module re-declares the shared $defs it uses (Id, Timestamp, ...). The index
// exports every name exactly once, from the first module (in ROOT_SCHEMAS order) declaring it.
const exportsByModule = new Map<string, string[]>();
const claimed = new Set<string>();
for (const name of ROOT_SCHEMAS) {
  const schema = bundled.get(name);
  if (!schema) throw new Error(`missing bundled schema ${name}`);
  // biome-ignore lint/suspicious/noExplicitAny: json-schema-to-typescript's JSONSchema4 typing is looser than ours
  const ts = await compile(schema as any, name, {
    bannerComment: BANNER,
    additionalProperties: false,
    strictIndexSignatures: true,
    declareExternallyReferenced: true,
    unreachableDefinitions: true,
    style: { semi: true, singleQuote: false, trailingComma: "all", printWidth: 100 },
  });
  await writeFile(path.join(OUT_DIR, `${name}.ts`), ts);
  const names: string[] = [];
  for (const m of ts.matchAll(/^export (?:interface|type) (\w+)/gm)) {
    const id = m[1] as string;
    if (!claimed.has(id)) {
      claimed.add(id);
      names.push(id);
    }
  }
  exportsByModule.set(name, names);
}
const indexLines: string[] = [BANNER];
for (const [name, names] of exportsByModule) {
  if (names.length === 0) continue;
  indexLines.push(`export type { ${names.join(", ")} } from "./${name}.ts";`);
}
await writeFile(path.join(OUT_DIR, "index.ts"), `${indexLines.join("\n")}\n`);
console.log(
  `generated ${ROOT_SCHEMAS.length} TypeScript modules → ${path.relative(process.cwd(), OUT_DIR)}`,
);

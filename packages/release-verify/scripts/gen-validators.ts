/**
 * Writes this package's generated files (RFC-0046 §11a) from the core-contracts sources:
 *
 *   src/generated/validators.js      ajv standalone validators for exactly the two release roots
 *   src/generated/validators.d.ts
 *   src/generated/release-manifest.ts, release-statement.ts   the generated contract types
 *
 * The package never depends on `@cloudhal/core-contracts` at runtime, so a Worker deployer does
 * not pull in every validator; the validators import only ajv's runtime helpers and the
 * `date-time` format of ajv-formats (test/generated.test.ts). Run by `pnpm gen` (turbo `gen:ts`,
 * after core-contracts'); test/generated.test.ts fails when the committed files are stale.
 *
 *   node scripts/gen-validators.ts            # write
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemas } from "@cloudhal/core-contracts";
import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneModule from "ajv/dist/standalone/index.js";
import addFormatsModule from "ajv-formats";

const addFormats = addFormatsModule.default;
const standaloneCode = standaloneModule.default;

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.resolve(here, "../src/generated");
const CONTRACTS_GENERATED = path.resolve(here, "../../core-contracts/src/generated");

const BANNER = `/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/release-{manifest,statement}.schema.json
 * (run \`pnpm gen\`; packages/release-verify/scripts/gen-validators.ts)
 */
`;

const ROOTS = {
  validateReleaseManifest: "release-manifest",
  validateReleaseStatement: "release-statement",
} as const;

/**
 * ajv's standalone output uses `require()` for its runtime helpers even in ESM mode: rewrite those
 * into static imports with explicit `.js` extensions (the same transform as core-contracts').
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
  const interop = body.replace(/\b(__req\d+)\.default\b/g, "($1.default ?? $1)");
  return `${imports.join("\n")}\n${interop}`;
}

/** The generated files, by name, as they must be committed. */
export function generate(): Map<string, string> {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    code: { source: true, esm: true, lines: true },
  });
  addFormats(ajv);
  const exportsMap: Record<string, string> = {};
  for (const [fn, name] of Object.entries(ROOTS)) {
    const schema = schemas[name] as { $id: string };
    ajv.addSchema(schema, name);
    exportsMap[fn] = schema.$id;
  }
  const out = new Map<string, string>();
  out.set("validators.js", `${BANNER}${toEsm(standaloneCode(ajv, exportsMap))}\n`);
  out.set(
    "validators.d.ts",
    [
      BANNER,
      'import type { ReleaseManifest } from "./release-manifest.ts";',
      'import type { ReleaseStatement } from "./release-statement.ts";',
      "",
      "export interface StandaloneValidator<T> {",
      "  (data: unknown): data is T;",
      "  errors?: { instancePath: string; message?: string }[] | null;",
      "}",
      "",
      "export declare const validateReleaseManifest: StandaloneValidator<ReleaseManifest>;",
      "export declare const validateReleaseStatement: StandaloneValidator<ReleaseStatement>;",
      "",
    ].join("\n"),
  );
  for (const name of Object.values(ROOTS)) {
    const types = readFileSync(path.join(CONTRACTS_GENERATED, `${name}.ts`), "utf8");
    // core-contracts' own banner goes; this package's names both sources.
    const body = types.slice(types.indexOf("*/\n") + 3);
    out.set(`${name}.ts`, `${BANNER}${body}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(OUT_DIR, { recursive: true });
  const files = generate();
  for (const [name, text] of files) await writeFile(path.join(OUT_DIR, name), text);
  console.log(
    `generated ${[...files.keys()].join(", ")} → ${path.relative(process.cwd(), OUT_DIR)}`,
  );
}

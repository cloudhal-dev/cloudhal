/**
 * JSON Schema → Rust via cargo-typify (pinned 0.8.0), from the bundled schemas.
 * Output is committed under crates/cloudhal-schema/src/generated/ and drift-checked in CI.
 *
 * Requires: `cargo install cargo-typify --version 0.8.0 --locked` and rustfmt.
 */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_DIR, writeBundled } from "./bundle.ts";
import { ROOT_SCHEMAS } from "./schema-list.ts";

const TYPIFY_VERSION = "0.8.0";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../../../crates/cloudhal-schema/src/generated");

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout;
}

const version = run("cargo", ["typify", "--version"]).trim();
if (!version.includes(TYPIFY_VERSION)) {
  throw new Error(
    `cargo-typify ${TYPIFY_VERSION} required, found "${version}". Run: cargo install cargo-typify --version ${TYPIFY_VERSION} --locked`,
  );
}

await writeBundled();
await mkdir(OUT_DIR, { recursive: true });

const HEADER = `//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run \`pnpm gen\`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]

`;

const mods: string[] = [];
for (const name of ROOT_SCHEMAS) {
  const modName = name.replace(/-/g, "_");
  const input = path.join(BUNDLED_DIR, `${name}.schema.json`);
  const output = path.join(OUT_DIR, `${modName}.rs`);
  run("cargo", ["typify", input, "--no-builder", "--additional-derive", "PartialEq", "-o", output]);
  const body = await readFile(output, "utf8");
  await writeFile(
    output,
    HEADER + body.replace(/^#!\[allow\(clippy::redundant_closure_call\)\]\n/m, ""),
  );
  mods.push(modName);
}
await writeFile(
  path.join(OUT_DIR, "mod.rs"),
  `//! GENERATED FILE — DO NOT EDIT. One module per root contract.\n\n${mods.map((m) => `pub mod ${m};`).join("\n")}\n`,
);
run("rustfmt", [
  "--edition",
  "2024",
  ...mods.map((m) => path.join(OUT_DIR, `${m}.rs`)),
  path.join(OUT_DIR, "mod.rs"),
]);
console.log(`generated ${mods.length} Rust modules → ${path.relative(process.cwd(), OUT_DIR)}`);

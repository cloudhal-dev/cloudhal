/**
 * The translation exchange (ADR-0034): Studio's catalogs stay in the repo; translators (people on
 * a platform, or the `translate` skill) work on nested ICU JSON.
 *
 *   pnpm i18n:export [--out .i18n]             every language as `<out>/<locale>/<file>.json`,
 *                                              plus `<out>/descriptions.json` (English + notes)
 *   pnpm i18n:import [--out .i18n] [--locale de] [--no-check]
 *                                              rewrites `src/i18n/<locale>.ts` and
 *                                              `lazy/<ns>.<locale>.ts` from the JSON, then runs
 *                                              the catalog tests
 *   node scripts/i18n-exchange.ts check        fails if a non-English catalog was edited by hand
 *
 * `<file>` is `core` (the core catalog) or a namespace. Only `en.ts` and `lazy/<ns>.en.ts` are
 * edited by hand: every other catalog is generated and carries a hash of its messages, so a hand
 * edit fails `check` (and `test/i18n-messages.test.ts`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileMessage } from "../packages/messages/src/compile.ts";
import { catalogEntries } from "./i18n-codemod/catalog-entries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = path.join(ROOT, "apps/studio");
const I18N = path.join(STUDIO, "src/i18n");
type Tree = { [key: string]: string | Tree };

/** Every catalog file of `locale`: `core` and each namespace, with its path. */
function files(locale: string): { name: string; file: string; ns?: string }[] {
  const lazy = readdirSync(path.join(I18N, "lazy"))
    .filter((f) => f.endsWith(`.${locale}.ts`))
    .map((f) => {
      const ns = f.slice(0, -`.${locale}.ts`.length);
      return { name: ns, file: path.join(I18N, "lazy", f), ns };
    });
  return [{ name: "core", file: path.join(I18N, `${locale}.ts`) }, ...lazy];
}

const locales = () =>
  readdirSync(I18N)
    .filter((f) => /^[a-z]{2,3}(-[A-Za-z0-9]+)*\.ts$/.test(f) && !["locales.ts"].includes(f))
    .map((f) => f.slice(0, -3));

/** A catalog module's messages, as written (Node loads the TypeScript; no compilation). */
async function load(file: string, english: boolean, ns?: string): Promise<Tree> {
  const mod = (await import(file)) as Record<string, Tree>;
  const tree = english && !ns ? mod.en : mod.messages;
  return (ns ? (tree as Tree)[ns] : tree) as Tree;
}

/** The hash a generated catalog carries: of its messages, in order. */
export const hashOf = (tree: Tree) =>
  createHash("sha256").update(JSON.stringify(tree)).digest("hex").slice(0, 16);

async function exportAll(out: string) {
  const descriptions: Record<string, { en: string; note?: string }> = {};
  for (const locale of locales()) {
    mkdirSync(path.join(out, locale), { recursive: true });
    for (const { name, file, ns } of files(locale)) {
      const tree = await load(file, locale === "en", ns);
      writeFileSync(path.join(out, locale, `${name}.json`), `${JSON.stringify(tree, null, 2)}\n`);
      if (locale !== "en") continue;
      for (const e of catalogEntries(readFileSync(file, "utf8")))
        descriptions[e.path] = { en: e.value, ...(e.comment ? { note: e.comment } : {}) };
    }
  }
  writeFileSync(path.join(out, "descriptions.json"), `${JSON.stringify(descriptions, null, 2)}\n`);
  console.log(`exported ${locales().join(", ")} to ${path.relative(ROOT, out)}`);
}

/** `theirs` in English's key order; missing, extra or invalid messages are errors. */
function align(english: Tree, theirs: unknown, at: string, errors: string[]): Tree {
  const out: Tree = {};
  const other = (theirs ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(english)) {
    const where = `${at}${key}`;
    if (typeof value === "string") {
      const t = other[key];
      if (typeof t !== "string") errors.push(`missing ${where}`);
      else {
        try {
          compileMessage(t);
          out[key] = t;
        } catch (error) {
          errors.push(`invalid ${where}: ${(error as Error).message}`);
        }
      }
    } else out[key] = align(value, other[key], `${where}.`, errors);
  }
  for (const key of Object.keys(other)) if (!(key in english)) errors.push(`extra ${at}${key}`);
  return out;
}

const literal = (tree: Tree) =>
  JSON.stringify(tree, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, "$1$2:");

/** The generated module for one catalog file, keeping what follows its messages (`dropped`). */
function render(locale: string, name: string, tree: Tree, previous: string | undefined): string {
  const ns = name === "core" ? undefined : name;
  const extras = previous?.match(/\n\};\n([\s\S]*)$/)?.[1]?.trim();
  const body = ns ? { [ns]: tree } : tree;
  const head = [
    `// Generated by \`pnpm i18n:import\` (ADR-0034): ${locale} ${ns ? `\`${ns}.*\`` : "core"} messages.`,
    "// Do not edit: change the translation file and import it; only English is edited here.",
    `// hash: ${hashOf(tree)}`,
    ns
      ? 'import type { NamespaceMessages } from "../namespaces.ts";'
      : 'import type { Messages } from "./en.ts";',
    "",
    `export const messages: ${ns ? `NamespaceMessages<"${ns}">` : "Messages"} = ${literal(body)};`,
  ];
  return `${head.join("\n")}\n${extras ? `\n${extras}\n` : ""}`;
}

async function importAll(out: string, only: string | undefined, check: boolean) {
  const written: string[] = [];
  for (const locale of locales().filter((l) => l !== "en" && (!only || l === only))) {
    const errors: string[] = [];
    const rendered: [string, string][] = [];
    for (const { name, file, ns } of files("en")) {
      const english = await load(file, true, ns);
      const json = path.join(out, locale, `${name}.json`);
      if (!existsSync(json)) {
        errors.push(`no ${path.relative(ROOT, json)}`);
        continue;
      }
      const tree = align(
        english,
        JSON.parse(readFileSync(json, "utf8")),
        ns ? `${ns}.` : "",
        errors,
      );
      const target = ns
        ? path.join(I18N, "lazy", `${ns}.${locale}.ts`)
        : path.join(I18N, `${locale}.ts`);
      const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
      rendered.push([target, render(locale, name, tree, previous)]);
    }
    if (errors.length) throw new Error(`${locale}: nothing written\n  ${errors.join("\n  ")}`);
    for (const [target, text] of rendered) writeFileSync(target, text);
    written.push(...rendered.map(([t]) => t));
  }
  if (written.length)
    execFileSync("pnpm", ["exec", "biome", "format", "--write", ...written], {
      cwd: ROOT,
      stdio: "ignore",
    });
  console.log(`imported ${written.length} catalog files`);
  if (check)
    execFileSync(
      "pnpm",
      ["exec", "vitest", "run", "test/i18n.test.tsx", "test/i18n-messages.test.ts"],
      {
        cwd: STUDIO,
        stdio: "inherit",
      },
    );
}

/** Non-English catalogs whose messages no longer match their hash (edited by hand). */
export async function handEdited(): Promise<string[]> {
  const out: string[] = [];
  for (const locale of locales().filter((l) => l !== "en"))
    for (const { file, ns } of files(locale)) {
      const hash = readFileSync(file, "utf8").match(/^\/\/ hash: ([0-9a-f]+)$/m)?.[1];
      const tree = await load(file, false, ns);
      if (hash !== hashOf(tree)) out.push(path.relative(ROOT, file));
    }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const out = path.resolve(ROOT, arg("out") ?? ".i18n");
  if (command === "export") await exportAll(out);
  else if (command === "import")
    await importAll(out, arg("locale"), !process.argv.includes("--no-check"));
  else if (command === "check") {
    const edited = await handEdited();
    if (edited.length) {
      console.error(
        `Edited by hand (only English is): ${edited.join(", ")}\n` +
          "Change the translation file and run `pnpm i18n:import` (ADR-0034, DESIGN.md §1).",
      );
      process.exit(1);
    }
  } else {
    console.error("usage: i18n-exchange.ts export | import | check [--out .i18n] [--locale xx]");
    process.exit(2);
  }
}

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
 * `<file>` is `core` (the core catalog), a namespace, or `status` (the renderer's status pages,
 * RFC-0043 §1.5, in `packages/astro-renderer/src/status-strings/`). Only `en.ts`,
 * `lazy/<ns>.en.ts` and `status-strings/en.ts` are edited by hand: every other catalog is
 * generated and carries a hash of its messages, so a hand edit fails `check` (and
 * `test/i18n-messages.test.ts`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALE_LIST, LOCALE_REGISTRY } from "../apps/studio/src/i18n/locales.ts";
import { compileMessage } from "../packages/messages/src/compile.ts";
import { catalogEntries } from "./i18n-codemod/catalog-entries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = path.join(ROOT, "apps/studio");
const I18N = path.join(STUDIO, "src/i18n");
/** The renderer's status-page catalog (RFC-0043 §1.5): the same flow, one file per language. */
const STATUS = path.join(ROOT, "packages/astro-renderer/src/status-strings");
type Tree = { [key: string]: string | Tree };

interface CatalogFile {
  name: string;
  file: string;
  ns?: string;
  kind: "core" | "lazy" | "status";
}

/** Every catalog file of `locale`: `core`, each namespace and `status`, with its path. */
function files(locale: string): CatalogFile[] {
  const lazy = readdirSync(path.join(I18N, "lazy"))
    .filter((f) => f.endsWith(`.${locale}.ts`))
    .map((f): CatalogFile => {
      const ns = f.slice(0, -`.${locale}.ts`.length);
      return { name: ns, file: path.join(I18N, "lazy", f), ns, kind: "lazy" };
    });
  return [
    { name: "core", file: path.join(I18N, `${locale}.ts`), kind: "core" },
    ...lazy,
    { name: "status", file: path.join(STATUS, `${locale}.ts`), kind: "status" },
  ];
}

/** Languages with catalogs on disk (export, check). */
const locales = () =>
  readdirSync(I18N)
    .filter((f) => /^[a-z]{2,3}(-[A-Za-z0-9]+)*\.ts$/.test(f) && !["locales.ts"].includes(f))
    .map((f) => f.slice(0, -3));
/** Registered languages (import): a new language has no catalogs until its first import. */
const registered = (): string[] => [...LOCALE_LIST];

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
      // a language registered after its last import has no status catalog yet
      if (!existsSync(file)) continue;
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
function render(
  locale: string,
  entry: CatalogFile,
  tree: Tree,
  previous: string | undefined,
): string {
  const ns = entry.ns;
  const extras = previous?.match(/\n\};\n([\s\S]*)$/)?.[1]?.trim();
  const body = ns ? { [ns]: tree } : tree;
  const what = ns ? `\`${ns}.*\`` : entry.kind === "status" ? "status page" : "core";
  const type =
    entry.kind === "status"
      ? { import: 'import type { StatusMessages } from "./en.ts";', name: "StatusMessages" }
      : ns
        ? {
            import: 'import type { NamespaceMessages } from "../namespaces.ts";',
            name: `NamespaceMessages<"${ns}">`,
          }
        : { import: 'import type { Messages } from "./en.ts";', name: "Messages" };
  const head = [
    `// Generated by \`pnpm i18n:import\` (ADR-0034): ${locale} ${what} messages.`,
    "// Do not edit: change the translation file and import it; only English is edited here.",
    `// hash: ${hashOf(tree)}`,
    type.import,
    "",
    `export const messages: ${type.name} = ${literal(body)};`,
  ];
  return `${head.join("\n")}\n${extras ? `\n${extras}\n` : ""}`;
}

/** Where `locale`'s generated catalog for `entry` is written. */
function targetOf(locale: string, entry: CatalogFile): string {
  if (entry.kind === "status") return path.join(STATUS, `${locale}.ts`);
  if (entry.ns) return path.join(I18N, "lazy", `${entry.ns}.${locale}.ts`);
  return path.join(I18N, `${locale}.ts`);
}

/**
 * The renderer's catalog index (RFC-0043 §1.5): every registered language's status messages
 * with its writing direction and `Intl` tag from the registry, so a language added to Studio
 * reaches the site Worker with its first import and nothing is wired by hand.
 */
function statusCatalogModule(): string {
  const ident = (l: string) => l.replace(/-/g, "_");
  const entries = registered().map((l) => {
    const info = LOCALE_REGISTRY[l];
    const intl = info.intl ? `, intl: "${info.intl}"` : "";
    return `  "${l}": { messages: ${l === "en" ? "en" : ident(l)}, dir: "${info.dir}"${intl} },`;
  });
  // in Biome's import order, so the generated file passes `pnpm lint` as written
  const imports = [...registered()]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((l) =>
      l === "en"
        ? 'import { en, type StatusMessages } from "./en.ts";'
        : `import { messages as ${ident(l)} } from "./${l}.ts";`,
    );
  return [
    "// Generated by `pnpm i18n:import` (ADR-0034, RFC-0043 §1.5): every registered language's",
    "// status-page messages with its writing direction and `Intl` tag from Studio's locale registry.",
    "// Do not edit: add a language to `apps/studio/src/i18n/locales.ts` and import its catalogs.",
    "",
    ...imports,
    "",
    "export interface StatusCatalogEntry {",
    "  readonly messages: StatusMessages;",
    '  readonly dir: "ltr" | "rtl";',
    "  /** The tag `Intl` formats with when it differs from the locale (Western digits, ADR-0033). */",
    "  readonly intl?: string;",
    "}",
    "",
    "export const STATUS_CATALOG: Readonly<Record<string, StatusCatalogEntry>> = {",
    ...entries,
    "};",
    "",
  ].join("\n");
}

/** Where `locale`'s lazy namespaces load from, kept out of the first load (`namespaces.ts`). */
const loaderModule = (locale: string) =>
  [
    `// Generated by \`pnpm i18n:import\` (ADR-0034): ${locale}'s lazy namespaces, loaded with its core`,
    "// catalog only when Studio shows the language, so the first load does not grow per language.",
    'import type { Loader } from "../namespaces.ts";',
    "",
    `export const loaders: Record<string, Loader> = import.meta.glob<Awaited<ReturnType<Loader>>>("../lazy/*.${locale}.ts");`,
    "",
  ].join("\n");

async function importAll(out: string, only: string | undefined, check: boolean) {
  const written: string[] = [];
  for (const locale of registered().filter((l) => l !== "en" && (!only || l === only))) {
    const errors: string[] = [];
    const rendered: [string, string][] = [];
    for (const entry of files("en")) {
      const { name, file, ns } = entry;
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
      const target = targetOf(locale, entry);
      const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
      rendered.push([target, render(locale, entry, tree, previous)]);
    }
    rendered.push([path.join(I18N, "loaders", `${locale}.ts`), loaderModule(locale)]);
    if (errors.length) throw new Error(`${locale}: nothing written\n  ${errors.join("\n  ")}`);
    mkdirSync(path.join(I18N, "loaders"), { recursive: true });
    for (const [target, text] of rendered) writeFileSync(target, text);
    written.push(...rendered.map(([t]) => t));
  }
  if (written.length) {
    const catalog = path.join(STATUS, "catalog.ts");
    writeFileSync(catalog, statusCatalogModule());
    written.push(catalog);
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
      if (!existsSync(file)) continue;
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

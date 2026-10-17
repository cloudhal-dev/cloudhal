/**
 * The catalog checks of RFC-0032 §5: every message is valid ICU (the subset), arrives compiled,
 * keeps English's arguments with compatible kinds, and has every plural category its language
 * needs. Runs for every registered language.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ArgInfo, argumentsOf } from "@cloudhal/messages/compile";
import { type Compiled, isMessage } from "@cloudhal/messages/format";
import { compileCatalogSource } from "@cloudhal/messages/transform";
import { describe, expect, it } from "vitest";
import { unusedKeys } from "../scripts/i18n-usage.ts";
import { en } from "../src/i18n/en.ts";
import { LOCALE_LIST, type Locale, NAMESPACES, translate } from "../src/i18n/index.tsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const I18N = path.resolve(here, "../src/i18n");

const CORE = import.meta.glob<{ messages: object }>(
  [
    "../src/i18n/*.ts",
    "!../src/i18n/en.ts",
    "!../src/i18n/locales.ts",
    "!../src/i18n/namespaces.ts",
  ],
  { eager: true },
);
const LAZY = import.meta.glob<{ messages: object }>("../src/i18n/lazy/*.ts", { eager: true });

const flat = (o: object, prefix = ""): [string, Compiled][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" || isMessage(v)
      ? [[`${prefix}${k}`, v as Compiled]]
      : flat(v as object, `${prefix}${k}.`),
  );
/** Every message of `locale`, core and lazy, by key. */
function messages(locale: Locale): Map<string, Compiled> {
  const core = locale === "en" ? en : CORE[`../src/i18n/${locale}.ts`]?.messages;
  const out = new Map(flat(core ?? {}));
  for (const ns of NAMESPACES)
    for (const [k, v] of flat(LAZY[`../src/i18n/lazy/${ns}.${locale}.ts`]?.messages ?? {}))
      out.set(k, v);
  return out;
}

/** A translation may render a number plainly (`{count} dosya`) or choose by it, never print an enum. */
function compatible(english: ArgInfo, translated: ArgInfo): boolean {
  if (english.kind === "select") return translated.kind === "select";
  if (translated.kind === "select") return false;
  return true;
}

function categories(locale: string, ordinal: boolean): string[] {
  return new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" }).resolvedOptions()
    .pluralCategories;
}

describe("message catalogs (RFC-0032 §5)", () => {
  it("every catalog file is valid ICU (the subset): the build would fail otherwise", () => {
    const files = [
      ...readdirSync(I18N).filter(
        (f) => /^[\w-]+\.ts$/.test(f) && f !== "locales.ts" && f !== "namespaces.ts",
      ),
      ...readdirSync(path.join(I18N, "lazy")).map((f) => `lazy/${f}`),
    ];
    expect(files.length).toBe(LOCALE_LIST.length * (NAMESPACES.length + 1));
    const errors = files.flatMap((f) => {
      try {
        compileCatalogSource(readFileSync(path.join(I18N, f), "utf8"), f);
        return [];
      } catch (error) {
        return [(error as Error).message];
      }
    });
    expect(errors).toEqual([]);
  });

  it("arrives compiled: a message with syntax is data, plain ones stay strings", () => {
    const english = messages("en");
    expect(isMessage(english.get("aiSettings.unavailable.description"))).toBe(true);
    expect(english.get("common.save")).toBe("Save");
    expect(translate("en", "aiSettings.unavailable.description")).toMatch(
      /^Add "ai": \{\} to cloudhal\.json/,
    );
  });

  it("keeps English's argument kinds in every language (a select stays a select)", () => {
    const english = messages("en");
    const problems: string[] = [];
    for (const locale of LOCALE_LIST.filter((l) => l !== "en"))
      for (const [key, message] of messages(locale)) {
        const source = english.get(key);
        if (source === undefined) continue;
        const want = argumentsOf(source);
        for (const [name, info] of argumentsOf(message)) {
          const theirs = want.get(name);
          if (theirs && !compatible(theirs, info))
            problems.push(`${locale}: ${key} uses {${name}} as ${info.kind}`);
          if (theirs?.kind === "select" && info.kind === "select") {
            const missing = (theirs.options ?? []).filter((o) => !info.options?.includes(o));
            if (missing.length)
              problems.push(`${locale}: ${key} select lacks ${missing.join(", ")}`);
          }
        }
      }
    expect(problems).toEqual([]);
  });

  it("has every plural category each language needs (CLDR, Intl.PluralRules)", () => {
    const problems: string[] = [];
    for (const locale of LOCALE_LIST)
      for (const [key, message] of messages(locale))
        for (const [name, info] of argumentsOf(message))
          for (const plural of info.plurals ?? []) {
            const missing = categories(locale, plural.ordinal).filter(
              (c) => !plural.keys.includes(c),
            );
            if (missing.length)
              problems.push(`${locale}: ${key} {${name}} lacks ${missing.join(", ")}`);
          }
    expect(problems).toEqual([]);
  });

  it("has no plurals by hand: no `…One`/`…Many` keys (RFC-0032 step b)", () => {
    const byHand = [...messages("en").keys()].filter((k) => /(One|Many)$/.test(k));
    expect(byHand).toEqual([]);
  });

  it("knows the categories that make one/other wrong elsewhere", () => {
    const sorted = (l: string) => categories(l, false).sort();
    expect(sorted("en")).toEqual(["one", "other"]);
    expect(sorted("ru")).toEqual(["few", "many", "one", "other"]);
    expect(sorted("ar")).toEqual(["few", "many", "one", "other", "two", "zero"]);
  });

  it("has no unused keys: every key is reachable from Studio's code (Phase 5)", () => {
    expect(unusedKeys(messages("en").keys())).toEqual([]);
    // The check itself: a key no code names is reported, a key built from a bound prefix is not.
    expect(unusedKeys(["nothing.uses.this", "comments.approvals.approveTitle"])).toEqual([
      "nothing.uses.this",
    ]);
  });

  it("has generated parameter types that match the English catalogs (`pnpm gen`)", () => {
    const script = path.resolve(here, "../scripts/i18n-types.ts");
    expect(() =>
      execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

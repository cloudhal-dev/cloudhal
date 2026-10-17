import { describe, expect, it } from "vitest";
import { argumentsOf, compileMessage, MessageSyntaxError } from "../src/compile.ts";
import { formatMessage } from "../src/format.ts";
import { compileCatalogSource } from "../src/transform.ts";
import { cloudhalMessages } from "../src/vite.ts";

const fmt = (locale: string, source: string, params: Record<string, string | number> = {}) =>
  formatMessage(locale, compileMessage(source), params);

describe("compileMessage", () => {
  it("keeps text and {name} messages as strings (the runtime substitutes them directly)", () => {
    expect(compileMessage("Save")).toBe("Save");
    expect(compileMessage("rev {rev}")).toBe("rev {rev}");
    expect(compileMessage("Don't save {name}")).toBe("Don't save {name}");
    expect(compileMessage("It''s")).toBe("It's");
    expect(compileMessage("#1 · {count}")).toBe("#1 · {count}");
  });

  it("compiles plural, select, selectordinal and number to data, never code", () => {
    const m = compileMessage("{count, plural, =0 {none} one {# word} other {# words}}");
    expect(Array.isArray(m)).toBe(true);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(typeof compileMessage("{n, number, percent}")).toBe("object");
    expect(typeof compileMessage("{k, select, a {A} other {B}}")).toBe("object");
  });

  it("quotes literal braces with apostrophes (ICU double-optional mode)", () => {
    expect(fmt("en", `Add "ai": '{}' to cloudhal.json`)).toBe('Add "ai": {} to cloudhal.json');
    expect(fmt("en", "'{name}' stays")).toBe("{name} stays");
    expect(fmt("en", "{n, plural, other {'#' is #}}", { n: 3 })).toBe("# is 3");
  });

  it("rejects what the subset does not allow, with the offset", () => {
    const bad = [
      'Add "ai": {} to cloudhal.json',
      "{count, plural, one {# word}}",
      "{count, plural, single {x} other {y}}",
      "{k, select, a {A} a {B} other {C}}",
      "{d, date, short}",
      "{n, number, currency}",
      "unclosed {name",
      "stray } brace",
    ];
    for (const source of bad)
      expect(() => compileMessage(source), source).toThrow(MessageSyntaxError);
  });
});

describe("formatMessage", () => {
  it("picks CLDR categories per locale", () => {
    const words = "{count, plural, one {# word} other {# words}}";
    expect(fmt("en", words, { count: 1 })).toBe("1 word");
    expect(fmt("en", words, { count: 1234 })).toBe("1,234 words");
    const ru = "{count, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}";
    expect([1, 2, 5, 21, 22, 25, 1.5].map((count) => fmt("ru", ru, { count }))).toEqual([
      "1 файл",
      "2 файла",
      "5 файлов",
      "21 файл",
      "22 файла",
      "25 файлов",
      "1,5 файла",
    ]);
    const ar =
      "{count, plural, zero {لا ملفات} one {ملف واحد} two {ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}";
    expect(fmt("ar", ar, { count: 0 })).toBe("لا ملفات");
    expect(fmt("ar", ar, { count: 2 })).toBe("ملفان");
  });

  it("prefers an exact =n case, and formats # and {n} in the branch in the locale", () => {
    const m = "{count, plural, =0 {No files} one {# file} other {{count} files}}";
    expect(fmt("en", m, { count: 0 })).toBe("No files");
    expect(fmt("de", m, { count: 12345 })).toBe("12.345 files");
    expect(fmt("tr", "{count, number} kelime", { count: 1200 })).toBe("1.200 kelime");
  });

  it("selects by value with other as the safety net, and nests", () => {
    const m =
      "{kind, select, page {{count, plural, one {A menu links to this page} other {# menu items link to this page}}} other {{count, plural, one {A menu links here} other {# menu items link here}}}}";
    expect(fmt("en", m, { kind: "page", count: 1 })).toBe("A menu links to this page");
    expect(fmt("en", m, { kind: "contentEntry", count: 3 })).toBe("3 menu items link here");
  });

  it("does ordinals and number styles", () => {
    const m = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
    expect([1, 2, 3, 4, 11, 21].map((n) => fmt("en", m, { n }))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "21st",
    ]);
    expect(fmt("en", "{r, number, percent}", { r: 0.25 })).toBe("25%");
    expect(fmt("en", "{n, number, integer}", { n: 2.6 })).toBe("3");
  });

  it("leaves a missing simple argument visible, as before", () => {
    expect(formatMessage("en", "Hello {name}")).toBe("Hello {name}");
    expect(fmt("en", "{k, select, a {A {name}} other {B}}", { k: "a" })).toBe("A {name}");
  });
});

describe("argumentsOf", () => {
  it("types each argument by its use", () => {
    const args = argumentsOf(
      compileMessage(
        "{who} · {count, plural, one {#} other {#}} · {kind, select, page {p} entry {e} other {x}}",
      ),
    );
    expect(args.get("who")).toEqual({ kind: "text" });
    expect(args.get("count")?.kind).toBe("number");
    expect(args.get("count")?.plurals).toEqual([{ ordinal: false, keys: ["one", "other"] }]);
    expect(args.get("kind")).toEqual({ kind: "select", options: ["page", "entry"] });
    expect([...argumentsOf("rev {rev}").keys()]).toEqual(["rev"]);
  });
});

describe("catalog modules", () => {
  const source = `/** "{not, a, message}" in a comment */
import type { Messages } from "./en.ts";
// a line comment with 'quotes {x}'
export const messages: Messages = {
  save: "Save",
  rev: "rev {rev}",
  words: "{count, plural, one {# word} other {# words}}",
  quote: 'It\\'s {n, number}',
  "1": "First",
};`;

  it("compiles only the messages that need it, as JSON data", () => {
    const out = compileCatalogSource(source, "de.ts");
    expect(out).toContain('save: "Save"');
    expect(out).toContain('rev: "rev {rev}"');
    expect(out).toContain('"1": "First"');
    expect(out).toContain('words: [[2,"count",{"one":[[4]," word"],"other":[[4]," words"]}]]');
    expect(out).toContain('quote: ["It\'s ",[1,"n"]]');
    expect(out).toContain('"{not, a, message}"');
    expect(compileCatalogSource('export const en = { a: "b" } as const;', "en.ts")).toBe(
      'export const en = { a: "b" } as const;',
    );
  });

  it("fails the build on an invalid message, naming file and line", () => {
    expect(() =>
      compileCatalogSource('const m = {\n  a: "{count, plural, one {x}}",\n};', "tr.ts"),
    ).toThrow(/tr\.ts:2: invalid message/);
  });

  it("is a plugin that touches only catalogs", () => {
    const plugin = cloudhalMessages({ include: /\/i18n\/[\w.]+\.ts$/ });
    expect(plugin.transform('const a = "{n, number}";', "/src/App.tsx")).toBeNull();
    expect(plugin.transform('const a = "Save";', "/src/i18n/en.ts")).toBeNull();
    expect(plugin.transform('const a = "{n, number}";', "/src/i18n/en.ts?v=1")?.code).toBe(
      'const a = [[1,"n"]];',
    );
  });
});

import { argumentsOf } from "@cloudhal/messages/compile";
import { type Compiled, isMessage } from "@cloudhal/messages/format";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { en, formsOf } from "../src/i18n/en.ts";
import {
  fallbackChain,
  I18nProvider,
  LOCALE_LIST,
  LOCALE_REGISTRY,
  type Locale,
  loadNamespace,
  type MessageKey,
  matchLocale,
  NAMESPACES,
  resetNamespaces,
  translate,
  useI18n,
  useT,
  withMessages,
} from "../src/i18n/index.tsx";

afterEach(cleanup);

/** Every catalog module, by path, as the app finds them (`import.meta.glob`, never a list). */
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
const core = (l: Locale): object | undefined =>
  l === "en" ? en : CORE[`../src/i18n/${l}.ts`]?.messages;
const lazy = (ns: string, l: Locale): object | undefined =>
  LAZY[`../src/i18n/lazy/${ns}.${l}.ts`]?.messages;
const OTHERS = LOCALE_LIST.filter((l) => l !== "en");

/** Every message by key; a value is a string or a message compiled at build time (RFC-0032). */
const flat = (o: object, prefix = ""): [string, Compiled][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" || isMessage(v)
      ? [[`${prefix}${k}`, v as Compiled]]
      : flat(v as object, `${prefix}${k}.`),
  );
const leaves = (o: object) => flat(o).map(([k]) => k);
const params = (message: Compiled) => new Set(argumentsOf(message).keys());

/**
 * Messages whose translation leaves a placeholder out because the language cannot inflect it
 * (a Turkish case suffix on an arbitrary name). Every other message keeps every placeholder.
 */
const DROPPED: Partial<Record<Locale, readonly string[]>> = {
  tr: [
    "common.deleteResource.warning",
    "common.deleteResource.delete",
    "comments.bulk.notFor",
    "menus.delete.title",
  ],
};
/** An argument and the forms declared for it (`forms` in `en.ts`, RFC-0032 §4c): any may stand for it. */
const allowed = (key: string, name: string) => [name, ...(formsOf(key)[name] ?? [])];

/** What breaks between English and a translation: missing or extra keys, unknown placeholders. */
function parity(english: object, other: object, locale: Locale): string[] {
  const problems: string[] = [];
  const theirs = new Map(flat(other));
  for (const [key, text] of flat(english)) {
    const translated = theirs.get(key);
    if (translated === undefined) {
      problems.push(`${locale}: missing ${key}`);
      continue;
    }
    theirs.delete(key);
    const want = params(text);
    const got = params(translated);
    const known = new Set([...want].flatMap((p) => allowed(key, p)));
    for (const p of got) if (!known.has(p)) problems.push(`${locale}: ${key} has unknown {${p}}`);
    const dropped = DROPPED[locale]?.includes(key);
    for (const p of want)
      if (!dropped && !allowed(key, p).some((a) => got.has(a)))
        problems.push(`${locale}: ${key} lost {${p}}`);
  }
  for (const key of theirs.keys()) problems.push(`${locale}: extra ${key}`);
  return problems;
}

/** Sentences a language keeps in English on purpose (none so far). */
const ENGLISH_LEFT: Partial<Record<Locale, number>> = {};

describe("declared forms (RFC-0032 §4c)", () => {
  it("let a translation take another form only where English declares it", () => {
    expect(formsOf("gating.abilities.rollback")).toEqual({ roles: ["role"] });
    expect(formsOf("editor.words")).toEqual({});
    const english = { gating: { abilities: { x: "Only {roles} can" } }, editor: { y: "{roles}" } };
    const turkish = { gating: { abilities: { x: "En az {role}" } }, editor: { y: "{role}" } };
    expect(parity(english, turkish, "tr")).toEqual([
      "tr: editor.y has unknown {role}",
      "tr: editor.y lost {roles}",
    ]);
  });
});

describe("locales", () => {
  it("every registered language has its core catalog and every namespace, and nothing else does", () => {
    for (const l of LOCALE_LIST) {
      expect(core(l), `${l}.ts`).toBeDefined();
      for (const ns of NAMESPACES) expect(lazy(ns, l), `lazy/${ns}.${l}.ts`).toBeDefined();
    }
    const files = [...Object.keys(CORE), ...Object.keys(LAZY)];
    const strays = files.filter(
      (f) => !LOCALE_LIST.some((l) => f.endsWith(`.${l}.ts`) || f.endsWith(`/${l}.ts`)),
    );
    expect(strays).toEqual([]);
  });

  it("registers well-formed BCP 47 tags with fallbacks that end in English", () => {
    for (const l of LOCALE_LIST) {
      expect(new Intl.Locale(l).toString()).toBe(l);
      const info = LOCALE_REGISTRY[l];
      for (const f of info.fallback) expect(LOCALE_LIST).toContain(f);
      expect(fallbackChain(l).at(-1)).toBe("en");
      expect(["ltr", "rtl"]).toContain(info.dir);
    }
    // A machine-translated language says so (the menus mark it); English and Turkish are reviewed.
    expect(LOCALE_REGISTRY.en.reviewed).toBe(true);
    expect(LOCALE_REGISTRY.tr.reviewed).toBe(true);
    expect(LOCALE_REGISTRY.de.reviewed).toBe(false);
  });

  it("picks the browser's language: exact tag, then the same language, then English", () => {
    expect(matchLocale(["tr-TR", "en"])).toBe("tr");
    expect(matchLocale(["de-AT"])).toBe("de");
    expect(matchLocale(["fr-FR", "de"])).toBe("de");
    expect(matchLocale(["ja", "x-invalid-tag-!!"])).toBe("en");
  });

  it("keeps every language on English's keys and placeholders (core catalogs)", () => {
    expect(OTHERS.flatMap((l) => parity(en, core(l) as object, l))).toEqual([]);
  });

  it("keeps every language on English's keys and placeholders (lazy namespaces)", () => {
    const problems = NAMESPACES.flatMap((ns) =>
      OTHERS.flatMap((l) => parity(lazy(ns, "en") as object, lazy(ns, l) as object, l)),
    );
    expect(problems).toEqual([]);
  });

  it("keeps lazy namespaces out of the core catalogs", () => {
    for (const ns of NAMESPACES) {
      expect(Object.keys(lazy(ns, "en") as object)).toEqual([ns]);
      expect(leaves(lazy(ns, "en") as object).length).toBeGreaterThan(0);
      for (const l of LOCALE_LIST) expect(core(l), `${l}.ts holds ${ns}`).not.toHaveProperty(ns);
    }
  });

  it("speaks the language, not English left behind", () => {
    // Placeholders, product names and codes may stay as they are; sentences may not.
    // A sentence has a lower-case word after another word ("Save changes"); names do not
    // ("Cloudhal Studio", "Core Web Vitals", "Samsung Internet").
    const sentence = (v: string) => /[A-Za-z]{4,} [a-z]{3,}/.test(v) && !/^Cloudflare /.test(v);
    for (const l of OTHERS) {
      const sources: [object, object][] = [
        [en, core(l) as object],
        ...NAMESPACES.map((ns) => [lazy(ns, "en"), lazy(ns, l)] as [object, object]),
      ];
      const same = sources.flatMap(([english, other]) => {
        const source = new Map(flat(english));
        return flat(other).filter(
          ([k, v]) => typeof v === "string" && source.get(k) === v && sentence(v),
        );
      });
      expect(
        same.length,
        `${l}: ${same
          .slice(0, 5)
          .map(([k]) => k)
          .join(", ")}`,
      ).toBeLessThanOrEqual(ENGLISH_LEFT[l] ?? 0);
    }
  });
});

describe("i18n", () => {
  it("substitutes placeholders and falls back along the chain, then to the key", () => {
    expect(translate("tr", "common.rev", { rev: 3 })).toBe("rev 3");
    expect(translate("en", "common.rev", { rev: 3 })).toBe("rev 3");
    expect(translate("tr", "nope.missing" as MessageKey)).toBe("nope.missing");
  });
  it("useT reads the provider locale", () => {
    function Probe() {
      const t = useT();
      return <span>{t("common.save")}</span>;
    }
    render(
      <I18nProvider initialLocale="tr">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("Kaydet")).toBeInTheDocument();
  });
  it("sets the page's language and direction from the registry", () => {
    render(
      <I18nProvider initialLocale="de">
        <span>x</span>
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("lazy message namespaces", () => {
  // The setup file loads every namespace; these tests start from nothing and restore it.
  afterAll(() =>
    Promise.all(LOCALE_LIST.flatMap((l) => NAMESPACES.map((ns) => loadNamespace(ns, l)))),
  );

  it("loads a namespace when a component asks for it, without ever showing its keys", async () => {
    resetNamespaces();
    expect(translate("tr", "readers.title")).toBe("readers.title");
    const seen: string[] = [];
    function Probe() {
      const t = useT("readers");
      seen.push(t("readers.title"));
      return <span>{t("readers.title")}</span>;
    }
    // Awaited: React retries a suspended render inside the act scope that started it.
    await act(async () => {
      render(
        <I18nProvider initialLocale="tr">
          <Suspense fallback={<span>waiting</span>}>
            <Probe />
          </Suspense>
        </I18nProvider>,
      );
    });
    expect(await screen.findByText("Okurlar")).toBeInTheDocument();
    expect(seen).toEqual(["Okurlar"]);
    expect(translate("tr", "readers.title")).toBe("Okurlar");
    // Only the language on screen was fetched.
    expect(translate("en", "readers.title")).toBe("readers.title");
  });

  it("loads a route's namespaces together with its module", async () => {
    resetNamespaces();
    const route = await withMessages(Promise.resolve({ Page: "module" }), ["analytics"], ["en"]);
    expect(route).toEqual({ Page: "module" });
    expect(translate("en", "analytics.range.apply")).toBe("Apply");
    expect(translate("tr", "analytics.range.apply")).toBe("Apply");
  });

  it("switches the language only once the namespaces on screen are there in it", async () => {
    resetNamespaces();
    await loadNamespace("readers", "en");
    let fallbacks = 0;
    let switchTo: (locale: Locale) => void = () => {};
    function Fallback() {
      fallbacks++;
      return null;
    }
    function Probe() {
      const { t, setLocale } = useI18n("readers");
      switchTo = setLocale;
      return <span>{t("readers.title")}</span>;
    }
    render(
      <I18nProvider initialLocale="en">
        <Suspense fallback={<Fallback />}>
          <Probe />
        </Suspense>
      </I18nProvider>,
    );
    expect(screen.getByText("Readers")).toBeInTheDocument();
    await act(async () => switchTo("tr"));
    expect(await screen.findByText("Okurlar")).toBeInTheDocument();
    expect(fallbacks).toBe(0);
  });
});

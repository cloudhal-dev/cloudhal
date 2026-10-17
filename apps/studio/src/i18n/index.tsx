import { type Compiled, formatList, formatMessage, isMessage } from "@cloudhal/messages/format";
import { pseudoLocalize } from "@cloudhal/messages/pseudo";

/** Studio's `Intl` layer (the i18n review's Phase 2): cached, always with an explicit locale. */
export {
  collator,
  dateTimeFormat,
  displayNames,
  formatDate,
  formatList,
  formatNumber,
  formatRelative,
  NUMERIC_DATE,
  NUMERIC_DATE_TIME,
  numberFormat,
  relativeTimeFormat,
} from "@cloudhal/messages/format";

/**
 * Items as a list in the Studio language ("a, b, and c", "a, b ve c"; `Intl.ListFormat`): what a
 * person reads is never `items.join(", ")` (RFC-0032 §4f). Components re-render on a language
 * switch, so the module-level locale is current.
 */
export function listOf(items: readonly string[], type?: "conjunction" | "disjunction"): string {
  return formatList(currentLocale(), items, type);
}

import {
  createContext,
  type ReactNode,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { en, type Messages } from "./en.ts";
import type { MessageParams } from "./generated/params.ts";
import {
  fallbackChain,
  isLocale,
  LOCALE_LIST,
  LOCALE_REGISTRY,
  type Locale,
  matchLocale,
} from "./locales.ts";
import {
  isNamespace,
  loadedCatalog,
  loadedNamespaces,
  loadNamespace,
  type Namespace,
  type NamespaceCatalogs,
} from "./namespaces.ts";

export {
  fallbackChain,
  isLocale,
  LOCALE_LIST,
  LOCALE_REGISTRY,
  LOCALES,
  type Locale,
  type LocaleInfo,
  matchLocale,
} from "./locales.ts";
export {
  loadNamespace,
  NAMESPACES,
  type Namespace,
  type NamespaceMessages,
  resetNamespaces,
} from "./namespaces.ts";

/**
 * The core catalogs. English is in the first load (it is also every key's fallback); another
 * language loads once, before the first render in it (`loadLocale`) and on a switch to it, so a
 * page never ships a language it does not show. Each is `./<locale>.ts` exporting
 * `messages: Messages`, found by name: one dynamic import per language, no loader to write.
 */
const catalogs: Partial<Record<Locale, Messages>> = { en: en as Messages };
const CORE_MODULES = import.meta.glob<{ messages: Messages }>([
  "./*.ts",
  "!./en.ts",
  "!./locales.ts",
  "!./namespaces.ts",
]);
const corePending = new Map<Locale, Promise<void>>();

/** Loads `locale`'s core catalog, once (the same promise until it settles; a failure can retry). */
export function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return Promise.resolve();
  let promise = corePending.get(locale);
  if (!promise) {
    const load = CORE_MODULES[`./${locale}.ts`];
    if (!load) return Promise.reject(new Error(`no core catalog for locale "${locale}"`));
    promise = load().then(
      ({ messages }) => {
        catalogs[locale] = messages;
        corePending.delete(locale);
      },
      (error: unknown) => {
        corePending.delete(locale);
        throw error;
      },
    );
    corePending.set(locale, promise);
  }
  return promise;
}

/** Whether `locale`'s core catalog is here. */
export function localeLoaded(locale: Locale): boolean {
  return catalogs[locale] !== undefined;
}
const STORAGE_KEY = "cloudhal.studio.locale";

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {}
  if (typeof navigator === "undefined") return "en";
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * The locale the Studio shows, for code outside React (route loaders preload namespaces in it).
 * Set by `I18nProvider`.
 */
let activeLocale: Locale | undefined;
export function currentLocale(): Locale {
  activeLocale ??= detectLocale();
  return activeLocale;
}

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Keys of the core catalogs (`en.ts`), which every page has. */
export type MessageKey = Leaves<Messages>;
/** Keys of lazy namespaces `N` (`analytics.range.apply` for `"analytics"`). */
export type NamespaceKey<N extends Namespace> = Leaves<Pick<NamespaceCatalogs, N>>;
/** Every key a `t` from `useT(...namespaces)` accepts. */
export type KeyIn<N extends Namespace = never> = MessageKey | NamespaceKey<N>;
type Params = Record<string, string | number>;
type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (
  i: infer I,
) => void
  ? I
  : never;
/**
 * The arguments `t(key, …)` takes for `key` (RFC-0032 §3, `generated/params.ts`): none for a key
 * without parameters, its typed parameters otherwise. A template key whose every possible key
 * takes parameters (``t(`errors.api.${code}`)``) takes what all of them need.
 */
type ParamsOf<K extends string> = K extends keyof MessageParams ? MessageParams[K] : never;
export type ArgsOf<K extends string> = [K] extends [never]
  ? [params?: Params]
  : [Exclude<K, keyof MessageParams>] extends [never]
    ? [params: UnionToIntersection<ParamsOf<K>>]
    : [ParamsOf<K>] extends [never]
      ? [params?: Record<string, never>]
      : // A key computed at run time from a mix (`as MessageKey`): checked by the catalog tests.
        [params?: Params];
/**
 * Parameters that stay placeholders, for a message a block fills in itself (`DeleteResource`'s
 * `{name}`, an editor's "Item {n}"): `t("editor.blocks.item", keep("n"))` → "Item {n}".
 */
export function keep<P extends string>(...names: P[]): Record<P, string> {
  return Object.fromEntries(names.map((n) => [n, `{${n}}`])) as Record<P, string>;
}

export type TFunction<N extends Namespace = never> = <K extends KeyIn<N>>(
  key: K,
  ...args: ArgsOf<K>
) => string;

/** A catalog value: a string, or a message compiled at build time (RFC-0032, `isMessage`). */
function lookup(messages: object | undefined, parts: readonly string[]): Compiled | undefined {
  let cur: unknown = messages;
  for (const part of parts) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === "string" || isMessage(cur) ? cur : undefined;
}

function find(locale: Locale, key: string): Compiled | undefined {
  const parts = key.split(".");
  const top = parts[0] ?? "";
  // A lazy namespace is read from its module, once loaded; the core catalogs never hold it.
  if (isNamespace(top)) return lookup(loadedCatalog(top, locale), parts.slice(1));
  return lookup(catalogs[locale], parts);
}

/**
 * Translates `key`: substitutes `{name}` and renders plurals, selects and numbers in `locale`
 * (`formatMessage`, RFC-0032). Falls back along the locale's chain
 * (`fallbackChain`: its fallbacks, then English), then to the key.
 * A key of a lazy namespace resolves only once that namespace is loaded in the locale (use
 * `useT(namespace)`, which waits for it).
 */
const PSEUDO_KEY = "cloudhal.studio.pseudo";
/**
 * The pseudo-locale (the i18n review's Phase 5, DESIGN.md §1): every catalog message accented,
 * lengthened and bracketed, to find hard-coded text, cut-off labels and layouts too tight for
 * longer languages. Dev and test only — `import.meta.env.DEV` removes it from production builds
 * (the bundle budget checks) — and never a language in the menus. Turn it on with `?pseudo` or
 * `localStorage["cloudhal.studio.pseudo"] = "1"` (`SHOTS_PSEUDO=1 pnpm design:shots`).
 */
let pseudo = import.meta.env.DEV && pseudoRequested();
function pseudoRequested(): boolean {
  try {
    return (
      new URLSearchParams(location.search).has("pseudo") || localStorage.getItem(PSEUDO_KEY) === "1"
    );
  } catch {
    return false;
  }
}
/** Dev and test only: turns the pseudo-locale on or off (a no-op in production). */
export function setPseudo(on: boolean): void {
  if (import.meta.env.DEV) pseudo = on;
}

export function translate(
  locale: Locale,
  key: MessageKey | NamespaceKey<Namespace>,
  params: Params = {},
): string {
  let text: Compiled | undefined;
  for (const l of fallbackChain(locale)) {
    text = find(l, key);
    if (text !== undefined) break;
  }
  const message = import.meta.env.DEV && pseudo && text !== undefined ? pseudoLocalize(text) : text;
  return formatMessage(locale, message ?? key, params);
}

interface I18nValue<N extends Namespace = never> {
  locale: Locale;
  /** Switches the language once the namespaces on screen are loaded in it (no untranslated flash). */
  setLocale: (locale: Locale) => void;
  t: TFunction<N>;
}

const I18nContext = createContext<I18nValue<Namespace> | undefined>(undefined);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const first = initialLocale ?? detectLocale();
    activeLocale = first;
    return first;
  });
  const setLocale = useCallback(
    (next: Locale) => {
      const apply = () => {
        activeLocale = next;
        startTransition(() => setLocaleState(next));
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {}
      };
      const needed = loadedNamespaces(locale).filter((ns) => !loadedCatalog(ns, next));
      if (needed.length === 0 && localeLoaded(next)) apply();
      else
        void Promise.all([loadLocale(next), ...needed.map((ns) => loadNamespace(ns, next))]).then(
          apply,
          () => {
            // A namespace failed to load: switch anyway; screens that need it suspend and retry.
            apply();
          },
        );
    },
    [locale],
  );
  // The page's language from the first render on (screen readers, hyphenation, `text-transform`),
  // not only after a switch: `index.html` ships `lang="en"`.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_REGISTRY[locale].dir;
  }, [locale]);
  // Normally loaded before the first render (main.tsx); otherwise wait for it here.
  if (!localeLoaded(locale)) use(loadLocale(locale));
  const value = useMemo<I18nValue<Namespace>>(
    () => ({
      locale,
      setLocale,
      t: ((key: string, params?: Params) =>
        translate(locale, key as MessageKey, params)) as TFunction<Namespace>,
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Suspends until `namespaces` are loaded in `locales` (the current locale by default). The route
 * preloads them (`withMessages`), so this normally returns at once.
 */
export function useMessages(namespaces: readonly Namespace[], locales?: readonly Locale[]): void {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useMessages must be used inside <I18nProvider>");
  for (const locale of locales ?? [ctx.locale])
    for (const ns of namespaces) if (!loadedCatalog(ns, locale)) use(loadNamespace(ns, locale));
}

/** The locale, its switch and `t` for the core keys plus lazy `namespaces` (suspends until loaded). */
export function useI18n<N extends Namespace = never>(...namespaces: N[]): I18nValue<N> {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  useMessages(namespaces);
  return ctx as I18nValue<N>;
}

/** `t` for the core keys plus lazy `namespaces`: `useT()`, `useT("analytics")`. */
export function useT<N extends Namespace>(...namespaces: [N, ...N[]]): TFunction<N>;
/** (Last, so `ReturnType<typeof useT>` is the core `t`.) */
export function useT(): TFunction;
export function useT(...namespaces: Namespace[]): TFunction<Namespace> {
  return useI18n(...namespaces).t;
}

/**
 * Loads a lazy route's module together with the namespaces it shows, in the current locale (or
 * every locale, for screens that show more than one language): one round trip, no flash of keys.
 * `lazyRouteComponent(() => withMessages(import("./routes/X.tsx"), ["readers"]), "X")`.
 */
export function withMessages<T>(
  module: Promise<T>,
  namespaces: readonly Namespace[],
  locales: readonly Locale[] = [currentLocale()],
): Promise<T> {
  return Promise.all([
    module,
    ...locales.flatMap((locale) => namespaces.map((ns) => loadNamespace(ns, locale))),
  ]).then(([m]) => m);
}

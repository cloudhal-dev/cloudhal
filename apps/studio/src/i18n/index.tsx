import {
  createContext,
  type ReactNode,
  startTransition,
  use,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { en, type Messages } from "./en.ts";
import {
  isNamespace,
  loadedCatalog,
  loadedNamespaces,
  loadNamespace,
  type Namespace,
  type NamespaceCatalogs,
} from "./namespaces.ts";
import { tr } from "./tr.ts";

export {
  loadNamespace,
  NAMESPACES,
  type Namespace,
  type NamespaceMessages,
  resetNamespaces,
} from "./namespaces.ts";

export const LOCALES = { en: "English", tr: "Türkçe" } as const;
export type Locale = keyof typeof LOCALES;
export const LOCALE_LIST = Object.keys(LOCALES) as Locale[];
const catalogs: Record<Locale, Messages> = { en: en as Messages, tr };
const STORAGE_KEY = "cloudhal.studio.locale";

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in catalogs) return stored as Locale;
  } catch {}
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return nav in catalogs ? (nav as Locale) : "en";
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
export type TFunction<N extends Namespace = never> = (key: KeyIn<N>, params?: Params) => string;

function lookup(messages: object | undefined, parts: readonly string[]): string | undefined {
  let cur: unknown = messages;
  for (const part of parts) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === "string" ? cur : undefined;
}

function find(locale: Locale, key: string): string | undefined {
  const parts = key.split(".");
  const top = parts[0] ?? "";
  // A lazy namespace is read from its module, once loaded; the core catalogs never hold it.
  if (isNamespace(top)) return lookup(loadedCatalog(top, locale), parts.slice(1));
  return lookup(catalogs[locale], parts);
}

/**
 * Translates `key`, substituting `{name}` placeholders. Falls back to English, then to the key.
 * A key of a lazy namespace resolves only once that namespace is loaded in the locale (use
 * `useT(namespace)`, which waits for it).
 */
export function translate(
  locale: Locale,
  key: MessageKey | NamespaceKey<Namespace>,
  params: Params = {},
): string {
  let text = find(locale, key);
  if (text === undefined && locale !== "en") text = find("en", key);
  return (text ?? key).replace(/\{(\w+)\}/g, (_m, name: string) =>
    String(params[name] ?? `{${name}}`),
  );
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
        document.documentElement.lang = next;
      };
      const needed = loadedNamespaces(locale).filter((ns) => !loadedCatalog(ns, next));
      if (needed.length === 0) apply();
      else
        void Promise.all(needed.map((ns) => loadNamespace(ns, next))).then(apply, () => {
          // A namespace failed to load: switch anyway; screens that need it suspend and retry.
          apply();
        });
    },
    [locale],
  );
  const value = useMemo<I18nValue<Namespace>>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
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

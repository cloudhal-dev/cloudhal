import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { en, type Messages } from "./en.ts";
import { tr } from "./tr.ts";

export const LOCALES = { en: "English", tr: "Türkçe" } as const;
export type Locale = keyof typeof LOCALES;
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

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

function lookup(messages: Messages, key: string): string {
  let cur: unknown = messages;
  for (const part of key.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === "string" ? cur : key;
}

/** Translates `key`, substituting `{name}` placeholders. Falls back to English, then to the key. */
export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  let text = lookup(catalogs[locale], key);
  if (text === key && locale !== "en") text = lookup(en, key);
  return text.replace(/\{(\w+)\}/g, (_m, name: string) => String(params[name] ?? `{${name}}`));
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? detectLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    document.documentElement.lang = next;
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

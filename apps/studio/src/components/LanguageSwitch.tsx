import { Select } from "@cloudhal/ui";
import {
  LOCALE_LIST,
  LOCALE_REGISTRY,
  type Locale,
  type TFunction,
  useI18n,
} from "../i18n/index.tsx";

/**
 * The language menus' names: each language in itself, and a machine-translated one marked as such
 * in the Studio language (`reviewed: false` in `i18n/locales.ts`), never hidden.
 */
export function languageNames(t: TFunction): Record<Locale, string> {
  return Object.fromEntries(
    LOCALE_LIST.map((l) => {
      const { name, reviewed } = LOCALE_REGISTRY[l];
      return [l, reviewed ? name : t("common.unreviewedLanguage", { name })];
    }),
  ) as Record<Locale, string>;
}

export function LanguageSwitch({ size = "sm" }: { size?: "xs" | "sm" | "base" }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <Select
      size={size}
      aria-label={t("common.language")}
      value={locale}
      onValueChange={(v) => setLocale(v as Locale)}
      items={languageNames(t)}
    />
  );
}

import { Select } from "@cloudhal/ui";
import { LOCALES, type Locale, useI18n } from "../i18n/index.tsx";

/**
 * The language menu: each language's name in itself, nothing more. Which languages are AI drafts
 * awaiting review is a note in `i18n/locales.ts` (`reviewed`), not a label for people.
 */
export function LanguageSwitch({ size = "sm" }: { size?: "xs" | "sm" | "base" }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <Select
      size={size}
      aria-label={t("common.language")}
      value={locale}
      onValueChange={(v) => setLocale(v as Locale)}
      items={LOCALES}
    />
  );
}

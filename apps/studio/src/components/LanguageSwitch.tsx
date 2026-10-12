import { Select } from "@cloudhal/ui";
import { LOCALES, type Locale, useI18n } from "../i18n/index.tsx";

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

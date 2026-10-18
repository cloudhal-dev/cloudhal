import { DirectionProvider, KumoLocaleProvider, type KumoTranslationsPartial } from "@cloudhal/ui";
import { type ReactNode, useMemo } from "react";
import { directionOf, useI18n } from "../i18n/index.tsx";

/**
 * Kumo's own words in the Studio language (DESIGN.md §2v, "Kumo locale"). Kumo 2.14's
 * `KumoLocaleProvider` translates only `LayerDialog`'s close button and its dismiss action
 * ("Close", "Cancel"); explicit `closeLabel`/`dismissLabel` props still win. Our Kumo patch
 * (`patches/kumo/label-locale.patch`) adds `Label`'s "(optional)" suffix and the name of its
 * tooltip button, which `Field`, `Checkbox` and `Select` show. Calendars, chart tooltips and the
 * map legend are localised per component instead (`calendarLocaleProps`, the analytics blocks'
 * labels and `Intl` formatters, one Kumo patch). Sits inside `I18nProvider`, so a language switch
 * follows. Base UI's `DirectionProvider` (under Kumo) gets the language's writing direction from
 * the locale registry, so menus, popovers and arrow keys follow `dir` (ADR-0033 B).
 */
export function KumoLocale({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const translations = useMemo<KumoTranslationsPartial>(
    () => ({
      layerDialog: { close: t("common.close"), cancel: t("common.cancel") },
      label: { optional: t("common.optional"), moreInformation: t("common.moreInformation") },
    }),
    [t],
  );
  return (
    <DirectionProvider direction={directionOf(locale)}>
      <KumoLocaleProvider translations={translations}>{children}</KumoLocaleProvider>
    </DirectionProvider>
  );
}

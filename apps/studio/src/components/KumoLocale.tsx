import { KumoLocaleProvider, type KumoTranslationsPartial } from "@cloudhal/ui";
import { type ReactNode, useMemo } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Kumo's own words in the Studio language (DESIGN.md §2v, "Kumo locale"). Kumo 2.14's
 * `KumoLocaleProvider` translates only `LayerDialog`'s close button and its dismiss action
 * ("Close", "Cancel"); explicit `closeLabel`/`dismissLabel` props still win. Calendars, chart
 * tooltips and the map legend are localised per component instead (`calendarLocaleProps`, the
 * analytics blocks' labels and `Intl` formatters, one Kumo patch). Sits inside `I18nProvider`, so
 * a language switch follows.
 */
export function KumoLocale({ children }: { children: ReactNode }) {
  const t = useT();
  const translations = useMemo<KumoTranslationsPartial>(
    () => ({ layerDialog: { close: t("common.close"), cancel: t("common.cancel") } }),
    [t],
  );
  return <KumoLocaleProvider translations={translations}>{children}</KumoLocaleProvider>;
}

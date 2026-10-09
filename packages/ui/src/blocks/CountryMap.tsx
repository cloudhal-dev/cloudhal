import { ChoroplethMap, cn, type MapGeoJson } from "@cloudflare/kumo";
import { type ReactNode, useMemo } from "react";
import { type CountryNameLabels, createAnalyticsFormatter } from "./analytics-format.ts";
import { BreakdownTable } from "./Breakdown.tsx";
import { echarts } from "./charts.ts";
import { useChartFrame } from "./useChartFrame.ts";
import { useChartPalette } from "./useChartPalette.ts";

/** Page views (or visits) for one country: ISO 3166-1 alpha-2, plus `XX` unknown and `T1` Tor. */
export interface CountryRow {
  country: string;
  value: number;
}

export interface CountryMapLabels extends CountryNameLabels {
  /** What the map shows, for screen readers ("Page views by country, last 30 days"). */
  map: string;
  /** Table headers: "Country", "Page views", "Share". */
  item: string;
  value: string;
  share: string;
  /** The folded remainder of the table ("Other countries"). */
  other: string;
}

export interface CountryMapProps {
  rows: readonly CountryRow[];
  /**
   * Country shapes (Natural Earth 1:110m admin-0, public domain), loaded lazily by the screen.
   * `undefined` while it loads: the map's place shows a placeholder and the table still renders.
   */
  geoJson: MapGeoJson | undefined;
  /** The feature property holding the alpha-2 code. Natural Earth's `ISO_A2` is `-99` for some countries, so the default is `ISO_A2_EH`. */
  nameProperty?: string;
  locale: string;
  labels: CountryMapLabels;
  /** Countries listed under the map before the rest folds into "Other countries". Default 8. */
  tableLimit?: number;
  /** The period's total; the table's shares are of it. */
  total?: number;
  loading?: boolean;
  /** Shown instead of the map and table when there are no rows (a `SectionEmpty`). */
  empty?: ReactNode;
  /** Map width / height. Default 1.6. */
  aspectRatio?: number;
  className?: string;
}

/** The property the block adds to every feature: the country's name in the Studio locale. */
const LOCAL_NAME = "cloudhalLocalName";

/**
 * Countries (DESIGN.md §2v, RFC-0006 §10.1): Kumo `ChoroplethMap` shaded with the token ramp
 * from `useChartPalette` (no-data in `--color-kumo-fill`), and under it the top countries as a
 * `BreakdownTable` — the map's text alternative, named with `Intl.DisplayNames`. It goes in a
 * flush `SectionCard`: the block pads the map and lets the table run edge to edge.
 *
 * The map's own tooltip is the only one used. Kumo's custom tooltip hook injects its return value
 * as HTML, so this block never passes one (the design lint refuses it); instead each feature is
 * given its localised name, joined on it, so the default tooltip — which escapes — reads
 * "Germany · 1,204". Shading uses `log1p` so one large country does not wash out the rest; the
 * tooltip shows the real figure.
 */
export function CountryMap({
  rows,
  geoJson,
  nameProperty = "ISO_A2_EH",
  locale,
  labels,
  tableLimit = 8,
  total,
  loading = false,
  empty,
  aspectRatio = 1.6,
  className,
}: CountryMapProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const palette = useChartPalette();
  const frameRef = useChartFrame();
  const names = useMemo<CountryNameLabels>(
    () => ({ unknown: labels.unknown, tor: labels.tor }),
    [labels.unknown, labels.tor],
  );

  const localized = useMemo<MapGeoJson | undefined>(() => {
    if (!geoJson) return undefined;
    return {
      type: "FeatureCollection",
      features: geoJson.features.map((f) => {
        const code = f.properties?.[nameProperty];
        const label =
          typeof code === "string" && /^[A-Z]{2}$/.test(code)
            ? fmt.country(code, names)
            : undefined;
        return { ...f, properties: { ...f.properties, [LOCAL_NAME]: label ?? "" } };
      }),
    };
  }, [geoJson, nameProperty, fmt, names]);

  const mapRows = useMemo(
    () =>
      rows
        .filter((r) => /^[A-Z]{2}$/.test(r.country) && r.country !== "XX" && r.value > 0)
        .map((r) => ({ name: fmt.country(r.country, names), shade: Math.log1p(r.value) })),
    [rows, fmt, names],
  );

  const tableRows = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.value - a.value)
        .map((r) => ({ id: r.country, label: fmt.country(r.country, names), value: r.value })),
    [rows, fmt, names],
  );

  if (!loading && rows.length === 0) return <>{empty}</>;
  const waiting = loading || !localized;
  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-3", className)} data-testid="country-map">
      <div
        ref={frameRef}
        role="img"
        aria-label={labels.map}
        aria-busy={waiting || undefined}
        className="min-w-0 px-5 pt-4"
      >
        {waiting ? (
          <div
            className="w-full rounded-lg bg-kumo-recessed motion-safe:animate-pulse"
            style={{ aspectRatio: String(aspectRatio) }}
            data-map-placeholder
          />
        ) : (
          <ChoroplethMap
            echarts={echarts}
            geoJson={localized}
            nameProperty={LOCAL_NAME}
            data={mapRows}
            name="name"
            value="shade"
            valueFormat={(shade) => fmt.number(Math.round(Math.expm1(shade)))}
            colorRange={palette.ramp}
            noDataColor={palette.noData}
            showLegend
            aspectRatio={aspectRatio}
            isDarkMode={palette.isDarkMode}
          />
        )}
      </div>
      <BreakdownTable
        rows={tableRows}
        locale={locale}
        limit={tableLimit}
        {...(total !== undefined ? { total } : {})}
        loading={loading}
        density="compact"
        labels={{
          item: labels.item,
          value: labels.value,
          share: labels.share,
          other: labels.other,
          caption: labels.map,
        }}
      />
    </div>
  );
}

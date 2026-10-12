import { Badge, Button, cn, SkeletonLine, Text, Tooltip } from "@cloudflare/kumo";
import { Info, Minus, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Children, type ReactNode, useMemo } from "react";
import {
  compareValues,
  createAnalyticsFormatter,
  type DeltaTone,
  type StatDelta,
} from "./analytics-format.ts";
import { InsetPanel } from "./InsetPanel.tsx";

export interface StatTileProps {
  /** What is counted ("Page views"). */
  label: string;
  /** The number; `null`/`undefined` reads as "—" (no data). */
  value: number | null | undefined;
  /** Studio locale (`Intl`), for the value and the delta. */
  locale: string;
  /** Formats the value instead of `Intl.NumberFormat` ("1.4" views per visit). */
  format?: (value: number) => string;
  /** The previous period's value; the delta is computed from it (±2 % reads as no change). */
  previous?: number | null;
  /** A delta the server already computed; wins over `previous`. */
  delta?: StatDelta;
  /**
   * The delta in words, for its tooltip and screen readers: `(formatted, delta) =>`
   * "12% more than the previous 30 days". Without it the badge is read as its number.
   */
  describeDelta?: (formatted: string, delta: StatDelta) => string;
  /** `false` when a fall is good news (the badge colours flip). Default `true`. */
  higherIsBetter?: boolean;
  /** A short explanation behind an info button ("Daily unique visitors, summed"). */
  hint?: string;
  /** Accessible name of the info button ("About unique visitors"); defaults to the hint. */
  hintLabel?: string;
  /** Values over the range, drawn as a sparkline under the number. */
  sparkline?: readonly number[];
  /** Screen-reader text for an empty value ("No data"). */
  emptyLabel?: string;
  loading?: boolean;
  className?: string;
}

const TONE_ICON: Record<DeltaTone, ReactNode> = {
  up: <TrendUp size={12} weight="bold" />,
  down: <TrendDown size={12} weight="bold" />,
  flat: <Minus size={12} weight="bold" />,
};

function deltaVariant(
  tone: DeltaTone,
  higherIsBetter: boolean,
): "success" | "warning" | "secondary" {
  if (tone === "flat") return "secondary";
  const good = tone === "up" ? higherIsBetter : !higherIsBetter;
  return good ? "success" : "warning";
}

/** The delta pill: success up, warning down, neutral within ±2 % (RFC-0006 §10.1). */
export function DeltaBadge({
  delta,
  locale,
  describe,
  higherIsBetter = true,
}: {
  delta: StatDelta;
  locale: string;
  describe?: StatTileProps["describeDelta"];
  higherIsBetter?: boolean;
}) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const formatted = fmt.delta(delta.tone === "flat" ? 0 : delta.ratio);
  const words = describe?.(formatted, delta);
  const variant = deltaVariant(delta.tone, higherIsBetter);
  const badge = (
    <Badge variant={variant} icon={TONE_ICON[delta.tone]}>
      <span aria-hidden={words ? true : undefined} className="tabular-nums">
        {formatted}
      </span>
      {words && <span className="sr-only">{words}</span>}
    </Badge>
  );
  const frame = { className: "inline-flex", "data-delta": delta.tone, "data-variant": variant };
  return words ? (
    <Tooltip content={words} render={<span {...frame} />}>
      {badge}
    </Tooltip>
  ) : (
    <span {...frame}>{badge}</span>
  );
}

/**
 * A line of values without axes, for a tile or a table cell. Decorative unless `label` is given;
 * the numbers it summarises must be readable elsewhere (the chart's table, the tile's value).
 */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: readonly number[];
  /** Accessible name when the line carries meaning on its own. */
  label?: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);
  const y = (v: number) => 23 - ((v - min) / span) * 22;
  const line = values.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      // The chart colour (`--color-kumo-brand`, the series blue); `text-kumo-brand` is the orange
      // brand text colour, so the SVG paints through the fill/stroke utilities instead.
      className={cn("block h-6 w-full overflow-visible", className)}
      data-sparkline
      role="img"
      aria-hidden={label ? undefined : true}
    >
      <title>{label ?? ""}</title>
      <polygon points={`0,24 ${line} 100,24`} className="fill-kumo-brand" fillOpacity={0.1} />
      <polyline
        points={line}
        fill="none"
        className="stroke-kumo-brand"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * One key figure (DESIGN.md §2v): the label, the value in large tabular figures, a delta badge
 * against the previous period and an optional sparkline. Renders a `dt`/`dd` pair, so it always
 * sits in a `StatTileGroup` (a `dl`). Loading shows skeleton lines in the value's place; an
 * unknown value reads "—".
 */
export function StatTile({
  label,
  value,
  locale,
  format,
  previous,
  delta: deltaProp,
  describeDelta,
  higherIsBetter = true,
  hint,
  hintLabel,
  sparkline,
  emptyLabel,
  loading = false,
  className,
}: StatTileProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const hasValue = typeof value === "number" && Number.isFinite(value);
  const delta = deltaProp ?? (hasValue ? compareValues(value, previous) : undefined);
  return (
    <InsetPanel className={cn("content-start gap-1.5", className)}>
      <dt className="flex min-h-6 min-w-0 items-center gap-1" data-stat-tile={label}>
        <Text as="span" size="sm" variant="secondary" truncate>
          {label}
        </Text>
        {hint && (
          <Tooltip
            content={hint}
            render={
              <Button
                variant="ghost"
                size="xs"
                shape="square"
                aria-label={hintLabel ?? hint}
                icon={<Info size={14} />}
              />
            }
          />
        )}
      </dt>
      <dd className="grid min-w-0 gap-2" aria-busy={loading || undefined}>
        {loading ? (
          <span className="grid py-1">
            <SkeletonLine minWidth={45} maxWidth={70} blockHeight={20} />
          </span>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tabular-nums" data-stat-value>
              <Text variant="heading" size="lg" as="span">
                {hasValue ? (format ?? fmt.number)(value) : "—"}
              </Text>
              {!hasValue && emptyLabel && <span className="sr-only">{emptyLabel}</span>}
            </span>
            {delta && (
              <DeltaBadge
                delta={delta}
                locale={locale}
                describe={describeDelta}
                higherIsBetter={higherIsBetter}
              />
            )}
          </span>
        )}
        {sparkline && !loading && <Sparkline values={sparkline} />}
      </dd>
    </InsetPanel>
  );
}

export interface StatTileGroupProps {
  /** Accessible name of the list of figures ("Traffic, last 30 days"). */
  label?: string;
  /** `compact` keeps two columns (side columns, the editor's Readers card). */
  density?: "base" | "compact";
  className?: string;
  children: ReactNode;
}

/**
 * Lays out `StatTile`s as a description list in a container-query grid: two columns, then three
 * or four in one row once the container has room for them. While three tiles share two columns
 * the third spans both, so no tile is left alone on half a row.
 */
export function StatTileGroup({
  label,
  density = "base",
  className,
  children,
}: StatTileGroupProps) {
  const count = Children.toArray(children).length;
  return (
    <div className="@container min-w-0">
      <dl
        aria-label={label}
        data-stat-count={count}
        className={cn(
          "grid min-w-0 grid-cols-2 gap-3",
          density === "base" &&
            count === 3 &&
            "@lg:grid-cols-3 [&>:nth-child(3)]:col-span-2 @lg:[&>:nth-child(3)]:col-span-1",
          density === "base" && count >= 4 && "@2xl:grid-cols-4",
          className,
        )}
      >
        {children}
      </dl>
    </div>
  );
}

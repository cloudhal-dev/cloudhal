import { cn, Link, Meter, SkeletonLine, Table, Text } from "@cloudflare/kumo";
import { type ReactNode, useMemo } from "react";
import { createAnalyticsFormatter } from "./analytics-format.ts";

/** One ranked item of a breakdown: a page, a channel, a referrer host, a country, a device. */
export interface BreakdownRow {
  /** Stable key (node id, channel enum, host, ISO code). */
  id: string;
  /** Plain text — titles and hosts come from the graph or the visitor, never HTML. */
  label: string;
  /** A second line in mono, such as the page's path. */
  detail?: string;
  /** Links the label (Kumo `Link`, routed by `LinkProvider`). Leave it out for referrer hosts: they are never linked. */
  href?: string;
  /** A 16 px icon before the label (the channel's icon). */
  icon?: ReactNode;
  /** After the label: the node kind as an outline `Badge`, "No longer exists". */
  badge?: ReactNode;
  /** The ranked metric; it drives the share. */
  value: number;
  /** A second metric shown in its own column (visits next to page views). */
  secondary?: number;
  /** The "(other)" bucket: always last, muted, never linked. */
  other?: boolean;
  /** Muted label, for nodes that no longer exist. */
  muted?: boolean;
}

export interface BreakdownLabels {
  /** First column's header ("Page", "Channel", "Referrer", "Country"). */
  item: string;
  /** The ranked metric's header ("Page views", "Visits"). */
  value: string;
  /** The second metric's header, when rows carry one ("Visits"). */
  secondary?: string;
  /** The share column's header ("Share"). */
  share: string;
  /** Label of the folded remainder ("Other"). */
  other: string;
  /** Accessible table caption ("Top content, last 30 days"). */
  caption?: string;
}

/**
 * Puts rows in their final order and folds what does not fit into one "(other)" row: rows past
 * `limit`, the rows the server already marked `other`, and — when the period's `total` is known
 * — whatever the listed rows do not account for.
 */
export function foldBreakdown(
  rows: readonly BreakdownRow[],
  opts: { limit?: number; total?: number; otherLabel: string; showOther?: boolean },
): { rows: BreakdownRow[]; total: number } {
  const ranked = rows.filter((r) => !r.other);
  const shown = opts.limit === undefined ? ranked : ranked.slice(0, opts.limit);
  const rest = [...ranked.slice(shown.length), ...rows.filter((r) => r.other)];
  const listed = rows.reduce((sum, r) => sum + r.value, 0);
  const total = Math.max(opts.total ?? listed, listed);
  const restValue = rest.reduce((sum, r) => sum + r.value, 0) + (total - listed);
  // The second metric of the remainder is known only when every folded row carries it and the
  // total adds nothing unlisted (the gap's visits are unknown): otherwise "—", never a guess.
  const restSecondary =
    total === listed && rest.length > 0 && rest.every((r) => r.secondary !== undefined)
      ? rest.reduce((sum, r) => sum + (r.secondary ?? 0), 0)
      : undefined;
  const out = [...shown];
  if (restValue > 0 && opts.showOther !== false) {
    out.push({
      id: "(other)",
      label: opts.otherLabel,
      value: restValue,
      other: true,
      ...(restSecondary !== undefined ? { secondary: restSecondary } : {}),
    });
  }
  return { rows: out, total };
}

export interface BreakdownTableProps {
  rows: readonly BreakdownRow[];
  labels: BreakdownLabels;
  locale: string;
  /** Rows shown before the rest folds into "(other)". */
  limit?: number;
  /** The period's total of `value`; shares are of this, and the gap becomes "(other)". */
  total?: number;
  loading?: boolean;
  /** Skeleton rows while loading. Default 5. */
  loadingRows?: number;
  /** Shown instead of the table when there are no rows (a `SectionEmpty`). */
  empty?: ReactNode;
  /** `compact` drops the second metric and narrows the share bar (side columns). */
  density?: "base" | "compact";
  className?: string;
}

/** A share bar: Kumo `Meter` with its label visually hidden (the row already names it). */
function ShareMeter({
  label,
  value,
  text,
  muted,
  compact,
}: {
  label: string;
  value: number;
  text: string;
  muted?: boolean | undefined;
  compact: boolean;
}) {
  return (
    <Meter
      label={label}
      value={Math.min(100, Math.max(0, value * 100))}
      customValue={text}
      className={cn(
        "flex-row-reverse items-center gap-3 [&>div:first-child]:w-12 [&>div:first-child]:justify-end [&>div:first-child>span:first-child]:sr-only",
        // Phone-narrow cards keep the percentage and drop the bar, so the name keeps its room.
        "w-12 @sm/breakdown:w-24",
        compact ? "@md/breakdown:w-28" : "@lg/breakdown:w-40",
      )}
      trackClassName="hidden h-1.5 flex-1 @sm/breakdown:block"
      indicatorClassName={cn(
        "motion-reduce:transition-none",
        muted && "from-kumo-interact via-kumo-interact to-kumo-interact",
      )}
    />
  );
}

/**
 * A ranked breakdown (DESIGN.md §2v) for top content, sources, referrers, campaigns and
 * countries: the item (icon, label linked or plain, a mono detail line, a badge), the metric
 * columns in tabular figures, and the share as a `Meter`. The remainder folds into one "(other)"
 * row. Goes in a flush `SectionCard`; an empty breakdown renders `empty` instead.
 */
export function BreakdownTable({
  rows: input,
  labels,
  locale,
  limit,
  total: totalProp,
  loading = false,
  loadingRows = 5,
  empty,
  density = "base",
  className,
}: BreakdownTableProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const compact = density === "compact";
  const { rows, total } = useMemo(
    () =>
      foldBreakdown(input, {
        ...(limit !== undefined ? { limit } : {}),
        ...(totalProp !== undefined ? { total: totalProp } : {}),
        otherLabel: labels.other,
      }),
    [input, limit, totalProp, labels.other],
  );
  const secondary = !compact && labels.secondary !== undefined;
  if (!loading && rows.length === 0) return <>{empty}</>;
  const columns = ["item", "value", ...(secondary ? ["secondary"] : []), "share"];
  return (
    // A container, so the second metric and the bar width follow the card, not the viewport.
    <div className="@container/breakdown min-w-0">
      <Table className={className} data-testid="breakdown-table">
        {labels.caption && <caption className="sr-only">{labels.caption}</caption>}
        <Table.Header>
          <Table.Row>
            <Table.Head>{labels.item}</Table.Head>
            <Table.Head className="w-0 text-right whitespace-nowrap">{labels.value}</Table.Head>
            {secondary && (
              <Table.Head className="hidden w-0 text-right whitespace-nowrap @lg/breakdown:table-cell">
                {labels.secondary}
              </Table.Head>
            )}
            <Table.Head className="w-0 whitespace-nowrap">{labels.share}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {loading
            ? Array.from({ length: loadingRows }, (_, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
                <Table.Row key={r} aria-hidden>
                  {columns.map((column) => (
                    <Table.Cell
                      key={column}
                      className={cn(column === "secondary" && "hidden @lg/breakdown:table-cell")}
                    >
                      <SkeletonLine minWidth={40} maxWidth={90} />
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            : rows.map((row) => (
                <Table.Row
                  key={row.id}
                  data-breakdown-row={row.id}
                  data-other={row.other || undefined}
                >
                  <Table.Cell className="min-w-32">
                    <div className="flex min-w-0 items-start gap-2">
                      {row.icon && (
                        <span
                          className="flex h-lh shrink-0 items-center text-kumo-subtle"
                          aria-hidden
                        >
                          {row.icon}
                        </span>
                      )}
                      <div className="grid min-w-0 gap-0.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {row.href && !row.other ? (
                            <Link href={row.href} className="min-w-0 break-words">
                              {row.label}
                            </Link>
                          ) : (
                            <Text as="span" variant={row.other || row.muted ? "secondary" : "body"}>
                              {row.label}
                            </Text>
                          )}
                          {row.badge}
                        </span>
                        {row.detail && (
                          <Text variant="mono-secondary" as="span" truncate>
                            {row.detail}
                          </Text>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right whitespace-nowrap tabular-nums">
                    {fmt.number(row.value)}
                  </Table.Cell>
                  {secondary && (
                    <Table.Cell className="hidden text-right whitespace-nowrap tabular-nums @lg/breakdown:table-cell">
                      {row.secondary === undefined ? "—" : fmt.number(row.secondary)}
                    </Table.Cell>
                  )}
                  <Table.Cell className="whitespace-nowrap">
                    <ShareMeter
                      label={row.label}
                      value={total > 0 ? row.value / total : 0}
                      text={fmt.share(row.value, total)}
                      muted={row.other}
                      compact={compact}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
        </Table.Body>
      </Table>
    </div>
  );
}

export interface BreakdownMetersProps {
  rows: readonly BreakdownRow[];
  locale: string;
  /** Rows shown before the rest folds into "(other)". */
  limit?: number;
  total?: number;
  /** Label of the folded remainder ("Other"). */
  otherLabel: string;
  /** `false` lists only the top rows (shares still of the total), without "(other)". */
  showOther?: boolean;
  /** Accessible name of the list ("Devices"). */
  label?: string;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
}

/**
 * Small categorical breakdowns as a list of labelled `Meter`s — devices, browsers, operating
 * systems, an article's top channels (DESIGN.md §2v; a bar list reads better than a pie). Each
 * meter shows "62% · 7,700".
 */
export function BreakdownMeters({
  rows: input,
  locale,
  limit,
  total: totalProp,
  otherLabel,
  showOther = true,
  label,
  loading = false,
  empty,
  className,
}: BreakdownMetersProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const { rows, total } = useMemo(
    () =>
      foldBreakdown(input, {
        ...(limit !== undefined ? { limit } : {}),
        ...(totalProp !== undefined ? { total: totalProp } : {}),
        otherLabel,
        showOther,
      }),
    [input, limit, totalProp, otherLabel, showOther],
  );
  if (loading) {
    return (
      <div className={cn("grid gap-4", className)} aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2">
            <SkeletonLine minWidth={30} maxWidth={60} />
            <SkeletonLine minWidth={100} maxWidth={100} blockHeight={8} />
          </div>
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul aria-label={label} className={cn("m-0 grid list-none gap-4 p-0", className)}>
      {rows.map((row) => (
        <li key={row.id} data-breakdown-row={row.id} className="min-w-0">
          <Meter
            label={row.label}
            value={total > 0 ? (row.value / total) * 100 : 0}
            customValue={`${fmt.share(row.value, total)} · ${fmt.number(row.value)}`}
            indicatorClassName={cn(
              "motion-reduce:transition-none",
              row.other && "from-kumo-interact via-kumo-interact to-kumo-interact",
            )}
          />
        </li>
      ))}
    </ul>
  );
}

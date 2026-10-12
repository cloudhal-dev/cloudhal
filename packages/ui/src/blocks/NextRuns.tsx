import { Badge, cn, SkeletonLine, Text } from "@cloudflare/kumo";
import { ClockClockwise } from "@phosphor-icons/react";
import { InsetPanel } from "./InsetPanel.tsx";
import { formatDay, formatScheduleTime, zonedDay } from "./schedule-model.ts";

export interface NextRun {
  /** RFC 3339 instant, from the server's rule preview. */
  at: string;
  /** The day falls on a clock change in the site zone (DST): a warning badge. */
  clockChange?: boolean;
  /** Moved forward out of a DST gap (D2): the screen's words ("Runs at 03:30, 02:30 does not exist"). */
  note?: string;
}

export interface NextRunsLabels {
  /** The panel's name ("Next runs"). */
  title: string;
  /** The badge on DST days ("Clock change"). */
  clockChange: string;
  /** No runs ("This automation will not run again"). */
  empty: string;
  /** While the preview loads ("Working out the next runs"). */
  loading: string;
}

export interface NextRunsProps {
  /** The next runs from the server (`POST …/automations/preview-rule`), at most five shown. */
  runs: readonly NextRun[];
  locale: string;
  /** The site's zone (IANA). Default UTC. */
  timeZone?: string;
  hourCycle?: "h23" | "h12";
  labels: NextRunsLabels;
  loading?: boolean;
  /** How many to show. Default 5. */
  limit?: number;
  className?: string;
}

/**
 * The next runs of a recurrence (RFC-0008 §15.4) as an outline `InsetPanel` `dl`: the day
 * ("Monday 12 October") and the time in the site zone, a warning "Clock change" `Badge` on DST
 * days and the screen's note for a moved run. Runs come from the server, so Studio has one
 * recurrence implementation and no date library (§9.4).
 */
export function NextRuns({
  runs,
  locale,
  timeZone = "UTC",
  hourCycle,
  labels,
  loading,
  limit = 5,
  className,
}: NextRunsProps) {
  return (
    <InsetPanel label={labels.title} className={className}>
      <Text as="span" bold size="sm">
        {labels.title}
      </Text>
      {loading ? (
        <div className="grid gap-2" data-next-runs-loading="">
          <span role="status" className="sr-only">
            {labels.loading}
          </span>
          {[0, 1, 2].map((i) => (
            <SkeletonLine key={i} />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <Text as="span" variant="secondary" size="sm">
          {labels.empty}
        </Text>
      ) : (
        <dl className="m-0 grid gap-1.5" data-next-runs="">
          {runs.slice(0, limit).map((run) => (
            <div
              key={run.at}
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
              <dt className="min-w-0">
                <Text as="span" size="sm">
                  {formatDay(zonedDay(run.at, timeZone), locale, "long")}
                </Text>
              </dt>
              <dd className={cn("m-0 flex items-center gap-2")}>
                {run.clockChange && (
                  <Badge variant="warning" icon={<ClockClockwise size={14} aria-hidden />}>
                    {labels.clockChange}
                  </Badge>
                )}
                <Text as="span" size="sm" variant="secondary">
                  <span className="tabular-nums">
                    {formatScheduleTime(run.at, locale, timeZone, hourCycle)}
                  </span>
                </Text>
                {run.note && (
                  <Text as="span" size="xs" variant="secondary">
                    {run.note}
                  </Text>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </InsetPanel>
  );
}

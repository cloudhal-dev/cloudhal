import { Badge, cn, Link, Table, Text, Tooltip } from "@cloudflare/kumo";
import type { ScheduleRunState } from "@cloudhal/core-contracts";
import { numberFormat } from "@cloudhal/messages/format";
import { ArrowsClockwise, Package, ShieldWarning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ScheduleStatusBadge } from "./ScheduleStatusBadge.tsx";
import {
  formatDay,
  formatScheduleTime,
  type ScheduleRunOutcome,
  type ScheduleRunTrigger,
  type ScheduleWords,
  zonedDay,
} from "./schedule-model.ts";

/** One history row's data (a `ScheduleRun` with its subject already named). */
export interface ScheduleRunRowData {
  id: string;
  /** When it ran (or was due): RFC 3339. */
  at: string;
  subject: "release" | "automation";
  /** Automation runs: a built-in job or an agent task. */
  job?: "builtin" | "agent-task";
  /** The release or automation's title, plain text, and where it links. */
  title: string;
  href?: string | undefined;
  state: ScheduleRunState;
  outcome?: ScheduleRunOutcome | undefined;
  trigger?: ScheduleRunTrigger | undefined;
  latenessSeconds?: number | undefined;
  /** Moved out of a DST gap or by new zone rules. */
  adjusted?: "dst-gap" | "tzdata" | undefined;
  usage?: { toolCalls: number; writes: number; approvalRequests: number } | undefined;
  budget?: { maxToolCalls: number; maxWrites: number; maxApprovalRequests: number } | undefined;
  /** The run read untrusted text (D10): from then on it could only read, label and hide. */
  taint?: { at: string; tool: string } | undefined;
}

export interface ScheduleRunRowLabels {
  /** "Release", "Built-in job", "Agent task". */
  subject: { release: string; builtin: string; agentTask: string };
  /** "Cron", "Clock", "Request", "Timer", "Run now". */
  trigger: Record<ScheduleRunTrigger, string>;
  /** "Did work", "Nothing to do", "Proposed changes", "Waiting for approval". */
  outcome: Record<ScheduleRunOutcome, string>;
  /** "On time" (under a minute late). */
  onTime: string;
  /** "3 min late" from the locale's duration ("3 min"). */
  late: (duration: string) => string;
  /** "Moved past a clock change", "Moved by new zone rules". */
  adjusted: { "dst-gap": string; tzdata: string };
  /** Budget use, from the formatted parts: "Calls 12/50 · Writes 2/10 · Requests 0/5". */
  usage: (parts: { toolCalls: string; writes: string; approvalRequests: string }) => string;
  /** The usage cell's name when over budget ("Over budget"). */
  overBudget: string;
  /** The taint marker ("Read visitor text") and its explanation from the tool and time. */
  taint: string;
  taintHint: (tool: string, time: string) => string;
  /** An empty cell ("—" or "None"), read by screen readers. */
  none: string;
}

export interface ScheduleRunRowProps {
  run: ScheduleRunRowData;
  words: Pick<ScheduleWords, "status">;
  labels: ScheduleRunRowLabels;
  locale: string;
  /** The site's zone (IANA). Default UTC. */
  timeZone?: string;
  hourCycle?: "h23" | "h12";
  /** Who started it (`ActorBadge` + name): the Origin column. */
  origin?: ReactNode;
  /** The last, sticky column: snapshot and audit links, the row menu. */
  actions?: ReactNode;
}

export const SCHEDULE_RUN_COLUMNS = [
  "time",
  "kind",
  "subject",
  "origin",
  "state",
  "outcome",
  "lateness",
  "usage",
  "links",
] as const;
export type ScheduleRunColumn = (typeof SCHEDULE_RUN_COLUMNS)[number];

/** The History table's header row, in the same column order as `ScheduleRunRow`. */
export function ScheduleRunHeader({ labels }: { labels: Record<ScheduleRunColumn, string> }) {
  return (
    <Table.Row>
      {SCHEDULE_RUN_COLUMNS.map((c) =>
        c === "links" ? (
          <Table.Head key={c} sticky="right">
            <span className="sr-only">{labels[c]}</span>
          </Table.Head>
        ) : (
          <Table.Head key={c}>{labels[c]}</Table.Head>
        ),
      )}
    </Table.Row>
  );
}

function formatLateness(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return numberFormat(locale, {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
    }).format(minutes);
  return numberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(minutes / 60);
}

/**
 * One row of the History tab (RFC-0008 §15.1, §11.7): when (day and time in the site zone),
 * the kind (release, built-in job or agent task, with its trigger), the subject (linked), who, the run **state**
 * and its **outcome** in separate columns (`ScheduleStatusBadge` subject `run`; an outline
 * outcome badge), lateness ("On time", "3 min late", a clock-change note), budget use against
 * the automation's budget (`tabular-nums`, warning when over), and a warning `ShieldWarning`
 * marker when the run read untrusted text (D10) whose toggletip names the tool and time. A
 * `Table.Row`: render it inside the screen's `Table` under `ScheduleRunHeader`.
 */
export function ScheduleRunRow({
  run,
  words,
  labels,
  locale,
  timeZone = "UTC",
  hourCycle,
  origin,
  actions,
}: ScheduleRunRowProps) {
  const nf = numberFormat(locale);
  const pair = (used: number, max: number | undefined) =>
    max === undefined ? nf.format(used) : `${nf.format(used)}/${nf.format(max)}`;
  const over =
    !!run.usage &&
    !!run.budget &&
    (run.usage.toolCalls > run.budget.maxToolCalls ||
      run.usage.writes > run.budget.maxWrites ||
      run.usage.approvalRequests > run.budget.maxApprovalRequests);
  const late = run.latenessSeconds ?? 0;
  const time = formatScheduleTime(run.at, locale, timeZone, hourCycle);
  const kindLabel =
    run.subject === "release"
      ? labels.subject.release
      : run.job === "agent-task"
        ? labels.subject.agentTask
        : labels.subject.builtin;
  const KindIcon = run.subject === "release" ? Package : ArrowsClockwise;
  return (
    <Table.Row data-run-id={run.id} data-run-state={run.state}>
      <Table.Cell>
        <span className="grid gap-0.5 whitespace-nowrap">
          <Text as="span">
            <span className="tabular-nums">{time}</span>
          </Text>
          <Text as="span" variant="secondary" size="xs">
            {formatDay(zonedDay(run.at, timeZone), locale, "medium")}
          </Text>
        </span>
      </Table.Cell>
      <Table.Cell>
        <span className="grid gap-1">
          <span className="inline-flex">
            <Badge variant="outline" icon={<KindIcon size={14} aria-hidden />}>
              {kindLabel}
            </Badge>
          </span>
          {run.trigger && (
            <Text as="span" variant="secondary" size="xs">
              {labels.trigger[run.trigger]}
            </Text>
          )}
        </span>
      </Table.Cell>
      <Table.Cell>
        <span className="block min-w-40 wrap-anywhere">
          {run.href ? (
            <Link href={run.href}>{run.title}</Link>
          ) : (
            <Text as="span" bold>
              {run.title}
            </Text>
          )}
        </span>
      </Table.Cell>
      <Table.Cell>{origin}</Table.Cell>
      <Table.Cell>
        <span className="flex flex-wrap items-center gap-1.5">
          <ScheduleStatusBadge status={{ subject: "run", state: run.state }} words={words} />
          {run.taint && (
            <Tooltip
              content={labels.taintHint(
                run.taint.tool,
                formatScheduleTime(run.taint.at, locale, timeZone, hourCycle),
              )}
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  data-taint=""
                  className={cn(
                    props.className,
                    "inline-flex shrink-0 cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
                  )}
                />
              )}
            >
              <Badge variant="warning" icon={<ShieldWarning size={14} aria-hidden />}>
                {labels.taint}
                <span className="sr-only">
                  .{" "}
                  {labels.taintHint(
                    run.taint.tool,
                    formatScheduleTime(run.taint.at, locale, timeZone, hourCycle),
                  )}
                </span>
              </Badge>
            </Tooltip>
          )}
        </span>
      </Table.Cell>
      <Table.Cell>
        {run.outcome ? (
          <span data-run-outcome={run.outcome} className="inline-flex">
            <Badge variant="outline">{labels.outcome[run.outcome]}</Badge>
          </span>
        ) : (
          <Text as="span" variant="secondary">
            <span aria-hidden>—</span>
            <span className="sr-only">{labels.none}</span>
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        <span className="grid gap-0.5 whitespace-nowrap" data-lateness={late}>
          <Text as="span" variant={late >= 60 ? undefined : "secondary"}>
            {late >= 60 ? labels.late(formatLateness(late, locale)) : labels.onTime}
          </Text>
          {run.adjusted && (
            <Text as="span" variant="secondary" size="xs">
              {labels.adjusted[run.adjusted]}
            </Text>
          )}
        </span>
      </Table.Cell>
      <Table.Cell>
        {run.usage ? (
          <span data-usage={over ? "over" : "within"} className="inline-flex flex-col gap-0.5">
            <Text as="span" size="sm" variant={over ? "error" : "secondary"}>
              <span className="whitespace-nowrap tabular-nums">
                {labels.usage({
                  toolCalls: pair(run.usage.toolCalls, run.budget?.maxToolCalls),
                  writes: pair(run.usage.writes, run.budget?.maxWrites),
                  approvalRequests: pair(
                    run.usage.approvalRequests,
                    run.budget?.maxApprovalRequests,
                  ),
                })}
              </span>
            </Text>
            {over && (
              <span className="inline-flex">
                <Badge variant="warning">{labels.overBudget}</Badge>
              </span>
            )}
          </span>
        ) : (
          <Text as="span" variant="secondary">
            <span aria-hidden>—</span>
            <span className="sr-only">{labels.none}</span>
          </Text>
        )}
      </Table.Cell>
      <Table.Cell sticky="right">
        <span className="flex items-center justify-end gap-1">{actions}</span>
      </Table.Cell>
    </Table.Row>
  );
}

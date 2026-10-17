import { cn, Link, Text } from "@cloudflare/kumo";
import {
  ArrowsClockwise,
  CalendarCheck,
  CalendarX,
  CircleNotch,
  ClockCounterClockwise,
  HandPalm,
  type Icon,
  Lightning,
  LinkBreak,
  Package,
  Pause,
  Robot,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { ScheduleStatusBadge } from "./ScheduleStatusBadge.tsx";
import {
  formatScheduleTime,
  type ScheduleEntry,
  type ScheduleKind,
  type ScheduleLook,
  type ScheduleWords,
  scheduleLook,
  statusWord,
} from "./schedule-model.ts";

/** Kind icons (RFC-0008 §15.3): publish and embargo `CalendarCheck`, expiry `CalendarX`, release `Package`, automation `Robot`. */
export const SCHEDULE_KIND_ICON: Record<ScheduleKind, Icon> = {
  publish: CalendarCheck,
  embargo: CalendarCheck,
  expiry: CalendarX,
  release: Package,
  automation: Robot,
};

/** The chip's fill and outline by look: fill = certainty, tone = state. */
const CHIP_LOOK: Record<ScheduleLook, string> = {
  quiet: "bg-kumo-tint text-kumo-default",
  auto: "bg-kumo-tint text-kumo-default",
  // D14: proposals are a dashed outline with no fill. Rings cannot be dashed, so this block — and
  // only this block — draws a dashed `border`, without any shadow (DESIGN.md §2x).
  proposed: "border border-dashed border-kumo-warning bg-transparent text-kumo-default",
  struck: "text-kumo-inactive line-through",
  danger: "bg-kumo-danger-tint text-kumo-default",
  running: "bg-kumo-info-tint text-kumo-default",
  done: "bg-kumo-recessed text-kumo-subtle",
  ghost: "ring ring-inset ring-kumo-line text-kumo-subtle",
  paused: "ring ring-inset ring-kumo-line text-kumo-subtle",
};

/** The icons that lead an item: the state's when it says more than the kind, else the kind's. */
function leadingIcons(
  entry: ScheduleEntry,
  look: ScheduleLook,
): { icon: Icon; tone?: string; spin?: boolean }[] {
  const kind = { icon: SCHEDULE_KIND_ICON[entry.kind] };
  switch (look) {
    case "proposed":
      return entry.origin === "agent"
        ? [{ icon: Robot }, { icon: HandPalm, tone: "text-kumo-warning" }]
        : [{ icon: HandPalm, tone: "text-kumo-warning" }];
    case "auto":
      return [kind, { icon: Lightning, tone: "text-kumo-warning" }];
    case "running":
      return [{ icon: CircleNotch, tone: "text-kumo-info", spin: true }];
    case "danger": {
      const s = entry.status;
      const icon =
        s.state === "conflict"
          ? Warning
          : s.state === "missed"
            ? ClockCounterClockwise
            : s.state === "broken"
              ? LinkBreak
              : WarningCircle;
      return [{ icon, tone: "text-kumo-danger" }];
    }
    case "ghost":
      return [{ icon: ArrowsClockwise }];
    case "paused":
      return [{ icon: Pause }];
    default:
      return [kind];
  }
}

function Icons({ entry, look }: { entry: ScheduleEntry; look: ScheduleLook }) {
  return (
    <span aria-hidden className="flex h-lh shrink-0 items-center gap-0.5">
      {leadingIcons(entry, look).map(({ icon: I, tone, spin }, i) => (
        <I
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, short list of icons
          key={i}
          size={14}
          className={cn(tone, spin && "animate-spin motion-reduce:animate-none")}
        />
      ))}
    </span>
  );
}

/**
 * The whole sentence an item reads as (RFC-0008 §15.4): "09:00, Publish, Election results,
 * proposed by Desk, Waiting for approval". The screen may word it itself (`entry.label`).
 */
export function scheduleItemSentence(
  entry: ScheduleEntry,
  words: ScheduleWords,
  time: string,
): string {
  if (entry.label) return entry.label;
  const parts = [time, words.kind[entry.kind], entry.title];
  if (entry.originLabel) parts.push(entry.originLabel);
  parts.push(statusWord(entry.status, words));
  if (entry.approval && entry.status.subject !== "approval")
    parts.push(words.status.approval[entry.approval]);
  if (entry.timeLeft) parts.push(entry.timeLeft);
  return parts.join(", "); // i18n-ignore: clauses of one spoken sentence (an accessible name), not a list
}

interface CommonProps {
  entry: ScheduleEntry;
  words: ScheduleWords;
  locale: string;
  /** The site's zone (IANA): the time is written in it. Default UTC. */
  timeZone?: string | undefined;
  /** Override the locale's hour cycle (Turkish is 24-hour already). */
  hourCycle?: "h23" | "h12" | undefined;
}

export type ScheduleItemChipProps = CommonProps &
  Omit<ComponentPropsWithRef<"button">, "children" | "type"> & {
    variant: "chip";
    /** A click or Enter on the chip (open the item, its menu or its agenda). */
    onOpen?: ((entry: ScheduleEntry) => void) | undefined;
  };

export interface ScheduleItemRowProps extends CommonProps {
  variant: "row";
  /** Under the title: collection, locale and terms as outline `Badge`s. */
  meta?: ReactNode;
  /** Who: `ActorBadge` + `ModeBadge subtle` from the screen. */
  origin?: ReactNode;
  /** Trailing actions (Approve/Deny, the ⋯ menu with "Move to…"). */
  actions?: ReactNode;
  /** Why it is in its state, for the status badge's tooltip. */
  reason?: string | undefined;
  /** Leave out the time column (a list already grouped by time). */
  hideTime?: boolean;
  className?: string;
}

export type ScheduleItemProps = ScheduleItemChipProps | ScheduleItemRowProps;

/**
 * One scheduled thing (RFC-0008 §15.4) as a month-grid `chip` or an agenda `row`.
 *
 * - **Chip** — a button at least 24 px tall: state or kind icon, time (`tabular-nums`) and title;
 *   its accessible name is the whole sentence (`scheduleItemSentence`). Looks follow §15.3:
 *   proposals are a dashed outline with no fill (D14), approved and person-made items a neutral
 *   tint, `auto` adds `Lightning`, failures a danger tint, done items fade, recurring occurrences
 *   are outline-only ghosts, denied and expired ones are struck through.
 * - **Row** — time, kind icon (its word for screen readers), the title (a `Link` when `href`),
 *   `meta`, `origin`, the `ScheduleStatusBadge` (the quiet "Scheduled" state shows none; an
 *   approval or `auto` shows its own badge) and `actions`. It wraps on phones.
 */
export function ScheduleItem(props: ScheduleItemProps) {
  const { entry, words, locale, timeZone = "UTC", hourCycle } = props;
  const look = scheduleLook(entry);
  const time = entry.timeLabel ?? formatScheduleTime(entry.at, locale, timeZone, hourCycle);

  if (props.variant === "chip") {
    const {
      entry: _e,
      words: _w,
      locale: _l,
      timeZone: _t,
      hourCycle: _h,
      variant: _v,
      onOpen,
      className,
      onClick,
      ...rest
    } = props;
    return (
      <button
        {...rest}
        type="button"
        aria-label={scheduleItemSentence(entry, words, time)}
        data-look={look}
        data-kind={entry.kind}
        data-entry-id={entry.id}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) onOpen?.(entry);
        }}
        className={cn(
          "flex min-h-6 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-start text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-kumo-brand",
          CHIP_LOOK[look],
          className,
        )}
      >
        <Icons entry={entry} look={look} />
        <span aria-hidden className="shrink-0 tabular-nums">
          {time}
        </span>
        <span aria-hidden className="min-w-0 truncate">
          {entry.title}
        </span>
      </button>
    );
  }

  const { meta, origin, actions, reason, hideTime, className } = props;
  const quiet =
    entry.status.subject === "release" &&
    entry.status.state === "scheduled" &&
    entry.approval !== "waiting";
  const approval =
    entry.approval && entry.status.subject !== "approval" && entry.approval !== "waiting"
      ? entry.approval
      : undefined;
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1.5 px-5 py-3", className)}
      data-look={look}
      data-kind={entry.kind}
      data-entry-id={entry.id}
    >
      {!hideTime && (
        <span className="flex h-lh w-16 shrink-0 items-center">
          <Text as="span" variant="secondary">
            <span className="tabular-nums">{time}</span>
          </Text>
        </span>
      )}
      <span className="flex h-lh shrink-0 items-center text-kumo-subtle">
        <Icons entry={entry} look={look} />
        <span className="sr-only">{words.kind[entry.kind]}</span>
      </span>
      <div className="grid min-w-0 flex-1 basis-40 gap-1">
        <span className={cn("min-w-0 wrap-anywhere", look === "struck" && "line-through")}>
          {entry.href ? (
            <Link href={entry.href}>{entry.title}</Link>
          ) : (
            <Text as="span" bold variant={look === "struck" ? "secondary" : undefined}>
              {entry.title}
            </Text>
          )}
        </span>
        {meta && <div className="flex min-w-0 flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {(origin || !quiet || approval) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {origin}
          {!quiet && (
            <ScheduleStatusBadge
              status={entry.status}
              words={words}
              reason={reason}
              timeLeft={entry.timeLeft}
            />
          )}
          {approval && (
            <ScheduleStatusBadge status={{ subject: "approval", state: approval }} words={words} />
          )}
        </div>
      )}
      {actions && <div className="ms-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

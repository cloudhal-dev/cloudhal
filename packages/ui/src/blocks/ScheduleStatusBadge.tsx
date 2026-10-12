import { Badge, cn, Tooltip } from "@cloudflare/kumo";
import type { AutomationState, ReleaseState, ScheduleRunState } from "@cloudhal/core-contracts";
import {
  ArrowsClockwise,
  CalendarBlank,
  CheckCircle,
  CircleNotch,
  Clock,
  ClockCountdown,
  ClockCounterClockwise,
  FlagCheckered,
  Gauge,
  HandPalm,
  Hourglass,
  type Icon,
  Lightning,
  LinkBreak,
  Pause,
  PauseCircle,
  PencilSimpleLine,
  Prohibit,
  SkipForward,
  StopCircle,
  Warning,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import type { ScheduleApprovalState, ScheduleStatus, ScheduleWords } from "./schedule-model.ts";
import { statusWord } from "./schedule-model.ts";

type Variant = "outline" | "secondary" | "info" | "success" | "warning" | "error";
interface Look {
  variant: Variant;
  icon: Icon;
  /** The icon turns (running states); still under `prefers-reduced-motion`. */
  spin?: boolean;
}

const RELEASE: Record<ReleaseState, Look> = {
  draft: { variant: "outline", icon: PencilSimpleLine },
  awaiting_approval: { variant: "warning", icon: HandPalm },
  scheduled: { variant: "outline", icon: CalendarBlank },
  running: { variant: "info", icon: CircleNotch, spin: true },
  published: { variant: "success", icon: CheckCircle },
  conflict: { variant: "error", icon: Warning },
  missed: { variant: "error", icon: ClockCounterClockwise },
  expired: { variant: "secondary", icon: Hourglass },
  failed: { variant: "error", icon: WarningCircle },
  canceled: { variant: "secondary", icon: XCircle },
};

const AUTOMATION: Record<AutomationState, Look> = {
  active: { variant: "success", icon: ArrowsClockwise },
  paused: { variant: "secondary", icon: Pause },
  "auto-paused": { variant: "warning", icon: PauseCircle },
  broken: { variant: "error", icon: LinkBreak },
  ended: { variant: "outline", icon: FlagCheckered },
};

const RUN: Record<ScheduleRunState, Look> = {
  due: { variant: "outline", icon: Clock },
  ready: { variant: "info", icon: Hourglass },
  running: { variant: "info", icon: CircleNotch, spin: true },
  succeeded: { variant: "success", icon: CheckCircle },
  failed: { variant: "error", icon: WarningCircle },
  missed: { variant: "error", icon: ClockCounterClockwise },
  skipped: { variant: "secondary", icon: SkipForward },
  "budget-exceeded": { variant: "warning", icon: Gauge },
  killed: { variant: "secondary", icon: StopCircle },
};

const APPROVAL: Record<ScheduleApprovalState, Look> = {
  waiting: { variant: "warning", icon: HandPalm },
  approved: { variant: "outline", icon: CheckCircle },
  auto: { variant: "warning", icon: Lightning },
  denied: { variant: "error", icon: Prohibit },
  expired: { variant: "secondary", icon: Hourglass },
};

/** The badge variant and icon of a status (for legends and tests). */
export function scheduleStatusLook(status: ScheduleStatus): Look {
  switch (status.subject) {
    case "release":
      return RELEASE[status.state];
    case "automation":
      return AUTOMATION[status.state];
    case "run":
      return RUN[status.state];
    case "approval":
      return APPROVAL[status.state];
  }
}

export interface ScheduleStatusBadgeProps {
  status: ScheduleStatus;
  words: Pick<ScheduleWords, "status">;
  /** Why it is in this state ("Pinned version 7 changed after approval"): a toggletip. */
  reason?: string | undefined;
  /** Waiting for approval: the time left, already worded ("3 h left"), with `ClockCountdown`. */
  timeLeft?: string | undefined;
  className?: string;
}

/**
 * The state of a release, an automation, one run or an approval (RFC-0008 §5.2–§5.3, §15.3):
 * a Kumo `Badge` whose variant is the tone (success done, warning waiting or automatic, error
 * conflict, failed, missed, info running, secondary and outline for quiet ends) and whose icon
 * and word always say the state too — colour is never the only signal (WCAG 1.4.1). Running
 * states turn their icon (not under `prefers-reduced-motion`) and are a polite status. With a
 * `reason` the badge is a button that opens it as a tooltip (also from the keyboard); with
 * `timeLeft` an outline `ClockCountdown` badge follows. `data-subject`/`data-state` for tests.
 */
export function ScheduleStatusBadge({
  status,
  words,
  reason,
  timeLeft,
  className,
}: ScheduleStatusBadgeProps) {
  const look = scheduleStatusLook(status);
  const word = statusWord(status, words);
  const badge = (
    <Badge
      variant={look.variant}
      icon={
        <look.icon
          size={14}
          aria-hidden
          className={cn(look.spin && "animate-spin motion-reduce:animate-none")}
        />
      }
    >
      {word}
      {reason && <span className="sr-only">. {reason}</span>}
    </Badge>
  );
  const running = look.spin === true;
  return (
    <span
      className={cn("inline-flex shrink-0 flex-wrap items-center gap-1", className)}
      data-subject={status.subject}
      data-state={status.state}
      {...(running ? { role: "status" } : {})}
    >
      {reason ? (
        <Tooltip
          content={reason}
          render={(props) => (
            <button
              {...props}
              type="button"
              className={cn(
                props.className,
                "inline-flex shrink-0 cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
              )}
            />
          )}
        >
          {badge}
        </Tooltip>
      ) : (
        badge
      )}
      {timeLeft && (
        <Badge variant="outline" icon={<ClockCountdown size={14} aria-hidden />}>
          {timeLeft}
        </Badge>
      )}
    </span>
  );
}

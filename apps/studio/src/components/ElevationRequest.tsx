import { Badge, Banner, Link, Text, Tooltip } from "@cloudhal/ui";
import { ArrowRight, ClockCountdown, Info } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import type { Approval, KeyMode } from "../lib/api.ts";
import {
  type ElevationRequest,
  type PendingElevation,
  REQUEST_ELEVATION,
} from "../lib/approvals.ts";
import {
  ELEVATION_PRESETS,
  formatDuration,
  formatUntil,
  isMoreAutonomous,
} from "../lib/elevation.ts";
import { ModeBadge } from "./AgentModes.tsx";

/**
 * A duration in the same short words as the elevation presets: "15 min", "1 hour", "1 day",
 * and "1 hr 30 min" / "1 sa 30 dk" for anything else (Intl's short Turkish adds full stops).
 */
export function useShortDuration() {
  const t = useT();
  return useCallback(
    (minutes: number) => {
      const standard = ELEVATION_PRESETS.find((p) => p === minutes);
      if (standard !== undefined) return t(`agents.elevate.presets.${standard}`);
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return [
        hours > 0 ? t("approvals.elevation.presetHours", { count: hours }) : "",
        rest > 0 ? t("approvals.elevation.presetMinutes", { count: rest }) : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    [t],
  );
}

/**
 * Words for an agent's elevation request (ADR-0016 addendum) in the person's language. The
 * server's English prompt is never shown; the agent's reason is quoted as plain text.
 */
export function useElevationRequestText() {
  const { t, locale } = useI18n();
  const shortDuration = useShortDuration();
  return useCallback(
    (request: Pick<Approval, "actor">, elevation: ElevationRequest) => {
      const agent = request.actor.name ?? request.actor.id;
      const mode = t(`agents.modes.names.${elevation.mode}`);
      return {
        agent,
        mode,
        /** "Desk asks to work in Auto mode for 1 hour." */
        sentence: t("approvals.elevation.sentence", {
          agent,
          mode,
          duration: formatDuration(elevation.minutes, locale, "long"),
        }),
        /** "Elevation to Auto · 1 hr" (History). */
        short: t("approvals.elevation.history", {
          mode,
          duration: shortDuration(elevation.minutes),
        }),
      };
    },
    [t, locale, shortDuration],
  );
}

/** "Own mode → requested mode" as two badges; the own mode is left out when it is unknown. */
export function ModeTransition({ from, to }: { from: KeyMode | undefined; to: KeyMode }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-transition={`${from ?? "?"}:${to}`}>
      {from && (
        <>
          <ModeBadge mode={from} />
          <ArrowRight size={14} className="text-kumo-subtle" aria-hidden />
        </>
      )}
      <ModeBadge mode={to} />
    </span>
  );
}

/**
 * The left cell of an elevation request in Approvals: a timer tile and "Elevation request" with
 * the raw MCP name underneath, so it reads as a different kind of request from content approvals.
 */
export function ElevationRequestCell() {
  const t = useT();
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-tint text-kumo-subtle ring ring-kumo-hairline">
        <ClockCountdown size={20} />
      </span>
      <div className="grid gap-0.5">
        <Text bold as="span">
          {t("approvals.elevation.badge")}
        </Text>
        <Text variant="mono-secondary" as="span">
          {REQUEST_ELEVATION}
        </Text>
      </div>
    </div>
  );
}

/**
 * The body of a pending elevation request: the mode change as badges, a localised sentence, the
 * agent's reason quoted as plain text (it is agent-controlled), and what approving does.
 */
export function ElevationRequestDetails({
  request,
  elevation,
  ownMode,
}: {
  request: Approval;
  elevation: ElevationRequest;
  ownMode: KeyMode | undefined;
}) {
  const t = useT();
  const text = useElevationRequestText()(request, elevation);
  return (
    <div className="grid gap-3" data-elevation-request={elevation.mode}>
      <div className="grid gap-1.5">
        <ModeTransition from={ownMode} to={elevation.mode} />
        <Text data-testid="elevation-sentence">{text.sentence}</Text>
      </div>
      <div className="grid gap-1 rounded-lg bg-kumo-recessed px-4 py-3 ring ring-kumo-hairline">
        <Text variant="secondary" size="xs" as="span">
          {t("approvals.elevation.reasonLabel")}
        </Text>
        {/* Agent-written: plain text only, never markup. */}
        {elevation.reason ? (
          <Text data-testid="elevation-reason">“{elevation.reason}”</Text>
        ) : (
          <Text variant="secondary">{t("approvals.elevation.noReason")}</Text>
        )}
      </div>
      {cannotTake(ownMode, elevation) ? (
        <CannotTakeNotice agent={text.agent} own={ownMode} />
      ) : (
        <Text variant="secondary" size="sm">
          {t("approvals.elevation.hint")}
        </Text>
      )}
    </div>
  );
}

/** The key's own mode has caught up with the request (changed meanwhile): nothing left to grant. */
export function cannotTake(
  own: KeyMode | undefined,
  elevation: Pick<ElevationRequest, "mode">,
): own is KeyMode {
  return own !== undefined && !isMoreAutonomous(elevation.mode, own);
}

/** Says why a request can no longer be granted, and that denying it tells the agent. */
export function CannotTakeNotice({ agent, own }: { agent: string; own: KeyMode }) {
  const t = useT();
  return (
    <div data-testid="elevation-cannot-take">
      <Banner
        variant="secondary"
        size="sm"
        icon={<Info weight="fill" />}
        description={t("approvals.elevation.cannotTake", {
          agent,
          own: t(`agents.modes.names.${own}`),
        })}
      />
    </div>
  );
}

/** "If you approve now: until 14:30" — when the elevation would end, at today's clock. */
export function UntilIfApprovedNow({ minutes, now }: { minutes: number; now: number }) {
  const { t, locale } = useI18n();
  const until = new Date(now + minutes * 60_000).toISOString();
  return (
    <span className="flex items-center gap-1.5" data-testid="elevation-until">
      <ClockCountdown size={14} className="text-kumo-subtle" aria-hidden />
      <Text variant="secondary" size="sm" as="span">
        {t("approvals.elevation.untilIfNow", { time: formatUntil(until, locale, { now }) })}
      </Text>
    </span>
  );
}

/**
 * Agents page: a key whose agent asked for more autonomy shows "Asks for Auto", linking to the
 * Approvals of the site it asked on.
 */
export function AsksForBadge({ pending }: { pending: PendingElevation }) {
  const { t, locale } = useI18n();
  const mode = t(`agents.modes.names.${pending.elevation.mode}`);
  return (
    <span className="inline-flex" data-asks-for={pending.elevation.mode}>
      <Tooltip
        content={
          <span className="block max-w-72">
            {t("approvals.elevation.asksForTooltip", {
              agent: pending.request.actor.name ?? pending.request.actor.id,
              mode,
              duration: formatDuration(pending.elevation.minutes, locale, "long"),
            })}
          </span>
        }
      >
        <Link href={`/sites/${pending.siteId}/approvals`} variant="plain">
          <Badge variant="warning" appearance="dot">
            {t("approvals.elevation.asksFor", { mode })}
          </Badge>
        </Link>
      </Tooltip>
    </span>
  );
}

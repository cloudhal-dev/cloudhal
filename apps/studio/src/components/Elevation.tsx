import { Badge, Banner, Text, Tooltip } from "@cloudhal/ui";
import { ClockClockwise, ClockCountdown, Stop } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ownModeOf } from "../lib/agents.ts";
import { type AgentKeyElevation, type AgentKeySummary, api } from "../lib/api.ts";
import type { PendingElevation } from "../lib/approvals.ts";
import {
  activeElevation,
  formatDuration,
  formatUntil,
  nextElevationEnd,
  remainingLabel,
  remainingMinutes,
} from "../lib/elevation.ts";
import {
  DEFAULT_EXTEND_MINUTES,
  type ExtendTarget,
  endsWithin,
  extendTargetOfKey,
} from "../lib/notifications.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { AsksForBadge } from "./ElevationRequest.tsx";
import { ElevationGoneError, useEndElevation, useExtendElevation } from "./elevation-actions.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";

export { ElevationGoneError, useEndElevation, useExtendElevation };

/** Keys with an elevation in force at `now`, with that elevation. */
export function elevatedKeys(
  keys: readonly AgentKeySummary[] | undefined,
  now: number,
): Array<{ key: AgentKeySummary; elevation: AgentKeyElevation }> {
  return (keys ?? []).flatMap((key) => {
    const elevation = activeElevation({ mode: ownModeOf(key), elevation: key.elevation }, now);
    return elevation ? [{ key, elevation }] : [];
  });
}

/** Who granted an elevation, as the person reads it: "you" for their own grants. */
function useGrantedBy(): (actorId: string) => string {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 5 * 60_000 });
  return (actorId) =>
    actorId && actorId === me.data?.actor.id ? t("agents.elevation.byYou") : actorId || "—";
}

/**
 * The key list's Mode cell (DESIGN.md §2g). While an elevation runs: the elevated `ModeBadge`, an
 * outline timer badge "42 min left" whose tooltip says from which mode, until when, by whom and
 * why, and the key's own mode underneath. Otherwise just the own mode. `now` ticks from the page.
 * When the key's agent waits for an elevation it asked for, "Asks for Auto" links to Approvals.
 */
export function KeyModeCell({
  agentKey,
  now,
  asks,
}: {
  agentKey: AgentKeySummary;
  now: number;
  /** The agent's pending elevation request, if any (ADR-0016 addendum). */
  asks?: PendingElevation | undefined;
}) {
  const { t, locale } = useI18n();
  const grantedBy = useGrantedBy();
  const { noticeMinutes } = useAgentModeRules();
  const own = ownModeOf(agentKey);
  const elevation = activeElevation({ mode: own, elevation: agentKey.elevation }, now);
  if (!elevation)
    return asks ? (
      <div className="grid justify-items-start gap-1.5">
        <ModeBadge mode={own} />
        <AsksForBadge pending={asks} />
      </div>
    ) : (
      <ModeBadge mode={own} />
    );
  const ownName = t(`agents.modes.names.${own}`);
  return (
    <div className="grid justify-items-start gap-1" data-elevated-to={elevation.mode}>
      {/* One line even in a narrow table: the table scrolls sideways instead. */}
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <ModeBadge mode={elevation.mode} />
        <span className="inline-flex" data-testid="elevation-remaining">
          <Tooltip
            content={
              <span className="grid max-w-72 gap-1">
                <span>
                  {t("agents.elevation.tooltip", {
                    from: ownName,
                    time: formatUntil(elevation.until, locale, { now }),
                    who: grantedBy(elevation.grantedBy),
                  })}
                </span>
                {elevation.reason && (
                  <span className="text-kumo-subtle">
                    {agentAsked(elevation.reason)
                      ? t("agents.elevation.requestedReason", {
                          reason: agentAsked(elevation.reason) ?? "",
                        })
                      : `“${elevation.reason}”`}
                  </span>
                )}
              </span>
            }
          >
            {/* Inside the notice window the timer turns to a warning, like the bell's item. */}
            <Badge
              variant={endsWithin(elevation.until, noticeMinutes, now) ? "warning" : "outline"}
              icon={<ClockCountdown />}
            >
              {remainingLabel(t, locale, elevation.until, now)}
            </Badge>
          </Tooltip>
        </span>
      </div>
      <Text variant="secondary" size="xs" as="span" data-own-mode={own}>
        {t("agents.elevation.ownMode", { mode: ownName })}
      </Text>
      {asks && <AsksForBadge pending={asks} />}
    </div>
  );
}

/**
 * A grant made from an agent's request stores the reason as `requested by the agent: …`
 * (packages/api routes/approvals.ts); returns the agent's own words, or undefined otherwise.
 */
function agentAsked(reason: string): string | undefined {
  const m = /^requested by the agent:\s*(.*)$/s.exec(reason);
  return m ? (m[1] ?? "").trim() || "…" : undefined;
}

/** Refetches the key list the moment the first elevation runs out, so the list flips back. */
export function useElevationExpiry(keys: readonly AgentKeySummary[] | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    const wait = nextElevationEnd(
      (keys ?? []).map((k) => ({ mode: ownModeOf(k), elevation: k.elevation })),
    );
    if (wait === undefined) return;
    // A second after the end, so the server no longer reports it; capped to setTimeout's range.
    const id = setTimeout(
      () => qc.invalidateQueries({ queryKey: ["agent-keys"] }),
      Math.min(wait + 1000, 2_147_483_647),
    );
    return () => clearTimeout(id);
  }, [keys, qc]);
}

/**
 * Agents page summary while any key is elevated: "1 agent key is elevated", one line per key
 * ("Desk: Edits → Auto until 14:30") and "End now". Alert tone when one of them is in Auto. Keys
 * inside the notice window (ADR-0016 addendum) carry an "Ends in 8 min" badge, and the banner
 * offers "Extend 1 hour" for them next to "End now" (`useExtendElevation`, like the bell).
 */
export function ElevatedKeysBanner({
  keys,
  now,
  noticeMinutes,
  onEnd,
  ending,
  onExtend,
  extending,
}: {
  keys: readonly AgentKeySummary[] | undefined;
  now: number;
  /** Minutes before its end that a key counts as ending soon. */
  noticeMinutes: number;
  onEnd: (keys: AgentKeySummary[]) => void;
  ending: boolean;
  onExtend: (targets: ExtendTarget[]) => void;
  extending: boolean;
}) {
  const { t, locale } = useI18n();
  const elevated = elevatedKeys(keys, now);
  if (elevated.length === 0) return null;
  const count = elevated.length;
  const endingSoon = elevated.flatMap(({ key, elevation }) => {
    const target = endsWithin(elevation.until, noticeMinutes, now)
      ? extendTargetOfKey(key, now)
      : undefined;
    return target ? [target] : [];
  });
  const extendBy = t(`notifications.extend.presets.${DEFAULT_EXTEND_MINUTES}`);
  return (
    <div role="status" data-testid="elevated-keys-banner">
      <Banner
        variant={elevated.some((e) => e.elevation.mode === "auto") ? "alert" : "default"}
        // Two actions do not fit next to the text on a phone: let them wrap under it.
        className="[&>div]:flex-wrap"
        icon={<ClockCountdown weight="fill" />}
        title={t("agents.elevation.bannerTitle", { count })}
        description={
          <span className="grid gap-1">
            {elevated.map(({ key, elevation }) => (
              <span key={key.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span data-elevated-key={key.id}>
                  {t("agents.elevation.bannerItem", {
                    name: key.name ?? t("agents.unnamed"),
                    from: t(`agents.modes.names.${ownModeOf(key)}`),
                    to: t(`agents.modes.names.${elevation.mode}`),
                    time: formatUntil(elevation.until, locale, { now }),
                  })}
                </span>
                {endingSoon.some((e) => e.keyId === key.id) && (
                  <span className="inline-flex" data-ending-soon={key.id}>
                    <Badge variant="warning" icon={<ClockCountdown />}>
                      {t("agents.elevation.endsIn", {
                        time: formatDuration(
                          Math.max(1, remainingMinutes(elevation.until, now)),
                          locale,
                          "short",
                        ),
                      })}
                    </Badge>
                  </span>
                )}
              </span>
            ))}
          </span>
        }
        action={
          <>
            {endingSoon.length > 0 && (
              <Banner.Action
                icon={<ClockClockwise />}
                loading={extending}
                onClick={() => onExtend(endingSoon)}
              >
                {endingSoon.length === 1 // i18n-ignore: one key's action vs "all", not a form
                  ? t("notifications.extend.button", { duration: extendBy })
                  : t("agents.elevation.extendAll", { duration: extendBy })}
              </Banner.Action>
            )}
            <Banner.Action
              icon={<Stop />}
              loading={ending}
              onClick={() => onEnd(elevated.map((e) => e.key))}
            >
              {
                // i18n-ignore: ending one key vs all keys, not a grammatical form
                count === 1 ? t("agents.elevation.endNow") : t("agents.elevation.endAll")
              }
            </Banner.Action>
          </>
        }
      />
    </div>
  );
}

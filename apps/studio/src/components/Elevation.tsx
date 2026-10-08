import { Badge, Banner, Text, Tooltip } from "@cloudhal/ui";
import { ClockCountdown, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ownModeOf } from "../lib/agents.ts";
import { type AgentKeyElevation, type AgentKeySummary, api } from "../lib/api.ts";
import {
  activeElevation,
  formatUntil,
  nextElevationEnd,
  remainingLabel,
} from "../lib/elevation.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { useToast } from "./Toast.ts";

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
 */
export function KeyModeCell({ agentKey, now }: { agentKey: AgentKeySummary; now: number }) {
  const { t, locale } = useI18n();
  const grantedBy = useGrantedBy();
  const own = ownModeOf(agentKey);
  const elevation = activeElevation({ mode: own, elevation: agentKey.elevation }, now);
  if (!elevation) return <ModeBadge mode={own} />;
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
                {elevation.reason && <span className="text-kumo-subtle">“{elevation.reason}”</span>}
              </span>
            }
          >
            <Badge variant="outline" icon={<ClockCountdown />}>
              {remainingLabel(t, locale, elevation.until, now)}
            </Badge>
          </Tooltip>
        </span>
      </div>
      <Text variant="secondary" size="xs" as="span" data-own-mode={own}>
        {t("agents.elevation.ownMode", { mode: ownName })}
      </Text>
    </div>
  );
}

/**
 * Ends elevations early (`DELETE …/elevation`, audited). No confirmation: it only takes autonomy
 * away, and elevating again is one dialog away (DESIGN.md §2g). Success and failure are toasts.
 */
export function useEndElevation() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (keys: readonly AgentKeySummary[]) =>
      Promise.all(keys.map((k) => api.agentKeys.endElevation(k.id))),
    onSuccess: async (updated) => {
      qc.setQueryData<AgentKeySummary[]>(["agent-keys"], (keys) =>
        keys?.map((k) => updated.find((u) => u.id === k.id) ?? k),
      );
      toast.success(
        t("agents.elevation.ended"),
        updated
          .map((u) =>
            t("agents.elevation.endedDescription", {
              name: u.name ?? t("agents.unnamed"),
              mode: t(`agents.modes.names.${ownModeOf(u)}`),
            }),
          )
          .join(" "),
      );
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
    },
    onError: (error) => toast.error(t("agents.elevation.endFailed"), error.message),
  });
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
 * ("Desk: Edits → Auto until 14:30") and "End now". Alert tone when one of them is in Auto.
 */
export function ElevatedKeysBanner({
  keys,
  now,
  onEnd,
  ending,
}: {
  keys: readonly AgentKeySummary[] | undefined;
  now: number;
  onEnd: (keys: AgentKeySummary[]) => void;
  ending: boolean;
}) {
  const { t, locale } = useI18n();
  const elevated = elevatedKeys(keys, now);
  if (elevated.length === 0) return null;
  const count = elevated.length;
  return (
    <div role="status" data-testid="elevated-keys-banner">
      <Banner
        variant={elevated.some((e) => e.elevation.mode === "auto") ? "alert" : "default"}
        icon={<ClockCountdown weight="fill" />}
        title={
          count === 1
            ? t("agents.elevation.bannerTitleOne")
            : t("agents.elevation.bannerTitleOther", { count })
        }
        description={
          <span className="grid gap-0.5">
            {elevated.map(({ key, elevation }) => (
              <span key={key.id} data-elevated-key={key.id}>
                {t("agents.elevation.bannerItem", {
                  name: key.name ?? t("agents.unnamed"),
                  from: t(`agents.modes.names.${ownModeOf(key)}`),
                  to: t(`agents.modes.names.${elevation.mode}`),
                  time: formatUntil(elevation.until, locale, { now }),
                })}
              </span>
            ))}
          </span>
        }
        action={
          <Banner.Action
            icon={<Stop />}
            loading={ending}
            onClick={() => onEnd(elevated.map((e) => e.key))}
          >
            {count === 1 ? t("agents.elevation.endNow") : t("agents.elevation.endAll")}
          </Banner.Action>
        }
      />
    </div>
  );
}

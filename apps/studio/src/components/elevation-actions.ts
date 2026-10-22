import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../i18n/index.tsx";
import { ownModeOf } from "../lib/agents.ts";
import { type AgentKeySummary, api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { formatUntil } from "../lib/elevation.ts";
import {
  canExtend,
  DEFAULT_EXTEND_MINUTES,
  type ExtendTarget,
  extendTargetOfKey,
  extensionInput,
} from "../lib/notifications.ts";
import { useToast } from "./Toast.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";

/*
 * Ending and extending elevations: the one implementation of each, shared by the key menu, the
 * Agents banner, the bell and its toasts. Hooks only, so the shell's notification alerts load them
 * without the Agents screen's badges and banners (`Elevation.tsx`).
 */

/**
 * After any change to an elevation: the key list, the bell and the approvals (a request the key
 * can no longer take reads differently) are read again.
 */
async function refreshAfterElevationChange(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["agent-keys"] }),
    qc.invalidateQueries({ queryKey: ["notifications"] }),
    qc.invalidateQueries({ queryKey: ["approvals"] }),
  ]);
}

/** Puts the summaries the server returned into the cached key list. */
function mergeKeys(qc: QueryClient, updated: readonly AgentKeySummary[]) {
  qc.setQueryData<AgentKeySummary[]>(["agent-keys"], (keys) =>
    keys?.map((k) => updated.find((u) => u.id === k.id) ?? k),
  );
}

/**
 * Ends elevations early (`DELETE …/elevation`, audited). No confirmation: it only takes autonomy
 * away, and elevating again is one dialog away (DESIGN.md §2g). Success and failure are toasts.
 * The one way Studio ends an elevation: the key menu, the Agents banner and the notification bell
 * all call this.
 */
export function useEndElevation() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (keys: readonly Pick<AgentKeySummary, "id">[]) =>
      Promise.all(keys.map((k) => api.agentKeys.endElevation(k.id))),
    onSuccess: async (updated) => {
      mergeKeys(qc, updated);
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
      await refreshAfterElevationChange(qc);
    },
    onError: (error) => toast.error(t("agents.elevation.endFailed"), apiErrorText(t, error)),
  });
}

/** The elevation ended or changed before "Extend" went out: extending it now would be a new grant. */
export class ElevationGoneError extends Error {
  override readonly name = "ElevationGoneError";
}

/**
 * Extends elevations in force (ADR-0016 addendum): a new elevation in **the same mode** for
 * `minutes` from now, which replaces the one in force. The keys are read again first, and a key
 * whose elevation has ended or changed mode is refused: that would be a new grant, and new grants
 * (with the Auto consent) only go through the elevate dialog. The one way Studio extends: the bell,
 * its toast and the Agents banner all call this.
 */
export function useExtendElevation() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useAgentModeRules();
  return useMutation({
    mutationFn: async ({
      targets,
      minutes = DEFAULT_EXTEND_MINUTES,
    }: {
      targets: readonly ExtendTarget[];
      minutes?: number;
    }) => {
      const keys = await api.agentKeys.list();
      const now = Date.now();
      for (const target of targets) {
        const key = keys.find((k) => k.id === target.keyId);
        const inForce = key ? extendTargetOfKey(key, now) : undefined;
        if (!canExtend(target, now) || inForce?.mode !== target.mode) {
          throw new ElevationGoneError(target.name ?? target.keyId);
        }
      }
      return Promise.all(
        targets.map((target) =>
          api.agentKeys.elevate(target.keyId, extensionInput(target, minutes, rules.elevation)),
        ),
      );
    },
    onSuccess: async (updated) => {
      mergeKeys(qc, updated);
      toast.success(
        t("notifications.extend.done"),
        updated
          .flatMap((u) =>
            u.elevation
              ? [
                  t("agents.elevate.doneDescription", {
                    name: u.name ?? t("agents.unnamed"),
                    mode: t(`agents.modes.names.${u.elevation.mode}`),
                    time: formatUntil(u.elevation.until, locale),
                    from: t(`agents.modes.names.${ownModeOf(u)}`),
                  }),
                ]
              : [],
          )
          .join(" "),
      );
      await refreshAfterElevationChange(qc);
    },
    onError: async (error) => {
      if (error instanceof ElevationGoneError) {
        toast.error(t("notifications.extend.gone"), t("notifications.extend.goneDescription"));
        await refreshAfterElevationChange(qc);
      } else {
        toast.error(t("notifications.extend.failed"), apiErrorText(t, error));
      }
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { type AnalyticsFeature, api } from "../lib/api.ts";
import { type AnalyticsAvailability, analyticsAvailability } from "../lib/readers.ts";
import { useGate, useMe } from "./useMe.ts";

/** `/api/instance` → `features.analytics`, shared with every gated screen (`["instance"]`). */
function useAnalyticsFeature(): { feature: AnalyticsFeature | undefined; known: boolean } {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { feature: instance.data?.features.analytics, known: !instance.isPending };
}

/**
 * Whether the analytics cards (the editors' Readers card, the overview card) and the lists'
 * "Views · 30 days" column appear and may ask the API: `null` while that is unknown or when
 * analytics are off (for the deployment or this site) — the card is left out; else the
 * availability and the gate. Contributors never call the analytics API (§10.2): the person's
 * abilities must be known first, and the site's status is read only when they may.
 */
export function useAnalyticsCard(siteId: string): {
  availability: Exclude<AnalyticsAvailability, "off">;
  reason: string | undefined;
} | null {
  const { feature, known } = useAnalyticsFeature();
  const me = useMe();
  const gate = useGate("analytics.read");
  const availability = analyticsAvailability(feature);
  const status = useQuery({
    queryKey: ["analytics", siteId, "status"],
    queryFn: () => api.analytics.status(siteId),
    enabled: availability === "on" && me.data !== undefined && gate.allowed,
    staleTime: 60_000,
    retry: false,
  });
  if (!known || availability === "off" || me.data === undefined) return null;
  if (!gate.allowed) return { availability, reason: gate.reason };
  if (availability === "on") {
    // An unreadable status does not hide the card: the node query says what went wrong.
    if (status.isPending) return null;
    if (status.data?.settings.enabled === false) return null;
  }
  return { availability, reason: undefined };
}

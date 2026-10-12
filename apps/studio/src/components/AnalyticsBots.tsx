/**
 * "Possible bot traffic" on the Analytics screen (RFC-0006 §5.5, §10.1; DESIGN.md §2v): the
 * `…/analytics/bots` signal for the period (its last 7 days, by the hour, for the whole site) as
 * the `AnalyticsBotBanner` block when the level is `watch` or `likely`, worded from the reason
 * codes in the Studio language. Nothing shows for `none`, while loading, or when the read fails —
 * a missing warning is better than a false one, and the cards report their own errors.
 */
import { AnalyticsBotBanner, addDays, Banner } from "@cloudhal/ui";
import { CalendarBlank } from "@phosphor-icons/react";
import { rangeQuery } from "../lib/analytics.ts";
import type { AnalyticsBotReason, AnalyticsBotTraffic } from "../lib/api.ts";
import { api } from "../lib/api.ts";
import { type AnalyticsScope, useReport } from "./AnalyticsSections.tsx";

/** The signal for the scope's range; the filter is left out (the check is site-wide). */
export function useBotTraffic(scope: AnalyticsScope, enabled = true) {
  return useReport(
    { ...scope, filter: undefined },
    ["bots"],
    () => api.analytics.bots(scope.siteId, rangeQuery(scope.range)),
    enabled,
  );
}

/** The day of the busiest hour as a range (UTC days, `to` exclusive). */
export function botTrafficDay(signal: AnalyticsBotTraffic): { from: string; to: string } | null {
  if (!signal.hour) return null;
  const from = signal.hour.slice(0, 10);
  return { from, to: addDays(from, 1) };
}

export function BotTrafficBanner({
  scope,
  signal,
  onShowDay,
}: {
  scope: AnalyticsScope;
  signal: AnalyticsBotTraffic | undefined;
  /** Opens the busiest hour's day (top pages and referrers of that day); absent when on it. */
  onShowDay?: ((day: { from: string; to: string }) => void) | undefined;
}) {
  const { t, fmt } = scope.text;
  if (!signal || signal.level === "none" || !signal.hour) return null;
  const hour = fmt.bucket(Date.parse(signal.hour), "hour");
  const spike = signal.reasons.find((r) => r.code === "hourly_spike");
  const multiple = fmt.number(spike?.value ?? 0);
  const day = botTrafficDay(signal);
  const onDay =
    day && "from" in scope.range && scope.range.from === day.from && scope.range.to === day.to;

  const reasonText = (r: AnalyticsBotReason): string => {
    switch (r.code) {
      case "hourly_spike":
        return t("analytics.bots.reasons.hourlySpike", {
          pageviews: fmt.number(signal.pageviews),
          hour,
          multiple: fmt.number(r.value),
          baseline: fmt.number(signal.baseline),
          threshold: fmt.number(r.threshold),
        });
      case "direct_entrances":
        return t("analytics.bots.reasons.directEntrances", {
          share: fmt.percent(r.value),
          threshold: fmt.percent(r.threshold),
        });
      case "single_browser":
        return t("analytics.bots.reasons.singleBrowser", {
          share: fmt.percent(r.value),
          browser: scope.text.browser(r.key ?? "other"),
          threshold: fmt.percent(r.threshold),
        });
      case "single_page":
        return t("analytics.bots.reasons.singlePage", {
          share: fmt.percent(r.value),
          page: r.node?.title ?? r.node?.path ?? r.key ?? "",
        });
    }
  };

  return (
    <AnalyticsBotBanner
      labels={{
        title:
          signal.level === "likely"
            ? t("analytics.bots.titleLikely")
            : t("analytics.bots.titleWatch"),
        description: t("analytics.bots.description", {
          pageviews: fmt.number(signal.pageviews),
          hour,
          multiple,
        }),
        advice: t("analytics.bots.advice"),
        details: t("analytics.bots.details"),
        note: t("analytics.bots.note"),
      }}
      reasons={signal.reasons.map((r) => ({ id: r.code, text: reasonText(r) }))}
      actions={
        day && !onDay && onShowDay ? (
          <Banner.Action
            variant="secondary"
            icon={<CalendarBlank />}
            onClick={() => onShowDay(day)}
          >
            {t("analytics.bots.showDay")}
          </Banner.Action>
        ) : undefined
      }
    />
  );
}

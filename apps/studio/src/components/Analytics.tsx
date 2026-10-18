/**
 * Shared pieces of the analytics surfaces (RFC-0006 §10, DESIGN.md §2v): the deployment's
 * analytics feature and the site's status, the words every analytics block takes as props (one
 * place, so the screen, the Readers card and the overview card say the same thing), channel icons
 * and names, and the error banner. Nothing here imports `@cloudhal/ui/charts`, so the editors and
 * the overview can use it without loading ECharts.
 */
import {
  type AnalyticsRangePickerLabels,
  Banner,
  type BreakdownLabels,
  type CountryNameLabels,
  createAnalyticsFormatter,
  directional,
  type StatDelta,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ArrowSquareIn,
  ArrowsLeftRight,
  CurrencyCircleDollar,
  EnvelopeSimple,
  type Icon,
  Link as LinkIcon,
  MagnifyingGlass,
  ShareNetwork,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type NamespaceKey, useI18n } from "../i18n/index.tsx";
import type { AnalyticsFilter } from "../lib/analytics.ts";
import {
  type AnalyticsChannel,
  type AnalyticsFeature,
  ApiRequestError,
  api,
  errorCode,
  isNotEnabled,
} from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { useGate, useMe } from "./useMe.ts";

export const analyticsKeys = {
  all: (siteId: string) => ["analytics", siteId] as const,
  status: (siteId: string) => ["analytics", siteId, "status"] as const,
  settings: (siteId: string) => ["analytics", siteId, "settings"] as const,
};

/** `/api/instance` → `features.analytics`; `undefined` while loading or on servers without it. */
export function useAnalyticsFeature(): { feature: AnalyticsFeature | undefined; pending: boolean } {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { feature: instance.data?.features.analytics, pending: instance.isPending };
}

/**
 * May the signed-in person read analytics (`analytics.read`, Authors and above)? Unlike plain
 * `useGate`, analytics waits for `/api/me` before asking (`ready`), so a Contributor's Studio never
 * fires a burst of refused reads; a server without `/api/me` reads as allowed once it has answered.
 */
export function useAnalyticsAccess() {
  const me = useMe();
  const gate = useGate("analytics.read");
  return { ready: !me.isPending, allowed: gate.allowed, reason: gate.reason };
}

/**
 * The site's analytics status (settings, last rollup, budget, yesterday's request estimate). Asked
 * only of people who may read analytics; a server without analytics answers 404 once.
 */
export function useAnalyticsStatus(siteId: string, enabled = true) {
  const access = useAnalyticsAccess();
  return useQuery({
    queryKey: analyticsKeys.status(siteId),
    queryFn: () => api.analytics.status(siteId),
    enabled: enabled && access.ready && access.allowed && !!siteId,
    staleTime: 60_000,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}

/** Whether an analytics error is Cloudflare's service being busy (503 with `retryable`). */
export function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 503 || errorCode(error) === "analytics_unavailable")
  );
}

const CHANNEL_ICONS: Record<AnalyticsChannel, Icon> = {
  direct: directional(ArrowSquareIn),
  internal: directional(ArrowsLeftRight),
  search: MagnifyingGlass,
  social: ShareNetwork,
  ai: Sparkle,
  email: EnvelopeSimple,
  paid: CurrencyCircleDollar,
  referral: LinkIcon,
};

/** The 16 px icon of a channel (RFC-0006 §10.1). */
export function ChannelIcon({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICONS[channel as AnalyticsChannel] ?? LinkIcon;
  return <Icon size={16} />;
}

const KNOWN = {
  channels: ["direct", "internal", "search", "social", "ai", "email", "paid", "referral"],
  devices: ["desktop", "mobile", "tablet", "bot", "unknown"],
  browsers: ["chrome", "edge", "firefox", "safari", "samsung", "opera", "other"],
  oses: ["windows", "macos", "ios", "android", "linux", "chromeos", "other"],
} as const;

/**
 * Every word the analytics blocks need, in the Studio language, plus `fmt` (numbers, dates and
 * region names through `Intl`). Memoised per locale.
 */
export function useAnalyticsText() {
  const { t, locale } = useI18n("analytics");
  return useMemo(() => {
    const fmt = createAnalyticsFormatter(locale);
    const name =
      (group: keyof typeof KNOWN, prefix: string) =>
      (key: string): string =>
        (KNOWN[group] as readonly string[]).includes(key)
          ? t(`${prefix}.${key}` as NamespaceKey<"analytics">)
          : key;
    const countryNames: CountryNameLabels = {
      unknown: t("analytics.countries.unknown"),
      tor: t("analytics.countries.tor"),
    };
    const rangePicker: AnalyticsRangePickerLabels = {
      group: t("analytics.range.group"),
      presets: {
        today: t("analytics.range.today"),
        "7d": t("analytics.range.7d"),
        "30d": t("analytics.range.30d"),
        "90d": t("analytics.range.90d"),
        "12m": t("analytics.range.12m"),
      },
      custom: t("analytics.range.custom"),
      customTitle: t("analytics.range.customTitle"),
      apply: t("analytics.range.apply"),
      cancel: t("common.cancel"),
      timezone: t("analytics.range.timezone"),
      calendar: {
        previousMonth: t("analytics.range.previousMonth"),
        nextMonth: t("analytics.range.nextMonth"),
        navigation: t("analytics.range.months"),
        day: (date, { today, selected }) => {
          const named = selected ? t("analytics.range.daySelected", { date }) : date;
          return today ? t("analytics.range.dayToday", { date: named }) : named;
        },
      },
      pickHint: t("analytics.range.pickHint"),
      tooLong: t("analytics.range.tooLong"),
      compare: t("analytics.range.compare"),
    };
    const chart = (description: string) => ({
      description,
      timezone: t("analytics.chart.timezone"),
      showTable: t("analytics.chart.showTable"),
      showChart: t("analytics.chart.showChart"),
      time: t("analytics.chart.time"),
      loading: t("common.loading"),
    });
    const breakdown = (item: string, value: string, extra: Partial<BreakdownLabels> = {}) => ({
      item,
      value,
      share: t("analytics.columns.share"),
      other: t("analytics.other"),
      ...extra,
    });
    const describeDelta = (formatted: string, delta: StatDelta) =>
      delta.tone === "flat"
        ? t("analytics.delta.flat")
        : t("analytics.delta.change", { value: formatted });
    const filterLabel = (filter: AnalyticsFilter, nodeTitle?: string) => {
      switch (filter.kind) {
        case "node":
          return nodeTitle ?? filter.value;
        case "channel":
          return name("channels", "analytics.channels")(filter.value);
        case "country":
          return fmt.country(filter.value, countryNames);
        case "device":
          return name("devices", "analytics.devices")(filter.value);
      }
    };
    return {
      t,
      locale,
      fmt,
      countryNames,
      rangePicker,
      chart,
      breakdown,
      describeDelta,
      filterLabel,
      channel: name("channels", "analytics.channels"),
      device: name("devices", "analytics.devices"),
      browser: name("browsers", "analytics.browsers"),
      os: name("oses", "analytics.oses"),
    };
  }, [t, locale]);
}

export type AnalyticsText = ReturnType<typeof useAnalyticsText>;

/**
 * An analytics read failed (DESIGN.md §5): the reason in plain words — "Cloudflare's analytics
 * service is busy" for a retryable 503 — and "Try again".
 */
export function AnalyticsErrorBanner({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useI18n("analytics");
  if (!error) return null;
  const busy = isRetryable(error);
  return (
    <div role="alert" data-testid="analytics-error">
      <Banner
        variant="error"
        icon={<WarningCircle weight="fill" />}
        title={busy ? t("analytics.errors.busyTitle") : t("analytics.errors.title")}
        description={
          busy
            ? t("analytics.errors.busyDescription")
            : error instanceof Error
              ? apiErrorText(t, error)
              : String(error)
        }
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowClockwise />}
            onClick={onRetry}
            loading={retrying}
          >
            {t("analytics.errors.retry")}
          </Banner.Action>
        }
      />
    </div>
  );
}

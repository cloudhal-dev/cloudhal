import { Banner, cn, Meter, Text } from "@cloudflare/kumo";
import { Warning } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import { createAnalyticsFormatter } from "./analytics-format.ts";

/** Workers Free: 100,000 requests a day across the account (RFC-0006 §0, Cost). */
export const WORKERS_FREE_DAILY_REQUESTS = 100_000;
/** Studio warns once yesterday's analytics-driven requests pass this (RFC-0006 §10.1). */
export const FREE_PLAN_WARNING_AT = 60_000;

/** The site's plan as the owner told Studio (`analytics_settings.planHint`). */
export type AnalyticsPlanHint = "unknown" | "free" | "paid";

/**
 * Whether the Free-plan warning shows: not on a plan the owner marked paid, and yesterday's
 * page views + analytics requests + renders above the threshold.
 */
export function shouldWarnFreePlan(
  requests: number,
  planHint: AnalyticsPlanHint | undefined,
  threshold = FREE_PLAN_WARNING_AT,
): boolean {
  return planHint !== "paid" && requests > threshold;
}

export interface AnalyticsQuotaBannerLabels {
  /** "Analytics may push you past the Workers Free limit" */
  title: string;
  /** What it means and what helps (lower vitals sampling, a paid plan). Plain text. */
  description: string;
  /** The meter's label ("Requests yesterday"). */
  meter: string;
  /** The meter's value text from the formatted numbers: `(used, limit) => "62,400 of 100,000 a day"`. */
  meterValue: (used: string, limit: string) => string;
}

export interface AnalyticsQuotaBannerProps {
  /** Yesterday's page views + analytics requests + renders. */
  requests: number;
  /** The daily allowance the meter is measured against. Default 100,000 (Workers Free). */
  limit?: number;
  locale: string;
  labels: AnalyticsQuotaBannerLabels;
  /** `Banner.Action`s: "Lower vitals sampling", "Analytics settings". */
  actions?: ReactNode;
  className?: string;
}

/**
 * The Free-plan request warning (RFC-0006 §10.1, DESIGN.md §2v): an alert `Banner` above the
 * Analytics cards with the estimate as a warning-toned `Meter` against the daily allowance and
 * the screen's actions. Show it with `shouldWarnFreePlan`; the same estimate sits in the "About
 * this data" card as a plain `Meter`.
 */
export function AnalyticsQuotaBanner({
  requests,
  limit = WORKERS_FREE_DAILY_REQUESTS,
  locale,
  labels,
  actions,
  className,
}: AnalyticsQuotaBannerProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const share = limit > 0 ? Math.min(100, (requests / limit) * 100) : 100;
  return (
    <Banner
      variant="alert"
      icon={<Warning weight="fill" />}
      title={labels.title}
      // The actions wrap under the text on phones (as in the elevated-keys banner, §2g).
      className={cn("[&>div]:flex-wrap", className)}
      data-testid="analytics-quota-banner"
      description={
        <span className="grid max-w-xl gap-3">
          <Text as="span">{labels.description}</Text>
          <Meter
            label={labels.meter}
            value={share}
            customValue={labels.meterValue(fmt.number(requests), fmt.number(limit))}
            indicatorClassName={cn(
              "from-kumo-warning via-kumo-warning to-kumo-warning motion-reduce:transition-none",
            )}
          />
        </span>
      }
      action={actions}
    />
  );
}

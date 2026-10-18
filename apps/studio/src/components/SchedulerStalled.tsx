import { Banner, directional, LinkButton } from "@cloudhal/ui";
import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { useI18n } from "../i18n/index.tsx";
import type { SchedulerStatus } from "../lib/api.ts";
import { formatMoment } from "../lib/schedules.ts";

/** Whether the scheduler's state deserves a banner (as the server's `scheduler-stalled`, §8.7). */
export function isStalled(status: SchedulerStatus | undefined): status is SchedulerStatus {
  return !!status && !status.healthy && (status.state !== "unknown" || status.dueWithin24h);
}

/**
 * "Scheduled work is not running" (RFC-0008 §8.7): what stopped, the last tick, and the way to the
 * schedule settings. Shown on the Schedules screens and the site overview; loaded lazily there.
 */
export function SchedulerStalledBanner({
  siteId,
  status,
}: {
  siteId: string;
  status: SchedulerStatus;
}) {
  const { t, locale } = useI18n("schedules");
  const s = "schedules.stalled" as const;
  const what = t(`${s}.${status.state === "running" ? "late" : status.state}`);
  return (
    <div role="alert" data-banner="stalled">
      <Banner
        variant="error"
        icon={<WarningCircle weight="fill" />}
        title={t(`${s}.title`)}
        description={
          status.lastTickAt
            ? `${what} ${t(`${s}.lastTick`, { time: formatMoment(status.lastTickAt, locale) })}`
            : what
        }
        action={
          <LinkButton
            href={`/sites/${siteId}/settings#schedules`}
            variant="secondary"
            size="sm"
            icon={directional(ArrowRight)}
          >
            {t(`${s}.action`)}
          </LinkButton>
        }
      />
    </div>
  );
}

export default SchedulerStalledBanner;

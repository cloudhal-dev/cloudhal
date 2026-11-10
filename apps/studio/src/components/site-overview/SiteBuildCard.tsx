import { Badge, Banner, Code, InlineCopyText, SectionCard } from "@cloudhal/ui";
import { Globe, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../../i18n/index.tsx";
import { api, type SiteBuildStatus } from "../../lib/api.ts";
import { RelativeTime } from "../RelativeTime.tsx";
import { StatRow } from "./SiteStatusCard.tsx";

/** While a build is queued or running the card follows it; otherwise it looks now and then. */
const POLL_BUSY_MS = 3_000;
const POLL_IDLE_MS = 30_000;

/**
 * The overview's "Public site build" card (#150): on a self-hosted server that rebuilds its static
 * site after every publish, whether a build is running or queued, and the last one — when, how
 * long, what visitors now see (the published snapshot, or the coming soon page before the first
 * publish), or why it failed while the previous version stays online. Absent elsewhere.
 */
export function SiteBuildCard({ siteId }: { siteId: string }) {
  const t = useT();
  const status = useQuery({
    queryKey: ["site-build", siteId],
    queryFn: () => api.siteBuild.status(siteId),
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d?.enabled && d.state !== "idle" ? POLL_BUSY_MS : POLL_IDLE_MS;
    },
  });
  const s = status.data;
  if (!s?.enabled) return null;
  const last = s.last;
  return (
    <SectionCard
      title={t("overview.siteBuild.title")}
      icon={<Globe size={16} />}
      description={t("overview.siteBuild.description")}
      actions={<StateBadge status={s} />}
    >
      <div className="grid gap-4">
        {last && !last.ok && (
          <Banner
            variant="error"
            icon={<WarningCircle />}
            title={t("overview.siteBuild.failedTitle")}
            description={t("overview.siteBuild.failedDescription")}
          />
        )}
        {last && (
          <dl className="grid divide-y divide-kumo-hairline">
            <StatRow
              label={t("overview.siteBuild.lastBuild")}
              value={<RelativeTime iso={last.at} size="base" />}
            />
            {last.durationMs !== undefined && (
              <StatRow
                label={t("overview.siteBuild.duration")}
                value={t("overview.siteBuild.seconds", {
                  seconds: Math.max(1, Math.round(last.durationMs / 1000)),
                })}
              />
            )}
            {last.ok && last.state === "not-published" && (
              <StatRow
                label={t("overview.siteBuild.output")}
                value={t("overview.siteBuild.statusPage")}
              />
            )}
            {last.ok && last.snapshotId && (
              <StatRow
                label={t("overview.siteBuild.snapshot")}
                value={<InlineCopyText>{last.snapshotId}</InlineCopyText>}
              />
            )}
          </dl>
        )}
        {last?.error && <Code lang="bash" code={last.error} />}
      </div>
    </SectionCard>
  );
}

function StateBadge({ status }: { status: Extract<SiteBuildStatus, { enabled: true }> }) {
  const t = useT();
  if (status.state === "running")
    return (
      <Badge variant="warning" appearance="dot">
        {t("overview.siteBuild.building")}
      </Badge>
    );
  if (status.state === "queued")
    return (
      <Badge variant="neutral" appearance="dot">
        {t("overview.siteBuild.queued")}
      </Badge>
    );
  if (!status.last)
    return (
      <Badge variant="neutral" appearance="dot">
        {t("overview.siteBuild.never")}
      </Badge>
    );
  return status.last.ok ? (
    <Badge variant="success" appearance="dot">
      {t("overview.siteBuild.built")}
    </Badge>
  ) : (
    <Badge variant="error" appearance="dot">
      {t("overview.siteBuild.failed")}
    </Badge>
  );
}

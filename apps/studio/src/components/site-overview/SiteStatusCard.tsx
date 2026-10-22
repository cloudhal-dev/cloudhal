import { Badge, InlineCopyText, Link, SectionCard, SkeletonLine, Text } from "@cloudhal/ui";
import type { ReactNode } from "react";
import { useT } from "../../i18n/index.tsx";
import { originHost } from "../../lib/live-site.ts";
import { RelativeTime } from "../RelativeTime.tsx";
import { useLiveSite, useLiveSnapshot } from "../useLiveSite.ts";

/**
 * The overview's Status card: live or not, the counts, where the site is live (its primary domain,
 * opening in a new tab), when the live snapshot was taken, and its id.
 */
export function SiteStatusCard({
  siteId,
  loading,
  pages,
  articles,
  snapshots,
}: {
  siteId: string;
  loading: boolean;
  pages: number;
  articles: number;
  snapshots: number;
}) {
  const t = useT();
  const { origin, liveSnapshotId } = useLiveSite(siteId);
  const live = useLiveSnapshot(siteId).data;
  return (
    <SectionCard
      title={t("overview.status")}
      actions={
        liveSnapshotId ? (
          <Badge variant="success" appearance="dot">
            {t("overview.live")}
          </Badge>
        ) : (
          <Badge variant="secondary" appearance="dot">
            {t("overview.notPublished")}
          </Badge>
        )
      }
    >
      {loading ? (
        <SkeletonLine />
      ) : (
        <dl className="grid divide-y divide-kumo-hairline">
          {liveSnapshotId && origin && (
            <StatRow
              label={t("liveSite.liveAt")}
              value={
                <Link href={`${origin}/`} target="_blank" rel="noopener noreferrer">
                  {originHost(origin)} <Link.ExternalIcon />
                </Link>
              }
            />
          )}
          {live && (
            <StatRow
              label={t("liveSite.lastPublished")}
              value={<RelativeTime iso={live.createdAt} size="base" />}
            />
          )}
          <StatRow label={t("overview.pages")} value={pages} />
          <StatRow label={t("nav.articles")} value={articles} />
          <StatRow label={t("nav.snapshots")} value={snapshots} />
          {liveSnapshotId && (
            <StatRow
              label={t("overview.liveSnapshotLabel")}
              value={<InlineCopyText>{liveSnapshotId}</InlineCopyText>}
            />
          )}
        </dl>
      )}
    </SectionCard>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <Text as="dt" variant="secondary">
        {label}
      </Text>
      <Text as="dd" bold truncate>
        {value}
      </Text>
    </div>
  );
}

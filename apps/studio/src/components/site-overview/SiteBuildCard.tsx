import { Badge, Banner, Code, InlineCopyText, SectionCard } from "@cloudhal/ui";
import { Globe, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../../i18n/index.tsx";
import { ApiRequestError, api, type SiteBuildStatus } from "../../lib/api.ts";
import { RelativeTime } from "../RelativeTime.tsx";
import { StatRow } from "./SiteStatusCard.tsx";

/** While a build is queued or running the card follows it; otherwise it looks now and then. */
export const POLL_BUSY_MS = 3_000;
export const POLL_IDLE_MS = 30_000;

type Enabled = Extract<SiteBuildStatus, { enabled: true }>;

/** An answer that will not change by asking again: a 4xx (403, 404, …), not a timeout or 429. */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

/**
 * How often to look again: never once the server said the feature is off or refused for good (a
 * 4xx); after a network error or a 5xx, at the last pace (idle when nothing came yet).
 */
export function siteBuildPoll(data: SiteBuildStatus | undefined, error: unknown): number | false {
  if (isPermanent(error) || data?.enabled === false) return false;
  return data?.enabled && data.state !== "idle" ? POLL_BUSY_MS : POLL_IDLE_MS;
}

/**
 * Whether Studio's last build is what visitors see: by build id when both sides name one (a run
 * that failed after its swap still went live), else by time (a build that went live within a
 * minute of its end).
 */
function lastIsServed(s: Enabled): boolean | undefined {
  const { last, served } = s;
  if (!last || !served) return undefined;
  if (last.build && served.build) return last.build === served.build;
  if (!last.ok) return false;
  const end = Date.parse(last.at) + (last.durationMs ?? 0);
  return Date.parse(served.at) <= end + 60_000;
}

/** What the card shows: what is online, and whether Studio's last build failed after it. */
export function siteBuildView(s: Enabled) {
  const { last, served } = s;
  const live = lastIsServed(s);
  const lastEnd = last ? Date.parse(last.at) + (last.durationMs ?? 0) : Number.NaN;
  // Studio's failed build is current unless it went live after all (same build id), or another
  // build went live after it (a cron or hand-started one: another id, or a later time)
  const replaced =
    !!served &&
    !!last &&
    (last.build && served.build ? served.build !== last.build : Date.parse(served.at) > lastEnd);
  const failure = last && !last.ok && !live && !replaced ? last : undefined;
  // the server says what is online (`served`); an older one only knows Studio's last build
  const online =
    served !== undefined ? served : last?.ok ? { at: last.at, ...pick(last) } : undefined;
  // a failure: when it ran; otherwise when what is online went live
  const when = failure ? failure.at : (served?.at ?? last?.at);
  // the duration is Studio's build's, shown for the failure or while that build is online
  const durationMs = failure || (last && (live ?? last.ok)) ? last?.durationMs : undefined;
  return {
    failure,
    online,
    when,
    durationMs,
    built: !failure && (!!last || !!served),
  };
}

function pick(l: { snapshotId?: string; state?: "published" | "not-published" }) {
  return {
    ...(l.snapshotId ? { snapshotId: l.snapshotId } : {}),
    ...(l.state ? { state: l.state } : {}),
  };
}

/**
 * The overview's "Public site build" card (#150): on a self-hosted server that rebuilds its static
 * site after every publish, whether a build is running or queued, when the site was last built,
 * what visitors see now (the published snapshot, or the coming soon page before the first
 * publish) whoever built it, and why Studio's last build failed — saying whether a previous
 * version stays online or nothing is online yet. Absent elsewhere.
 */
export function SiteBuildCard({ siteId }: { siteId: string }) {
  const t = useT();
  const status = useQuery({
    queryKey: ["site-build", siteId],
    queryFn: () => api.siteBuild.status(siteId),
    retry: false,
    refetchInterval: (q) => siteBuildPoll(q.state.data, q.state.error),
  });
  const s = status.data;
  if (!s?.enabled) return null;
  const v = siteBuildView(s);
  return (
    <SectionCard
      title={t("overview.siteBuild.title")}
      icon={<Globe size={16} />}
      description={t("overview.siteBuild.description")}
      actions={<StateBadge state={s.state} failed={!!v.failure} built={v.built} />}
    >
      <div className="grid gap-4">
        {v.failure && (
          <Banner
            variant="error"
            icon={<WarningCircle />}
            title={t("overview.siteBuild.failedTitle")}
            description={
              v.online === null
                ? t("overview.siteBuild.failedNothingOnline")
                : t("overview.siteBuild.failedDescription")
            }
          />
        )}
        {v.when && (
          <dl className="grid divide-y divide-kumo-hairline">
            <StatRow
              label={t("overview.siteBuild.lastBuild")}
              value={<RelativeTime iso={v.when} size="base" />}
            />
            {v.durationMs !== undefined && (
              <StatRow
                label={t("overview.siteBuild.duration")}
                value={t("overview.siteBuild.seconds", {
                  seconds: Math.max(1, Math.round(v.durationMs / 1000)),
                })}
              />
            )}
            {v.online?.state === "not-published" && (
              <StatRow
                label={t("overview.siteBuild.output")}
                value={t("overview.siteBuild.statusPage")}
              />
            )}
            {v.online?.snapshotId && (
              <StatRow
                label={t("overview.siteBuild.snapshot")}
                value={<InlineCopyText>{v.online.snapshotId}</InlineCopyText>}
              />
            )}
          </dl>
        )}
        {v.failure?.error && <Code lang="bash" code={v.failure.error} />}
      </div>
    </SectionCard>
  );
}

function StateBadge(p: { state: Enabled["state"]; failed: boolean; built: boolean }) {
  const t = useT();
  if (p.state === "running")
    return (
      <Badge variant="warning" appearance="dot">
        {t("overview.siteBuild.building")}
      </Badge>
    );
  if (p.state === "queued")
    return (
      <Badge variant="neutral" appearance="dot">
        {t("overview.siteBuild.queued")}
      </Badge>
    );
  if (p.failed)
    return (
      <Badge variant="error" appearance="dot">
        {t("overview.siteBuild.failed")}
      </Badge>
    );
  return p.built ? (
    <Badge variant="success" appearance="dot">
      {t("overview.siteBuild.built")}
    </Badge>
  ) : (
    <Badge variant="neutral" appearance="dot">
      {t("overview.siteBuild.never")}
    </Badge>
  );
}

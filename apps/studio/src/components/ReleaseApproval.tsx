/**
 * Release requests in Approvals (RFC-0008 §15.1 "Approvals", §10.4): the release itself — the time
 * in the site's zone, the pinned items, "Approving schedules exactly these versions; any change asks
 * again" — instead of the server's sentence; and for `lift_embargo`, the embargo time and the
 * agent's reason quoted as plain text. Approving carries the request out on the server.
 */
import { Badge, directional, InsetPanel, LinkButton, SkeletonLine, Text } from "@cloudhal/ui";
import { ArrowRight, Package, ShieldCheck } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Approval } from "../lib/api.ts";
import { formatWhen } from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { AgentReason } from "./ElevationRequest.tsx";
import { ReleaseItems } from "./ReleaseParts.tsx";
import { itemsLabel, scheduleKeys, useScheduleWords, useSiteZone } from "./Schedules.tsx";

/** Whether a request is about a release or an embargo (and so rendered here). */
export function isScheduleRequest(request: Pick<Approval, "tool" | "releaseId">): boolean {
  return !!request.releaseId || request.tool === "lift_embargo";
}

export function ReleaseRequestDetails({ siteId, request }: { siteId: string; request: Approval }) {
  const { t, locale } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const releaseId = request.releaseId;
  const release = useQuery({
    queryKey: scheduleKeys.release(siteId, releaseId ?? ""),
    queryFn: () => schedulesApi.releases.get(siteId, releaseId ?? ""),
    enabled: !!releaseId,
    retry: false,
  });
  const a = "schedules.approvals" as const;
  const input = (request.input ?? {}) as { reason?: unknown; from?: unknown };

  if (request.tool === "lift_embargo" && !releaseId)
    return (
      <div className="grid gap-2" data-schedule-request="embargo">
        <Text bold>{t(`${a}.embargo.title`)}</Text>
        {typeof input.from === "string" && (
          <Text variant="secondary" size="sm">
            {t(`${a}.embargo.at`, { time: formatWhen(input.from, locale, zone.timeZone) })}
          </Text>
        )}
        <AgentReason reason={typeof input.reason === "string" ? input.reason : undefined} />
      </div>
    );

  const r = release.data;
  const at = r?.executeAt ?? (r?.when?.kind === "at" ? r.when.at : undefined);
  return (
    <div className="grid gap-2" data-schedule-request="release">
      {release.isPending ? (
        <div className="grid gap-2" role="status">
          <span className="sr-only">{t(`${a}.loading`)}</span>
          <SkeletonLine minWidth={30} maxWidth={50} />
          <SkeletonLine minWidth={50} maxWidth={80} />
        </div>
      ) : !r ? (
        <Text variant="secondary">{t(`${a}.missing`)}</Text>
      ) : (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <Package size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
            <Text bold as="span">
              {r.title ?? itemsLabel(t, r.items.length)}
            </Text>
            <Badge variant="outline">{t(`${a}.items`, { count: r.items.length })}</Badge>
          </span>
          <Text>
            {r.when?.kind === "on-approval" || !at
              ? t(`${a}.onApproval`)
              : t(`${a}.at`, {
                  time: formatWhen(at, locale, zone.timeZone, "long"),
                  zone: zone.zoneLabel,
                })}
          </Text>
          <InsetPanel>
            <ReleaseItems siteId={siteId} release={r} compact />
          </InsetPanel>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.prompt`)}
              </Text>
            </span>
            <LinkButton
              href={`/sites/${siteId}/schedules/releases/${r.id}`}
              variant="ghost"
              size="sm"
              icon={directional(ArrowRight)}
            >
              {t(`${a}.open`)}
            </LinkButton>
          </span>
        </>
      )}
    </div>
  );
}

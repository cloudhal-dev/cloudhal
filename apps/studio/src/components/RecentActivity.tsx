import { Empty, SkeletonLine, Table, Text } from "@cloudhal/ui";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { api, isNotEnabled } from "../lib/api.ts";
import { Decision, useToolLabel } from "./Audit.tsx";
import { RelativeTime } from "./RelativeTime.tsx";

/** Compact "Recent activity" table for the site overview: the five newest audit events. */
export function RecentActivity({ siteId, limit = 5 }: { siteId: string; limit?: number }) {
  const t = useT();
  const label = useToolLabel();
  const recent = useQuery({
    queryKey: ["activity", siteId, "recent", limit],
    queryFn: () => api.activity.list(siteId, { limit }),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  if (recent.isPending) {
    return (
      <div className="grid gap-3 px-5 py-4">
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine />
      </div>
    );
  }
  const items = recent.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Empty
        size="sm"
        icon={<ClockCounterClockwise size={32} className="text-kumo-inactive" />}
        title={
          recent.error && !isNotEnabled(recent.error)
            ? t("errors.title")
            : t("activity.recentEmpty")
        }
        description={
          isNotEnabled(recent.error)
            ? t("activity.notEnabledDescription")
            : recent.error
              ? recent.error.message
              : t("activity.recentEmptyDescription")
        }
      />
    );
  }
  return (
    <Table>
      <Table.Body>
        {items.map((r) => (
          <Table.Row key={r.id} data-event-id={r.id}>
            <Table.Cell className="min-w-0">
              <div className="grid min-w-0 gap-0.5">
                <Text bold as="span" truncate>
                  {label(r.tool)}
                </Text>
                <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                  <Text variant="secondary" size="sm" as="span" truncate>
                    {r.actor.name ?? r.actor.id}
                  </Text>
                  <Text variant="secondary" size="sm" as="span">
                    ·
                  </Text>
                  <RelativeTime iso={r.at} />
                </div>
              </div>
            </Table.Cell>
            <Table.Cell className="w-0 whitespace-nowrap text-right">
              <Decision decision={r.decision} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

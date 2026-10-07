import { Badge, Button, Empty, InlineCopyText, Table, Text } from "@cloudflare/kumo";
import type { Snapshot } from "@cloudhal/core-contracts";
import { GitDiff } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface SnapshotTimelineLabels {
  empty: string;
  emptyDescription?: string;
  live: string;
  publish: string;
  rollBack: string;
  /** Label of the "compare" action (shown when `onCompare` is set). */
  compare?: string;
  columns: { snapshot: string; actor: string; changes: string; when: string };
  reasons: Record<Snapshot["reason"], string>;
}

export interface SnapshotTimelineProps {
  snapshots: Snapshot[];
  publishedSnapshotId?: string | undefined;
  onPublish?: ((snapshot: Snapshot) => void) | undefined;
  onRollback?: ((snapshot: Snapshot) => void) | undefined;
  /** Opens a diff of this snapshot against its predecessor or the live one. */
  onCompare?: ((snapshot: Snapshot) => void) | undefined;
  labels: SnapshotTimelineLabels;
  emptyIcon?: ReactNode;
  formatDate?: ((iso: string) => string) | undefined;
}

/** Newest-first table of a site's snapshots with publish / roll back actions (Kumo Table). */
export function SnapshotTimeline({
  snapshots,
  publishedSnapshotId,
  onPublish,
  onRollback,
  onCompare,
  labels,
  emptyIcon,
  formatDate,
}: SnapshotTimelineProps) {
  if (snapshots.length === 0) {
    return (
      <Empty
        size="sm"
        icon={emptyIcon}
        title={labels.empty}
        description={labels.emptyDescription}
      />
    );
  }
  const publishedIndex = snapshots.findIndex((s) => s.id === publishedSnapshotId);
  const fmt = formatDate ?? ((iso: string) => new Date(iso).toLocaleString());
  return (
    <Table data-testid="snapshot-timeline">
      <Table.Header>
        <Table.Row>
          <Table.Head>{labels.columns.snapshot}</Table.Head>
          <Table.Head>{labels.columns.actor}</Table.Head>
          <Table.Head>{labels.columns.changes}</Table.Head>
          <Table.Head>{labels.columns.when}</Table.Head>
          <Table.Head />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {snapshots.map((s, i) => {
          const isLive = s.id === publishedSnapshotId;
          const isOlderThanLive = publishedIndex !== -1 && i > publishedIndex;
          return (
            <Table.Row key={s.id} data-snapshot-id={s.id} data-live={isLive || undefined}>
              <Table.Cell>
                <div className="flex items-center gap-2">
                  <Text bold as="span">
                    {s.label ?? labels.reasons[s.reason]}
                  </Text>
                  {isLive && <Badge variant="success">{labels.live}</Badge>}
                </div>
                <div className="mt-0.5">
                  <InlineCopyText>{s.id}</InlineCopyText>
                </div>
              </Table.Cell>
              <Table.Cell>{s.actor.name ?? s.actor.id}</Table.Cell>
              <Table.Cell>
                <Text variant="mono-secondary" as="span">
                  +{s.summary.added} ~{s.summary.changed} −{s.summary.removed}
                </Text>
              </Table.Cell>
              <Table.Cell>{fmt(s.createdAt)}</Table.Cell>
              <Table.Cell>
                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                  {onCompare && (s.parentId || (publishedSnapshotId && !isLive)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<GitDiff />}
                      onClick={() => onCompare(s)}
                    >
                      {labels.compare ?? "Compare"}
                    </Button>
                  )}
                  {!isLive && onPublish && !isOlderThanLive && (
                    <Button variant="secondary" size="sm" onClick={() => onPublish(s)}>
                      {labels.publish}
                    </Button>
                  )}
                  {!isLive && onRollback && isOlderThanLive && (
                    <Button variant="secondary-destructive" size="sm" onClick={() => onRollback(s)}>
                      {labels.rollBack}
                    </Button>
                  )}
                </div>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

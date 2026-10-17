import { Badge, Button, InlineCopyText, Table, Text } from "@cloudflare/kumo";
import type { Snapshot } from "@cloudhal/core-contracts";
import { GearSix, GitDiff, type Icon, Robot, User } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SectionEmpty } from "./SectionEmpty.tsx";

export interface SnapshotTimelineLabels {
  empty: string;
  emptyDescription?: string;
  live: string;
  publish: string;
  rollBack: string;
  /** Label of the "compare" action (shown when `onCompare` is set). */
  compare: string;
  /** Accessible name of the actions column (it has no visible header). */
  actions?: string;
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
  /**
   * The person's role cannot publish: the button stays in place, disabled, with this reason as its
   * tooltip ("Only Authors and above can publish"). DESIGN.md §2s.
   */
  publishDisabledReason?: string | undefined;
  /** The same for rolling back. */
  rollbackDisabledReason?: string | undefined;
  labels: SnapshotTimelineLabels;
  emptyIcon?: ReactNode;
  /** CTA under the empty state (e.g. the page's "Create snapshot" button). */
  emptyContents?: ReactNode;
  /** Renders the creation time; lists pass a relative time with the absolute one in a tooltip. */
  renderTime: (iso: string) => ReactNode;
}

const ACTOR_ICON: Record<Snapshot["actor"]["kind"], Icon> = {
  human: User,
  agent: Robot,
  system: GearSix,
};

/**
 * Newest-first table of a site's snapshots (DESIGN.md §2a): label with the live badge, reason and
 * copyable id; author; change counts; creation time; then Compare and Publish / Roll back in
 * their own columns so the actions line up row to row. Render it inside `LayerCard p-0`.
 */
export function SnapshotTimeline({
  snapshots,
  publishedSnapshotId,
  onPublish,
  onRollback,
  onCompare,
  publishDisabledReason,
  rollbackDisabledReason,
  labels,
  emptyIcon,
  emptyContents,
  renderTime: time,
}: SnapshotTimelineProps) {
  if (snapshots.length === 0) {
    return (
      <SectionEmpty
        icon={emptyIcon}
        title={labels.empty}
        description={labels.emptyDescription}
        contents={emptyContents}
      />
    );
  }
  const publishedIndex = snapshots.findIndex((s) => s.id === publishedSnapshotId);
  const showCompare = onCompare !== undefined;
  return (
    <Table data-testid="snapshot-timeline">
      <Table.Header>
        <Table.Row>
          <Table.Head>{labels.columns.snapshot}</Table.Head>
          <Table.Head>{labels.columns.actor}</Table.Head>
          <Table.Head>{labels.columns.changes}</Table.Head>
          <Table.Head>{labels.columns.when}</Table.Head>
          {showCompare && <Table.Head className="w-0" />}
          <Table.Head sticky="right" className="w-0">
            <span className="sr-only">{labels.actions}</span>
          </Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {snapshots.map((s, i) => {
          const isLive = s.id === publishedSnapshotId;
          const isOlderThanLive = publishedIndex !== -1 && i > publishedIndex;
          const canCompare = !!s.parentId || (!!publishedSnapshotId && !isLive);
          const ActorIcon = ACTOR_ICON[s.actor.kind];
          return (
            <Table.Row key={s.id} data-snapshot-id={s.id} data-live={isLive || undefined}>
              <Table.Cell>
                <div className="grid min-w-48 gap-1">
                  <div className="flex items-center gap-2">
                    <Text bold as="span">
                      {s.label ?? labels.reasons[s.reason]}
                    </Text>
                    {isLive && (
                      <Badge variant="success" appearance="dot">
                        {labels.live}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {s.label && (
                      <Text variant="secondary" size="sm" as="span">
                        {labels.reasons[s.reason]}
                      </Text>
                    )}
                    <InlineCopyText>{s.id}</InlineCopyText>
                  </div>
                </div>
              </Table.Cell>
              <Table.Cell>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <ActorIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
                  <Text as="span">{s.actor.name ?? s.actor.id}</Text>
                </span>
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap">
                <Text variant="mono-secondary" as="span">
                  +{s.summary.added} ~{s.summary.changed} −{s.summary.removed}
                </Text>
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap">{time(s.createdAt)}</Table.Cell>
              {showCompare && (
                <Table.Cell className="w-0 whitespace-nowrap">
                  {canCompare && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<GitDiff />}
                      onClick={() => onCompare(s)}
                    >
                      {labels.compare}
                    </Button>
                  )}
                </Table.Cell>
              )}
              <Table.Cell sticky="right" className="w-0 whitespace-nowrap text-right">
                {!isLive && onPublish && !isOlderThanLive && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPublish(s)}
                    disabled={publishDisabledReason !== undefined}
                    title={publishDisabledReason}
                  >
                    {labels.publish}
                  </Button>
                )}
                {!isLive && onRollback && isOlderThanLive && (
                  <Button
                    variant="secondary-destructive"
                    size="sm"
                    onClick={() => onRollback(s)}
                    disabled={rollbackDisabledReason !== undefined}
                    title={rollbackDisabledReason}
                  >
                    {labels.rollBack}
                  </Button>
                )}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

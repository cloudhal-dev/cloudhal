import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { bodyDiff } from "@cloudhal/core-ts/body-blocks";
import { Badge, BodyDiff, type BodyDiffLabels, Button, SkeletonLine, Text } from "@cloudhal/ui";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";

/** `BodyDiff`'s words in the current language. */
export function useBodyDiffLabels(): BodyDiffLabels {
  const t = useT();
  return useMemo(
    () => ({
      added: t("diff.textChanges.added"),
      removed: t("diff.textChanges.removed"),
      changed: t("diff.textChanges.edited"),
      unchanged: (count) =>
        count === 1
          ? t("diff.textChanges.unchangedOne")
          : t("diff.textChanges.unchangedOther", { count }),
      wordsAdded: (count) => t("diff.textChanges.wordsAdded", { count }),
      wordsRemoved: (count) => t("diff.textChanges.wordsRemoved", { count }),
      same: t("diff.textChanges.same"),
    }),
    [t],
  );
}

/** One body's changes, from `before` to `after`, under a small heading. */
export function TextChange({
  title,
  before,
  after,
}: {
  title: string;
  before: string;
  after: string;
}) {
  const labels = useBodyDiffLabels();
  const diff = useMemo(() => bodyDiff(before, after), [before, after]);
  return (
    <div className="grid min-w-0 gap-1.5">
      <Text bold size="sm" as="span">
        {title}
      </Text>
      <BodyDiff diff={diff} labels={labels} />
    </div>
  );
}

/** A short field that changed: "Title: Old → New". */
function FieldChange({ label, before, after }: { label: string; before?: string; after?: string }) {
  if ((before ?? "") === (after ?? "")) return null;
  return (
    <div className="grid min-w-0 gap-0.5">
      <Text bold size="sm" as="span">
        {label}
      </Text>
      <Text size="sm" as="span">
        <del className="text-kumo-subtle">{before || "—"}</del>
        {" → "}
        <ins className="no-underline">{after || "—"}</ins>
      </Text>
    </div>
  );
}

type Node = ContentEntry | Page;

/** The text of a page or article between two versions: short fields, then bodies block by block. */
export function NodeTextChanges({ before, after }: { before: Node; after: Node }) {
  const t = useT();
  const d = "diff.textChanges" as const;
  if ("collection" in after) {
    const b = before as ContentEntry;
    const sameBody = b.body.value === after.body.value;
    return (
      <div className="grid min-w-0 gap-3" data-text-changes="">
        <FieldChange label={t(`${d}.title`)} before={b.title} after={after.title} />
        <FieldChange label={t(`${d}.slug`)} before={b.slug} after={after.slug} />
        <FieldChange label={t(`${d}.summary`)} before={b.summary} after={after.summary} />
        {!sameBody && (
          <TextChange title={t(`${d}.body`)} before={b.body.value} after={after.body.value} />
        )}
        {sameBody && b.title === after.title && b.summary === after.summary && (
          <Text variant="secondary" size="sm">
            {t(`${d}.noTextChanges`)}
          </Text>
        )}
      </div>
    );
  }
  const b = before as Page;
  const old = new Map(b.sections.map((s) => [s.id, s]));
  const ids = [...after.sections.map((s) => s.id), ...b.sections.map((s) => s.id)].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const rows = ids.flatMap((id) => {
    const was = old.get(id);
    const now = after.sections.find((s) => s.id === id);
    const section = now ?? was;
    if (!section || JSON.stringify(was) === JSON.stringify(now)) return [];
    const name = t(`${d}.section`, { kind: t(`editor.sectionKinds.${section.kind}`) });
    if (was?.kind === "richText" && now?.kind === "richText")
      return [<TextChange key={id} title={name} before={was.body} after={now.body} />];
    const state = !was ? "sectionAdded" : !now ? "sectionRemoved" : "sectionChanged";
    return [
      <div key={id} className="flex flex-wrap items-center gap-2">
        <Text bold size="sm" as="span">
          {name}
        </Text>
        <Badge
          variant={
            state === "sectionAdded"
              ? "success"
              : state === "sectionRemoved"
                ? "error"
                : "secondary"
          }
        >
          {t(`${d}.${state}`)}
        </Badge>
      </div>,
    ];
  });
  return (
    <div className="grid min-w-0 gap-3" data-text-changes="">
      <FieldChange label={t(`${d}.title`)} before={b.title} after={after.title} />
      <FieldChange label={t(`${d}.path`)} before={b.path} after={after.path} />
      {rows}
      {rows.length === 0 && b.title === after.title && b.path === after.path && (
        <Text variant="secondary" size="sm">
          {t(`${d}.noTextChanges`)}
        </Text>
      )}
    </div>
  );
}

/**
 * "Show changes" under a changed page or article in the snapshot diff (RFC-0014 phase 2): loads
 * both versions from their snapshots on first opening and shows what the text says now.
 */
export function SnapshotNodeChanges({
  siteId,
  nodeId,
  fromSnapshot,
  toSnapshot,
}: {
  siteId: string;
  nodeId: string;
  fromSnapshot: string;
  toSnapshot: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const versions = useQuery({
    queryKey: ["snapshot-node-pair", siteId, nodeId, fromSnapshot, toSnapshot],
    queryFn: () =>
      Promise.all([
        api.snapshots.node<Node>(siteId, fromSnapshot, nodeId),
        api.snapshots.node<Node>(siteId, toSnapshot, nodeId),
      ]),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY, // snapshots are immutable
  });
  return (
    <div className="grid min-w-0 gap-2">
      <div>
        <Button
          variant="ghost"
          size="xs"
          icon={open ? <CaretUp /> : <CaretDown />}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t("diff.textChanges.hide") : t("diff.textChanges.show")}
        </Button>
      </div>
      {open &&
        (versions.error ? (
          <ErrorBanner error={versions.error} onRetry={() => versions.refetch()} />
        ) : !versions.data ? (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t("diff.textChanges.loading")}</span>
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : (
          <NodeTextChanges before={versions.data[0]} after={versions.data[1]} />
        ))}
    </div>
  );
}

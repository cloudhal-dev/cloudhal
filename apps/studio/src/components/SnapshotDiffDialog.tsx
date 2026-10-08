import type { Snapshot } from "@cloudhal/core-contracts";
import {
  Badge,
  InlineCopyText,
  InsetPanel,
  LayerCard,
  LayerDialog,
  Link,
  SectionEmpty,
  SkeletonLine,
  Table,
  Tabs,
  Text,
} from "@cloudhal/ui";
import { Equals, GitDiff, MinusCircle, PencilSimple, PlusCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import {
  CHANGES,
  type Change,
  type DiffBase,
  type DiffRow,
  diffBases,
  diffRows,
} from "../lib/diff.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";

const CHANGE_STYLE: Record<
  Change,
  { variant: "success" | "warning" | "error"; icon: typeof PlusCircle }
> = {
  added: { variant: "success", icon: PlusCircle },
  changed: { variant: "warning", icon: PencilSimple },
  removed: { variant: "error", icon: MinusCircle },
};

/** Resolves node ids to titles and editor links using the site's current pages and articles. */
function useNodeNames(siteId: string, enabled: boolean) {
  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled,
  });
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled,
  });
  return (row: DiffRow): { title?: string; href?: string; detail?: string } => {
    if (row.kind === "site") {
      return site.data?.id === row.id
        ? { title: site.data.name, detail: `/${site.data.slug}` }
        : {};
    }
    if (row.kind === "page") {
      const page = pages.data?.find((p) => p.id === row.id);
      return page
        ? { title: page.title, detail: page.path, href: `/sites/${siteId}/pages/${page.id}` }
        : {};
    }
    // Taxonomies, terms and redirects are named by their kind badge until Studio lists them.
    if (row.kind !== "contentEntry") return {};
    const entry = entries.data?.find((e) => e.id === row.id);
    return entry
      ? {
          title: entry.title,
          detail: `/${entry.collection}/${entry.slug}`,
          href: `/sites/${siteId}/articles/${entry.id}`,
        }
      : {};
  };
}

/**
 * What a snapshot changed, against its predecessor or the live version (DESIGN.md §2i): counts as
 * badges, then one table per change type. Nodes are named from the site's current content; ones
 * that have since been deleted say so.
 */
export function SnapshotDiffDialog({
  siteId,
  snapshot: current,
  publishedSnapshotId,
  onOpenChange,
}: {
  siteId: string;
  snapshot: Snapshot | undefined;
  publishedSnapshotId: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const open = current !== undefined;
  // Keep the last snapshot on screen while the dialog animates closed.
  const last = useRef(current);
  if (current) last.current = current;
  const snapshot = current ?? last.current;
  const bases = snapshot ? diffBases(snapshot, publishedSnapshotId) : {};
  const available = (["previous", "live"] as const).filter((b) => bases[b]);
  const [against, setAgainst] = useState<DiffBase>("previous");
  useEffect(() => {
    if (snapshot) setAgainst(bases.previous ? "previous" : "live");
  }, [snapshot?.id]);
  const effective: DiffBase = bases[against] ? against : (available[0] ?? "previous");
  const baseId = bases[effective];
  const diff = useQuery({
    queryKey: ["snapshot-diff", siteId, baseId, snapshot?.id],
    queryFn: () => api.snapshots.diff(siteId, baseId as string, (snapshot as Snapshot).id),
    enabled: open && !!baseId && !!snapshot,
    staleTime: Number.POSITIVE_INFINITY, // snapshots are immutable
  });
  const name = useNodeNames(siteId, open);
  const groups = diff.data ? diffRows(diff.data) : undefined;
  const total = groups ? CHANGES.reduce((n, c) => n + groups[c].length, 0) : 0;
  const title = snapshot?.label ?? snapshot?.id ?? "";

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="xl" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("diff.title", { name: title })}</LayerDialog.Title>
        <LayerDialog.Description>
          {baseId ? t(`diff.descriptions.${effective}`) : t("diff.nothingToCompare")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="snapshot-diff">
            {available.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {available.length > 1 ? (
                  <Tabs
                    variant="segmented"
                    size="sm"
                    value={effective}
                    onValueChange={(v) => setAgainst(v as DiffBase)}
                    tabs={available.map((b) => ({
                      value: b,
                      label: b === "live" ? t("diff.live") : t("diff.previous"),
                    }))}
                  />
                ) : (
                  <Text variant="secondary" size="sm" as="span">
                    {t("diff.against")}:{" "}
                    {effective === "live" ? t("diff.live") : t("diff.previous")}
                  </Text>
                )}
                {groups && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="diff-counts">
                    {CHANGES.map((c) => {
                      const Icon = CHANGE_STYLE[c].icon;
                      const count = groups[c].length;
                      // Zero counts stay readable but quiet, so the colour points at what changed.
                      return (
                        <span key={c} data-change-count={c} className="inline-flex">
                          <Badge
                            variant={count > 0 ? CHANGE_STYLE[c].variant : "secondary"}
                            icon={<Icon />}
                          >
                            {t(`diff.counts.${c}`, { count })}
                          </Badge>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {available.length === 0 ? (
              <SectionEmpty
                icon={<GitDiff size={32} className="text-kumo-inactive" />}
                title={t("diff.nothingToCompare")}
                description={t("diff.nothingToCompareDescription")}
              />
            ) : diff.error ? (
              <ErrorBanner error={diff.error} onRetry={() => diff.refetch()} />
            ) : !groups ? (
              <InsetPanel className="gap-3">
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
              </InsetPanel>
            ) : total === 0 ? (
              <SectionEmpty
                icon={<Equals size={32} className="text-kumo-inactive" />}
                title={t("diff.none")}
                description={t("diff.noneDescription")}
              />
            ) : (
              CHANGES.filter((c) => groups[c].length > 0).map((c) => (
                <section key={c} className="grid gap-2" data-change={c}>
                  <div className="flex items-center gap-2">
                    <Text bold as="h3">
                      {t(`diff.${c}`)}
                    </Text>
                    <Badge variant="secondary">{groups[c].length}</Badge>
                  </div>
                  <LayerCard className="overflow-x-auto p-0">
                    <Table layout="fixed">
                      <colgroup>
                        <col />
                        <col className="w-32" />
                      </colgroup>
                      <Table.Header variant="compact">
                        <Table.Row>
                          <Table.Head>{t("diff.columns.item")}</Table.Head>
                          <Table.Head>{t("diff.columns.revision")}</Table.Head>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {groups[c].map((row) => {
                          const n = name(row);
                          return (
                            <Table.Row key={row.id} data-node-id={row.id}>
                              <Table.Cell>
                                <div className="grid min-w-0 gap-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="block min-w-0 truncate">
                                      {n.title ? (
                                        n.href ? (
                                          <Link href={n.href} variant="plain">
                                            <Text bold as="span">
                                              {n.title}
                                            </Text>
                                          </Link>
                                        ) : (
                                          <Text bold as="span">
                                            {n.title}
                                          </Text>
                                        )
                                      ) : (
                                        <Text variant="secondary" as="span">
                                          {t("diff.gone")}
                                        </Text>
                                      )}
                                    </span>
                                    <span className="shrink-0">
                                      <Badge variant="outline">{t(`diff.kinds.${row.kind}`)}</Badge>
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                    {n.detail && (
                                      <Text variant="mono-secondary" as="span" truncate>
                                        {n.detail}
                                      </Text>
                                    )}
                                    <InlineCopyText>{row.id}</InlineCopyText>
                                  </div>
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <Text variant="mono-secondary" as="span">
                                  {row.from !== undefined && row.to !== undefined
                                    ? t("diff.revs", { from: row.from, to: row.to })
                                    : t("diff.rev", { rev: row.to ?? row.from ?? 0 })}
                                </Text>
                              </Table.Cell>
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table>
                  </LayerCard>
                </section>
              ))
            )}
          </div>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

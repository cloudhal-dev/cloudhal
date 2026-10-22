import type { Snapshot } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts/permalinks";
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
import {
  Equals,
  GitDiff,
  Minus,
  MinusCircle,
  PencilSimple,
  Plus,
  PlusCircle,
  Star,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { type AssignmentDelta, api } from "../lib/api.ts";
import {
  CHANGES,
  type Change,
  type DiffBase,
  type DiffRow,
  diffBases,
  diffRows,
} from "../lib/diff.ts";
import { entryHref } from "../lib/entry-href.ts";
import { assetTitle, formatSize, typeLabel } from "../lib/media.ts";
import type { MenuDiffSummary } from "../lib/menus.ts";
import { archivePath } from "../lib/taxonomy.ts";
import { SnapshotNodeChanges } from "./BodyChanges.tsx";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { useMenuTitle } from "./Menus.tsx";
import { type TaxonomyData, taxonomyKeys, useTaxonomyData } from "./Taxonomy.tsx";

/**
 * How an article's terms moved between the two snapshots (RFC-0002 §6.4): "+ Tag AI",
 * "− Tag LLMs", "Primary category → News", as quiet badges under the article's row.
 */
function AssignmentDeltas({ deltas, data }: { deltas: AssignmentDelta[]; data: TaxonomyData }) {
  const t = useT("menus");
  const name = (id: string | null) => {
    if (!id) return t("diff.assignments.none");
    const term = data.byId.get(id)?.term;
    return term ? data.name(term) : id;
  };
  const taxLabel = (key: string) => {
    const tax = data.taxonomies.data?.find((x) => x.key === key);
    return (tax ? data.label(tax, "singular") : key).toLocaleLowerCase();
  };
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" data-testid="assignment-deltas">
      {deltas.flatMap((d) => [
        ...d.added.map((id) => (
          <Badge key={`+${d.taxonomy}${id}`} variant="outline" icon={<Plus />}>
            {t("diff.assignments.added", { taxonomy: taxLabel(d.taxonomy), name: name(id) })}
          </Badge>
        )),
        ...d.removed.map((id) => (
          <Badge key={`-${d.taxonomy}${id}`} variant="outline" icon={<Minus />}>
            {t("diff.assignments.removed", { taxonomy: taxLabel(d.taxonomy), name: name(id) })}
          </Badge>
        )),
        ...(d.primary
          ? [
              <Badge key={`*${d.taxonomy}`} variant="outline" icon={<Star />}>
                {t("diff.assignments.primary", {
                  taxonomy: taxLabel(d.taxonomy),
                  name: name(d.primary.to),
                })}
              </Badge>,
            ]
          : []),
      ])}
    </span>
  );
}

/** A menu's delta under its row (RFC-0003 §6.3 counts): "+2 −1 ↕1 ~1" and "3 → 4 items". */
function MenuDeltaBadges({ summary }: { summary: MenuDiffSummary }) {
  const t = useT("menus");
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" data-testid="menu-delta-summary">
      <Badge variant="outline">
        {t("menus.diff.summary", {
          added: summary.added,
          removed: summary.removed,
          moved: summary.moved,
          changed: summary.changed,
        })}
      </Badge>
      <Badge variant="outline">
        {t("menus.diff.items", { before: summary.before, after: summary.after })}
      </Badge>
    </span>
  );
}

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
  const { locale } = useI18n();
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
  const taxonomy = useTaxonomyData(siteId, enabled);
  const redirects = useQuery({
    queryKey: taxonomyKeys.redirects(siteId),
    queryFn: () => api.redirects.list(siteId),
    enabled,
  });
  // Media (RFC-0004): the library names a file — retired ones too; deleted ones are gone.
  const assets = useQuery({
    queryKey: ["assets", siteId, "diff"],
    queryFn: () => api.assets.list(siteId, { limit: 200 }),
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
    if (row.kind === "taxonomy") {
      const tax = taxonomy.taxonomies.data?.find((x) => x.id === row.id);
      return tax
        ? {
            title: taxonomy.label(tax),
            detail: tax.archive.basePath,
            href: `/sites/${siteId}/taxonomy?taxonomy=${tax.key}`,
          }
        : {};
    }
    if (row.kind === "term") {
      const term = taxonomy.byId.get(row.id)?.term;
      const tax = term && taxonomy.taxonomies.data?.find((x) => x.id === term.taxonomyId);
      return term
        ? {
            title: taxonomy.name(term),
            ...(tax ? { detail: archivePath(tax, term.slug) } : {}),
            href: `/sites/${siteId}/taxonomy/${term.id}`,
          }
        : {};
    }
    if (row.kind === "redirect") {
      const r = redirects.data?.find((x) => x.id === row.id);
      return r ? { title: `${r.from} → ${r.to}`, href: `/sites/${siteId}/redirects` } : {};
    }
    if (row.kind === "asset") {
      const item = assets.data?.assets.find((a) => a.asset.id === row.id);
      return item
        ? {
            title: assetTitle(item.asset, locale, site.data?.defaultLocale),
            detail: `${typeLabel(item.asset.mediaType)} · ${formatSize(item.asset.bytes, locale)}`,
            href: `/sites/${siteId}/media/${item.asset.id}`,
          }
        : {};
    }
    const entry = entries.data?.find((e) => e.id === row.id);
    return entry
      ? {
          title: entry.title,
          detail: entryPath(site.data, entry),
          href: entryHref(siteId, entry.id, entry.collection),
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
  const t = useT("menus");
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
    queryFn: () =>
      api.snapshots.diff(siteId, baseId as string, (snapshot as Snapshot).id, {
        assignments: true,
        menus: true,
      }),
    enabled: open && !!baseId && !!snapshot,
    staleTime: Number.POSITIVE_INFINITY, // snapshots are immutable
  });
  const nodeName = useNodeNames(siteId, open);
  const menuTitle = useMenuTitle();
  const menuOf = (id: string) => diff.data?.menus?.find((m) => m.menuId === id);
  // Menus are named from the diff itself (key and delta), so a deleted menu keeps its name.
  const name = (row: DiffRow): { title?: string; href?: string; detail?: string } => {
    if (row.kind !== "menu") return nodeName(row);
    const m = menuOf(row.id);
    if (!m) return {};
    return {
      title: menuTitle(m.key),
      ...(m.change !== "removed"
        ? { href: `/sites/${siteId}/navigation?menu=${encodeURIComponent(m.key)}` }
        : {}),
    };
  };
  const taxonomy = useTaxonomyData(siteId, open);
  const deltasOf = (entryId: string) =>
    (diff.data?.assignments ?? []).filter((d) => d.entryId === entryId);
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
                                  {row.kind === "menu" && menuOf(row.id) && (
                                    <MenuDeltaBadges summary={menuOf(row.id) as MenuDiffSummary} />
                                  )}
                                  {row.kind === "contentEntry" && deltasOf(row.id).length > 0 && (
                                    <AssignmentDeltas deltas={deltasOf(row.id)} data={taxonomy} />
                                  )}
                                  {row.change === "changed" &&
                                    (row.kind === "contentEntry" || row.kind === "page") &&
                                    baseId &&
                                    snapshot && (
                                      <SnapshotNodeChanges
                                        siteId={siteId}
                                        nodeId={row.id}
                                        fromSnapshot={baseId}
                                        toSnapshot={snapshot.id}
                                      />
                                    )}
                                </div>
                              </Table.Cell>
                              <Table.Cell className="align-top">
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

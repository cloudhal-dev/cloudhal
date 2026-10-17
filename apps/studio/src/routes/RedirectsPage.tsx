import type { Redirect } from "@cloudhal/core-contracts";
import {
  Badge,
  Button,
  DropdownMenu,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  Select,
  Table,
  Text,
  Toolbar,
  Tooltip,
} from "@cloudhal/ui";
import {
  Archive,
  ArrowRight,
  ArrowSquareOut,
  ArrowsMerge,
  DotsThree,
  PencilSimple,
  Plus,
  Signpost,
  TextAa,
  Trash,
  User,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ReadOnly, ViewOnlyBanner } from "../components/Gating.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RedirectDialog } from "../components/RedirectDialog.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { taxonomyKeys, useTaxonomyData } from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { externalHost, servedPaths } from "../lib/redirects.ts";
import { primaryHostname } from "../lib/site-settings.ts";

type ReasonFilter = "all" | Redirect["reason"];

const REASON_STYLE: Record<
  Redirect["reason"],
  { variant: "info" | "secondary" | "warning" | "outline"; icon: typeof TextAa }
> = {
  "slug-change": { variant: "info", icon: TextAa },
  merge: { variant: "secondary", icon: ArrowsMerge },
  retire: { variant: "warning", icon: Archive },
  manual: { variant: "outline", icon: User },
};

/**
 * Site › Settings › Redirects (DESIGN.md §2p): every redirect with its source (slug change,
 * merge, retirement, manual) and the node it preserves; people create, edit and delete them. Each
 * write is one snapshot and goes live with the next publish.
 */
export function RedirectsPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const toast = useToast();
  const data = useTaxonomyData(siteId);
  const redirects = useQuery({
    queryKey: taxonomyKeys.redirects(siteId),
    queryFn: () => api.redirects.list(siteId),
  });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Redirect }>({ open: false });
  const [toDelete, setToDelete] = useState<Redirect | undefined>();
  // Redirects are structure: Editors and above (RFC-0005 §2.2, DESIGN.md §2s).
  const structure = useGate("structure.write");
  const host = primaryHostname(data.site.data?.domains ?? []);
  const list = [...(redirects.data ?? [])]
    .filter((r) => reason === "all" || r.reason === reason)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const paging = usePaging(
    list,
    (r, q, fold) => fold(r.from).includes(q) || fold(r.to).includes(q),
  );
  const served = servedPaths({
    pages: pages.data ?? [],
    entries: entries.data ?? [],
    defaultLocale: data.defaultLocale,
    taxonomies: data.taxonomies.data ?? [],
    terms: data.items.map((i) => i.term),
  });
  const remove = useMutation({
    mutationFn: (r: Redirect) => api.redirects.remove(r),
    onSuccess: async (_x, r) => {
      setToDelete(undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: taxonomyKeys.redirects(siteId) }),
        qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
      ]);
      toast.success(t("redirects.deleted", { from: r.from }), t("governance.oneSnapshot"));
    },
  });

  /** The node whose old address a redirect keeps, linked to its editor. */
  const sourceOf = (r: Redirect): { label: string; href: string } | undefined => {
    if (!r.source) return undefined;
    if (r.source.kind === "term") {
      const term = data.byId.get(r.source.id)?.term;
      return term
        ? { label: data.name(term), href: `/sites/${siteId}/taxonomy/${term.id}` }
        : undefined;
    }
    if (r.source.kind === "contentEntry") {
      const e = entries.data?.find((x) => x.id === r.source?.id);
      return e ? { label: e.title, href: `/sites/${siteId}/articles/${e.id}` } : undefined;
    }
    const p = pages.data?.find((x) => x.id === r.source?.id);
    return p ? { label: p.title, href: `/sites/${siteId}/pages/${p.id}` } : undefined;
  };

  const newButton = (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => setDialog({ open: true })}
      disabled={structure.reason !== undefined}
      title={structure.reason}
      data-testid="new-redirect"
    >
      {t("redirects.new")}
    </Button>
  );
  return (
    <PageLayout
      crumbs={
        <SiteCrumbs
          siteId={siteId}
          trail={[
            { label: t("pageHeaders.settings.title"), href: `/sites/${siteId}/settings` },
            { label: t("pageHeaders.redirects.title") },
          ]}
        />
      }
      icon={<Signpost size={24} />}
      title={t("pageHeaders.redirects.title")}
      description={t("pageHeaders.redirects.description")}
      actions={newButton}
    >
      <ErrorBanner error={redirects.error ?? remove.error} />
      <ViewOnlyBanner reason={structure.reason} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("redirects.search")}
        actions={
          <Toolbar aria-label={t("redirects.filters.reason")}>
            <Select
              aria-label={t("redirects.filters.reason")}
              value={reason}
              onValueChange={(v) => setReason(v as ReasonFilter)}
              items={{
                all: t("redirects.filters.all"),
                "slug-change": t("redirects.reasons.slug-change"),
                merge: t("redirects.reasons.merge"),
                retire: t("redirects.reasons.retire"),
                manual: t("redirects.reasons.manual"),
              }}
              render={<Toolbar.Button />}
            />
          </Toolbar>
        }
      />
      {redirects.data && list.length === 0 ? (
        <Empty
          icon={<Signpost size={48} className="text-kumo-inactive" />}
          title={reason === "all" ? t("redirects.empty") : t("redirects.emptyFiltered")}
          description={t("redirects.emptyDescription")}
          contents={reason === "all" ? newButton : undefined}
        />
      ) : (
        <ReadOnly reason={structure.reason} className="min-w-0">
          <LayerCard className="overflow-x-auto p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("redirects.columns.from")}</Table.Head>
                  <Table.Head>{t("redirects.columns.to")}</Table.Head>
                  <Table.Head>{t("redirects.columns.type")}</Table.Head>
                  <Table.Head>{t("redirects.columns.source")}</Table.Head>
                  <Table.Head>{t("redirects.columns.updated")}</Table.Head>
                  <Table.Head sticky="right" className="w-0">
                    <span className="sr-only">{t("site.rowMenu")}</span>
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              {redirects.isPending ? (
                <TableSkeleton columns={6} />
              ) : (
                <Table.Body>
                  {paging.pageItems.map((r) => {
                    const style = REASON_STYLE[r.reason];
                    const ext = externalHost(r.to);
                    const source = sourceOf(r);
                    return (
                      <Table.Row key={r.id} data-redirect-id={r.id} data-reason={r.reason}>
                        <Table.Cell>
                          <span className="flex min-w-48 items-center gap-2">
                            <Text variant="mono" as="span">
                              {r.from}
                              {r.match === "prefix" ? "/…" : ""}
                            </Text>
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="flex min-w-48 flex-wrap items-center gap-x-2 gap-y-1">
                            <ArrowRight
                              size={14}
                              className="shrink-0 text-kumo-subtle"
                              aria-hidden
                            />
                            <Text variant="mono" as="span">
                              {r.to}
                            </Text>
                            {ext && (
                              <Tooltip content={t("redirects.externalHint", { host: ext })}>
                                <span className="inline-flex">
                                  <Badge variant="outline" icon={<ArrowSquareOut />}>
                                    {t("redirects.external.badge")}
                                  </Badge>
                                </span>
                              </Tooltip>
                            )}
                          </span>
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Tooltip content={t(`redirects.status.${r.status}Hint`)}>
                              <span className="inline-flex">
                                <Badge variant={r.status === 301 ? "secondary" : "warning"}>
                                  {t(`redirects.status.short${r.status}`)}
                                </Badge>
                              </span>
                            </Tooltip>
                            {r.match === "prefix" && (
                              <Text variant="secondary" size="sm" as="span">
                                {t("redirects.match.prefixShort")}
                              </Text>
                            )}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="grid min-w-36 gap-1">
                            <span className="inline-flex" data-testid="redirect-source">
                              <Badge variant={style.variant} icon={<style.icon />}>
                                {t(`redirects.reasons.${r.reason}`)}
                              </Badge>
                            </span>
                            {source && (
                              <Link href={source.href} variant="plain">
                                <Text size="sm" as="span" truncate>
                                  {source.label}
                                </Text>
                              </Link>
                            )}
                            {r.note && (
                              <Text variant="secondary" size="sm" as="span" truncate>
                                {r.note}
                              </Text>
                            )}
                          </span>
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap">
                          <RelativeTime iso={r.updatedAt} />
                        </Table.Cell>
                        <Table.Cell sticky="right" className="w-0 text-end">
                          <DropdownMenu>
                            <Tooltip
                              content={t("site.rowMenu")}
                              render={
                                <DropdownMenu.Trigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      shape="square"
                                      icon={<DotsThree weight="bold" />}
                                      aria-label={t("redirects.menu", { from: r.from })}
                                    />
                                  }
                                />
                              }
                            />
                            <DropdownMenu.Content align="end">
                              <DropdownMenu.Item
                                icon={PencilSimple}
                                onClick={() => setDialog({ open: true, editing: r })}
                              >
                                {t("redirects.edit")}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                icon={Trash}
                                variant="danger"
                                onClick={() => setToDelete(r)}
                              >
                                {t("common.delete")}
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        </ReadOnly>
      )}
      {paging.total > paging.perPage && (
        <Pagination
          page={paging.page}
          perPage={paging.perPage}
          totalCount={paging.total}
          setPage={paging.setPage}
        />
      )}
      <RedirectDialog
        siteId={siteId}
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        editing={dialog.editing}
        redirects={redirects.data ?? []}
        served={served}
        host={host}
      />
      <ConfirmDialog
        open={toDelete !== undefined}
        onOpenChange={(o) => !o && setToDelete(undefined)}
        title={t("redirects.deleteTitle", { from: toDelete?.from ?? "" })}
        description={
          toDelete?.reason === "manual"
            ? t("redirects.deleteDescription")
            : t("redirects.deleteAutomatic")
        }
        confirmLabel={t("redirects.deleteConfirm")}
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </PageLayout>
  );
}

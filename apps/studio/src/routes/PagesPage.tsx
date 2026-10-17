import type { Page } from "@cloudhal/core-contracts";
import { formatDate, NUMERIC_DATE_TIME } from "@cloudhal/messages/format";
import {
  Badge,
  Button,
  DeleteResource,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { EyeSlash, FileText, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { deleteResourceProps } from "../components/deleteLabels.ts";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { ListViewsCell, ListViewsHead, useListViews } from "../components/ListViews.tsx";
import {
  InMenuBadge,
  MenuDeleteNotice,
  useMenuReferences,
  usePageMenus,
} from "../components/Menus.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useGate } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function PagesPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const pageMenus = usePageMenus(siteId);
  const viewsColumn = useListViews(siteId);
  const [toDelete, setToDelete] = useState<Page | undefined>();
  // Pages are structure: Editors and above (RFC-0005 §2.2).
  const pagesGate = useGate("pages.write");
  const deleteRefs = useMenuReferences(
    siteId,
    toDelete ? { kind: "page", id: toDelete.id } : undefined,
  );
  const order = new Map((site.data?.pageIds ?? []).map((id, i) => [id, i]));
  const sorted = [...(pages.data ?? [])].sort(
    (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
  );
  const paging = usePaging(sorted, (p, q, fold) => fold(p.title).includes(q) || p.path.includes(q));
  const create = useMutation({
    mutationFn: () =>
      api.pages.create(siteId, {
        path: `/page-${Date.now().toString(36)}`,
        title: t("overview.newPage"),
        locale: site.data?.defaultLocale ?? "en",
        status: "draft",
        sections: [],
      }),
    onSuccess: async ({ page }) => {
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      await navigate({ to: "/sites/$siteId/pages/$pageId", params: { siteId, pageId: page.id } });
    },
  });
  const remove = useMutation({
    mutationFn: async (page: Page) => {
      await api.pages.remove(page);
    },
    onSuccess: async () => {
      setToDelete(undefined);
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
    },
  });
  const newButton = (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => create.mutate()}
      loading={create.isPending}
      disabled={!pagesGate.allowed}
      title={pagesGate.reason}
    >
      {t("overview.newPage")}
    </Button>
  );
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.pages.title") }]} />}
      icon={<FileText size={24} />}
      title={t("pageHeaders.pages.title")}
      description={t("pageHeaders.pages.description")}
      actions={newButton}
    >
      <ErrorBanner error={pages.error ?? create.error ?? remove.error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("overview.search")}
      />
      {pages.data?.length === 0 ? (
        <Empty
          icon={<FileText size={48} className="text-kumo-inactive" />}
          title={t("overview.empty")}
          description={t("overview.emptyDescription")}
          contents={newButton}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("overview.columns.title")}</Table.Head>
                <Table.Head>{t("overview.columns.path")}</Table.Head>
                <Table.Head>{t("overview.columns.status")}</Table.Head>
                <Table.Head>{t("overview.columns.updated")}</Table.Head>
                {viewsColumn && <ListViewsHead />}
                <Table.Head />
              </Table.Row>
            </Table.Header>
            {pages.isPending ? (
              <TableSkeleton columns={viewsColumn ? 6 : 5} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((p) => (
                  <Table.Row key={p.id}>
                    <Table.Cell>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/sites/${siteId}/pages/${p.id}`} variant="plain">
                          <Text bold as="span">
                            {p.title}
                          </Text>
                        </Link>
                        <InMenuBadge keys={pageMenus.get(p.id)} />
                        {p.seo?.noindex && (
                          <Tooltip content={t("seo.noindexBadgeHint")}>
                            <span className="inline-flex" data-testid="noindex-badge">
                              <Badge variant="outline" icon={<EyeSlash />}>
                                {t("seo.noindexBadge")}
                              </Badge>
                            </span>
                          </Tooltip>
                        )}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <Text variant="mono-secondary" as="span">
                        {p.path}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Status status={p.status} />
                    </Table.Cell>
                    <Table.Cell>
                      <Text variant="secondary" size="sm" as="span">
                        {formatDate(locale, p.updatedAt, NUMERIC_DATE_TIME)}
                      </Text>
                    </Table.Cell>
                    {viewsColumn && <ListViewsCell views={viewsColumn.views} nodeId={p.id} />}
                    <Table.Cell className="text-end">
                      <RowMenu
                        onOpen={() =>
                          navigate({
                            to: "/sites/$siteId/pages/$pageId",
                            params: { siteId, pageId: p.id },
                          })
                        }
                        onDelete={() => setToDelete(p)}
                        deleteDisabledReason={pagesGate.reason}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            )}
          </Table>
        </LayerCard>
      )}
      {paging.total > paging.perPage && (
        <Pagination
          page={paging.page}
          perPage={paging.perPage}
          totalCount={paging.total}
          setPage={paging.setPage}
        />
      )}
      <DeleteResource
        open={toDelete !== undefined}
        onOpenChange={(o) => !o && setToDelete(undefined)}
        {...deleteResourceProps(t, t("editor.page"))}
        resourceName={toDelete?.path ?? ""}
        notice={<MenuDeleteNotice refs={deleteRefs.data} kind="page" />}
        isDeleting={remove.isPending}
        onDelete={async () => {
          if (toDelete) await remove.mutateAsync(toDelete);
        }}
      />
    </PageLayout>
  );
}

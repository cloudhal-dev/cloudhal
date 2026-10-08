import type { ContentEntry } from "@cloudhal/core-contracts";
import {
  Button,
  DeleteResource,
  Empty,
  ImagePreview,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  Table,
  Text,
} from "@cloudhal/ui";
import { Article, GearSix, type Icon, Plus, Robot, User } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { previewImageUrl } from "../lib/seo.ts";
import { primaryHostname } from "../lib/site-settings.ts";

const AUTHOR_ICON: Record<ContentEntry["author"]["kind"], Icon> = {
  human: User,
  agent: Robot,
  system: GearSix,
};

/** Site › Articles (DESIGN.md §2a): the "posts" collection, newest first. Built like PagesPage. */
export function ArticlesPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const host = primaryHostname(site.data?.domains ?? []);
  const entries = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
  });
  const [toDelete, setToDelete] = useState<ContentEntry | undefined>();
  const sorted = [...(entries.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const paging = usePaging(
    sorted,
    (e, q) => e.title.toLowerCase().includes(q) || e.slug.includes(q),
  );
  const create = useMutation({
    mutationFn: () =>
      api.entries.create(siteId, {
        collection: "posts",
        slug: `untitled-${Date.now().toString(36)}`,
        locale: site.data?.defaultLocale ?? "en",
        status: "draft",
        title: t("articles.untitled"),
        body: { format: "markdown", value: "" },
        fields: {},
        tags: [],
      }),
    onSuccess: async (entry) => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate({
        to: "/sites/$siteId/articles/$entryId",
        params: { siteId, entryId: entry.id },
      });
    },
  });
  const remove = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.remove(entry),
    onSuccess: async () => {
      setToDelete(undefined);
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
    },
  });
  const newButton = (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => create.mutate()}
      loading={create.isPending}
      data-testid="new-article"
    >
      {t("articles.newArticle")}
    </Button>
  );
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.articles.title") }]} />}
      title={t("pageHeaders.articles.title")}
      description={t("pageHeaders.articles.description")}
      actions={newButton}
    >
      <ErrorBanner error={entries.error ?? create.error ?? remove.error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("articles.search")}
      />
      {entries.data?.length === 0 ? (
        <Empty
          icon={<Article size={48} className="text-kumo-inactive" />}
          title={t("articles.empty")}
          description={t("articles.emptyDescription")}
          contents={newButton}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("articles.columns.title")}</Table.Head>
                <Table.Head>{t("articles.columns.author")}</Table.Head>
                <Table.Head>{t("articles.columns.status")}</Table.Head>
                <Table.Head>{t("articles.columns.updated")}</Table.Head>
                <Table.Head sticky="right" className="w-0">
                  <span className="sr-only">{t("site.rowMenu")}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            {entries.isPending ? (
              <TableSkeleton columns={5} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((e) => {
                  const AuthorIcon = AUTHOR_ICON[e.author.kind];
                  return (
                    <Table.Row key={e.id} data-entry-id={e.id}>
                      <Table.Cell>
                        <div className="flex min-w-56 items-center gap-3">
                          <ImagePreview
                            size="thumb"
                            src={e.coverImage ? previewImageUrl(e.coverImage.src, host) : undefined}
                            alt=""
                            labels={{
                              empty: t("seo.noCover"),
                              loading: t("seo.cover.loading"),
                              error: t("seo.cover.broken"),
                            }}
                          />
                          <div className="grid min-w-0 gap-1">
                            <Link href={`/sites/${siteId}/articles/${e.id}`} variant="plain">
                              <Text bold as="span">
                                {e.title}
                              </Text>
                            </Link>
                            <Text variant="mono-secondary" as="span" truncate>
                              /{e.collection}/{e.slug}
                            </Text>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <AuthorIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
                          <Text as="span">{e.author.name ?? e.author.id}</Text>
                        </span>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <Status status={e.status} />
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <RelativeTime iso={e.updatedAt} />
                      </Table.Cell>
                      <Table.Cell sticky="right" className="w-0 text-right">
                        <RowMenu
                          onOpen={() =>
                            navigate({
                              to: "/sites/$siteId/articles/$entryId",
                              params: { siteId, entryId: e.id },
                            })
                          }
                          onDelete={() => setToDelete(e)}
                        />
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
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
        resourceType={t("editor.article")}
        resourceName={toDelete?.slug ?? ""}
        isDeleting={remove.isPending}
        onDelete={async () => {
          if (toDelete) await remove.mutateAsync(toDelete);
        }}
      />
    </PageLayout>
  );
}

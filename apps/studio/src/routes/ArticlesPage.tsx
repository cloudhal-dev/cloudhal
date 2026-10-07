import type { ContentEntry } from "@cloudhal/core-contracts";
import {
  Button,
  DeleteResource,
  Empty,
  LayerCard,
  Link,
  Pagination,
  Table,
  Text,
} from "@cloudhal/ui";
import { Article, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function ArticlesPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
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
    <div className="grid gap-4">
      <ErrorBanner error={entries.error ?? create.error ?? remove.error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("articles.search")}
        actions={newButton}
      />
      {entries.data?.length === 0 ? (
        <Empty
          icon={<Article size={48} className="text-kumo-inactive" />}
          title={t("articles.empty")}
          description={t("articles.emptyDescription")}
          contents={newButton}
        />
      ) : (
        <LayerCard className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("articles.columns.title")}</Table.Head>
                <Table.Head>{t("articles.columns.slug")}</Table.Head>
                <Table.Head>{t("articles.columns.author")}</Table.Head>
                <Table.Head>{t("articles.columns.status")}</Table.Head>
                <Table.Head>{t("articles.columns.updated")}</Table.Head>
                <Table.Head />
              </Table.Row>
            </Table.Header>
            {entries.isPending ? (
              <TableSkeleton columns={6} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((e) => (
                  <Table.Row key={e.id}>
                    <Table.Cell>
                      <Link href={`/sites/${siteId}/articles/${e.id}`} variant="plain">
                        <Text bold as="span">
                          {e.title}
                        </Text>
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <Text variant="mono-secondary" as="span">
                        /{e.collection}/{e.slug}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{e.author.name ?? e.author.id}</Table.Cell>
                    <Table.Cell>
                      <Status status={e.status} />
                    </Table.Cell>
                    <Table.Cell>
                      <Text variant="secondary" size="sm" as="span">
                        {new Date(e.updatedAt).toLocaleString(locale)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
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
        resourceType={t("editor.article")}
        resourceName={toDelete?.slug ?? ""}
        isDeleting={remove.isPending}
        onDelete={async () => {
          if (toDelete) await remove.mutateAsync(toDelete);
        }}
      />
    </div>
  );
}

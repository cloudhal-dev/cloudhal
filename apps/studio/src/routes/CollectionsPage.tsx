import { collectionPermalink, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
import {
  Badge,
  Button,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { Plus, Stack } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { NewCollectionDialog } from "../components/NewCollectionDialog.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useCan } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { COLLECTION_ICONS } from "../lib/collection-icons.ts";
import { collectionIcon, collectionNames, entryTotal, useCollections } from "../lib/collections.ts";

/**
 * Site › Collections (RFC-0040 §4): every collection of the registry with its address and entry
 * count, and "New collection" for people who may change site settings.
 */
export function CollectionsPage() {
  const { t, locale } = useI18n("collections");
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const registry = useCollections(siteId);
  const canCreate = useCan("settings.write");
  const [creating, setCreating] = useState(false);
  const rows = (registry.data ?? []).map((c) => ({
    ...c,
    name:
      collectionNames(site.data, c.key, locale)?.plural ??
      (c.key === "posts" ? t("nav.articles") : c.key),
    prefix: permalinkPrefix(collectionPermalink(site.data, c.key)),
  }));
  const paging = usePaging(rows, (c, q, fold) => fold(c.name).includes(q) || c.key.includes(q));
  const newButton = canCreate && (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => setCreating(true)}
      data-testid="new-collection"
    >
      {t("collections.newCollection")}
    </Button>
  );
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("collections.title") }]} />}
      icon={<Stack size={24} />}
      title={t("collections.title")}
      description={t("collections.description")}
      actions={newButton}
    >
      <ErrorBanner error={registry.error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("collections.search")}
      />
      {registry.data?.length === 0 ? (
        <Empty
          icon={<Stack size={48} className="text-kumo-inactive" />}
          title={t("collections.empty")}
          description={t("collections.emptyDescription")}
          contents={newButton}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("collections.columns.name")}</Table.Head>
                <Table.Head>{t("collections.columns.address")}</Table.Head>
                <Table.Head>{t("collections.columns.entries")}</Table.Head>
                <Table.Head>{t("collections.columns.state")}</Table.Head>
              </Table.Row>
            </Table.Header>
            {registry.isPending ? (
              <TableSkeleton columns={4} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((c) => {
                  const Icon = collectionIcon(c, COLLECTION_ICONS);
                  return (
                    <Table.Row key={c.key} data-collection={c.key}>
                      <Table.Cell>
                        <span className="flex items-center gap-2">
                          <Icon size={16} className="text-kumo-subtle" />
                          <Link href={`/sites/${siteId}/collections/${c.key}`} variant="plain">
                            <Text bold as="span">
                              {c.name}
                            </Text>
                          </Link>
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Text variant="mono-secondary" as="span">
                          {`${c.prefix}/…`}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{t("collections.entries", { count: entryTotal(c) })}</Table.Cell>
                      <Table.Cell>
                        {c.declared ? (
                          <Badge variant="secondary">{t("collections.declared")}</Badge>
                        ) : (
                          <Tooltip content={t("collections.inferredHint")}>
                            <span className="inline-flex">
                              <Badge variant="outline">{t("collections.inferred")}</Badge>
                            </span>
                          </Tooltip>
                        )}
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
      <NewCollectionDialog
        open={creating}
        onOpenChange={setCreating}
        site={site.data}
        taken={(registry.data ?? []).map((c) => c.key)}
      />
    </PageLayout>
  );
}

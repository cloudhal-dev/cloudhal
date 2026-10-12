import type { ContentEntry, Taxonomy } from "@cloudhal/core-contracts";
import {
  Badge,
  Button,
  DeleteResource,
  Empty,
  ImagePreview,
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
  Article,
  FunnelSimple,
  GearSix,
  type Icon,
  Plus,
  Robot,
  Star,
  User,
  Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { ListViewsCell, ListViewsHead, useListViews } from "../components/ListViews.tsx";
import { MenuDeleteNotice, useMenuReferences } from "../components/Menus.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { TagsMigrationBanner } from "../components/TagsMigration.tsx";
import { type TaxonomyData, useTaxonomyData } from "../components/Taxonomy.tsx";
import { treeOptions } from "../components/TermPickers.tsx";
import { useCan, useSelf } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { imageRefPreviewUrl } from "../lib/media.ts";
import { entryAccess } from "../lib/roles.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import { facetFilter, needsTagsMigration } from "../lib/taxonomy.ts";

const AUTHOR_ICON: Record<ContentEntry["author"]["kind"], Icon> = {
  human: User,
  agent: Robot,
  system: GearSix,
};

const ALL = "__all";

/** An entry's terms of one taxonomy as names, the primary first. */
function namesOf(entry: ContentEntry, tax: Taxonomy | undefined, data: TaxonomyData) {
  const a = tax ? entry.terms?.[tax.key] : undefined;
  if (!a) return { primary: undefined as string | undefined, names: [] as string[] };
  const ids = a.primary ? [a.primary, ...a.ids.filter((id) => id !== a.primary)] : a.ids;
  const names = ids.map((id) => {
    const term = data.byId.get(id)?.term;
    return term ? data.name(term) : id;
  });
  return { primary: a.primary ? names[0] : undefined, names };
}

/**
 * Site › Articles (DESIGN.md §2a, §2p): the "posts" collection, newest first, with its primary
 * category and first tags, and category / tag facets that query the API's filter language.
 */
export function ArticlesPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const facets = useSearch({ strict: false }) as { category?: string; tag?: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const data = useTaxonomyData(siteId);
  const host = primaryHostname(site.data?.domains ?? []);
  const { category: catTax, tag: tagTax } = data.defaults;
  const filter = facetFilter({
    category:
      catTax && facets.category
        ? { key: catTax.key, slug: facets.category, hierarchical: catTax.hierarchical }
        : undefined,
    tag: tagTax && facets.tag ? { key: tagTax.key, slug: facets.tag } : undefined,
  });
  const entries = useQuery({
    queryKey: filter ? ["entries", siteId, "posts", filter] : ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, { collection: "posts", filter }),
    enabled: !filter || data.taxonomies.isSuccess,
  });
  const all = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
  });
  const viewsColumn = useListViews(siteId);
  const [toDelete, setToDelete] = useState<ContentEntry | undefined>();
  // Others' articles (and a Contributor's published ones) cannot be deleted (RFC-0005 I9).
  const editAny = useCan("entries.editAny");
  const editOwnPublished = useCan("entries.editOwnPublished");
  const self = useSelf();
  const deleteRefs = useMenuReferences(
    siteId,
    toDelete ? { kind: "contentEntry", id: toDelete.id } : undefined,
  );
  const sorted = [...(entries.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const paging = usePaging(
    sorted,
    (e, q) => e.title.toLowerCase().includes(q) || e.slug.includes(q),
  );
  const setFacets = (next: { category?: string | undefined; tag?: string | undefined }) =>
    navigate({
      to: "/sites/$siteId/articles",
      params: { siteId },
      search: {
        ...(next.category ? { category: next.category } : {}),
        ...(next.tag ? { tag: next.tag } : {}),
      },
      replace: true,
    });
  const filtered = Boolean(facets.category || facets.tag);
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
  const migrated = (data.taxonomies.data?.length ?? 0) > 0;
  const categoryOptions = catTax ? treeOptions(data.itemsOf(catTax), data.name) : [];
  const tagOptions = tagTax
    ? data
        .itemsOf(tagTax)
        .filter((i) => i.term.status !== "retired")
        .sort(
          (a, b) =>
            b.usage.total - a.usage.total || data.name(a.term).localeCompare(data.name(b.term)),
        )
    : [];
  const columns = 5 + (catTax ? 1 : 0) + (viewsColumn ? 1 : 0) + 1;
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.articles.title") }]} />}
      title={t("pageHeaders.articles.title")}
      description={t("pageHeaders.articles.description")}
      actions={newButton}
    >
      <ErrorBanner error={entries.error ?? create.error ?? remove.error} />
      {needsTagsMigration(data.taxonomies.data, all.data) && (
        <TagsMigrationBanner siteId={siteId} />
      )}
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("articles.search")}
        actions={
          migrated && (catTax || tagTax) ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {filtered && (
                <Button variant="ghost" onClick={() => setFacets({})} data-testid="clear-facets">
                  {t("articles.facets.clear")}
                </Button>
              )}
              <Toolbar aria-label={t("articles.facets.label")}>
                {catTax && (
                  <Select
                    aria-label={t("articles.facets.category")}
                    value={facets.category ?? ALL}
                    onValueChange={(v) =>
                      setFacets({ ...facets, category: v === ALL ? undefined : (v as string) })
                    }
                    items={Object.fromEntries([
                      [
                        ALL,
                        t("articles.facets.allCategories", {
                          label: data.label(catTax).toLocaleLowerCase(locale),
                        }),
                      ],
                      ...categoryOptions.map((o) => [
                        o.term.slug,
                        `${" ".repeat(o.depth)}${data.name(o.term)}`,
                      ]),
                    ])}
                    render={<Toolbar.Button />}
                    data-testid="facet-category"
                  />
                )}
                {tagTax && (
                  <Select
                    aria-label={t("articles.facets.tag")}
                    value={facets.tag ?? ALL}
                    onValueChange={(v) =>
                      setFacets({ ...facets, tag: v === ALL ? undefined : (v as string) })
                    }
                    items={Object.fromEntries([
                      [
                        ALL,
                        t("articles.facets.allTags", {
                          label: data.label(tagTax).toLocaleLowerCase(locale),
                        }),
                      ],
                      ...tagOptions.map((i) => [i.term.slug, data.name(i.term)]),
                    ])}
                    render={<Toolbar.Button />}
                    data-testid="facet-tag"
                  />
                )}
              </Toolbar>
            </div>
          ) : undefined
        }
      />
      {entries.data?.length === 0 ? (
        filtered ? (
          <Empty
            icon={<FunnelSimple size={48} className="text-kumo-inactive" />}
            title={t("articles.facets.empty")}
            description={t("articles.facets.emptyDescription")}
            contents={
              <Button variant="secondary" onClick={() => setFacets({})}>
                {t("articles.facets.clear")}
              </Button>
            }
          />
        ) : (
          <Empty
            icon={<Article size={48} className="text-kumo-inactive" />}
            title={t("articles.empty")}
            description={t("articles.emptyDescription")}
            contents={newButton}
          />
        )
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("articles.columns.title")}</Table.Head>
                {catTax && <Table.Head>{data.label(catTax, "singular")}</Table.Head>}
                <Table.Head>{tagTax ? data.label(tagTax) : t("editor.tags")}</Table.Head>
                <Table.Head>{t("articles.columns.author")}</Table.Head>
                <Table.Head>{t("articles.columns.status")}</Table.Head>
                <Table.Head>{t("articles.columns.updated")}</Table.Head>
                {viewsColumn && <ListViewsHead />}
                <Table.Head sticky="right" className="w-0">
                  <span className="sr-only">{t("site.rowMenu")}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            {entries.isPending ? (
              <TableSkeleton columns={columns} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((e) => {
                  const AuthorIcon = AUTHOR_ICON[e.author.kind];
                  const cats = namesOf(e, catTax, data);
                  const tags = tagTax ? namesOf(e, tagTax, data).names : e.tags;
                  const needsCategory =
                    catTax?.required &&
                    !e.terms?.[catTax.key]?.primary &&
                    (e.status === "review" || e.status === "published");
                  return (
                    <Table.Row key={e.id} data-entry-id={e.id}>
                      <Table.Cell>
                        <div className="flex min-w-56 items-center gap-3">
                          <ImagePreview
                            size="thumb"
                            src={
                              e.coverImage
                                ? imageRefPreviewUrl(siteId, e.coverImage, host)
                                : undefined
                            }
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
                      {catTax && (
                        <Table.Cell className="whitespace-nowrap" data-testid="category-cell">
                          {cats.names.length === 0 ? (
                            needsCategory ? (
                              <Badge variant="warning" icon={<Warning />}>
                                {t("articles.noCategory")}
                              </Badge>
                            ) : (
                              <Text variant="secondary" as="span">
                                {t("articles.none")}
                              </Text>
                            )
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {cats.primary && (
                                <Tooltip content={t("articles.primary")}>
                                  <span className="flex items-center text-kumo-warning">
                                    <Star
                                      size={12}
                                      weight="fill"
                                      aria-label={t("articles.primary")}
                                    />
                                  </span>
                                </Tooltip>
                              )}
                              <Text as="span">{cats.names[0]}</Text>
                              {cats.names.length > 1 && (
                                <Tooltip content={cats.names.slice(1).join(", ")}>
                                  <span className="inline-flex">
                                    <Badge variant="secondary">+{cats.names.length - 1}</Badge>
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          )}
                        </Table.Cell>
                      )}
                      <Table.Cell data-testid="tags-cell">
                        {tags.length === 0 ? (
                          <Text variant="secondary" as="span">
                            {t("articles.none")}
                          </Text>
                        ) : (
                          <span className="flex min-w-36 flex-wrap items-center gap-1">
                            {tags.slice(0, 2).map((name) => (
                              <Badge key={name} variant="outline">
                                {name}
                              </Badge>
                            ))}
                            {tags.length > 2 && (
                              <Tooltip content={tags.slice(2).join(", ")}>
                                <span className="inline-flex">
                                  <Badge variant="secondary">+{tags.length - 2}</Badge>
                                </span>
                              </Tooltip>
                            )}
                          </span>
                        )}
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
                      {viewsColumn && <ListViewsCell views={viewsColumn.views} nodeId={e.id} />}
                      <Table.Cell sticky="right" className="w-0 text-right">
                        <RowMenu
                          onOpen={() =>
                            navigate({
                              to: "/sites/$siteId/articles/$entryId",
                              params: { siteId, entryId: e.id },
                            })
                          }
                          onDelete={() => setToDelete(e)}
                          deleteDisabledReason={
                            entryAccess(e, { editAny, editOwnPublished }, self) === "edit"
                              ? undefined
                              : t("gating.entryDelete")
                          }
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
        notice={<MenuDeleteNotice refs={deleteRefs.data} kind="contentEntry" />}
        isDeleting={remove.isPending}
        onDelete={async () => {
          if (toDelete) await remove.mutateAsync(toDelete);
        }}
      />
    </PageLayout>
  );
}

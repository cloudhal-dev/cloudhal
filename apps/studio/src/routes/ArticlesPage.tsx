import type { ContentEntry, FieldOrder, Site, Taxonomy } from "@cloudhal/core-contracts";
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
import { lazy, type ReactNode, Suspense, useState } from "react";
import { CollectionActions } from "../components/CollectionActions.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { deleteResourceProps } from "../components/deleteLabels.ts";
import { EntryPath } from "../components/EntryPath.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import {
  ListViewsCell,
  type ListViewsColumn,
  ListViewsHead,
  useListViews,
} from "../components/ListViews.tsx";
import { EntryLiveItems } from "../components/LiveRowItems.tsx";
import { MenuDeleteNotice, useMenuReferences } from "../components/Menus.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { TagsMigrationBanner } from "../components/TagsMigration.tsx";
import { type TaxonomyData, useTaxonomyData } from "../components/Taxonomy.tsx";
import { treeOptions } from "../components/TermPickers.tsx";
import {
  LanguageFilter,
  LanguagesCell,
  type TranslationList,
  useTranslationList,
} from "../components/TranslationList.tsx";
import { type ServerPaging, useCollectionEntries } from "../components/useCollectionEntries.ts";
import {
  scopeTaxonomies,
  useCollectionHeader,
  useCollectionParam,
  useNewEntry,
} from "../components/useCollectionView.ts";
import { useCan, useSelf } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { listOf, useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { entryHref, entryRoute } from "../lib/entry-href.ts";
import { listingQuery, withFilter } from "../lib/listing-query.ts";
import { imageRefPreviewUrl } from "../lib/media.ts";
import { entryAccess } from "../lib/roles.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import { facetFilter, needsTagsMigration } from "../lib/taxonomy.ts";

// RFC-0042 §4: a collection with listing fields gets their columns, filters and sort (lazy).
const columnsModule = () => import("../components/listings/ListFieldColumns.tsx");
const ListFieldFilters = lazy(() => columnsModule().then((m) => ({ default: m.ListFieldFilters })));
const ListFieldHeads = lazy(() => columnsModule().then((m) => ({ default: m.ListFieldHeads })));
const ListFieldCells = lazy(() => columnsModule().then((m) => ({ default: m.ListFieldCells })));

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
 * Site › a collection (DESIGN.md §2a, §2p; RFC-0040 §4): its entries, newest first, with their
 * primary category and first tags where those taxonomies apply, and category / tag facets that
 * query the API's filter language. `posts` is Articles; `/articles` redirects here.
 */
export function ArticlesPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const collection = useCollectionParam();
  const header = useCollectionHeader(siteId, collection);
  const facets = useSearch({ strict: false }) as Record<string, string> & Facets;
  const listing = listingQuery(facets);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const data = scopeTaxonomies(useTaxonomyData(siteId), collection);
  const host = primaryHostname(site.data?.domains ?? []);
  const { category: catTax, tag: tagTax } = data.defaults;
  const filter = facetFilter({
    category:
      catTax && facets.category
        ? { key: catTax.key, slug: facets.category, hierarchical: catTax.hierarchical }
        : undefined,
    tag: tagTax && facets.tag ? { key: tagTax.key, slug: facets.tag } : undefined,
  });
  const enabled = !filter || data.taxonomies.isSuccess;
  const entries = useCollectionEntries({ siteId, collection, filter, listing, enabled });
  const listFields = site.data?.collections?.[collection]?.listFields?.length ?? 0;
  const all = useQuery({
    queryKey: ["entries", siteId, collection],
    queryFn: () => api.entries.list(siteId, collection),
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
  const list = useTranslationList(siteId, site.data, entries.data ?? []);
  const paging = usePaging(
    list.items,
    (e, q, fold) => fold(e.title).includes(q) || e.slug.includes(q),
  );
  const setSearch = (search: Record<string, string>) =>
    navigate({
      to: "/sites/$siteId/collections/$collection",
      params: { siteId, collection },
      search,
      replace: true,
    });
  const setFacets = (next: Facets) => {
    const { category: _c, tag: _t, ...rest } = facets;
    setSearch({
      ...(next.category || next.tag ? rest : {}),
      ...(next.category ? { category: next.category } : {}),
      ...(next.tag ? { tag: next.tag } : {}),
    });
  };
  const filtered = Boolean(facets.category || facets.tag || listing.where.length);
  const create = useNewEntry(siteId, collection, list.newLocale);
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
      {header.newLabel}
    </Button>
  );
  const migrated = (data.taxonomies.data?.length ?? 0) > 0;
  const facetsShown = migrated && Boolean(catTax || tagTax);
  const columns =
    6 + listFields + (catTax ? 1 : 0) + (viewsColumn ? 1 : 0) + (list.groupOf ? 1 : 0);
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: header.title }]} />}
      icon={<header.Icon size={24} />}
      title={header.title}
      description={header.description}
      actions={<CollectionActions siteId={siteId} collection={collection} add={newButton} />}
    >
      <ErrorBanner error={entries.error ?? create.error ?? remove.error} />
      {needsTagsMigration(data.taxonomies.data, all.data) && (
        <TagsMigrationBanner siteId={siteId} />
      )}
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={header.search}
        actions={
          facetsShown || list.multilingual || listFields > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {filtered && (
                <Button variant="ghost" onClick={() => setFacets({})} data-testid="clear-facets">
                  {t("articles.facets.clear")}
                </Button>
              )}
              {list.multilingual && (
                <Toolbar aria-label={t("translationList.filter")}>
                  <LanguageFilter list={list} site={site.data} />
                </Toolbar>
              )}
              {facetsShown && <ArticleFacets data={data} facets={facets} setFacets={setFacets} />}
              {site.data && listFields > 0 && (
                <Suspense fallback={null}>
                  <ListFieldFilters
                    site={site.data}
                    collection={collection}
                    filters={listing.filters}
                    onFilter={(field, token) => setSearch(withFilter(facets, field, token))}
                  />
                </Suspense>
              )}
            </div>
          ) : undefined
        }
      />
      {entries.data?.length === 0 ? (
        <ArticlesEmpty
          filtered={filtered}
          onClear={() => setFacets({})}
          Icon={header.Icon}
          title={header.empty}
          newButton={newButton}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <ArticlesHead
              site={listFields > 0 ? site.data : undefined}
              collection={collection}
              data={data}
              translations={Boolean(list.groupOf)}
              views={Boolean(viewsColumn)}
              orderBy={listing.orderBy}
              onSort={(o) =>
                setSearch({
                  ...withoutSort(facets),
                  ...(o ? { sort: `${o.field}:${o.direction}` } : {}),
                })
              }
            />
            {entries.isPending ? (
              <TableSkeleton columns={columns} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((e) => (
                  <ArticleRow
                    key={e.id}
                    entry={e}
                    siteId={siteId}
                    host={host}
                    data={data}
                    list={list}
                    fields={site.data && listFields > 0 ? site.data : undefined}
                    views={viewsColumn}
                    deleteDisabledReason={
                      entryAccess(e, { editAny, editOwnPublished }, self) === "edit"
                        ? undefined
                        : t("gating.entryDelete")
                    }
                    onDelete={() => setToDelete(e)}
                  />
                ))}
              </Table.Body>
            )}
          </Table>
        </LayerCard>
      )}
      <ListPagination server={entries.server} paging={paging} />
      <DeleteResource
        open={toDelete !== undefined}
        onOpenChange={(o) => !o && setToDelete(undefined)}
        {...deleteResourceProps(t, t("editor.article"))}
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

/** Nothing to list: no entries yet, or none matching the filters. */
function ArticlesEmpty({
  filtered,
  onClear,
  Icon,
  title,
  newButton,
}: {
  filtered: boolean;
  onClear: () => void;
  Icon: Icon;
  title: string;
  newButton: ReactNode;
}) {
  const t = useT();
  return filtered ? (
    <Empty
      icon={<FunnelSimple size={48} className="text-kumo-inactive" />}
      title={t("articles.facets.empty")}
      description={t("articles.facets.emptyDescription")}
      contents={
        <Button variant="secondary" onClick={onClear}>
          {t("articles.facets.clear")}
        </Button>
      }
    />
  ) : (
    <Empty
      icon={<Icon size={48} className="text-kumo-inactive" />}
      title={title}
      description={t("articles.emptyDescription")}
      contents={newButton}
    />
  );
}

/** The list's header row; `site` when the collection has listing fields (their columns, lazy). */
function ArticlesHead({
  site,
  collection,
  data,
  translations,
  views,
  orderBy,
  onSort,
}: {
  site: Site | undefined;
  collection: string;
  data: TaxonomyData;
  translations: boolean;
  views: boolean;
  orderBy: FieldOrder | undefined;
  onSort: (orderBy: FieldOrder | undefined) => void;
}) {
  const t = useT();
  const { category: catTax, tag: tagTax } = data.defaults;
  return (
    <Table.Header>
      <Table.Row>
        <Table.Head>{t("articles.columns.title")}</Table.Head>
        {site && (
          <Suspense fallback={null}>
            <ListFieldHeads site={site} collection={collection} orderBy={orderBy} onSort={onSort} />
          </Suspense>
        )}
        {catTax && <Table.Head>{data.label(catTax, "singular")}</Table.Head>}
        <Table.Head>{tagTax ? data.label(tagTax) : t("editor.tags")}</Table.Head>
        <Table.Head>{t("articles.columns.author")}</Table.Head>
        {translations && <Table.Head>{t("translationList.column")}</Table.Head>}
        <Table.Head>{t("articles.columns.status")}</Table.Head>
        <Table.Head>{t("articles.columns.updated")}</Table.Head>
        {views && <ListViewsHead />}
        <Table.Head sticky="right" className="w-0">
          <span className="sr-only">{t("site.rowMenu")}</span>
        </Table.Head>
      </Table.Row>
    </Table.Header>
  );
}

/** Server pages (previous / next) while the list asks by field, else the client-side pages. */
function ListPagination({
  server,
  paging,
}: {
  server: ServerPaging | undefined;
  paging: { page: number; perPage: number; total: number; setPage: (page: number) => void };
}) {
  if (server)
    return server.total > server.perPage ? (
      <Pagination
        controls="simple"
        page={server.page}
        perPage={server.perPage}
        totalCount={server.total}
        setPage={server.setPage}
      />
    ) : null;
  return paging.total > paging.perPage ? (
    <Pagination
      page={paging.page}
      perPage={paging.perPage}
      totalCount={paging.total}
      setPage={paging.setPage}
    />
  ) : null;
}

/** One article; on a multilingual site's grouped list, with its group's Languages cell. */
function ArticleRow({
  entry: e,
  siteId,
  host,
  data,
  list,
  fields,
  views,
  deleteDisabledReason,
  onDelete,
}: {
  entry: ContentEntry;
  siteId: string;
  host: string | undefined;
  data: TaxonomyData;
  list: TranslationList<ContentEntry>;
  /** The site, when the collection has listing fields to show (RFC-0042). */
  fields: Site | undefined;
  views: ListViewsColumn;
  deleteDisabledReason: string | undefined;
  onDelete: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { category: catTax, tag: tagTax } = data.defaults;
  const group = list.groupOf?.(e.id);
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
            src={e.coverImage ? imageRefPreviewUrl(siteId, e.coverImage, host) : undefined}
            alt=""
            labels={{
              empty: t("seo.noCover"),
              loading: t("seo.cover.loading"),
              error: t("seo.cover.broken"),
            }}
          />
          <div className="grid min-w-0 gap-1">
            <Link href={entryHref(siteId, e.id, e.collection)} variant="plain">
              <Text bold as="span">
                {e.title}
              </Text>
            </Link>
            <EntryPath siteId={siteId} entry={e} truncate />
          </div>
        </div>
      </Table.Cell>
      {fields && (
        <Suspense fallback={null}>
          <ListFieldCells site={fields} collection={e.collection} entry={e} />
        </Suspense>
      )}
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
                    <Star size={12} weight="fill" aria-label={t("articles.primary")} />
                  </span>
                </Tooltip>
              )}
              <Text as="span">{cats.names[0]}</Text>
              {cats.names.length > 1 && (
                <Tooltip content={listOf(cats.names.slice(1))}>
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
              <Tooltip content={listOf(tags.slice(2))}>
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
      {list.groupOf && (
        <Table.Cell data-testid="languages-cell">
          {group && <LanguagesCell siteId={siteId} row={group} canWrite />}
        </Table.Cell>
      )}
      <Table.Cell className="whitespace-nowrap">
        <Status status={e.status} />
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        <RelativeTime iso={e.updatedAt} />
      </Table.Cell>
      {views && <ListViewsCell views={views.views} nodeId={e.id} />}
      <Table.Cell sticky="right" className="w-0 text-end">
        <RowMenu
          onOpen={() => navigate(entryRoute(siteId, e.id, e.collection))}
          items={<EntryLiveItems siteId={siteId} entry={e} />}
          onDelete={onDelete}
          deleteDisabledReason={deleteDisabledReason}
        />
      </Table.Cell>
    </Table.Row>
  );
}

type Facets = { category?: string | undefined; tag?: string | undefined };

/** The URL search without the field sort. */
function withoutSort(search: Record<string, string>): Record<string, string> {
  const { sort: _s, ...rest } = search;
  return rest;
}

/** The category and tag filters, which query the API's filter language (DESIGN.md §2p). */
function ArticleFacets({
  data,
  facets,
  setFacets,
}: {
  data: TaxonomyData;
  facets: Facets;
  setFacets: (next: Facets) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const { category: catTax, tag: tagTax } = data.defaults;
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
  return (
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
  );
}

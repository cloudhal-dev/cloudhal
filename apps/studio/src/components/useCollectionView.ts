/**
 * RFC-0040 §4: what a collection's list screen needs beyond the Articles list it generalises: the
 * collection from the route, its name in Studio's language, a "New" that creates in it, and only
 * the taxonomies that apply to it (`Taxonomy.collections`, absent = every collection).
 */
import type { Taxonomy } from "@cloudhal/core-contracts";
import { BUILT_IN_COLLECTION } from "@cloudhal/core-ts/collections";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { COLLECTION_ICONS } from "../lib/collection-icons.ts";
import { collectionIcon, collectionNames } from "../lib/collections.ts";
import { entryRoute } from "../lib/entry-href.ts";
import type { TaxonomyData } from "./Taxonomy.tsx";

/** `$collection` of `/sites/$siteId/collections/$collection(/$entryId)`; `posts` elsewhere. */
export function useCollectionParam(): string {
  const params = useParams({ strict: false }) as { collection?: string };
  return params.collection ?? BUILT_IN_COLLECTION;
}

/** Whether `tax` applies to `collection`. */
export function appliesTo(tax: Pick<Taxonomy, "collections"> | undefined, collection: string) {
  return tax !== undefined && (!tax.collections || tax.collections.includes(collection));
}

/** The taxonomy data with only the default taxonomies that apply to `collection`. */
export function scopeTaxonomies(data: TaxonomyData, collection: string): TaxonomyData {
  const { category, tag } = data.defaults;
  return {
    ...data,
    defaults: {
      ...data.defaults,
      category: appliesTo(category, collection) ? category : undefined,
      tag: appliesTo(tag, collection) ? tag : undefined,
    },
  };
}

/**
 * The screen's title, description and "New" label. `posts` without labels keeps Studio's own
 * Articles wording; another collection without labels is shown by its key.
 */
export function useCollectionHeader(siteId: string, collection: string) {
  const { t, locale } = useI18n();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const names = collectionNames(site.data, collection, locale);
  const builtIn = collection === BUILT_IN_COLLECTION && !names;
  const description = site.data?.collections?.[collection]?.labels?.[locale]?.description;
  return {
    title: builtIn ? t("pageHeaders.articles.title") : (names?.plural ?? collection),
    description: builtIn
      ? t("pageHeaders.articles.description")
      : (description ?? t("collectionList.description", { key: collection })),
    newLabel: builtIn ? t("articles.newArticle") : t("collectionList.newEntry"),
    search: builtIn ? t("articles.search") : t("collectionList.search"),
    empty: builtIn ? t("articles.empty") : t("collectionList.empty"),
    Icon: collectionIcon(
      { key: collection, settings: site.data?.collections?.[collection] ?? {} },
      COLLECTION_ICONS,
    ),
  };
}

/** Creates an untitled draft in `collection` and opens it in the editor. */
export function useNewEntry(siteId: string, collection: string, locale: string) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () =>
      api.entries.create(siteId, {
        collection,
        slug: `untitled-${Date.now().toString(36)}`,
        locale,
        status: "draft",
        title: t("articles.untitled"),
        body: { format: "markdown", value: "" },
        fields: {},
        tags: [],
      }),
    onSuccess: async (entry) => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate(entryRoute(siteId, entry.id, entry.collection));
    },
  });
}

/**
 * The editor's address names the entry's own collection: a link that did not know it (`posts`, the
 * old `/articles/$entryId`) is replaced once the entry has loaded, so the sidebar and the next
 * "New" follow the right collection.
 */
export function useEntryCollectionUrl(
  siteId: string,
  entryId: string,
  routeCollection: string,
  actual: string | undefined,
) {
  const navigate = useNavigate();
  useEffect(() => {
    if (actual && actual !== routeCollection)
      void navigate({ ...entryRoute(siteId, entryId, actual), replace: true });
  }, [navigate, siteId, entryId, routeCollection, actual]);
}

/** The editor's first crumb: the entry's collection list (Articles for `posts`). */
export function useCollectionCrumb(siteId: string, collection: string | undefined) {
  const key = collection ?? BUILT_IN_COLLECTION;
  const { title } = useCollectionHeader(siteId, key);
  return { label: title, href: `/sites/${siteId}/collections/${key}` };
}

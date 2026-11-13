import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  Banner,
  Button,
  SectionCard,
  SectionEmpty,
  UsedByList,
  type UsedByRow,
} from "@cloudhal/ui";
import { LinkSimple } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatList, useI18n } from "../../i18n/index.tsx";
import { type Referrer, referencesApi } from "../../lib/api/references.ts";
import { collectionName } from "../../lib/collections.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { referrerFieldWords } from "../../lib/field-references.ts";
import { languageName } from "../../lib/languages.ts";

const PAGE = 20;

/**
 * The entry editor's "Used by" card (RFC-0045 §5): every entry whose fields reference this
 * entry's translation group (`GET …/entries/:id/references`, published holders first), as
 * `UsedByList` in a flush `SectionCard`, with "Show more" while pages remain. Each row says where
 * the value sits and which translations show it too. Shown only when some field of the site can
 * reference this collection.
 */
export function UsedByCard({
  siteId,
  site,
  entry,
}: {
  siteId: string;
  site: Site;
  entry: ContentEntry;
}) {
  const { t, locale } = useI18n("fields");
  const pages = useInfiniteQuery({
    queryKey: ["entry-referrers", siteId, entry.id],
    queryFn: ({ pageParam }) =>
      referencesApi.referrers(siteId, entry.id, { limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
  });
  const referrers = pages.data?.pages.flatMap((p) => p.referrers) ?? [];
  const row = (r: Referrer): UsedByRow => {
    const words = referrerFieldWords(site, r.collection, r.field, locale);
    const field = words.sub
      ? t("fields.usedBy.subField", { field: words.field, sub: words.sub })
      : words.field;
    return {
      id: `${r.id} ${r.field}`,
      title: r.title,
      href: entryHref(siteId, r.id, r.collection),
      detail: t("fields.usedBy.detail", {
        collection: collectionName(site, r.collection, locale, t("nav.articles")),
        language: languageName(locale, r.locale),
        field,
      }),
      status: r.status,
      ...(r.shownBy.length
        ? {
            shownBy: t("fields.usedBy.shownBy", {
              languages: formatList(
                locale,
                r.shownBy.map((m) => languageName(locale, m.locale)),
              ),
            }),
          }
        : {}),
    };
  };
  const empty = !pages.isPending && !pages.isError && referrers.length === 0;
  return (
    <SectionCard
      id="used-by"
      title={t("fields.usedBy.title")}
      description={t("fields.usedBy.description")}
      icon={<LinkSimple />}
      flush={!empty && !pages.isError}
      footer={
        pages.hasNextPage ? (
          <Button
            variant="secondary"
            size="sm"
            loading={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            {t("fields.usedBy.more")}
          </Button>
        ) : undefined
      }
    >
      {pages.isError ? (
        <Banner variant="error" title={t("fields.usedBy.failed")} />
      ) : empty ? (
        <SectionEmpty
          icon={<LinkSimple size={32} className="text-kumo-inactive" />}
          title={t("fields.usedBy.empty")}
          description={t("fields.usedBy.emptyDescription")}
        />
      ) : (
        <UsedByList
          rows={referrers.map(row)}
          loading={pages.isPending}
          labels={{
            entry: t("fields.usedBy.entry"),
            status: t("fields.usedBy.status"),
            caption: t("fields.usedBy.caption"),
            statuses: {
              draft: t("status.draft"),
              review: t("status.review"),
              published: t("status.published"),
              archived: t("status.archived"),
            },
          }}
        />
      )}
    </SectionCard>
  );
}

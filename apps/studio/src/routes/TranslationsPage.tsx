import {
  Badge,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  Select,
  Table,
  Text,
  Toolbar,
} from "@cloudhal/ui";
import { Translate } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useI18n } from "../i18n/index.tsx";
import { api, type TranslationRow } from "../lib/api.ts";
import { type CoverageRow, coverageRows } from "../lib/coverage.ts";
import { languageName } from "../lib/languages.ts";

type Filter = "all" | "needsWork";

const editorHref = (siteId: string, m: TranslationRow) =>
  m.kind === "page" ? `/sites/${siteId}/pages/${m.id}` : `/sites/${siteId}/articles/${m.id}`;

/**
 * Site › Translations (RFC-0033 §8): every page and article by language — the coverage view and
 * the work queue. A row needs work when a language has no version, a version is out of date, or
 * a machine translation waits for a person's review (in the editor's translations card).
 */
export function TranslationsPage() {
  const { t, locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const [filter, setFilter] = useState<Filter>("needsWork");
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const translations = useQuery({
    queryKey: ["translations", siteId, "all"],
    queryFn: () => api.translations.list(siteId),
  });
  const locales = site.data?.locales ?? [];
  const loaded = site.data && pages.data && entries.data && translations.data;
  const rows = loaded
    ? coverageRows({
        uiLocale: locale,
        locales,
        nodes: [...(pages.data ?? []), ...(entries.data ?? [])],
        translations: translations.data?.items ?? [],
      }).filter((r) => filter === "all" || r.needsWork)
    : undefined;
  const paging = usePaging<CoverageRow>(rows, (r, q, fold) => fold(r.title).includes(q));
  const error = site.error ?? pages.error ?? entries.error ?? translations.error;
  return (
    <PageLayout
      crumbs={
        <SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.translations.title") }]} />
      }
      title={t("pageHeaders.translations.title")}
      description={t("pageHeaders.translations.description")}
    >
      <ErrorBanner error={error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("coverage.search")}
        actions={
          <Toolbar aria-label={t("coverage.filter")}>
            <Select
              aria-label={t("coverage.filter")}
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
              items={{ needsWork: t("coverage.needsWork"), all: t("coverage.all") }}
              render={<Toolbar.Button />}
            />
          </Toolbar>
        }
      />
      {site.data && locales.length < 2 ? (
        <Empty
          icon={<Translate size={48} className="text-kumo-inactive" />}
          title={t("coverage.oneLanguage")}
          description={t("coverage.oneLanguageDescription")}
          contents={
            <Link href={`/sites/${siteId}/settings#languages`} variant="inline">
              {t("coverage.openSettings")}
            </Link>
          }
        />
      ) : rows && rows.length === 0 ? (
        <Empty
          icon={<Translate size={48} className="text-kumo-inactive" />}
          title={filter === "needsWork" ? t("coverage.allDone") : t("coverage.empty")}
          description={t("coverage.emptyDescription")}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("coverage.item")}</Table.Head>
                {locales.map((l) => (
                  <Table.Head key={l}>{languageName(locale, l)}</Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            {rows === undefined ? (
              <TableSkeleton columns={locales.length + 1} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((r) => (
                  <Table.Row key={r.group} data-group={r.group}>
                    <Table.Cell>
                      <span className="grid gap-0.5">
                        <Text as="span">{r.title}</Text>
                        <Text as="span" variant="secondary" size="sm">
                          {r.kind === "page" ? t("coverage.page") : t("coverage.article")}
                        </Text>
                      </span>
                    </Table.Cell>
                    {locales.map((l) => (
                      <Table.Cell key={l} data-locale={l}>
                        <CoverageCell siteId={siteId} member={r.cells[l]} />
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            )}
          </Table>
        </LayerCard>
      )}
      {rows && paging.total > paging.perPage && (
        <Pagination
          page={paging.page}
          perPage={paging.perPage}
          totalCount={paging.total}
          setPage={paging.setPage}
        />
      )}
    </PageLayout>
  );
}

/** One language's version of a work: its status and what it still needs, or that it is missing. */
function CoverageCell({ siteId, member }: { siteId: string; member: TranslationRow | undefined }) {
  const { t } = useI18n();
  if (!member)
    return (
      <Text as="span" variant="secondary" size="sm">
        {t("coverage.missing")}
      </Text>
    );
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Link href={editorHref(siteId, member)} variant="inline" aria-label={member.title}>
        <Status status={member.status} />
      </Link>
      {member.stale && <Badge variant="warning">{t("translations.stale")}</Badge>}
      {member.method === "machine" && <Badge variant="outline">{t("coverage.toReview")}</Badge>}
    </span>
  );
}

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
import { type CoverageColumn, type CoverageRow, coverageRows } from "../lib/coverage.ts";
import { languageName } from "../lib/languages.ts";

type Filter = "all" | "needsWork";
type Scope = "site" | "project";

const editorHref = (m: TranslationRow) =>
  m.kind === "page" ? `/sites/${m.siteId}/pages/${m.id}` : `/sites/${m.siteId}/articles/${m.id}`;

/**
 * The coverage rows and columns: the site's languages, or with `scope: "project"` every language
 * of every site of the project the person may open (RFC-0034 §7), a column per site and language.
 */
function useCoverage(siteId: string, scope: Scope, filter: Filter) {
  const { locale } = useI18n();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const own = useQuery({
    queryKey: ["translations", siteId, "all"],
    queryFn: () => api.translations.list(siteId),
    enabled: scope === "site",
  });
  const project = useQuery({
    queryKey: ["translations", siteId, "project"],
    queryFn: () => api.translations.listProject(siteId),
    enabled: scope === "project",
  });
  const locales = site.data?.locales ?? [];
  const columns: CoverageColumn[] =
    scope === "project"
      ? (project.data?.sites ?? []).flatMap((s) =>
          s.locales.map((l) => ({ key: `${s.id}:${l}`, locale: l, siteId: s.id, site: s.name })),
        )
      : locales.map((l) => ({ key: l, locale: l }));
  const loaded =
    scope === "project" ? project.data : site.data && pages.data && entries.data && own.data;
  const rows = loaded
    ? coverageRows({
        uiLocale: locale,
        locales,
        columns,
        nodes: scope === "project" ? [] : [...(pages.data ?? []), ...(entries.data ?? [])],
        translations: (scope === "project" ? project.data?.items : own.data?.items) ?? [],
      }).filter((r) => filter === "all" || r.needsWork)
    : undefined;
  const error =
    site.error ?? pages.error ?? entries.error ?? (scope === "project" ? project.error : own.error);
  return { site, locales, columns, rows, error };
}

/**
 * Site › Translations (RFC-0033 §8): every page and article by language — the coverage view and
 * the work queue. A row needs work when a language has no version, a version is out of date, or
 * a machine translation waits for a person's review (in the editor's translations card).
 */
export function TranslationsPage() {
  const { t, locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const [filter, setFilter] = useState<Filter>("needsWork");
  const [scope, setScope] = useState<Scope>("site");
  const { site, locales, columns, rows, error } = useCoverage(siteId, scope, filter);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const siblings =
    (projects.data?.find((p) => p.sites.some((x) => x.id === siteId))?.sites.length ?? 0) > 1;
  const paging = usePaging<CoverageRow>(rows, (r, q, fold) => fold(r.title).includes(q));
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
            {siblings && (
              <Select
                aria-label={t("coverage.scope")}
                value={scope}
                onValueChange={(v) => setScope(v as Scope)}
                items={{ site: t("coverage.thisSite"), project: t("coverage.allSites") }}
                render={<Toolbar.Button />}
              />
            )}
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
      {site.data && scope === "site" && locales.length < 2 ? (
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
                {columns.map((c) => (
                  <Table.Head key={c.key}>
                    {c.site
                      ? t("coverage.siteLanguage", {
                          site: c.site,
                          language: languageName(locale, c.locale),
                        })
                      : languageName(locale, c.locale)}
                  </Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            {rows === undefined ? (
              <TableSkeleton columns={Math.max(columns.length, 1) + 1} />
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
                    {columns.map((c) => (
                      <Table.Cell key={c.key} data-locale={c.key}>
                        <CoverageCell member={r.cells[c.key]} />
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
function CoverageCell({ member }: { member: TranslationRow | undefined }) {
  const { t } = useI18n();
  if (!member)
    return (
      <Text as="span" variant="secondary" size="sm">
        {t("coverage.missing")}
      </Text>
    );
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Link href={editorHref(member)} variant="inline" aria-label={member.title}>
        <Status status={member.status} />
      </Link>
      {member.stale && <Badge variant="warning">{t("translations.stale")}</Badge>}
      {member.method === "machine" && <Badge variant="outline">{t("coverage.toReview")}</Badge>}
    </span>
  );
}

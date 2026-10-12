import {
  Badge,
  Button,
  Code,
  Columns,
  InlineCopyText,
  Link,
  LinkButton,
  PageLayout,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  Table,
  Text,
} from "@cloudhal/ui";
import { Article, FileText, Plus, TerminalWindow } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CommentsWaitingBanner } from "../components/CommentsWaitingBanner.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { PendingApprovalsBanner } from "../components/PendingApprovalsBanner.tsx";
import { OverviewAnalyticsCard } from "../components/Readers.tsx";
import { RecentActivity } from "../components/RecentActivity.tsx";
import { Status } from "../components/Status.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function SiteOverviewPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
  });
  const createPage = useMutation({
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
  const order = new Map((site.data?.pageIds ?? []).map((id, i) => [id, i]));
  const topPages = [...(pages.data ?? [])]
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
    .slice(0, 5);
  const recent = [...(entries.data ?? [])]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const viewAll = (href: string) => (
    <LinkButton href={href} variant="ghost" size="sm">
      {t("overview.viewAll")}
    </LinkButton>
  );
  const newPage = (
    <Button
      variant="secondary"
      icon={<Plus />}
      onClick={() => createPage.mutate()}
      loading={createPage.isPending}
    >
      {t("overview.newPage")}
    </Button>
  );

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} />}
      title={site.data?.name}
      loading={site.isPending}
      description={
        site.data
          ? t("site.description", { slug: site.data.slug, locale: site.data.defaultLocale })
          : undefined
      }
      actions={
        <>
          {newPage}
          <Button
            variant="secondary"
            icon={<Article />}
            onClick={() => navigate({ to: "/sites/$siteId/articles", params: { siteId } })}
          >
            {t("articles.newArticle")}
          </Button>
        </>
      }
    >
      <PendingApprovalsBanner siteId={siteId} />
      <CommentsWaitingBanner siteId={siteId} />
      <ErrorBanner error={site.error ?? pages.error ?? entries.error ?? createPage.error} />
      <Columns variant="2-1">
        <div className="grid min-w-0 content-start gap-6">
          <SectionCard
            title={t("overview.pages")}
            icon={<FileText size={16} />}
            actions={viewAll(`/sites/${siteId}/pages`)}
            flush
          >
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("overview.columns.title")}</Table.Head>
                  <Table.Head>{t("overview.columns.path")}</Table.Head>
                  <Table.Head>{t("overview.columns.status")}</Table.Head>
                </Table.Row>
              </Table.Header>
              {pages.isPending ? (
                <TableSkeleton columns={3} rows={3} />
              ) : topPages.length === 0 ? (
                <Table.Body>
                  <Table.Row>
                    <Table.Cell colSpan={3}>
                      <SectionEmpty
                        icon={<FileText size={32} className="text-kumo-inactive" />}
                        title={t("overview.empty")}
                        contents={newPage}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              ) : (
                <Table.Body>
                  {topPages.map((p) => (
                    <Table.Row key={p.id}>
                      <Table.Cell>
                        <Link href={`/sites/${siteId}/pages/${p.id}`} variant="plain">
                          <Text bold as="span">
                            {p.title}
                          </Text>
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Text variant="mono-secondary" as="span">
                          {p.path}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Status status={p.status} />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </SectionCard>
          <SectionCard
            title={t("overview.recentArticles")}
            icon={<Article size={16} />}
            actions={viewAll(`/sites/${siteId}/articles`)}
            flush
          >
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("articles.columns.title")}</Table.Head>
                  <Table.Head>{t("articles.columns.author")}</Table.Head>
                  <Table.Head>{t("articles.columns.status")}</Table.Head>
                </Table.Row>
              </Table.Header>
              {entries.isPending ? (
                <TableSkeleton columns={3} rows={3} />
              ) : recent.length === 0 ? (
                <Table.Body>
                  <Table.Row>
                    <Table.Cell colSpan={3}>
                      <SectionEmpty
                        icon={<Article size={32} className="text-kumo-inactive" />}
                        title={t("articles.empty")}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              ) : (
                <Table.Body>
                  {recent.map((e) => (
                    <Table.Row key={e.id}>
                      <Table.Cell>
                        <Link href={`/sites/${siteId}/articles/${e.id}`} variant="plain">
                          <Text bold as="span">
                            {e.title}
                          </Text>
                        </Link>
                      </Table.Cell>
                      <Table.Cell>{e.author.name ?? e.author.id}</Table.Cell>
                      <Table.Cell>
                        <Status status={e.status} />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </SectionCard>
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <OverviewAnalyticsCard siteId={siteId} />
          <SectionCard
            title={t("overview.status")}
            actions={
              site.data?.publishedSnapshotId ? (
                <Badge variant="success" appearance="dot">
                  {t("overview.live")}
                </Badge>
              ) : (
                <Badge variant="secondary" appearance="dot">
                  {t("overview.notPublished")}
                </Badge>
              )
            }
          >
            {site.isPending || pages.isPending ? (
              <SkeletonLine />
            ) : (
              <dl className="grid divide-y divide-kumo-hairline">
                <StatRow label={t("overview.pages")} value={pages.data?.length ?? 0} />
                <StatRow label={t("nav.articles")} value={entries.data?.length ?? 0} />
                <StatRow label={t("nav.snapshots")} value={snapshots.data?.length ?? 0} />
                {site.data?.publishedSnapshotId && (
                  <StatRow
                    label={t("overview.liveSnapshotLabel")}
                    value={<InlineCopyText>{site.data.publishedSnapshotId}</InlineCopyText>}
                  />
                )}
              </dl>
            )}
          </SectionCard>
          <SectionCard
            title={t("activity.recent")}
            actions={viewAll(`/sites/${siteId}/activity`)}
            flush
          >
            <RecentActivity siteId={siteId} />
          </SectionCard>
          <SectionCard title={t("overview.cli")} icon={<TerminalWindow size={16} />}>
            <Code lang="bash" code={"cloudhal snapshot --publish\ncloudhal build"} />
          </SectionCard>
        </div>
      </Columns>
    </PageLayout>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <Text as="dt" variant="secondary">
        {label}
      </Text>
      <Text as="dd" bold>
        {value}
      </Text>
    </div>
  );
}

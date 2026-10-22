import { BUILT_IN_COLLECTION } from "@cloudhal/core-ts/collections";
import {
  Button,
  Code,
  Columns,
  Link,
  LinkButton,
  PageLayout,
  SectionCard,
  SectionEmpty,
  Table,
  Text,
} from "@cloudhal/ui";
import { Article, FileText, Plus, TerminalWindow } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { CommentsWaitingBanner } from "../components/CommentsWaitingBanner.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { PendingApprovalsBanner } from "../components/PendingApprovalsBanner.tsx";
import { OverviewAnalyticsCard } from "../components/Readers.tsx";
import { RecentActivity } from "../components/RecentActivity.tsx";
import { Status } from "../components/Status.tsx";
import { RecentContentCard } from "../components/site-overview/RecentContentCard.tsx";
import { SiteStatusCard } from "../components/site-overview/SiteStatusCard.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useT, withMessages } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { entryTotal, useCollections } from "../lib/collections.ts";

// "Scheduled work is not running" (RFC-0008 §8.7): its words load only when it shows.
const SchedulerStalledBanner = lazy(() =>
  withMessages(import("../components/SchedulerStalled.tsx"), ["schedules"]),
);

export function SiteOverviewPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const scheduler = useQuery({ queryKey: ["scheduler"], queryFn: api.scheduler, retry: false });
  const s = scheduler.data;
  const stalled = !!s && !s.healthy && (s.state !== "unknown" || s.dueWithin24h);
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const registry = useCollections(siteId);
  const posts = registry.data?.find((c) => c.key === BUILT_IN_COLLECTION);
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
            onClick={() =>
              navigate({
                to: "/sites/$siteId/collections/$collection",
                params: { siteId, collection: BUILT_IN_COLLECTION },
              })
            }
          >
            {t("articles.newArticle")}
          </Button>
        </>
      }
    >
      <PendingApprovalsBanner siteId={siteId} />
      {stalled ? (
        <Suspense fallback={null}>
          <SchedulerStalledBanner siteId={siteId} status={s} />
        </Suspense>
      ) : null}
      <CommentsWaitingBanner siteId={siteId} />
      <ErrorBanner error={site.error ?? pages.error ?? createPage.error} />
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
          <RecentContentCard siteId={siteId} site={site.data} />
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <OverviewAnalyticsCard siteId={siteId} />
          <SiteStatusCard
            siteId={siteId}
            loading={site.isPending || pages.isPending || registry.isPending}
            pages={pages.data?.length ?? 0}
            articles={posts ? entryTotal(posts) : 0}
            snapshots={snapshots.data?.length ?? 0}
          />
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

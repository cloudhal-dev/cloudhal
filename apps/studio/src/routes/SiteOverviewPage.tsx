import {
  Badge,
  Button,
  ClipboardText,
  Code,
  Empty,
  Grid,
  LayerCard,
  Link,
  SkeletonLine,
  Table,
  Text,
} from "@cloudhal/ui";
import { Article, Camera, FileText, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
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
  const section = (title: string, href: string) => (
    <LayerCard.Secondary className="flex items-center justify-between px-5 py-3">
      <Text variant="heading" as="h2">
        {title}
      </Text>
      <Link href={href} variant="plain">
        <Text variant="secondary" size="sm" as="span">
          {t("overview.viewAll")}
        </Text>
      </Link>
    </LayerCard.Secondary>
  );
  return (
    <>
      <ErrorBanner error={pages.error ?? entries.error ?? createPage.error} />
      <Grid variant="2-1" gap="base">
        <div className="grid content-start gap-6">
          <LayerCard className="p-0">
            {section(t("overview.pages"), `/sites/${siteId}/pages`)}
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
                      <Empty
                        size="sm"
                        icon={<FileText size={32} className="text-kumo-inactive" />}
                        title={t("overview.empty")}
                        contents={
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Plus />}
                            onClick={() => createPage.mutate()}
                          >
                            {t("overview.newPage")}
                          </Button>
                        }
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
          </LayerCard>
          <LayerCard className="p-0">
            {section(t("overview.recentArticles"), `/sites/${siteId}/articles`)}
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
                      <Empty
                        size="sm"
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
          </LayerCard>
        </div>
        <div className="grid content-start gap-6">
          <LayerCard className="px-5 py-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Text variant="heading" as="h2">
                  {t("overview.status")}
                </Text>
                {site.data?.publishedSnapshotId ? (
                  <Badge variant="success" appearance="dot">
                    {t("overview.live")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" appearance="dot">
                    {t("overview.notPublished")}
                  </Badge>
                )}
              </div>
              {site.isPending || pages.isPending ? (
                <SkeletonLine />
              ) : (
                <Text variant="secondary" size="sm">
                  {t("overview.counts", {
                    pages: pages.data?.length ?? 0,
                    articles: entries.data?.length ?? 0,
                    snapshots: snapshots.data?.length ?? 0,
                  })}
                </Text>
              )}
              {site.data?.publishedSnapshotId && (
                <ClipboardText size="sm" text={site.data.publishedSnapshotId} />
              )}
            </div>
          </LayerCard>
          <LayerCard className="px-5 py-4">
            <div className="grid gap-3">
              <Text variant="heading" as="h2">
                {t("overview.quickActions")}
              </Text>
              <div className="grid gap-2">
                <Button
                  variant="secondary"
                  icon={<Plus />}
                  onClick={() => createPage.mutate()}
                  loading={createPage.isPending}
                  className="justify-start"
                >
                  {t("overview.newPage")}
                </Button>
                <Button
                  variant="secondary"
                  icon={<Article />}
                  onClick={() => navigate({ to: "/sites/$siteId/articles", params: { siteId } })}
                  className="justify-start"
                >
                  {t("articles.newArticle")}
                </Button>
                <Button
                  variant="secondary"
                  icon={<Camera />}
                  onClick={() => navigate({ to: "/sites/$siteId/snapshots", params: { siteId } })}
                  className="justify-start"
                >
                  {t("commands.createSnapshot")}
                </Button>
              </div>
            </div>
          </LayerCard>
          <LayerCard className="px-5 py-4">
            <div className="grid gap-3">
              <Text variant="heading" as="h2">
                {t("overview.cli")}
              </Text>
              <Code lang="bash" code={"cloudhal snapshot --publish\ncloudhal build"} />
            </div>
          </LayerCard>
        </div>
      </Grid>
    </>
  );
}

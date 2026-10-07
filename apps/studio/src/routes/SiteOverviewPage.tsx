import { Button, Empty, LayerCard, Link, PageHeader, Table, Text } from "@cloudhal/ui";
import { FileText, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { Status } from "../components/Status.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function SiteOverviewPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId/" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
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
  const sorted = [...(pages.data ?? [])].sort(
    (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
  );
  return (
    <div className="grid gap-6">
      <PageHeader
        breadcrumbs={
          <Crumbs
            items={[{ label: t("sites.title"), href: "/sites" }, { label: site.data?.name ?? "…" }]}
          />
        }
        title={site.data?.name ?? "…"}
        description={
          site.data?.publishedSnapshotId
            ? t("overview.liveSnapshot", { id: site.data.publishedSnapshotId })
            : t("overview.notPublished")
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => createPage.mutate()}
            loading={createPage.isPending}
          >
            {t("overview.newPage")}
          </Button>
        }
      />
      <ErrorBanner error={pages.error ?? createPage.error} />
      <section className="grid gap-3">
        <Text variant="heading" as="h2">
          {t("overview.pages")}
        </Text>
        {sorted.length === 0 ? (
          <Empty
            size="sm"
            icon={<FileText size={32} className="text-kumo-inactive" />}
            title={t("overview.empty")}
          />
        ) : (
          <LayerCard className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("overview.columns.title")}</Table.Head>
                  <Table.Head>{t("overview.columns.path")}</Table.Head>
                  <Table.Head>{t("overview.columns.status")}</Table.Head>
                  <Table.Head>{t("overview.columns.rev")}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sorted.map((p) => (
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
                    <Table.Cell>{p.rev}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </LayerCard>
        )}
      </section>
    </div>
  );
}

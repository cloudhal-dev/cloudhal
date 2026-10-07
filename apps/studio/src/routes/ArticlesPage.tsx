import { Button, Empty, LayerCard, Link, PageHeader, Table, Text } from "@cloudhal/ui";
import { Article, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { Status } from "../components/Status.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function ArticlesPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId/articles" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
  });
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
  return (
    <div className="grid gap-6">
      <PageHeader
        breadcrumbs={
          <Crumbs
            items={[
              { label: t("sites.title"), href: "/sites" },
              { label: site.data?.name ?? "…", href: `/sites/${siteId}` },
              { label: t("articles.title") },
            ]}
          />
        }
        title={t("articles.title")}
        description={t("articles.description")}
        actions={newButton}
      />
      <ErrorBanner error={entries.error ?? create.error} />
      {entries.data?.length === 0 ? (
        <Empty
          icon={<Article size={48} className="text-kumo-inactive" />}
          title={t("articles.empty")}
          description={t("articles.emptyDescription")}
          contents={newButton}
        />
      ) : (
        <LayerCard className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("articles.columns.title")}</Table.Head>
                <Table.Head>{t("articles.columns.slug")}</Table.Head>
                <Table.Head>{t("articles.columns.author")}</Table.Head>
                <Table.Head>{t("articles.columns.status")}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.data?.map((e) => (
                <Table.Row key={e.id}>
                  <Table.Cell>
                    <Link href={`/sites/${siteId}/articles/${e.id}`} variant="plain">
                      <Text bold as="span">
                        {e.title}
                      </Text>
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <Text variant="mono-secondary" as="span">
                      /{e.collection}/{e.slug}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{e.author.name ?? e.author.id}</Table.Cell>
                  <Table.Cell>
                    <Status status={e.status} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </LayerCard>
      )}
    </div>
  );
}

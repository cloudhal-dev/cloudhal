import {
  Badge,
  Code,
  Empty,
  LayerCard,
  Link,
  Pagination,
  ResourceListPage,
  Surface,
  Table,
  Text,
} from "@cloudhal/ui";
import { Globe } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export function SitesPage() {
  const t = useT();
  const navigate = useNavigate();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  const paging = usePaging(
    sites.data,
    (s, q) => s.name.toLowerCase().includes(q) || s.slug.includes(q),
  );
  return (
    <ResourceListPage
      title={t("sites.title")}
      description={t("sites.description")}
      icon={<Globe size={32} className="text-kumo-subtle" />}
      usage={
        <Surface className="grid gap-3 rounded-lg px-5 py-4 ring ring-kumo-line">
          <div className="grid gap-1.5">
            <Text variant="heading" as="h2">
              {t("sites.usageTitle")}
            </Text>
            <Text variant="secondary">{t("sites.usageDescription")}</Text>
          </div>
          <Code lang="bash" code={"cloudhal init my-site\ncloudhal dev\ncloudhal studio"} />
        </Surface>
      }
    >
      <div className="grid gap-4">
        <ErrorBanner error={sites.error} />
        <ListToolbar
          search={paging.search}
          onSearch={paging.setSearch}
          placeholder={t("sites.search")}
        />
        {sites.data?.length === 0 ? (
          <Empty
            icon={<Globe size={48} className="text-kumo-inactive" />}
            title={t("sites.empty")}
            description={t("sites.emptyDescription")}
            commandLine="cloudhal init my-site"
          />
        ) : (
          <LayerCard className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("sites.columns.name")}</Table.Head>
                  <Table.Head>{t("sites.columns.slug")}</Table.Head>
                  <Table.Head>{t("sites.columns.pages")}</Table.Head>
                  <Table.Head>{t("sites.columns.status")}</Table.Head>
                  <Table.Head />
                </Table.Row>
              </Table.Header>
              {sites.isPending ? (
                <TableSkeleton columns={5} />
              ) : (
                <Table.Body>
                  {paging.pageItems.map((site) => (
                    <Table.Row key={site.id}>
                      <Table.Cell>
                        <Link href={`/sites/${site.id}`} variant="plain">
                          <Text bold as="span">
                            {site.name}
                          </Text>
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Text variant="mono-secondary" as="span">
                          /{site.slug}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{site.pageIds.length}</Table.Cell>
                      <Table.Cell>
                        {site.publishedSnapshotId ? (
                          <Badge variant="success" appearance="dot">
                            {t("common.live")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" appearance="dot">
                            {t("sites.notPublished")}
                          </Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <RowMenu
                          onOpen={() =>
                            navigate({ to: "/sites/$siteId", params: { siteId: site.id } })
                          }
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
        {paging.total > paging.perPage && (
          <Pagination
            page={paging.page}
            perPage={paging.perPage}
            totalCount={paging.total}
            setPage={paging.setPage}
            controls="simple"
          />
        )}
      </div>
    </ResourceListPage>
  );
}

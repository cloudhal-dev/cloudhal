import {
  Badge,
  Code,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  SectionCard,
  Table,
  Text,
} from "@cloudhal/ui";
import { CaretRight, Globe, TerminalWindow } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

/** Account surface › Sites (DESIGN.md §2a). Sites are created with the CLI, so there is no create action. */
export function SitesPage() {
  const t = useT();
  const navigate = useNavigate();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  const paging = usePaging(
    sites.data,
    (s, q, fold) => fold(s.name).includes(q) || s.slug.includes(q),
  );
  const open = (siteId: string) => navigate({ to: "/sites/$siteId", params: { siteId } });
  return (
    <PageLayout
      crumbs={<Crumbs trail={[{ label: t("sites.title") }]} />}
      icon={<Globe size={24} />}
      title={t("sites.title")}
      description={t("sites.description")}
      aside={
        <SectionCard
          title={t("sites.usageTitle")}
          icon={<TerminalWindow size={16} />}
          description={t("sites.usageDescription")}
        >
          <Code lang="bash" code={"cloudhal init my-site\ncloudhal dev\ncloudhal studio"} />
        </SectionCard>
      }
    >
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
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("sites.columns.name")}</Table.Head>
                <Table.Head>{t("sites.columns.slug")}</Table.Head>
                <Table.Head>{t("sites.columns.pages")}</Table.Head>
                <Table.Head>{t("sites.columns.status")}</Table.Head>
                <Table.Head sticky="right" />
              </Table.Row>
            </Table.Header>
            {sites.isPending ? (
              <TableSkeleton columns={5} />
            ) : (
              <Table.Body>
                {paging.pageItems.map((site) => (
                  <Table.Row key={site.id} className="cursor-pointer" onClick={() => open(site.id)}>
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
                    <Table.Cell sticky="right" className="w-12 text-right">
                      <CaretRight size={16} className="text-kumo-subtle" aria-hidden />
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
    </PageLayout>
  );
}

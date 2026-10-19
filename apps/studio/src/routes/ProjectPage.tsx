import { formatNumber } from "@cloudhal/messages/format";
import {
  Badge,
  Button,
  Columns,
  Empty,
  Link,
  PageLayout,
  SectionCard,
  Table,
  Text,
} from "@cloudhal/ui";
import { ChartBar, FolderSimple, Globe, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { NewSiteDialog } from "../components/NewSiteDialog.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useGate } from "../components/useMe.ts";
import { listOf, useI18n } from "../i18n/index.tsx";
import { api, type ProjectSite } from "../lib/api.ts";
import { languageName } from "../lib/languages.ts";

/**
 * Account surface › a project (RFC-0034 §7): its sites side by side — languages, address, publish
 * state and approvals waiting — and "New site in this project". Only the sites the person may
 * open are listed.
 */
export function ProjectPage() {
  const { t } = useI18n();
  const { projectId } = useParams({ from: "/account/projects/$projectId" });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const project = projects.data?.find((p) => p.id === projectId);
  const create = useGate("sites.create");
  const [creating, setCreating] = useState(false);
  const title = project?.name ?? t("projects.title");
  return (
    <PageLayout
      crumbs={<Crumbs trail={[{ label: t("sites.title"), href: "/sites" }, { label: title }]} />}
      icon={<FolderSimple size={24} />}
      title={title}
      description={t("projects.description")}
      actions={
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          disabled={!create.allowed}
          title={create.reason}
          onClick={() => setCreating(true)}
        >
          {t("projects.newSite")}
        </Button>
      }
    >
      <ErrorBanner error={projects.error} />
      {projects.data && !project ? (
        <Empty
          icon={<FolderSimple size={48} className="text-kumo-inactive" />}
          title={t("projects.notFound")}
          description={t("projects.notFoundDescription")}
        />
      ) : (
        <Columns variant="2-1">
          <SectionCard title={t("projects.sites")} icon={<Globe size={16} />} flush>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("projects.columns.site")}</Table.Head>
                  <Table.Head>{t("projects.columns.languages")}</Table.Head>
                  <Table.Head>{t("projects.columns.address")}</Table.Head>
                  <Table.Head>{t("projects.columns.status")}</Table.Head>
                  <Table.Head>{t("projects.columns.approvals")}</Table.Head>
                </Table.Row>
              </Table.Header>
              {projects.isPending ? (
                <TableSkeleton columns={5} />
              ) : (
                <Table.Body>
                  {(project?.sites ?? []).map((site) => (
                    <ProjectSiteRow key={site.id} site={site} />
                  ))}
                </Table.Body>
              )}
            </Table>
          </SectionCard>
          <ProjectSummary sites={project?.sites ?? []} />
        </Columns>
      )}
      <NewSiteDialog open={creating} onOpenChange={setCreating} projectId={projectId} />
    </PageLayout>
  );
}

/** Totals for the project: sites, languages, live sites and approvals waiting. */
function ProjectSummary({ sites }: { sites: readonly ProjectSite[] }) {
  const { t, locale } = useI18n();
  const languages = new Set(sites.flatMap((s) => s.locales)).size;
  const rows: [string, number][] = [
    [t("projects.summary.sites"), sites.length],
    [t("projects.summary.languages"), languages],
    [t("projects.summary.live"), sites.filter((s) => s.published).length],
    [t("projects.summary.waiting"), sites.reduce((n, s) => n + s.pendingApprovals, 0)],
  ];
  return (
    <SectionCard title={t("projects.summary.title")} icon={<ChartBar size={16} />}>
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <Text as="span" variant="secondary">
              {label}
            </Text>
            <Text as="span" bold>
              {formatNumber(locale, value)}
            </Text>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

function ProjectSiteRow({ site }: { site: ProjectSite }) {
  const { t, locale } = useI18n();
  return (
    <Table.Row data-site-id={site.id}>
      <Table.Cell>
        <Link href={`/sites/${site.id}`} variant="plain">
          <Text bold as="span">
            {site.name}
          </Text>
        </Link>
      </Table.Cell>
      <Table.Cell>
        <Text as="span">{listOf(site.locales.map((l) => languageName(locale, l)))}</Text>
      </Table.Cell>
      <Table.Cell>
        {site.host ? (
          <Text variant="mono-secondary" as="span">
            {site.host}
          </Text>
        ) : (
          <Text variant="secondary" as="span">
            {t("projects.noAddress")}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        {site.published ? (
          <Badge variant="success" appearance="dot">
            {t("common.live")}
          </Badge>
        ) : (
          <Badge variant="secondary" appearance="dot">
            {t("sites.notPublished")}
          </Badge>
        )}
      </Table.Cell>
      <Table.Cell>
        {site.pendingApprovals > 0 ? (
          <Link href={`/sites/${site.id}/approvals`}>
            {t("projects.waiting", { count: site.pendingApprovals })}
          </Link>
        ) : (
          <Text variant="secondary" as="span">
            {t("projects.none")}
          </Text>
        )}
      </Table.Cell>
    </Table.Row>
  );
}

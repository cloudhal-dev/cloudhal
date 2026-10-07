import { Badge, Button, Empty, LayerCard, Link, ResourceListPage, Table, Text } from "@cloudhal/ui";
import { Globe, SignOut } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { authClient } from "../lib/auth.ts";

export function SitesPage() {
  const t = useT();
  const navigate = useNavigate();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  return (
    <ResourceListPage
      title={t("sites.title")}
      description={t("sites.description")}
      icon={<Globe size={28} className="text-kumo-subtle" />}
      additionalContent={
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitch />
          <Button
            variant="ghost"
            size="sm"
            icon={<SignOut />}
            onClick={async () => {
              await authClient.signOut();
              await navigate({ to: "/login" });
            }}
          >
            {t("common.signOut")}
          </Button>
        </div>
      }
    >
      <ErrorBanner error={sites.error} />
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
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sites.data?.map((site) => (
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
                      <Badge variant="success">{t("common.live")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("sites.notPublished")}</Badge>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </LayerCard>
      )}
    </ResourceListPage>
  );
}

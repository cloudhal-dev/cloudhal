import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { Link, LinkButton, SectionCard, SectionEmpty, Table, Text } from "@cloudhal/ui";
import { Article } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { collectionName, entryTotal, useCollections } from "../../lib/collections.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { ErrorBanner } from "../ErrorBanner.tsx";
import { Status } from "../Status.tsx";
import { TableSkeleton } from "../TableSkeleton.tsx";

/** Rows the card shows. */
export const RECENT_ROWS = 5;

/** The `count` most recently changed entries, of every collection. */
export function recentEntries(entries: readonly ContentEntry[], count = RECENT_ROWS) {
  return [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, count);
}

/**
 * The overview's "Recent content" (RFC-0040 §4): the latest entries across the registry's
 * collections, each with its collection's name (as the sidebar names it) and a link to its editor.
 * One request for every entry, and none while the registry counts no entry at all.
 */
export function RecentContentCard({ siteId, site }: { siteId: string; site: Site | undefined }) {
  const { t, locale } = useI18n();
  const registry = useCollections(siteId);
  const total = (registry.data ?? []).reduce((n, c) => n + entryTotal(c), 0);
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: total > 0,
  });
  const recent = recentEntries(entries.data ?? []);
  const error = registry.error ?? entries.error;
  const pending = registry.isPending || (total > 0 && entries.isPending);
  const row = (content: ReactNode) => (
    <Table.Body>
      <Table.Row>
        <Table.Cell colSpan={3}>{content}</Table.Cell>
      </Table.Row>
    </Table.Body>
  );
  return (
    <SectionCard
      title={t("overview.recentContent")}
      icon={<Article size={16} />}
      actions={
        <LinkButton href={`/sites/${siteId}/collections`} variant="ghost" size="sm">
          {t("overview.viewAll")}
        </LinkButton>
      }
      flush
    >
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t("overview.columns.title")}</Table.Head>
            <Table.Head>{t("overview.columns.collection")}</Table.Head>
            <Table.Head>{t("overview.columns.status")}</Table.Head>
          </Table.Row>
        </Table.Header>
        {error ? (
          row(<ErrorBanner error={error} />)
        ) : pending ? (
          <TableSkeleton columns={3} rows={3} />
        ) : recent.length === 0 ? (
          row(
            <SectionEmpty
              icon={<Article size={32} className="text-kumo-inactive" />}
              title={t("overview.recentEmpty")}
            />,
          )
        ) : (
          <Table.Body>
            {recent.map((e) => (
              <Table.Row key={e.id} data-collection={e.collection}>
                <Table.Cell>
                  <Link href={entryHref(siteId, e.id, e.collection)} variant="plain">
                    <Text bold as="span">
                      {e.title || t("articles.untitled")}
                    </Text>
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Text variant="secondary" as="span">
                    {collectionName(site, e.collection, locale, t("nav.articles"))}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Status status={e.status} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        )}
      </Table>
    </SectionCard>
  );
}

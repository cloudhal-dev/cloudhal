import type { Site } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts/permalinks";
import { DirectionalIcon, InsetPanel, LinkButton, Loader, Select, Text } from "@cloudhal/ui";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { listingsApi } from "../../lib/api/listings.ts";
import { api } from "../../lib/api.ts";
import { CodeHighlighted } from "../CodeHighlighted.tsx";
import { ErrorBanner } from "../ErrorBanner.tsx";

const RICH_RESULTS = "https://search.google.com/test/rich-results?url=";
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * The JSON-LD a chosen entry's page emits with the saved preset (`GET …/structured-data`, the
 * renderer's own builder), why it emits none, and — for a published entry on a site with a domain —
 * a link to Google's Rich Results Test for its public address.
 */
export function StructuredDataPreview({ site, collection }: { site: Site; collection: string }) {
  const { t } = useI18n("listings");
  const sd = "listings.structuredData";
  const entries = useQuery({
    queryKey: ["entries", site.id, collection],
    queryFn: () => api.entries.list(site.id, collection),
  });
  const [entryId, setEntryId] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["structured-data", site.id, entryId, site.rev],
    queryFn: () => listingsApi.structuredData(site.id, entryId ?? ""),
    enabled: entryId !== null,
  });
  const entry = entries.data?.find((e) => e.id === entryId);
  const list = (entries.data ?? []).slice(0, 100);
  const origin = preview.data?.origin;
  const testUrl =
    entry && origin && !LOCAL.test(origin) && entry.status === "published"
      ? `${RICH_RESULTS}${encodeURIComponent(`${origin}${entryPath(site, entry)}`)}`
      : undefined;
  const issues = preview.data?.issues ?? [];
  return (
    <InsetPanel>
      <div className="grid gap-4" data-testid="structured-data-preview">
        <div className="grid gap-1.5">
          <Text bold as="span">
            {t(`${sd}.preview`)}
          </Text>
          <Text variant="secondary" size="sm">
            {t(`${sd}.previewDescription`)}
          </Text>
        </div>
        {entries.data && list.length === 0 ? (
          <Text variant="secondary">{t(`${sd}.previewEmpty`)}</Text>
        ) : (
          <Select
            className="w-full"
            label={t(`${sd}.previewEntry`)}
            placeholder={t(`${sd}.previewChoose`)}
            value={entryId}
            onValueChange={(v) => setEntryId(v as string)}
            items={Object.fromEntries(list.map((e) => [e.id, `${e.title} · ${e.locale}`]))}
            loading={entries.isPending}
            data-testid="preview-entry"
          />
        )}
        <ErrorBanner error={preview.error} size="sm" />
        {preview.isFetching && <Loader />}
        {preview.data && (
          <div className="grid gap-3">
            {issues.map((i) => (
              <Text
                key={`${i.path}:${i.code}`}
                variant={i.warning ? "secondary" : "error"}
                size="sm"
              >
                {t(`${sd}.issues.${i.code}` as `${typeof sd}.issues.required_value_missing`, {
                  path: i.path.split("/").pop() ?? i.path,
                })}
              </Text>
            ))}
            {preview.data.document ? (
              <CodeHighlighted
                code={JSON.stringify(preview.data.document, null, 2)}
                lang="json"
                showCopyButton
              />
            ) : (
              <Text variant="secondary">{t(`${sd}.noDocument`)}</Text>
            )}
            {testUrl && (
              <div>
                <LinkButton
                  href={testUrl}
                  external
                  variant="secondary"
                  icon={<DirectionalIcon icon={ArrowSquareOut} />}
                >
                  {t(`${sd}.richResults`)}
                </LinkButton>
              </div>
            )}
          </div>
        )}
      </div>
    </InsetPanel>
  );
}

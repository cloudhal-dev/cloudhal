import type { Site } from "@cloudhal/core-contracts";
import { Banner, InsetPanel, Link, Text } from "@cloudhal/ui";
import { LinkBreak } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/index.tsx";
import { referencesApi } from "../../lib/api/references.ts";
import { api } from "../../lib/api.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { referrerFieldWords } from "../../lib/field-references.ts";
import { languageName } from "../../lib/languages.ts";

const SHOWN = 5;

/**
 * The publish dialog's reference warnings for a site whose collections define reference or list
 * fields; other sites render nothing and never load the `fields` words.
 */
export function ReferenceWarnings(props: {
  siteId: string;
  open: boolean;
  onNavigate: () => void;
}) {
  const site = useQuery({
    queryKey: ["site", props.siteId],
    queryFn: () => api.sites.get(props.siteId),
    enabled: props.open,
  });
  const holds = Object.values(site.data?.collections ?? {}).some((c) =>
    (c?.fields ?? []).some((d) => d.type === "reference" || d.type === "repeater"),
  );
  if (!site.data || !holds) return null;
  return <PublishWarnings site={site.data} open={props.open} onNavigate={props.onNavigate} />;
}

/**
 * The publish dialog's reference warnings (RFC-0045 §2 "Publish warns, never fails"): published
 * entries whose references will show nothing once this publish goes live (`GET
 * …/entries/reference-issues`, `referenceIssues` over the working copy) — the target is missing,
 * not shown (a draft, archived or gated), or has no version in the entry's language. Up to five,
 * each linked to its editor; publishing goes ahead either way.
 */
export function PublishWarnings({
  site,
  open,
  onNavigate,
}: {
  site: Site;
  open: boolean;
  /** Following a link closes the dialog. */
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n("fields");
  const issues = useQuery({
    queryKey: ["reference-issues", site.id],
    queryFn: () => referencesApi.issues(site.id),
    enabled: open,
  });
  const data = issues.data;
  if (!data || data.total === 0) return null;
  return (
    <div className="grid gap-2" data-testid="publish-reference-warnings">
      <Banner
        variant="alert"
        size="sm"
        icon={<LinkBreak weight="bold" />}
        title={t("fields.publish.title", { count: data.total })}
        description={t("fields.publish.description")}
      />
      <InsetPanel>
        {data.issues.slice(0, SHOWN).map((i) => {
          const field = i.path.split("/").slice(1);
          const words = referrerFieldWords(
            site,
            i.collection,
            field.length > 2 ? `${field[0]}.${field[2]}` : (field[0] ?? ""),
            locale,
          );
          return (
            <span key={`${i.entryId} ${i.path}`} className="grid gap-0.5" data-issue={i.reason}>
              <Link href={entryHref(site.id, i.entryId, i.collection)} onClick={onNavigate}>
                {i.title}
              </Link>
              <Text variant="secondary" size="sm" as="span">
                {t("fields.publish.issue", {
                  language: languageName(locale, i.locale),
                  field: words.sub
                    ? t("fields.usedBy.subField", { field: words.field, sub: words.sub })
                    : words.field,
                  reason: i.reason,
                })}
              </Text>
            </span>
          );
        })}
        {data.total > SHOWN && (
          <Text variant="secondary" size="sm" as="span">
            {t("fields.delete.more", { count: data.total - SHOWN })}
          </Text>
        )}
      </InsetPanel>
    </div>
  );
}

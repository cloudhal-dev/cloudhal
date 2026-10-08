import type { ContentEntry, Taxonomy } from "@cloudhal/core-contracts";
import { taxonomyReport } from "@cloudhal/core-ts/taxonomy-report";
import { Badge, Button, SectionCard, SectionEmpty, Text } from "@cloudhal/ui";
import { ArrowsMerge, Heartbeat, Sparkle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";
import { appliesTo } from "../lib/taxonomy.ts";
import type { TaxonomyData } from "./Taxonomy.tsx";

const SHOWN = 3;

/**
 * Vocabulary health of one taxonomy (DESIGN.md §2p), from `taxonomyReport` — the same report
 * agents read through MCP `taxonomy_report`: near-duplicates with a one-click merge, single-use
 * terms, empty and oversized categories, the proposed backlog and articles without a category.
 */
export function TaxonomyHealthCard({
  tax,
  data,
  entries,
  onMerge,
  onReview,
}: {
  tax: Taxonomy;
  data: TaxonomyData;
  /** The site's articles, for "articles without a category". */
  entries: readonly ContentEntry[] | undefined;
  onMerge: (sourceId: string, targetId: string) => void;
  onReview: () => void;
}) {
  const t = useT();
  const items = data.itemsOf(tax);
  const byId = new Map(items.map((i) => [i.term.id, i.term]));
  const applicable = (entries ?? []).filter((e) => appliesTo(tax, e.collection));
  const report = taxonomyReport({
    hierarchical: tax.hierarchical,
    terms: items.map((i) => i.term),
    usage: new Map(items.map((i) => [i.term.id, i.usage])),
    entries: applicable.length,
    locale: data.defaultLocale,
  });
  const names = (ids: readonly string[]) =>
    ids
      .slice(0, 4)
      .map((id) => {
        const term = byId.get(id);
        return term ? data.name(term) : id;
      })
      .join(", ") + (ids.length > 4 ? t("taxonomy.health.andMore", { count: ids.length - 4 }) : "");
  const uncategorised =
    tax.key === "category" ? applicable.filter((e) => !e.terms?.[tax.key]?.ids.length) : [];
  const issues =
    report.nearDuplicates.length +
    report.singleUse.length +
    report.emptyCategories.length +
    report.oversizedCategories.length +
    report.proposed.length +
    uncategorised.length;
  return (
    <SectionCard
      id="health"
      title={t("taxonomy.health.title")}
      icon={<Heartbeat size={16} />}
      description={t("taxonomy.health.description")}
      actions={
        issues > 0 ? (
          <Badge variant="warning">{t("taxonomy.health.issues", { count: issues })}</Badge>
        ) : undefined
      }
      flush={issues === 0}
    >
      {issues === 0 ? (
        <SectionEmpty
          icon={<Sparkle size={32} className="text-kumo-inactive" />}
          title={t("taxonomy.health.clean")}
          description={t("taxonomy.health.cleanDescription")}
        />
      ) : (
        <dl className="-my-3 grid divide-y divide-kumo-hairline" data-testid="health">
          {report.nearDuplicates.length > 0 && (
            <div className="grid gap-2 py-3" data-health="near-duplicates">
              <dt className="grid gap-0.5">
                <Text bold as="span">
                  {t("taxonomy.health.nearDuplicates", { count: report.nearDuplicates.length })}
                </Text>
                <Text variant="secondary" size="sm" as="span">
                  {t("taxonomy.health.nearDuplicatesHint")}
                </Text>
              </dt>
              {report.nearDuplicates.slice(0, SHOWN).map((d) => {
                const source = byId.get(d.source);
                const target = byId.get(d.target);
                if (!source || !target) return null;
                return (
                  <dd
                    key={`${d.source}:${d.target}`}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2"
                    data-merge-suggestion={`${d.source}:${d.target}`}
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <Text as="span" truncate>
                        {t("taxonomy.health.mergeInto", {
                          source: data.name(source),
                          target: data.name(target),
                        })}
                      </Text>
                      <Text variant="secondary" size="sm" as="span">
                        {t(`taxonomy.health.reasons.${d.reason}`)}
                      </Text>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ArrowsMerge />}
                      onClick={() => onMerge(d.source, d.target)}
                    >
                      {t("taxonomy.health.merge")}
                    </Button>
                  </dd>
                );
              })}
              {report.nearDuplicates.length > SHOWN && (
                <Text variant="secondary" size="sm" as="span">
                  {t("taxonomy.health.morePairs", {
                    count: report.nearDuplicates.length - SHOWN,
                  })}
                </Text>
              )}
            </div>
          )}
          {report.proposed.length > 0 && (
            <HealthRow
              id="proposed"
              label={t("taxonomy.health.proposed", { count: report.proposed.length })}
              hint={names(report.proposed)}
              action={
                <Button variant="secondary" size="sm" onClick={onReview}>
                  {t("taxonomy.health.review")}
                </Button>
              }
            />
          )}
          {uncategorised.length > 0 && (
            <HealthRow
              id="uncategorised"
              label={t("taxonomy.health.uncategorised", { count: uncategorised.length })}
              hint={t("taxonomy.health.uncategorisedHint")}
            />
          )}
          {report.singleUse.length > 0 && (
            <HealthRow
              id="single-use"
              label={t("taxonomy.health.singleUse", { count: report.singleUse.length })}
              hint={names(report.singleUse)}
            />
          )}
          {report.emptyCategories.length > 0 && (
            <HealthRow
              id="empty"
              label={t("taxonomy.health.empty", { count: report.emptyCategories.length })}
              hint={`${names(report.emptyCategories)} · ${t("taxonomy.health.emptyHint")}`}
            />
          )}
          {report.oversizedCategories.length > 0 && (
            <HealthRow
              id="oversized"
              label={t("taxonomy.health.oversized", {
                count: report.oversizedCategories.length,
              })}
              hint={`${names(report.oversizedCategories)} · ${t("taxonomy.health.oversizedHint")}`}
            />
          )}
        </dl>
      )}
    </SectionCard>
  );
}

function HealthRow({
  id,
  label,
  hint,
  action,
}: {
  id: string;
  label: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3"
      data-health={id}
    >
      <dt className="grid min-w-0 flex-[1_1_12rem] gap-0.5">
        <Text bold as="span">
          {label}
        </Text>
        <Text variant="secondary" size="sm" as="span">
          {hint}
        </Text>
      </dt>
      {action && <dd className="flex items-center">{action}</dd>}
    </div>
  );
}

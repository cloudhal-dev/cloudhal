import type { ContentEntry, Taxonomy, Term } from "@cloudhal/core-contracts";
import { Banner, SectionCard, TagInput } from "@cloudhal/ui";
import { ClockCounterClockwise, Tag } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { appliesTo, assignmentOf, withAssignment } from "../lib/taxonomy.ts";
import { slugify } from "../lib/workflow.ts";
import { type TaxonomyData, taxonomyKeys } from "./Taxonomy.tsx";
import { CategoryPicker, TagPicker } from "./TermPickers.tsx";

/** Taxonomies of an article's collection in editor order: hierarchical ones (categories) first. */
export function editorTaxonomies(taxonomies: readonly Taxonomy[], collection: string): Taxonomy[] {
  const rank = (t: Taxonomy) =>
    t.key === "category" ? 0 : t.key === "tag" ? 1 : t.hierarchical ? 2 : 3;
  return taxonomies
    .filter((t) => appliesTo(t, collection))
    .sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/**
 * Article › Categories and tags (DESIGN.md §2p). On a site with taxonomies: a tree-aware category
 * `Combobox` (required where the taxonomy says so, with the primary marked) and a tag
 * `Autocomplete` per flat taxonomy; the article saves `terms`. On a site not migrated yet the
 * legacy `tags` stay editable as before.
 */
export function ArticleTermsCard({
  entry,
  onChange,
  data,
  missing,
}: {
  entry: ContentEntry;
  onChange: (entry: ContentEntry) => void;
  data: TaxonomyData;
  /** Required taxonomies whose primary term is missing for the status being saved. */
  missing: readonly string[];
}) {
  const t = useT();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const taxonomies = data.taxonomies.data;
  const migrated = (taxonomies?.length ?? 0) > 0;
  const list = migrated ? editorTaxonomies(taxonomies ?? [], entry.collection) : [];

  const createTag = async (tax: Taxonomy, name: string, slug: string): Promise<Term> => {
    const { term } = await api.terms.create(entry.siteId, {
      taxonomyId: tax.id,
      slug,
      status: "active",
      visibility: "public",
      labels: { [data.defaultLocale]: { name } },
    });
    await qc.invalidateQueries({ queryKey: taxonomyKeys.terms(entry.siteId) });
    return term;
  };

  return (
    <SectionCard
      id="terms"
      title={t("articleTerms.title")}
      icon={<Tag size={16} />}
      description={migrated ? t("articleTerms.description") : t("articleTerms.legacyDescription")}
    >
      {!migrated ? (
        <TagInput
          label={t("editor.tags")}
          value={entry.tags}
          onValueChange={(tags: string[]) =>
            onChange({
              ...entry,
              tags: [...new Set(tags.map((x) => slugify(x)).filter((x) => x && x !== "untitled"))],
            })
          }
          description={t("editor.tagsHint")}
          className="w-full"
          data-testid="legacy-tags"
        />
      ) : (
        <>
          {entry.tags.length > 0 && (
            <Banner
              variant="secondary"
              size="sm"
              icon={<ClockCounterClockwise weight="fill" />}
              title={t("articleTerms.legacyTitle")}
              description={t("articleTerms.legacyPending", { tags: entry.tags.join(", ") })}
              data-testid="legacy-pending"
            />
          )}
          {list.map((tax) => {
            const value = assignmentOf(entry, tax.key);
            const items = data.itemsOf(tax);
            const label = data.label(tax);
            const error = missing.includes(tax.key)
              ? t("articleTerms.required", {
                  singular: data.label(tax, "singular").toLocaleLowerCase(locale),
                })
              : undefined;
            const set = (next: typeof value) =>
              onChange(withAssignment(entry, tax.key, next, { autoPrimary: tax.hierarchical }));
            return tax.hierarchical ? (
              <CategoryPicker
                key={tax.id}
                tax={tax}
                items={items}
                value={value}
                onChange={set}
                name={data.name}
                label={label}
                required={tax.required}
                error={error}
              />
            ) : (
              <TagPicker
                key={tax.id}
                tax={tax}
                items={items}
                value={value}
                onChange={set}
                onCreate={(name, slug) => createTag(tax, name, slug)}
                name={data.name}
                locale={data.defaultLocale}
                label={label}
                error={error}
              />
            );
          })}
        </>
      )}
    </SectionCard>
  );
}

import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import { Badge, DirectionalIcon, Link, Text, Tooltip } from "@cloudhal/ui";
import {
  ArrowElbowDownRight,
  CheckCircle,
  EyeSlash,
  Hourglass,
  MinusCircle,
} from "@phosphor-icons/react";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useI18n, useT } from "../i18n/index.tsx";
import { api, type TermListItem, type TermUsage } from "../lib/api.ts";
import {
  archivePath,
  defaultTaxonomies,
  type IndexStatus,
  siteLocales,
  taxonomyLabel,
  termLabel,
} from "../lib/taxonomy.ts";

/** Query keys of the taxonomy data, so every screen shares (and invalidates) the same cache. */
export const taxonomyKeys = {
  taxonomies: (siteId: string) => ["taxonomies", siteId] as const,
  terms: (siteId: string) => ["terms", siteId] as const,
  redirects: (siteId: string) => ["redirects", siteId] as const,
};

/**
 * The site's taxonomies and all its terms with usage (every status), plus naming helpers in the
 * site's default locale. One query each, shared by the taxonomy screen, the pickers, the article
 * list and the snapshot diff.
 */
export function useTaxonomyData(siteId: string, enabled = true) {
  const { locale: uiLocale, t } = useI18n();
  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled,
  });
  const taxonomies = useQuery({
    queryKey: taxonomyKeys.taxonomies(siteId),
    queryFn: () => api.taxonomies.list(siteId),
    enabled,
  });
  const terms = useQuery({
    queryKey: taxonomyKeys.terms(siteId),
    queryFn: () => api.terms.list(siteId),
    enabled: enabled && (taxonomies.data?.length ?? 0) > 0,
  });
  const locales = siteLocales(site.data);
  const defaultLocale = site.data?.defaultLocale ?? "en";
  const items = terms.data ?? [];
  const byId = new Map(items.map((i) => [i.term.id, i]));
  /**
   * A taxonomy's label in Studio's language: the site's own label in that language, else
   * Studio's word for the default `category`/`tag`, else the site's label (custom taxonomies).
   */
  const label = (tax: Pick<Taxonomy, "labels" | "key">, form: "singular" | "plural" = "plural") =>
    tax.labels[uiLocale]
      ? taxonomyLabel(tax, [uiLocale], form)
      : tax.key === "category" || tax.key === "tag"
        ? t(`taxonomy.defaults.${tax.key}.${form}`)
        : taxonomyLabel(tax, [uiLocale, defaultLocale, ...locales], form);
  return {
    site,
    taxonomies,
    terms,
    items,
    byId,
    defaultLocale,
    locales,
    defaults: defaultTaxonomies(taxonomies.data ?? []),
    /** A term's name in the site's default locale. */
    name: (term: Pick<Term, "labels" | "slug">) => termLabel(term, defaultLocale, ...locales),
    label,
    /** The singular label's declared forms (`forms` in `en.ts`): lower-case in sentences, as is. */
    singularForms: (tax: Pick<Taxonomy, "labels" | "key"> | undefined) => {
      const Singular = tax ? label(tax, "singular") : "";
      return { singular: Singular.toLocaleLowerCase(uiLocale), Singular };
    },
    itemsOf: (tax: Pick<Taxonomy, "id"> | undefined): TermListItem[] =>
      tax ? items.filter((i) => i.term.taxonomyId === tax.id) : [],
    usage: (id: string): TermUsage => byId.get(id)?.usage ?? { total: 0, published: 0 },
  };
}

export type TaxonomyData = ReturnType<typeof useTaxonomyData>;

/** After a taxonomy change: terms, taxonomies, articles, redirects and snapshots may all move. */
export async function invalidateTaxonomy(qc: QueryClient, siteId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: taxonomyKeys.terms(siteId) }),
    qc.invalidateQueries({ queryKey: taxonomyKeys.taxonomies(siteId) }),
    qc.invalidateQueries({ queryKey: taxonomyKeys.redirects(siteId) }),
    qc.invalidateQueries({ queryKey: ["entries", siteId] }),
    qc.invalidateQueries({ queryKey: ["entry", siteId] }),
    qc.invalidateQueries({ queryKey: ["term", siteId] }),
    qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
  ]);
}

/**
 * A term's state next to its name: proposed (waiting for a person), internal (no public URL),
 * retired (merged into another term, or gone). Active public terms show nothing.
 */
export function TermStateBadges({
  term,
  mergedInto,
}: {
  term: Term;
  /** Name of the term it was merged into. */
  mergedInto?: string | undefined;
}) {
  const t = useT();
  return (
    <>
      {term.status === "proposed" && (
        <Tooltip content={t("taxonomy.state.proposedHint")}>
          <span className="inline-flex" data-term-state="proposed">
            <Badge variant="warning" icon={<Hourglass />}>
              {t("taxonomy.state.proposed")}
            </Badge>
          </span>
        </Tooltip>
      )}
      {term.status !== "retired" && term.visibility === "internal" && (
        <Tooltip content={t("taxonomy.state.internalHint")}>
          <span className="inline-flex" data-term-state="internal">
            <Badge variant="outline" icon={<EyeSlash />}>
              {t("taxonomy.state.internal")}
            </Badge>
          </span>
        </Tooltip>
      )}
      {term.status === "retired" && (
        <span className="inline-flex" data-term-state="retired">
          <Badge variant="secondary">
            {mergedInto
              ? t("taxonomy.state.mergedInto", { name: mergedInto })
              : t("taxonomy.state.retired")}
          </Badge>
        </span>
      )}
    </>
  );
}

/** Name (default locale) over the slug in mono, indented by depth in a category tree. */
export function TermNameCell({
  term,
  tax,
  name,
  depth = 0,
  href,
  mergedInto,
  context,
}: {
  term: Term;
  tax: Taxonomy;
  name: string;
  depth?: number;
  href?: string | undefined;
  mergedInto?: string | undefined;
  /** A muted line under the slug (e.g. "under News" when the parent is filtered out). */
  context?: string | undefined;
}) {
  const title = (
    <Text bold as="span">
      {name}
    </Text>
  );
  return (
    <div
      className="flex min-w-44 items-start gap-2"
      // Tree indentation: one step per level (a style, not a class: the depth is data).
      style={depth > 0 ? { paddingInlineStart: `${(depth - 1) * 1.5}rem` } : undefined}
      data-depth={depth}
    >
      {depth > 0 && (
        <span className="flex h-lh items-center text-kumo-inactive" aria-hidden>
          <DirectionalIcon icon={ArrowElbowDownRight} size={16} />
        </span>
      )}
      <div className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link href={href} variant="plain">
              {title}
            </Link>
          ) : (
            title
          )}
          <TermStateBadges term={term} mergedInto={mergedInto} />
        </span>
        <Text variant="mono-secondary" as="span" truncate>
          {archivePath(tax, term.slug)}
        </Text>
        {context && (
          <Text variant="secondary" size="sm" as="span">
            {context}
          </Text>
        )}
      </div>
    </div>
  );
}

/**
 * Indexing status of a term's archive (RFC-0002 §7): "Indexed", "Not indexed: 1 of 3 posts",
 * "Empty: 404", "noindex", or why it has no archive — each with a tooltip saying what it means.
 */
export function IndexBadge({ status }: { status: IndexStatus }) {
  const t = useT();
  const [variant, text, hint, Icon] = ((): [
    "success" | "neutral" | "warning",
    string,
    string,
    typeof CheckCircle | undefined,
  ] => {
    switch (status.kind) {
      case "indexed":
        return [
          "success",
          t("taxonomy.index.indexed"),
          t("taxonomy.index.indexedHint", { count: status.published }),
          CheckCircle,
        ];
      case "thin":
        return [
          "warning",
          t("taxonomy.index.thin", { count: status.published, min: status.min }),
          t("taxonomy.index.thinHint", { min: status.min }),
          undefined,
        ];
      case "empty":
        return ["neutral", t("taxonomy.index.empty"), t("taxonomy.index.emptyHint"), undefined];
      case "noindex":
        return ["warning", t("taxonomy.index.noindex"), t("taxonomy.index.noindexHint"), undefined];
      case "none":
        return [
          "neutral",
          t(`taxonomy.index.none.${status.reason}`),
          t(`taxonomy.index.noneHint.${status.reason}`),
          MinusCircle,
        ];
    }
  })();
  return (
    <Tooltip content={hint}>
      <span className="inline-flex whitespace-nowrap" data-index={status.kind}>
        {Icon && status.kind === "none" ? (
          <Text variant="secondary" size="sm" as="span">
            {text}
          </Text>
        ) : (
          <Badge variant={variant} appearance="dot">
            {text}
          </Badge>
        )}
      </span>
    </Tooltip>
  );
}

/** Public / Internal, as the visibility column shows it. */
export function VisibilityBadge({ term }: { term: Term }) {
  const t = useT();
  if (term.status === "retired")
    return (
      <Text variant="secondary" size="sm" as="span">
        {t("taxonomy.visibility.none")}
      </Text>
    );
  return term.visibility === "public" ? (
    <Badge variant="info">{t("taxonomy.visibility.public")}</Badge>
  ) : (
    <Badge variant="outline" icon={<EyeSlash />}>
      {t("taxonomy.visibility.internal")}
    </Badge>
  );
}

/** "Categories" / "Tags" for a key, falling back to the key. */
export function useTaxonomyName(data: TaxonomyData) {
  return (key: string, form: "singular" | "plural" = "plural") => {
    const tax = data.taxonomies.data?.find((x) => x.key === key);
    return tax ? data.label(tax, form) : key;
  };
}

/**
 * RFC-0042 §4 "Studio": a collection list's listing-field columns, filters and sort, loaded only
 * for a collection with `listFields` (`LAZY_ONLY`). Values show as readers would read them
 * (`formatFieldValue` in the Studio language); filters and sort live in the URL, and the list asks
 * the API with them (`useCollectionEntries`).
 */
import type { ContentEntry, FieldDefinition, FieldOrder, Site } from "@cloudhal/core-contracts";
import { fieldLabel, formatFieldValue, optionLabel } from "@cloudhal/core-ts/fields";
import { Button, Select, Table, Text, Toolbar } from "@cloudhal/ui";
import { ArrowDown, ArrowsDownUp, ArrowUp } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/index.tsx";
import { listFieldDefs, sortable } from "../../lib/listings.ts";

const ANY = "__any";

/** The filter tokens a field type offers (`lib/listing-query.ts` turns them into conditions). */
function tokensOf(def: FieldDefinition): string[] {
  switch (def.type) {
    case "date":
    case "datetime":
      return ["upcoming", "past", "set", "unset"];
    case "boolean":
      return ["yes", "no"];
    case "select":
      return [...def.options.map((o) => `is:${o.value}`), "unset"];
    default:
      return ["set", "unset"];
  }
}

function useDefs(site: Site, collection: string) {
  const { locale } = useI18n();
  const defs = listFieldDefs(site.collections?.[collection]);
  const label = (def: FieldDefinition) => fieldLabel(def, locale, site.defaultLocale);
  return { defs, label, locale };
}

/** One `Select` per listing field: "Starts: upcoming", "Format: Workshop", "Seats: empty". */
export function ListFieldFilters({
  site,
  collection,
  filters,
  onFilter,
}: {
  site: Site;
  collection: string;
  filters: Readonly<Record<string, string>>;
  onFilter: (field: string, token: string | undefined) => void;
}) {
  const { t } = useI18n("listings");
  const { defs, label, locale } = useDefs(site, collection);
  const words = (def: FieldDefinition, token: string) => {
    const l = label(def);
    if (token.startsWith("is:"))
      return t("listings.filters.is", {
        label: l,
        value: optionLabel(def, token.slice(3), locale, site.defaultLocale),
      });
    return t(`listings.filters.${token as "set"}`, { label: l });
  };
  return (
    <Toolbar aria-label={t("listings.filters.label")}>
      {defs.map((def) => (
        <Select
          key={def.key}
          aria-label={label(def)}
          value={filters[def.key] ?? ANY}
          onValueChange={(v) => onFilter(def.key, v === ANY ? undefined : (v as string))}
          items={Object.fromEntries([
            [ANY, t("listings.filters.any", { label: label(def) })],
            ...tokensOf(def).map((token) => [token, words(def, token)]),
          ])}
          render={<Toolbar.Button />}
          data-testid={`list-filter-${def.key}`}
        />
      ))}
    </Toolbar>
  );
}

/** The columns' headers; number and date columns sort (ascending, descending, off). */
export function ListFieldHeads({
  site,
  collection,
  orderBy,
  onSort,
}: {
  site: Site;
  collection: string;
  orderBy: FieldOrder | undefined;
  onSort: (orderBy: FieldOrder | undefined) => void;
}) {
  const { t } = useI18n("listings");
  const { defs, label } = useDefs(site, collection);
  return defs.map((def) => {
    if (!sortable(def)) return <Table.Head key={def.key}>{label(def)}</Table.Head>;
    const direction = orderBy?.field === def.key ? orderBy.direction : undefined;
    const next: FieldOrder | undefined =
      direction === undefined
        ? { field: def.key, direction: "asc" }
        : direction === "asc"
          ? { field: def.key, direction: "desc" }
          : undefined;
    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowsDownUp;
    return (
      <Table.Head
        key={def.key}
        aria-sort={
          direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined
        }
      >
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon />}
          onClick={() => onSort(next)}
          title={t("listings.filters.sortBy", { label: label(def) })}
          data-testid={`list-sort-${def.key}`}
        >
          <Text bold as="span">
            {label(def)}
          </Text>
        </Button>
      </Table.Head>
    );
  });
}

/** One entry's listing-field values, formatted in the Studio language. */
export function ListFieldCells({
  site,
  collection,
  entry,
}: {
  site: Site;
  collection: string;
  entry: ContentEntry;
}) {
  const { t, locale } = useI18n("listings");
  const { defs } = useDefs(site, collection);
  const words = { yes: t("listings.contentList.yes"), no: t("listings.contentList.no") };
  return defs.map((def) => {
    const text = formatFieldValue(entry.fields?.[def.key], def, {
      locale,
      defaultLocale: site.defaultLocale,
      words,
    });
    return (
      <Table.Cell key={def.key} className="whitespace-nowrap" data-list-cell={def.key}>
        {text ? (
          <Text as="span">{text}</Text>
        ) : (
          <Text variant="secondary" as="span">
            {t("articles.none")}
          </Text>
        )}
      </Table.Cell>
    );
  });
}

import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";

/** Case-folds text for search in the Studio language (Turkish "İ" → "i", not "i̇"). */
export type Fold = (text: string) => string;

/**
 * Client-side search + paging for small lists; the API grows server paging later. `matches` gets
 * the query folded with the Studio locale and the same `fold` for the item's fields.
 */
export function usePaging<T>(
  items: T[] | undefined,
  matches: (item: T, q: string, fold: Fold) => boolean,
  perPage = 25,
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { locale } = useI18n();
  const fold = useCallback<Fold>((text) => text.toLocaleLowerCase(locale), [locale]);
  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return (items ?? []).filter((i) => !q || matches(i, q, fold));
  }, [items, search, matches, fold]);
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  return {
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setPage(1);
    },
    page,
    setPage,
    perPage,
    total: filtered.length,
    pageItems,
  };
}

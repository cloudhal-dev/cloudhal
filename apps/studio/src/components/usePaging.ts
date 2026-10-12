import { useMemo, useState } from "react";

/** Client-side search + paging for small lists; the API grows server paging later. */
export function usePaging<T>(
  items: T[] | undefined,
  matches: (item: T, q: string) => boolean,
  perPage = 25,
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || matches(i, q));
  }, [items, search, matches]);
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

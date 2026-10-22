import { entryPath } from "@cloudhal/core-ts/permalinks";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../lib/api.ts";
import { useSitePermalinks } from "./EntryPath.tsx";

/** Where a same-site path is edited: pages by path, published articles by their permalink. */
export function useEditorByPath(siteId: string, enabled: boolean) {
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled,
  });
  const site = useSitePermalinks(siteId);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pages.data ?? []) map.set(p.path, `/sites/${siteId}/pages/${p.id}`);
    for (const e of entries.data ?? [])
      if (e.status === "published")
        map.set(entryPath(site, e), `/sites/${siteId}/articles/${e.id}`);
    return map;
  }, [pages.data, entries.data, siteId, site]);
}

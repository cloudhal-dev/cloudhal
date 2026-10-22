/**
 * RFC-0040 §4: the palette's "Go to …" command for every collection of the registry, in its order,
 * named as the sidebar names it.
 */
import { BUILT_IN_COLLECTION } from "@cloudhal/core-ts/collections";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { collectionName, useCollections } from "../lib/collections.ts";
import type { PaletteCommand } from "./AppFrame.tsx";

export function useCollectionCommands(siteId: string): PaletteCommand[] {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const keys = (useCollections(siteId).data ?? []).map((c) => c.key);
  return (keys.length ? keys : [BUILT_IN_COLLECTION]).map((collection) => ({
    id: `collection-${collection}`,
    label: t("commands.goCollection", {
      name: collectionName(site.data, collection, locale, t("nav.articles")),
    }),
    run: () =>
      navigate({ to: "/sites/$siteId/collections/$collection", params: { siteId, collection } }),
  }));
}

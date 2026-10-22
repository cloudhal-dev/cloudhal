/**
 * RFC-0040 in Studio: the site's collection registry, each collection's name in Studio's language
 * and its icon from a closed set (`CollectionSettings.icon` is a name, never a URL or markup).
 */
import type { CollectionLabel, Site } from "@cloudhal/core-contracts";
import { BUILT_IN_COLLECTION, collectionLabel } from "@cloudhal/core-ts/collections";
import { Article, Files, type Icon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { CollectionInfo } from "./api/collections.ts";
import { api, onApiWrite } from "./api.ts";

/** The icon names a collection may use, in the order the picker shows them. */
export const COLLECTION_ICON_NAMES = [
  "article",
  "calendar",
  "briefcase",
  "users",
  "images",
  "package",
  "book-open",
  "megaphone",
  "quotes",
  "question",
  "map-pin",
  "files",
] as const;

export type CollectionIconName = (typeof COLLECTION_ICON_NAMES)[number];
export type CollectionIconSet = Readonly<Record<CollectionIconName, Icon>>;

/**
 * The collection's icon: its own (once `icons`, the lazily loaded set, is there), `article` for
 * `posts`, else `files`.
 */
export function collectionIcon(
  info: Pick<CollectionInfo, "key" | "settings">,
  icons?: CollectionIconSet,
): Icon {
  const name = info.settings.icon;
  const own =
    name && icons && Object.hasOwn(icons, name) ? icons[name as CollectionIconName] : undefined;
  return own ?? (info.key === BUILT_IN_COLLECTION ? Article : Files);
}

let iconSet: Promise<CollectionIconSet> | undefined;

/** The icon set, loaded with its first use so the shell's first load does not carry it. */
export function useCollectionIcons(): CollectionIconSet | undefined {
  const [icons, setIcons] = useState<CollectionIconSet>();
  useEffect(() => {
    iconSet ??= import("./collection-icons.ts").then((m) => m.COLLECTION_ICONS);
    let live = true;
    void iconSet.then((set) => live && setIcons(set));
    return () => {
      live = false;
    };
  }, []);
  return icons;
}

/**
 * The collection's labels in `locale`, then the site's default locale; `undefined` when it has
 * none (the caller shows the key, or Studio's own "Articles" for `posts`).
 */
export function collectionNames(
  site: Pick<Site, "collections" | "defaultLocale"> | undefined,
  key: string,
  locale: string,
): CollectionLabel | undefined {
  if (!site?.collections?.[key]?.labels) return undefined;
  return collectionLabel(site, key, locale);
}

/** Entries of every status and locale. */
export function entryTotal(info: Pick<CollectionInfo, "counts">): number {
  return Object.values(info.counts).reduce((a, b) => a + (b ?? 0), 0);
}

export function collectionsQuery(siteId: string) {
  return { queryKey: ["collections", siteId], queryFn: () => api.collections.list(siteId) };
}

/** Writes that can change the registry or its counts: the site, its collections and entries. */
const REGISTRY_WRITE = /^\/api\/sites\/[^/]+(\/collections(\/[^/]+)?|\/entries(\/[^/]+)?)?$/;

/**
 * The registry, shared by the sidebar, the collection screens and the palette. Every write to the
 * site, its collections or its entries through the API client refreshes it (`onApiWrite`).
 */
export function useCollections(siteId: string) {
  const qc = useQueryClient();
  useEffect(
    () =>
      onApiWrite((path) => {
        const bare = path.split("?")[0] ?? path;
        if (bare.startsWith(`/api/sites/${siteId}`) && REGISTRY_WRITE.test(bare))
          void qc.invalidateQueries({ queryKey: ["collections", siteId] });
      }),
    [qc, siteId],
  );
  return useQuery(collectionsQuery(siteId));
}

/** The registry's keys (empty while loading). */
export function useCollectionKeys(siteId: string): string[] {
  return (useCollections(siteId).data ?? []).map((c) => c.key);
}

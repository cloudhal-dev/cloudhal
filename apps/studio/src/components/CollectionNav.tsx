import type { Site } from "@cloudhal/core-contracts";
import { Sidebar } from "@cloudhal/ui";
import { Stack } from "@phosphor-icons/react";
import { useI18n } from "../i18n/index.tsx";
import {
  collectionIcon,
  collectionName,
  entryTotal,
  useCollectionIcons,
  useCollections,
} from "../lib/collections.ts";

/**
 * The sidebar's collections (RFC-0040 §4): one item per collection of the registry, by its plural
 * name in Studio's language, with its entry count, then "Collections", the overview with "New
 * collection". `posts` keeps Studio's own "Articles" until someone names it.
 */
export function CollectionNav({
  siteId,
  site,
  is,
}: {
  siteId: string;
  site: Site | undefined;
  is: (path: string, exact?: boolean) => boolean;
}) {
  const { t, locale } = useI18n();
  const registry = useCollections(siteId);
  const icons = useCollectionIcons();
  const base = `/sites/${siteId}`;
  return (
    <>
      {(registry.data ?? []).map((c) => {
        const href = `${base}/collections/${c.key}`;
        const name = collectionName(site, c.key, locale, t("nav.articles"));
        return (
          <Sidebar.MenuButton
            key={c.key}
            icon={collectionIcon(c, icons)}
            href={href}
            // The list, its settings and its entries' editors (`…/$collection/$entryId`).
            active={is(href, true) || is(`${href}/`)}
            tooltip={name}
          >
            {name}
            <Sidebar.MenuBadge>{entryTotal(c)}</Sidebar.MenuBadge>
          </Sidebar.MenuButton>
        );
      })}
      <Sidebar.MenuButton
        icon={Stack}
        href={`${base}/collections`}
        active={is(`${base}/collections`, true)}
        tooltip={t("nav.collections")}
      >
        {t("nav.collections")}
      </Sidebar.MenuButton>
    </>
  );
}

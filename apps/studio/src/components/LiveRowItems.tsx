/** The list rows' links to the live site: "View live" and "Copy link" (Pages, Articles). */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { DropdownMenu, directional } from "@cloudhal/ui";
import { ArrowSquareOut, Copy } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { absoluteItemUrl, type LiveItem } from "../lib/item-url.ts";
import { openLive, useCopyLink, useLiveSite } from "./useLiveSite.ts";

const OpenOutside = directional(ArrowSquareOut);

/**
 * A list row's "View live" and "Copy link": for a published item on a site that has been
 * published, when a domain serves its locale. The URL carries the item's locale (its `/<locale>`
 * prefix or the locale's own domain).
 */
export function LiveLinkItems({ siteId, item }: { siteId: string; item: LiveItem }) {
  const t = useT();
  const copy = useCopyLink();
  const { origin, liveSnapshotId, site } = useLiveSite(siteId);
  const url = absoluteItemUrl(site, origin, item);
  if (item.status !== "published" || !liveSnapshotId || !url) return null;
  return (
    <>
      <DropdownMenu.Item icon={OpenOutside} onClick={() => openLive(url)}>
        {t("liveSite.viewLive")}
      </DropdownMenu.Item>
      <DropdownMenu.Item icon={Copy} onClick={() => void copy(url)}>
        {t("liveSite.copyLink")}
      </DropdownMenu.Item>
    </>
  );
}

/** A page row's live links. */
export function PageLiveItems({ siteId, page }: { siteId: string; page: Page }) {
  return <LiveLinkItems siteId={siteId} item={page} />;
}

/** An article row's live links. */
export function EntryLiveItems({ siteId, entry }: { siteId: string; entry: ContentEntry }) {
  return <LiveLinkItems siteId={siteId} item={entry} />;
}

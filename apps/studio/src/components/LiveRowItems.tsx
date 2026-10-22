/** The list rows' links to the live site: "View live" and "Copy link" (Pages, Articles). */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts/permalinks";
import { DropdownMenu, directional } from "@cloudhal/ui";
import { ArrowSquareOut, Copy } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { liveUrl } from "../lib/live-site.ts";
import { openLive, useCopyLink, useLiveSite } from "./useLiveSite.ts";

const OpenOutside = directional(ArrowSquareOut);

/**
 * A list row's "View live" and "Copy link": for a published item on a site that has a domain and
 * has been published. `path` undefined: the address is not known (see `EntryLiveItems`).
 */
export function LiveLinkItems({
  siteId,
  path,
  published,
}: {
  siteId: string;
  path: string | undefined;
  published: boolean;
}) {
  const t = useT();
  const copy = useCopyLink();
  const { origin, liveSnapshotId } = useLiveSite(siteId);
  const url = path === undefined ? undefined : liveUrl(origin, path);
  if (!published || !liveSnapshotId || !url) return null;
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

/** A page row's live links (a page's path is already its full site path). */
export function PageLiveItems({ siteId, page }: { siteId: string; page: Page }) {
  return <LiveLinkItems siteId={siteId} path={page.path} published={page.status === "published"} />;
}

/** An article row's live links. */
export function EntryLiveItems({ siteId, entry }: { siteId: string; entry: ContentEntry }) {
  const { site } = useLiveSite(siteId);
  // Locale prefixes for articles come later: a non-default language's address is not known yet.
  const known = site !== undefined && entry.locale === site.defaultLocale;
  return (
    <LiveLinkItems
      siteId={siteId}
      path={known ? entryPath(site, entry) : undefined}
      published={entry.status === "published"}
    />
  );
}

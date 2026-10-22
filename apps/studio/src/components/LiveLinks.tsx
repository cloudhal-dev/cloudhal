/**
 * The shell's links to the live site (its primary domain, `useLiveSite`): the top bar's "View
 * site" and the site switcher's "Open site". The list rows' links are in `LiveRowItems.tsx` and the
 * editors' address in `LiveAddress.tsx`, so they load with their screens, not with the shell.
 */
import { DropdownMenu, directional, LinkButton } from "@cloudhal/ui";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { originHost } from "../lib/live-site.ts";
import { openLive, useLiveSite } from "./useLiveSite.ts";

const OpenOutside = directional(ArrowSquareOut);

/**
 * The top bar's "View site" (left of Publish): opens the primary domain in a new tab, its host in
 * the tooltip. Disabled, saying why, without a domain or before the first publish. Icon-only
 * below `xl`, where the top bar is short of room.
 */
export function ViewSiteButton({ siteId }: { siteId: string }) {
  const t = useT();
  const { origin, liveSnapshotId, loading } = useLiveSite(siteId);
  const reason = loading
    ? undefined
    : !origin
      ? t("liveSite.noDomain")
      : !liveSnapshotId
        ? t("liveSite.notPublished")
        : undefined;
  const ready = !loading && reason === undefined && origin !== undefined;
  return (
    <LinkButton
      href={ready ? `${origin}/` : undefined}
      external
      variant="secondary"
      size="sm"
      icon={OpenOutside}
      disabled={!ready}
      title={reason ?? (origin ? originHost(origin) : undefined)}
      aria-label={t("liveSite.view")}
      data-testid="view-site"
      data-reason={reason}
    >
      <span className="hidden xl:inline">{t("liveSite.view")}</span>
    </LinkButton>
  );
}

/** The site switcher's "Open site", once the site has a domain and is live. */
export function OpenSiteItem({ siteId }: { siteId: string }) {
  const t = useT();
  const { origin, liveSnapshotId } = useLiveSite(siteId);
  if (!origin || !liveSnapshotId) return null;
  return (
    <DropdownMenu.Item icon={OpenOutside} onClick={() => openLive(`${origin}/`)}>
      {t("liveSite.open")}
    </DropdownMenu.Item>
  );
}

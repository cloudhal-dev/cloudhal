/**
 * An editor's full address with copy: "Live at" / "Will be at" (`LiveLinks.tsx` has the shell's
 * and lists' links). Without a domain only the path shows.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts/permalinks";
import { ClipboardText, Text } from "@cloudhal/ui";
import { useT } from "../i18n/index.tsx";
import { liveUrl, servesAt } from "../lib/live-site.ts";
import { useLiveNode, useLiveSite } from "./useLiveSite.ts";

/**
 * An editor's address: "Live at" when the live snapshot serves this item, published, at this very
 * address; "Will be at" otherwise. The full URL is copyable; without a domain (or for an address
 * Studio cannot build yet) only the path shows.
 */
export function LiveAddress({
  path,
  origin,
  live,
}: {
  path: string;
  origin: string | undefined;
  live: boolean;
}) {
  const t = useT();
  const url = liveUrl(origin, path);
  return (
    <div className="grid min-w-0 gap-1.5" data-testid="live-address" data-live={live}>
      <Text size="sm" bold as="span">
        {live ? t("liveSite.liveAt") : t("liveSite.willBeAt")}
      </Text>
      {url ? (
        <ClipboardText
          size="base"
          text={url}
          tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
        />
      ) : (
        <Text variant="mono-secondary" as="span">
          {path}
        </Text>
      )}
    </div>
  );
}

/** The article editor's address, from the draft's slug and the collection's permalink. */
export function EntryAddress({ siteId, entry }: { siteId: string; entry: ContentEntry }) {
  const { origin, site } = useLiveSite(siteId);
  const liveNode = useLiveNode<ContentEntry>(siteId, entry.id);
  const path = entryPath(site, entry);
  const live = servesAt(liveNode, (n) => entryPath(site, n), path);
  // Locale prefixes for articles come later: a non-default language shows only its path.
  const known = site !== undefined && entry.locale === site.defaultLocale;
  return <LiveAddress path={path} origin={known ? origin : undefined} live={live} />;
}

/** The page editor's address (the page's path is its full site path). */
export function PageAddress({ siteId, page }: { siteId: string; page: Page }) {
  const { origin } = useLiveSite(siteId);
  const liveNode = useLiveNode<Page>(siteId, page.id);
  const live = servesAt(liveNode, (n) => n.path, page.path);
  return <LiveAddress path={page.path} origin={origin} live={live} />;
}

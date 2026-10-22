/**
 * An editor's full address with copy ("Live at" / "Will be at") and its header's "View live"
 * (`LiveLinks.tsx` has the shell's and lists' links). Addresses carry the item's locale: the
 * `/<locale>` prefix or the locale's own domain (`lib/item-url.ts`). Without a domain only the
 * path shows.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { itemUrl } from "@cloudhal/core-ts/locale-paths";
import { entryPath } from "@cloudhal/core-ts/permalinks";
import { ClipboardText, directional, LinkButton, Text, Tooltip } from "@cloudhal/ui";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { absoluteItemUrl, type LiveItem } from "../lib/item-url.ts";
import { servesAt } from "../lib/live-site.ts";
import { useLiveNode, useLiveSite } from "./useLiveSite.ts";

const OpenOutside = directional(ArrowSquareOut);

/**
 * An item's address: `url` the full URL (undefined while no domain serves its locale), `path`
 * what to show without one, `live` whether the live snapshot serves this item, published, at
 * this very address. The live node's query is shared by every caller (one request per item).
 */
export function useItemAddress(
  siteId: string,
  item: LiveItem,
): { url: string | undefined; path: string; live: boolean } {
  const { origin, site } = useLiveSite(siteId);
  const liveNode = useLiveNode<LiveItem>(siteId, item.id);
  const graphPath = "path" in item ? item.path : entryPath(site, item);
  if (!site) return { url: undefined, path: graphPath, live: false };
  const address = itemUrl(site, origin, item);
  return {
    url: absoluteItemUrl(site, origin, item),
    path: address,
    live: servesAt(liveNode, (n) => itemUrl(site, origin, n), address),
  };
}

/**
 * "Live at" when the live snapshot serves this item, published, at this very address; "Will be
 * at" otherwise. The full URL is copyable; without one only the path shows.
 */
export function LiveAddress({
  path,
  url,
  live,
}: {
  path: string;
  url: string | undefined;
  live: boolean;
}) {
  const t = useT();
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

/** The article editor's address, from the draft's slug, collection permalink and locale. */
export function EntryAddress({ siteId, entry }: { siteId: string; entry: ContentEntry }) {
  return <LiveAddress {...useItemAddress(siteId, entry)} />;
}

/** The page editor's address, from the draft's path and locale. */
export function PageAddress({ siteId, page }: { siteId: string; page: Page }) {
  return <LiveAddress {...useItemAddress(siteId, page)} />;
}

/**
 * An editor header's "View live": opens the item on the live site in a new tab, the full URL in
 * the tooltip. Only while the live snapshot serves this item at its address. Icon-only on narrow
 * screens, where the header is short of room.
 */
export function ViewLiveButton({ siteId, item }: { siteId: string; item: LiveItem }) {
  const t = useT();
  const { url, live } = useItemAddress(siteId, item);
  if (!live || !url) return null;
  return (
    <Tooltip content={url}>
      <LinkButton
        href={url}
        external
        variant="ghost"
        icon={OpenOutside}
        aria-label={t("liveSite.viewLive")}
        data-testid="view-live"
      >
        <span className="hidden lg:inline">{t("liveSite.viewLive")}</span>
      </LinkButton>
    </Tooltip>
  );
}

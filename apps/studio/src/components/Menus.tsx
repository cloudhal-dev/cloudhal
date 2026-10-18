import {
  Badge,
  Banner,
  directional,
  Link,
  SectionCard,
  SectionEmpty,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowSquareOut,
  Article,
  Cards,
  EyeSlash,
  FileText,
  FolderSimple,
  Tag,
  TreeStructure,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { listOf, type MessageKey, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import {
  isWellKnown,
  type MenuHiddenReason,
  type MenuReference,
  type TargetSummary,
} from "../lib/menus.ts";

/** Query keys of the menu screens. */
export const menuKeys = {
  overview: (siteId: string) => ["menus", siteId] as const,
  references: (siteId: string, kind: string, id: string) =>
    ["menu-references", siteId, kind, id] as const,
};

/** "Header", "Footer", "Sidebar" or the key itself for custom menus. */
export function useMenuName() {
  const t = useT("menus");
  return (key: string) => (isWellKnown(key) ? t(`menus.places.${key}`) : key);
}

/** "Header (primary)" — the place and the key, as diffs and lists name a menu. */
export function useMenuTitle() {
  const t = useT("menus");
  const name = useMenuName();
  return (key: string) =>
    isWellKnown(key) ? t("menus.placeWithKey", { place: name(key), key }) : key;
}

const CHIP_ICON = {
  page: FileText,
  contentEntry: Article,
  term: Tag,
  collection: Cards,
  url: directional(ArrowSquareOut),
  group: FolderSimple,
} as const;

/** What an item links to: "Page /about", "Category News", "External status.example.com ↗", "Group". */
export function TargetChip({
  target,
  taxonomyName,
}: {
  target: TargetSummary;
  /** The term's taxonomy in Studio's words ("Category"). */
  taxonomyName?: string | undefined;
}) {
  const t = useT("menus");
  const Icon = CHIP_ICON[target.kind];
  const text = target.missing
    ? t(`menus.chips.missing.${target.kind as "page" | "contentEntry" | "term"}`)
    : target.kind === "term"
      ? t("menus.chips.term", {
          taxonomy: taxonomyName ?? t("menus.chips.termFallback"),
          name: target.title ?? "",
        })
      : target.kind === "group"
        ? t("menus.chips.group")
        : t(`menus.chips.${target.kind}`, { where: target.where ?? "" });
  return (
    <span className="inline-flex max-w-full min-w-0" data-target-kind={target.kind}>
      <Badge variant="outline" icon={<Icon />}>
        <span className="min-w-0 truncate">{text}</span>
        {target.kind === "url" && target.newTab && (
          <span className="sr-only">{t("menus.chips.newTab")}</span>
        )}
      </Badge>
    </span>
  );
}

const REASON_BY_KIND: Partial<Record<MenuHiddenReason, true>> = {
  missing: true,
  unpublished: true,
};

/** The words of a hidden reason, by the item's kind where it matters ("page deleted"). */
export function useHiddenReason() {
  const t = useT("menus");
  return (reason: MenuHiddenReason, kind: string, part: "badge" | "explain") => {
    const node = kind === "page" || kind === "contentEntry" || kind === "term" ? kind : "page";
    const group = part === "badge" ? "reasons" : "explain";
    const key = REASON_BY_KIND[reason]
      ? `menus.hidden.${group}.${reason}.${node}`
      : `menus.hidden.${group}.${reason}`;
    return t(key as MessageKey);
  };
}

/** "Hidden: page deleted" with the full explanation in a tooltip. */
export function HiddenBadge({ reason, kind }: { reason: MenuHiddenReason; kind: string }) {
  const t = useT("menus");
  const words = useHiddenReason();
  return (
    <Tooltip
      content={words(reason, kind, "explain")}
      render={
        <span className="inline-flex" data-hidden-reason={reason} tabIndex={-1}>
          <Badge variant={reason === "parent-hidden" ? "secondary" : "warning"} icon={<EyeSlash />}>
            {t("menus.hidden.badge", { reason: words(reason, kind, "badge") })}
          </Badge>
        </span>
      }
    />
  );
}

/** Which menus link to each page (pages list "In menu" badges): page id → menu keys. */
export function usePageMenus(siteId: string): Map<string, string[]> {
  const overview = useQuery({
    queryKey: menuKeys.overview(siteId),
    queryFn: () => api.menus.list(siteId),
  });
  const out = new Map<string, string[]>();
  for (const { menu } of overview.data?.menus ?? []) {
    const walk = (items: typeof menu.items) => {
      for (const item of items) {
        if (item.kind === "page") {
          const keys = out.get(item.pageId) ?? [];
          if (!keys.includes(menu.key)) out.set(item.pageId, [...keys, menu.key]);
        }
        if (item.children) walk(item.children);
      }
    };
    walk(menu.items);
  }
  return out;
}

/** "In menu" next to a page title, the menus in a tooltip. */
export function InMenuBadge({ keys }: { keys: string[] | undefined }) {
  const t = useT("menus");
  const title = useMenuTitle();
  if (!keys?.length) return null;
  return (
    <Tooltip
      content={t("menus.inMenu.hint", { menus: listOf(keys.map(title)) })}
      render={
        <span className="inline-flex" data-testid="in-menu-badge">
          <Badge variant="outline" icon={<TreeStructure />}>
            {t("menus.inMenu.badge")}
          </Badge>
        </span>
      }
    />
  );
}

/** Menus and items that link to a page, article or term. */
export function useMenuReferences(
  siteId: string,
  target: { kind: "page" | "contentEntry" | "term"; id: string } | undefined,
) {
  return useQuery({
    queryKey: menuKeys.references(siteId, target?.kind ?? "", target?.id ?? ""),
    queryFn: () => api.menus.references(siteId, target?.kind ?? "page", target?.id ?? ""),
    enabled: target !== undefined,
  });
}

function itemHref(siteId: string, ref: MenuReference, itemId: string) {
  return `/sites/${siteId}/navigation?menu=${encodeURIComponent(ref.key)}&item=${encodeURIComponent(itemId)}`;
}

/**
 * "In menus" on the page, article and term editors (RFC-0003 §8): the menu items that link here,
 * each linking to the item in the menu editor. A rename flows into items without their own label.
 */
export function UsedInMenusCard({
  siteId,
  kind,
  id,
}: {
  siteId: string;
  kind: "page" | "contentEntry" | "term";
  id: string;
}) {
  const t = useT("menus");
  const title = useMenuTitle();
  const refs = useMenuReferences(siteId, { kind, id });
  const count = (refs.data ?? []).reduce((n, r) => n + r.items.length, 0);
  return (
    <SectionCard
      title={t("menus.usedIn.title")}
      icon={<TreeStructure size={16} />}
      actions={count > 0 ? <Badge variant="secondary">{count}</Badge> : undefined}
      id="used-in-menus"
    >
      {refs.data === undefined ? (
        <Text variant="secondary" size="sm">
          {t("common.loading")}
        </Text>
      ) : refs.data.length === 0 ? (
        <SectionEmpty
          icon={<TreeStructure size={32} className="text-kumo-inactive" />}
          title={t("menus.usedIn.none")}
          description={t(`menus.usedIn.noneDescription.${kind}`)}
          contents={
            <Link href={`/sites/${siteId}/navigation`} variant="inline">
              {t("menus.usedIn.open")}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          <dl className="grid divide-y divide-kumo-hairline">
            {refs.data.flatMap((ref) =>
              ref.items.map((item) => (
                <div
                  key={`${ref.menuId}:${item.id}`}
                  className="flex min-w-0 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  data-menu-item={item.id}
                >
                  <Text as="dt" variant="secondary">
                    {title(ref.key)}
                  </Text>
                  <dd className="min-w-0">
                    <Link href={itemHref(siteId, ref, item.id)} variant="inline">
                      <span className="block truncate">{item.label || t("menus.row.noLabel")}</span>
                    </Link>
                  </dd>
                </div>
              )),
            )}
          </dl>
          <Text variant="secondary" size="sm">
            {t(`menus.usedIn.description.${kind}`)}
          </Text>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * The warning a delete dialog shows when menus link to the page or article (RFC-0003 invariant
 * 10): the items stay, hidden on the site and flagged in Navigation.
 */
export function MenuDeleteNotice({
  refs,
  kind,
}: {
  refs: MenuReference[] | undefined;
  kind: "page" | "contentEntry";
}) {
  const t = useT("menus");
  const title = useMenuTitle();
  const items = (refs ?? []).flatMap((r) =>
    r.items.map((i) => `${title(r.key)}: “${i.label || t("menus.row.noLabel")}”`),
  );
  if (items.length === 0) return null;
  return (
    <div data-testid="menu-delete-notice">
      <Banner
        variant="alert"
        icon={<WarningCircle weight="fill" />}
        title={t(`menus.deleteNotice.title.${kind}`, { count: items.length })}
        description={`${items.join(" · ")}. ${t("menus.deleteNotice.description")}`}
      />
    </div>
  );
}

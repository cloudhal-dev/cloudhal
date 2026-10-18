import { CommandPalette } from "@cloudhal/ui";
import {
  ArrowBendUpRight,
  Article,
  File,
  ImageSquare,
  ListBullets,
  Tag,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api, type SiteSearchHit, type SiteSearchKind } from "../lib/api.ts";
import {
  CONTENT_MIN_CHARS,
  type PaletteEntry,
  type PaletteGroup,
  paletteGroups,
} from "../lib/palette.ts";
import type { PaletteCommand } from "./AppFrame.tsx";
import { useDebounced } from "./useDebounced.ts";

/** How the palette opens a content hit (the surface knows the routes); `newTab` for ⌘/Ctrl. */
export interface PaletteSearch {
  siteId: string;
  open: (hit: SiteSearchHit, newTab: boolean) => void;
}

const KIND_ICONS: Record<SiteSearchKind, ReactNode> = {
  entry: <Article />,
  page: <File />,
  term: <Tag />,
  asset: <ImageSquare />,
  menu: <ListBullets />,
  redirect: <ArrowBendUpRight />,
};

type Entry = PaletteEntry<PaletteCommand>;
type Group = PaletteGroup<PaletteCommand>;

/**
 * The command palette (⌘K, `/`; DESIGN.md §1 "Top bar", RFC-0029 §7): Kumo's `CommandPalette`
 * with the surface's commands, matched as the person types, and, on a site, the site's content
 * (drafts included) from the search endpoint, grouped by kind. Loaded with its first opening (or a
 * hover on the search button), so the shell's chunk carries only the shortcut and the button.
 *
 * Kumo selects through each item's `onClick` (a click, or Enter on the highlighted item); the
 * root's `onSelect` fires only for ⌘/Ctrl+Enter and needs `getSelectableItems`. Items render
 * through `CommandPalette.Results`, the autocomplete list that highlights and moves with ↑↓.
 */
export function CommandMenu({
  open,
  onOpenChange,
  commands,
  search,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  search?: PaletteSearch | undefined;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const settled = useDebounced(query.trim(), 150);
  const wantsContent = search !== undefined && settled.length >= CONTENT_MIN_CHARS;
  const content = useQuery({
    queryKey: ["site-search", search?.siteId, settled],
    queryFn: () => api.search.site(search?.siteId ?? "", settled),
    enabled: open && wantsContent,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const hits =
    wantsContent && query.trim().length >= CONTENT_MIN_CHARS ? (content.data?.hits ?? []) : [];
  const groups = paletteGroups(commands, query, hits);
  const searching = wantsContent && content.isFetching && groups.length === 0;
  // Every way out clears the query, so the next opening starts empty.
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };
  const run = (entry: Entry, newTab = false) => {
    setOpen(false);
    if (entry.type === "command") void entry.command.run();
    else search?.open(entry.hit, newTab);
  };
  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={setOpen}
      items={groups}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(g: Group) => g.id}
      getSelectableItems={(gs: Group[]) => gs.flatMap((g) => g.items)}
      onSelect={(entry: Entry, { newTab }: { newTab: boolean }) => run(entry, newTab)}
    >
      <CommandPalette.Input
        placeholder={search ? t("commands.searchPlaceholder") : t("commands.placeholder")}
      />
      <CommandPalette.List>
        {searching ? (
          <CommandPalette.Loading />
        ) : (
          <>
            <CommandPalette.Results>
              {(group: Group) => (
                <CommandPalette.Group key={group.id} items={group.items}>
                  <CommandPalette.GroupLabel>
                    {t(`commands.groups.${group.id}`)}
                  </CommandPalette.GroupLabel>
                  <CommandPalette.Items>
                    {(entry: Entry) =>
                      entry.type === "command" ? (
                        <CommandPalette.Item
                          key={entry.id}
                          value={entry}
                          onClick={() => run(entry)}
                        >
                          {entry.label}
                        </CommandPalette.Item>
                      ) : (
                        <CommandPalette.ResultItem
                          key={entry.id}
                          value={entry}
                          title={entry.label}
                          breadcrumbs={breadcrumbs(entry.hit, t)}
                          icon={KIND_ICONS[entry.hit.kind]}
                          onClick={(e) => run(entry, e.metaKey || e.ctrlKey)}
                        />
                      )
                    }
                  </CommandPalette.Items>
                </CommandPalette.Group>
              )}
            </CommandPalette.Results>
            <CommandPalette.Empty>
              {search ? t("commands.searchEmpty") : t("commands.empty")}
            </CommandPalette.Empty>
          </>
        )}
      </CommandPalette.List>
      <CommandPalette.Footer>
        <span className="flex items-center gap-3">
          <KeyHint keys="↑↓" label={t("commands.hintNavigate")} />
          <KeyHint keys="↵" label={t("commands.hintSelect")} />
          {search ? <KeyHint keys="⌘↵" label={t("commands.hintNewTab")} /> : null}
        </span>
        <KeyHint keys="esc" label={t("commands.hintClose")} />
      </CommandPalette.Footer>
    </CommandPalette.Root>
  );
}

const STATUS_KEYS = new Set(["draft", "review", "published", "archived"]);

/** What a hit belongs to and where it lives, shown before its title. */
function breadcrumbs(hit: SiteSearchHit, t: ReturnType<typeof useI18n>["t"]): string[] {
  const status =
    hit.status && STATUS_KEYS.has(hit.status) && hit.status !== "published"
      ? t(`status.${hit.status as "draft"}`)
      : undefined;
  return [hit.context, hit.detail, status].filter((s): s is string => Boolean(s));
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded bg-kumo-recessed px-1 font-mono text-kumo-subtle text-xs">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}

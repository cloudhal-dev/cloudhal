/**
 * The command palette's groups (RFC-0029 §7, DESIGN.md §1 "Top bar"): the surface's commands,
 * matched in the browser, then the site's content from `GET /api/sites/:siteId/search`, one group
 * per kind in a fixed order. Pure, so the palette and its tests share it.
 */
import type { SiteSearchHit, SiteSearchKind } from "./api.ts";
import { matchCommands } from "./command-match.ts";
import { entryRoute } from "./entry-href.ts";

/** Content kinds in the order the palette shows them. */
export const PALETTE_KINDS = [
  "entry",
  "page",
  "term",
  "asset",
  "menu",
  "redirect",
] as const satisfies readonly SiteSearchKind[];

/** A query this short only matches commands: one letter would list half the site. */
export const CONTENT_MIN_CHARS = 2;

export interface PaletteCommandLike {
  id: string;
  label: string;
}

export type PaletteEntry<C extends PaletteCommandLike> =
  | { type: "command"; id: string; label: string; command: C }
  | { type: "hit"; id: string; label: string; hit: SiteSearchHit };

export interface PaletteGroup<C extends PaletteCommandLike> {
  id: "commands" | SiteSearchKind;
  items: PaletteEntry<C>[];
}

/** The groups to show: matching commands first, then content hits by kind; empty groups left out. */
export function paletteGroups<C extends PaletteCommandLike>(
  commands: readonly C[],
  query: string,
  hits: readonly SiteSearchHit[],
): PaletteGroup<C>[] {
  const groups: PaletteGroup<C>[] = [
    {
      id: "commands",
      items: matchCommands(commands, query).map((command) => ({
        type: "command",
        id: `command:${command.id}`,
        label: command.label,
        command,
      })),
    },
    ...PALETTE_KINDS.map((kind) => ({
      id: kind,
      items: hits
        .filter((h) => h.kind === kind)
        .map(
          (hit): PaletteEntry<C> => ({
            type: "hit",
            id: `${hit.kind}:${hit.id}:${hit.ref ?? ""}`,
            label: hit.title,
            hit,
          }),
        ),
    })),
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Where a content hit opens in Studio (TanStack Router options). */
export type HitLocation =
  | {
      to: "/sites/$siteId/collections/$collection/$entryId";
      params: { siteId: string; collection: string; entryId: string };
    }
  | { to: "/sites/$siteId/pages/$pageId"; params: { siteId: string; pageId: string } }
  | { to: "/sites/$siteId/taxonomy/$termId"; params: { siteId: string; termId: string } }
  | { to: "/sites/$siteId/media/$assetId"; params: { siteId: string; assetId: string } }
  | {
      to: "/sites/$siteId/navigation";
      params: { siteId: string };
      search: { menu?: string; item?: string };
    }
  | { to: "/sites/$siteId/redirects"; params: { siteId: string } };

type Locate = (siteId: string, hit: SiteSearchHit) => HitLocation;

/** One screen per kind (a dispatch table): the editor of the node, or the list that holds it. */
const LOCATIONS: Record<SiteSearchKind, Locate> = {
  entry: (siteId, h) => entryRoute(siteId, h.id, h.context),
  page: (siteId, h) => ({ to: "/sites/$siteId/pages/$pageId", params: { siteId, pageId: h.id } }),
  term: (siteId, h) => ({
    to: "/sites/$siteId/taxonomy/$termId",
    params: { siteId, termId: h.id },
  }),
  asset: (siteId, h) => ({
    to: "/sites/$siteId/media/$assetId",
    params: { siteId, assetId: h.id },
  }),
  menu: (siteId, h) => ({
    to: "/sites/$siteId/navigation",
    params: { siteId },
    search: { ...(h.context ? { menu: h.context } : {}), ...(h.ref ? { item: h.ref } : {}) },
  }),
  redirect: (siteId) => ({ to: "/sites/$siteId/redirects", params: { siteId } }),
};

export function hitLocation(siteId: string, hit: SiteSearchHit): HitLocation {
  return LOCATIONS[hit.kind](siteId, hit);
}

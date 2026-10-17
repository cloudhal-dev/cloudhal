/** Navigation menus (the menu model and its types live in `lib/menus.ts`). */
import type { Menu, Snapshot } from "@cloudhal/core-contracts";
import type {
  FromPagesPreview,
  MenuPreviewResponse,
  MenuReference,
  MenusOverview,
  MenuWrite,
  ResolvedMenu,
} from "../menus.ts";
import { json, query, request } from "./http.ts";

/** Navigation menus (RFC-0003 §5): reads for every member, writes for Editor and above. */
export const menusApi = {
  /** Menus, the well-known keys without one (with the derived header) and the limits. */
  list: (siteId: string) => request<MenusOverview>(`/api/sites/${siteId}/menus`),
  get: (siteId: string, menuId: string, locale?: string) =>
    request<{ menu: Menu; locale: string; resolved: ResolvedMenu }>(
      `/api/sites/${siteId}/menus/${encodeURIComponent(menuId)}${query({ locale })}`,
    ),
  /** One snapshot; 409 `key_taken`. */
  create: (siteId: string, input: { key: string; maxDepth?: number; items?: Menu["items"] }) =>
    request<MenuWrite>(`/api/sites/${siteId}/menus`, { method: "POST", ...json(input) }),
  /** Whole tree with `rev` (CAS); 409 `conflict` carries the current menu in `details.current`. */
  save: (
    siteId: string,
    menuId: string,
    body: { rev: number; maxDepth: number; items: Menu["items"] },
  ) =>
    request<MenuWrite>(`/api/sites/${siteId}/menus/${encodeURIComponent(menuId)}`, {
      method: "PUT",
      ...json(body),
    }),
  remove: (menu: Pick<Menu, "id" | "siteId" | "rev">) =>
    request<{ snapshot: Snapshot }>(
      `/api/sites/${menu.siteId}/menus/${encodeURIComponent(menu.id)}?rev=${menu.rev}`,
      { method: "DELETE" },
    ),
  /** "Create menu from current pages": a dry run (nothing written) or the real thing. */
  fromPagesPreview: (siteId: string, input: { key: string; categories: boolean }) =>
    request<FromPagesPreview>(`/api/sites/${siteId}/menus/from-pages`, {
      method: "POST",
      ...json({ ...input, dryRun: true }),
    }),
  fromPages: (siteId: string, input: { key: string; categories: boolean }) =>
    request<MenuWrite>(`/api/sites/${siteId}/menus/from-pages`, {
      method: "POST",
      ...json(input),
    }),
  /** Resolves unsaved trees (or the stored menu / derived default) for the preview. */
  preview: (
    siteId: string,
    input: {
      locale?: string;
      path?: string;
      menus: { key: string; items?: Menu["items"] }[];
    },
  ) =>
    request<MenuPreviewResponse>(`/api/sites/${siteId}/menus/preview`, {
      method: "POST",
      ...json(input),
    }),
  /** Menus and items that link to a page, article or term ("Used in menus"). */
  references: (siteId: string, kind: "page" | "contentEntry" | "term", id: string) =>
    request<{ items: MenuReference[] }>(
      `/api/sites/${siteId}/menus/references${query({ kind, id })}`,
    ).then((r) => r.items),
};

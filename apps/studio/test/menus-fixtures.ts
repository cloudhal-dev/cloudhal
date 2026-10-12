import type { TargetData } from "../src/lib/menus.ts";
import { CATEGORY, entry, NEWS, SITE, TAG, term } from "./taxonomy-fixtures.ts";

/** Shared fixtures for the menu screens (RFC-0003): pages (one a draft), an article, categories. */
const page = (id: string, path: string, title: string, status = "published") =>
  ({
    schemaVersion: 1,
    id,
    siteId: "site_1",
    path,
    title,
    locale: "en",
    status,
    sections:
      path === "/"
        ? [
            {
              id: "sec_list000001",
              kind: "contentList",
              collection: "posts",
              limit: 10,
              sort: "newest",
            },
          ]
        : [],
    rev: 1,
    createdAt: "2026-10-08T08:00:00Z",
    updatedAt: "2026-10-08T08:00:00Z",
  }) as TargetData["pages"][number];

export const DATA: TargetData = {
  site: SITE,
  pages: [
    page("page_home00001", "/", "Home"),
    page("page_about0001", "/about", "About"),
    page("page_draft0001", "/pricing", "Pricing", "draft"),
  ],
  entries: [entry({ id: "entry_hello001", status: "published" })],
  taxonomies: [CATEGORY, TAG],
  terms: [NEWS, term("term_world001", CATEGORY, "world", "World", { parentId: NEWS.id })],
};

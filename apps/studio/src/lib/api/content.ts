/** Sites, pages, entries, design rules, theme settings, block types, previews and preview links. */
import type { ContentEntry, Page, PublishStatus, Site } from "@cloudhal/core-contracts";
import type { BlockType, PropsSchema } from "@cloudhal/core-ts/blocks";
import { json, query, request } from "./http.ts";

/** `GET /api/sites/:siteId/theme-settings` (RFC-0017 §1). */
export interface ThemeSettings {
  theme: string;
  /** `null` when the theme declares no settings. */
  schema: PropsSchema | null;
  values: Record<string, unknown>;
  rev: number;
}

/** RFC-0021: design rules for people and agents. */
export interface DesignRules {
  /** The theme's DESIGN.md (read-only), when it ships one. */
  theme: string | null;
  /** The site's own rules. */
  site: string | null;
  warnings: string[];
  rev: number;
}

/** `POST …/entries/:id/preview`, `POST …/pages/:id/preview`: the unsaved form, rendered. */

export interface DraftPreview {
  html: string;
}

/** Entries query: collection, the RFC-0002 §5 filter, statuses. */
export interface EntryListQuery {
  collection?: string;
  filter?: string;
  status?: PublishStatus[];
}

/** What a preview link renders: the current drafts or one snapshot. */
export type PreviewTarget = "live" | { snapshot: string };

export interface PreviewLinkInput {
  target: PreviewTarget;
  /** Absolute path on the site, e.g. `/blog/hello`. */
  path?: string;
  ttlSeconds?: number;
}

/** A signed, expiring link (`POST /api/sites/:id/preview-links`). */
export interface PreviewLink {
  token: string;
  /** `https://<primary domain><path>?cloudhal-preview=<token>`; null when the site has no domain. */
  url: string | null;
  expiresAt: string;
  target: PreviewTarget;
  path: string;
}

export type NewPage = Omit<
  Page,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId"
>;
export type NewEntry = Omit<
  ContentEntry,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId" | "author"
>;

export const contentApi = {
  previewLinks: {
    /** 404 when the server has no preview secret (see `isNotEnabled`). */
    create: (siteId: string, input: PreviewLinkInput) =>
      request<PreviewLink>(`/api/sites/${encodeURIComponent(siteId)}/preview-links`, {
        method: "POST",
        ...json(input),
      }),
  },
  sites: {
    list: () => request<Site[]>("/api/sites"),
    /** RFC-0034 §3: a new site in this installation (`site:create`); 409 when the slug is taken. */
    create: (input: { name: string; slug: string; locale: string; projectId?: string }) =>
      request<{ site: Site }>("/api/sites", { method: "POST", ...json(input) }),
    get: (id: string) => request<Site>(`/api/sites/${id}`),
    update: (site: Site) =>
      request<Site>(`/api/sites/${site.id}`, { method: "PUT", ...json(site) }),
  },
  pages: {
    list: (siteId: string) => request<Page[]>(`/api/sites/${siteId}/pages`),
    get: (siteId: string, id: string) => request<Page>(`/api/sites/${siteId}/pages/${id}`),
    create: (siteId: string, page: NewPage) =>
      request<{ page: Page; site: Site }>(`/api/sites/${siteId}/pages`, {
        method: "POST",
        ...json(page),
      }),
    update: (page: Page) =>
      request<Page>(`/api/sites/${page.siteId}/pages/${page.id}`, { method: "PUT", ...json(page) }),
    remove: (page: Page) =>
      request<{ site: Site }>(`/api/sites/${page.siteId}/pages/${page.id}?rev=${page.rev}`, {
        method: "DELETE",
      }),
    /** The page with the editor's unsaved title, SEO and sections. Nothing is written. */
    previewDraft: (page: Pick<Page, "id" | "siteId" | "title" | "seo" | "sections">) =>
      request<DraftPreview>(`/api/sites/${page.siteId}/pages/${page.id}/preview`, {
        method: "POST",
        ...json({ title: page.title, seo: page.seo ?? null, sections: page.sections }),
      }),
  },
  entries: {
    /** `filter` is sent encoded, so its `+` survives as `%2B` (RFC-0002 §5). 400 on an unknown term. */
    list: (siteId: string, q?: string | EntryListQuery) => {
      const o = typeof q === "string" ? { collection: q } : (q ?? {});
      return request<ContentEntry[]>(
        `/api/sites/${siteId}/entries${query({
          collection: o.collection,
          filter: o.filter,
          status: o.status?.join(","),
        })}`,
      );
    },
    get: (siteId: string, id: string) =>
      request<ContentEntry>(`/api/sites/${siteId}/entries/${id}`),
    /** The article with the editor's unsaved title, summary, body and cover. Nothing is written. */
    previewDraft: (
      entry: Pick<ContentEntry, "id" | "siteId" | "title" | "summary" | "body" | "coverImage">,
    ) =>
      request<DraftPreview>(`/api/sites/${entry.siteId}/entries/${entry.id}/preview`, {
        method: "POST",
        ...json({
          title: entry.title,
          summary: entry.summary ?? "",
          body: entry.body,
          coverImage: entry.coverImage ?? null,
        }),
      }),
    /** One piece of a body (a ```surface) as the preview draws it. Nothing is written. */
    previewFragment: (siteId: string, markdown: string) =>
      request<{ html: string }>(`/api/sites/${siteId}/entries/preview-fragment`, {
        method: "POST",
        ...json({ markdown }),
      }),
    create: (siteId: string, entry: NewEntry) =>
      request<ContentEntry>(`/api/sites/${siteId}/entries`, { method: "POST", ...json(entry) }),
    update: (entry: ContentEntry) =>
      request<ContentEntry>(`/api/sites/${entry.siteId}/entries/${entry.id}`, {
        method: "PUT",
        ...json(entry),
      }),
    remove: (entry: ContentEntry) =>
      request<void>(`/api/sites/${entry.siteId}/entries/${entry.id}?rev=${entry.rev}`, {
        method: "DELETE",
      }),
  },
  /** RFC-0021: the theme's and the site's design rules (DESIGN.md). */
  design: {
    get: (siteId: string) => request<DesignRules>(`/api/sites/${siteId}/design`),
    /** Saves the site's rules read at `rev` (null removes them); 409 when the site changed. */
    save: (siteId: string, input: { rev: number; markdown: string | null }) =>
      request<{ site: string | null; warnings: string[]; rev: number }>(
        `/api/sites/${siteId}/design`,
        { method: "PUT", ...json(input) },
      ),
  },
  /** The theme's design settings (RFC-0017 §1): its schema and the site's values. */
  themeSettings: {
    get: (siteId: string) => request<ThemeSettings>(`/api/sites/${siteId}/theme-settings`),
    /** Saves values read at `rev`; 409 when the site changed in between, 422 when they misfit. */
    save: (siteId: string, input: { rev: number; values: Record<string, unknown> }) =>
      request<{ values: Record<string, unknown>; rev: number }>(
        `/api/sites/${siteId}/theme-settings`,
        { method: "PUT", ...json(input) },
      ),
  },
  /** The deployment's block types (RFC-0015): built-ins and the theme's. */
  blockTypes: (siteId: string) =>
    request<{ types: BlockType[] }>(`/api/sites/${siteId}/block-types`).then((r) => r.types),
  /** Draft previews are whole HTML documents for a sandboxed `<iframe>`, not JSON. */
  preview: {
    page: (siteId: string, pageId: string) => `/api/sites/${siteId}/pages/${pageId}/preview`,
    /** Server-sent build events for Studio's Build view (RFC-0020 §6). */
    buildEvents: (siteId: string, pageId: string) =>
      `/api/sites/${siteId}/pages/${pageId}/build/events`,
    entry: (siteId: string, entryId: string) => `/api/sites/${siteId}/entries/${entryId}/preview`,
    /** A term's archive page as saved (the editor shows the unsaved draft via `terms.previewDraft`). */
    term: (siteId: string, termId: string) =>
      `/api/sites/${siteId}/terms/${encodeURIComponent(termId)}/preview`,
  },
};

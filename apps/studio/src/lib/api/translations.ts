/** Language versions, reviews and the glossary (RFC-0033 §8). */
import type { ContentEntry, Glossary, Page, TranslationMethod } from "@cloudhal/core-contracts";
import { json, query, request } from "./http.ts";

/** One language version of a page or entry, as the translations card lists it. */
export interface TranslationRow {
  id: string;
  /** The group's id: the original's. */
  group: string;
  kind: "page" | "contentEntry";
  siteId: string;
  locale: string;
  status: Page["status"];
  method?: TranslationMethod;
  layout?: "linked" | "independent";
  rev: number;
  stale: boolean;
  sourceMissing: boolean;
  reviewed: boolean;
  title: string;
  path?: string;
  collection?: string;
  slug?: string;
}

export const translationsApi = {
  /** Every language version of the node's group. */
  group: (siteId: string, nodeId: string) =>
    request<{ group: string; items: TranslationRow[] }>(
      `/api/sites/${siteId}/translations/${encodeURIComponent(nodeId)}`,
    ),
  /** Every language version on the site, optionally in one locale. */
  list: (siteId: string, locale?: string) =>
    request<{ items: TranslationRow[] }>(`/api/sites/${siteId}/translations${query({ locale })}`),
  /** A person's review: machine output becomes machine-reviewed; CAS on `rev`; one snapshot. */
  review: (siteId: string, nodeId: string, rev: number) =>
    request<Page | ContentEntry>(
      `/api/sites/${siteId}/translations/${encodeURIComponent(nodeId)}/review`,
      { method: "POST", ...json({ rev }) },
    ),
  glossary: (siteId: string) =>
    request<Glossary | { siteId: string; entries: Glossary["entries"] }>(
      `/api/sites/${siteId}/glossary`,
    ),
  saveGlossary: (
    siteId: string,
    glossary: { rev?: number; id?: string; entries: Glossary["entries"] },
  ) => request<Glossary>(`/api/sites/${siteId}/glossary`, { method: "PUT", ...json(glossary) }),
};

/**
 * Unsaved editor state for draft previews (RFC-0014 phase 1c): the stored node with the fields an
 * editor shows in its preview overlaid. Nothing here is written. Unknown or mistyped fields are
 * dropped, and a field that would not validate keeps its stored value, so a draft that would not
 * save still previews.
 */
import { type ContentEntry, isValid, type Page } from "@cloudhal/core-contracts";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const record = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/** Bodies are capped like the contract (1 MB markdown or HTML). */
const BODY_MAX = 1_000_000;
/** Sections a draft may carry; a page needs far fewer. */
const SECTIONS_MAX = 200;

/** An article with the editor's unsaved title, summary, body and cover image. */
export function entryDraft(stored: ContentEntry, input: unknown): ContentEntry {
  const b = record(input) ?? {};
  const { summary: _summary, coverImage: _cover, ...rest } = stored;
  const title = text(b.title, 300)?.trim() || stored.title;
  const summary = b.summary === undefined ? stored.summary : text(b.summary, 2000);
  const rawBody = record(b.body);
  const format: ContentEntry["body"]["format"] | undefined =
    rawBody?.format === "html" ? "html" : rawBody?.format === "markdown" ? "markdown" : undefined;
  const value = text(rawBody?.value, BODY_MAX);
  const body = format && value !== undefined ? { format, value } : stored.body;
  const next: ContentEntry = { ...rest, title, body, ...(summary ? { summary } : {}) };
  if (b.coverImage === undefined)
    return stored.coverImage ? { ...next, coverImage: stored.coverImage } : next;
  if (b.coverImage === null) return next;
  const withCover = { ...next, coverImage: b.coverImage } as ContentEntry;
  if (isValid("content-entry", withCover)) return withCover;
  return stored.coverImage ? { ...next, coverImage: stored.coverImage } : next;
}

/** A page with the editor's unsaved title, SEO and sections (each section validated alone). */
export function pageDraft(stored: Page, input: unknown): Page {
  const b = record(input) ?? {};
  const title = text(b.title, 300)?.trim() || stored.title;
  const sections = Array.isArray(b.sections)
    ? b.sections
        .slice(0, SECTIONS_MAX)
        .filter((s): s is Page["sections"][number] => isValid("section", s))
    : stored.sections;
  const { seo: _seo, ...rest } = stored;
  const next: Page = { ...rest, title, sections };
  if (b.seo === undefined) return stored.seo ? { ...next, seo: stored.seo } : next;
  if (b.seo === null) return next;
  const withSeo = { ...next, seo: b.seo } as Page;
  if (isValid("page", withSeo)) return withSeo;
  return stored.seo ? { ...next, seo: stored.seo } : next;
}

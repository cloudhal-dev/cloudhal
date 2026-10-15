/**
 * The theme kit (RFC-0018 §3): what every theme's templates read about an article, computed once
 * by Cloudhal so themes only draw it: the outline (table of contents, reading time) and the
 * corrections (RFC-0019 §2). Worker-safe.
 */
import type { ContentEntry, Correction } from "@cloudhal/core-contracts";
import { htmlText, renderBody, renderInlineMarkdown } from "./markdown.ts";

/** One heading of an article's table of contents; `id` is the anchor the rendered body carries. */
export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** An article's outline: its `h2`/`h3` headings and an estimated reading time. */
export interface ArticleOutline {
  toc: TocItem[];
  readingMinutes: number;
}

/** Words per minute when a theme sets none (RFC-0018 §1 `readingSpeed`). */
export const READING_SPEED = 230;

const HEADING = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;

/**
 * Headings of HTML rendered by `renderMarkdown`/`renderBody` (their ids come from `headingSlug`).
 * HTML bodies keep no ids through the sanitizer, so they have no table of contents.
 */
export function tableOfContents(html: string): TocItem[] {
  return [...html.matchAll(HEADING)].map((m) => ({
    id: m[2] as string,
    text: htmlText(m[3] as string),
    depth: Number(m[1]) as 2 | 3,
  }));
}

/**
 * Minutes to read rendered HTML: words at `wordsPerMinute`, plus 12 seconds for the first image,
 * one second less for each next one, at least 3 (Medium's rule). Never less than one minute.
 */
export function readingMinutes(html: string, wordsPerMinute = READING_SPEED): number {
  const words = htmlText(html).match(/\S+/g)?.length ?? 0;
  const images = html.match(/<img\b/g)?.length ?? 0;
  let seconds = (words / Math.max(1, wordsPerMinute)) * 60;
  for (let i = 0; i < images; i++) seconds += Math.max(12 - i, 3);
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * An entry's outline from its body. The body is rendered the same way the article renders it, so
 * the ids match the page's headings; media is not needed for either.
 */
export function articleOutline(
  entry: Pick<ContentEntry, "body">,
  wordsPerMinute = READING_SPEED,
): ArticleOutline {
  const html = renderBody(entry.body);
  return { toc: tableOfContents(html), readingMinutes: readingMinutes(html, wordsPerMinute) };
}

/** One correction as an article shows it (RFC-0019 §2): the note rendered as inline markdown. */
export interface ArticleCorrection {
  id: string;
  kind: Correction["kind"];
  at: string;
  html: string;
}

/** An article's corrections: newest first, and the time of the latest (its "Updated" date). */
export interface ArticleCorrections {
  items: ArticleCorrection[];
  latest?: string;
}

/** The corrections an article shows, newest first; notes go through the safe inline renderer. */
export function articleCorrections(entry: Pick<ContentEntry, "corrections">): ArticleCorrections {
  const items = (entry.corrections ?? [])
    .map((c) => ({ id: c.id, kind: c.kind, at: c.at, html: renderInlineMarkdown(c.note) }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items[0] ? { items, latest: items[0].at } : { items };
}

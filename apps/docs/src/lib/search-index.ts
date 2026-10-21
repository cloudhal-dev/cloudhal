/**
 * Builds the docs MCP's search index from the same page list as the HTML, the `.md` copies and
 * `llms.txt` (ADR-0039), so search finds exactly the published pages. Build-time only.
 */
import type { Page } from "./pages.ts";
import { type SearchDoc, type SearchIndex, tokens } from "./search.ts";

export { SEARCH_INDEX_PATH } from "./search.ts";

import { sectionOf, urlOf } from "./sections.ts";

/** Field weights: a word in the title counts five times, in the description or path twice. */
const WEIGHTS = { title: 5, description: 2, path: 2, body: 1 } as const;

/** Markdown to searchable text: links keep their text, markup and HTML tags go. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*```.*$/gm, " ")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, " ")
    .replace(/[`*_#>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(pages: readonly Page[]): SearchIndex {
  const docs: SearchDoc[] = [];
  const postings = new Map<string, number[]>();
  pages.forEach((page, doc) => {
    const text = plainText(page.body);
    const counts = new Map<string, number>();
    const fields = [
      [page.title, WEIGHTS.title],
      [page.description, WEIGHTS.description],
      [page.id.replace(/[/-]/g, " "), WEIGHTS.path],
      [text, WEIGHTS.body],
    ] as const;
    let length = 0;
    for (const [value, weight] of fields) {
      for (const t of tokens(value)) {
        counts.set(t, (counts.get(t) ?? 0) + weight);
        length += weight;
      }
    }
    for (const [t, tf] of counts) {
      const list = postings.get(t) ?? [];
      list.push(doc, tf);
      postings.set(t, list);
    }
    const section = sectionOf(page)?.key;
    docs.push({
      title: page.title,
      url: urlOf(page),
      ...(section ? { section } : {}),
      text,
      length,
    });
  });
  return { version: 1, docs, terms: Object.fromEntries(postings) };
}

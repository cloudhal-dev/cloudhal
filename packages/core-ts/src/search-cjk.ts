/**
 * RFC-0033 §5: languages written without spaces between words (Chinese, Japanese, Korean, Thai,
 * Lao, Khmer, Burmese, Tibetan) cannot be split into words by FTS5's `unicode61`, so their rows go
 * to `search_index_cjk` (`0026_search_cjk`), whose `trigram` tokenizer matches any substring of
 * three characters or more. Shorter words — common in Chinese and Japanese — fall back to `LIKE`
 * over the same rows. Worker-safe.
 */
import { queryWords } from "./search-common.ts";

export const WORD_TABLE = "search_index";
export const CJK_TABLE = "search_index_cjk";
export const SEARCH_TABLES = [WORD_TABLE, CJK_TABLE] as const;
export type SearchTable = (typeof SEARCH_TABLES)[number];

const UNSPACED = /^(?:zh|ja|ko|th|lo|km|my|bo)(?:-|$)/i;

/** The index table a locale's rows live in. */
export function searchTable(locale: string): SearchTable {
  return UNSPACED.test(locale) ? CJK_TABLE : WORD_TABLE;
}

/**
 * A query for the trigram table: a `MATCH` of quoted phrases when every word has three characters
 * or more, else `LIKE` patterns (`%word%`, with `%`, `_` and `\` escaped) that every row must meet.
 */
export function trigramQuery(query: string): { match: string } | { like: string[] } | undefined {
  const words = queryWords(query);
  if (words.length === 0) return undefined;
  if (words.every((w) => [...w].length >= 3))
    return { match: words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" ") };
  return { like: words.map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) };
}

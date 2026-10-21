/**
 * Every page cloudhal.dev publishes, in one list: the site's own pages, the repo's `docs/`, and
 * generated folder indexes. The content loader renders them; the post-build step writes their
 * Markdown copies and `llms.txt` from the same list.
 */
import { cliReference } from "./reference.ts";
import { folderIndex, listDocs, readDoc } from "./repo-docs.ts";
import { SITE_PAGES } from "./site-pages.ts";

export interface Page {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
  /** Repo file the page is built from, if any. */
  readonly file?: string;
  readonly label?: string;
  readonly order?: number;
  readonly data?: Record<string, unknown>;
}

/** Folders without a README get a generated index. */
const FOLDER_INDEXES = [{ dir: "docs/rfcs", title: "Proposals (RFCs)" }] as const;

/** `absolute` writes site links as `https://cloudhal.dev/…` (for Markdown read off the site). */
export function allPages(repoRoot: string, absolute = false): Page[] {
  const docs = listDocs(repoRoot).map((file) => readDoc(repoRoot, file, absolute));
  const indexes = FOLDER_INDEXES.map(({ dir, title }) => folderIndex(repoRoot, dir, title));
  return [...SITE_PAGES, cliReference(), ...indexes, ...docs];
}

import type { Term } from "@cloudhal/core-contracts";
import { Badge, Tooltip } from "@cloudhal/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { archiveIndexStatus } from "../lib/taxonomy.ts";
import { EditorPreview } from "./EditorPreview.tsx";
import { IndexBadge } from "./Taxonomy.tsx";
import { useSettled } from "./useSettled.ts";

/** What the preview sends: only the presentation the editor can change without governance. */
type DraftInput = Pick<Term, "id" | "siteId" | "labels" | "image">;

/**
 * The term editor's live preview (DESIGN.md §2f, §2p): the archive page rendered by the server from
 * the unsaved names, intro, SEO and image — a pause in typing re-renders it in place — with what
 * the public address answers next to the title: the indexing state (`IndexBadge`, the renderer's
 * status table) and the HTTP status. "Open in new tab" opens the saved version.
 */
export function TermArchivePreview({
  term,
  rev,
  path,
}: {
  /** The draft being edited. */
  term: Term;
  /** The saved revision: a save re-renders (counts may have moved). */
  rev: number;
  path: string;
}) {
  const t = useT();
  const input = JSON.stringify({
    id: term.id,
    siteId: term.siteId,
    labels: term.labels,
    ...(term.image ? { image: term.image } : {}),
  } satisfies DraftInput);
  const settled = useSettled(input, 350);
  const preview = useQuery({
    queryKey: ["term-preview", term.siteId, term.id, rev, settled],
    queryFn: () => api.terms.previewDraft(JSON.parse(settled) as DraftInput),
    placeholderData: keepPreviousData,
  });
  const archive = preview.data?.archive;
  return (
    <EditorPreview
      draft
      src={api.preview.term(term.siteId, term.id)}
      srcDoc={preview.data?.html}
      stale={settled !== input || preview.isFetching}
      rev={rev}
      name={path}
      dirty={false}
      status={
        archive ? (
          <span
            className="flex items-center gap-1.5"
            data-testid="preview-archive"
            data-status={archive.status}
          >
            <IndexBadge status={archiveIndexStatus(archive)} />
            <Tooltip content={t("termEditor.preview.statusHint", { path, status: archive.status })}>
              <span className="inline-flex">
                <Badge variant="outline">{`HTTP ${archive.status}`}</Badge>
              </span>
            </Tooltip>
          </span>
        ) : preview.error ? (
          <Tooltip content={apiErrorText(t, preview.error)}>
            <span className="inline-flex">
              <Badge variant="error">{t("preview.failed")}</Badge>
            </span>
          </Tooltip>
        ) : undefined
      }
    />
  );
}

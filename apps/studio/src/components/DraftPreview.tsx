import { Badge, Tooltip } from "@cloudhal/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import type { DraftPreview } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { EditorPreview } from "./EditorPreview.tsx";
import { useSettled } from "./useSettled.ts";

/**
 * An editor's preview that follows the form (RFC-0014 phase 1c, DESIGN.md §2f): saved, it shows
 * the saved page; with unsaved changes, the server renders the draft (`POST …/preview`, nothing
 * written) after each pause in typing, in place, so there is no "unsaved" gap to explain.
 */
export function DraftEditorPreview<I>({
  queryKey,
  src,
  rev,
  name,
  dirty,
  input,
  render,
}: {
  /** Identifies the node (e.g. `["entry-preview", siteId, entryId]`). */
  queryKey: readonly unknown[];
  /** The saved preview's address (shown while nothing is unsaved, and "Open saved"). */
  src: string;
  rev: number;
  name: string;
  dirty: boolean;
  /** What the server renders; compared as JSON. */
  input: I;
  render(input: I): Promise<DraftPreview>;
}) {
  const t = useT();
  const json = JSON.stringify(input);
  const settled = useSettled(json, 400);
  const preview = useQuery({
    queryKey: [...queryKey, rev, settled],
    queryFn: () => render(JSON.parse(settled) as I),
    enabled: dirty,
    placeholderData: keepPreviousData,
  });
  if (!dirty) return <EditorPreview src={src} rev={rev} name={name} dirty={false} />;
  return (
    <EditorPreview
      draft
      src={src}
      srcDoc={preview.data?.html}
      stale={settled !== json || preview.isFetching}
      rev={rev}
      name={name}
      dirty={false}
      status={
        preview.error ? (
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

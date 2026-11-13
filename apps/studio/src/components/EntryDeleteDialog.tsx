import type { ContentEntry } from "@cloudhal/core-contracts";
import { DeleteResource } from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError } from "../lib/api/http.ts";
import type { ReferencedDetails } from "../lib/api/references.ts";
import { api } from "../lib/api.ts";
import type { MenuReference } from "../lib/menus.ts";
import { deleteResourceProps } from "./deleteLabels.ts";
import { referenced } from "./EntryFieldCards.tsx";
import { MenuDeleteNotice } from "./Menus.tsx";

// RFC-0045 §5: the references part loads only where some field can reference this collection.
const DeleteReferences = lazy(() =>
  import("./fields/DeleteReferences.tsx").then((m) => ({ default: m.DeleteReferences })),
);

/**
 * The entry editor's delete (DESIGN.md §2d): `DeleteResource` with the menus that will hide the
 * entry and, where references can point at it (RFC-0045 §5), what the store says about its
 * referrers. Delete stays off while that check runs and while the store refuses
 * (`entry_referenced`); a failed check leaves it on, since the delete itself is guarded. A refusal
 * of the delete itself shows in the dialog: its referrers as the blocked state, any other refusal
 * (`field_operation_running`, …) in its words.
 */
export function EntryDeleteDialog({
  open,
  onOpenChange,
  siteId,
  entry,
  menuRefs,
  isDeleting,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** The entry to delete; none while the dialog is closed (a list's row). */
  entry: ContentEntry | undefined;
  menuRefs: MenuReference[] | undefined;
  isDeleting: boolean;
  onDelete: () => Promise<void>;
}) {
  const t = useT();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const checks =
    site.data !== undefined && entry !== undefined && referenced(site.data, entry.collection);
  // Undefined while the check runs; then whether the store refuses the delete.
  const [blocked, setBlocked] = useState<boolean | undefined>();
  // The real delete's refusal: its referrers when the check went stale, else its words.
  const [refused, setRefused] = useState<{ details?: unknown; error?: unknown }>();
  const [shown, setShown] = useState(entry?.id);
  if (shown !== entry?.id) {
    setShown(entry?.id);
    setRefused(undefined);
  }
  const deleteNow = async () => {
    setRefused(undefined);
    try {
      await onDelete();
    } catch (e) {
      const referenced = e instanceof ApiRequestError && e.body.error === "entry_referenced";
      setRefused(referenced ? { details: e.body.details } : { error: e });
    }
  };
  return (
    <DeleteResource
      open={open}
      onOpenChange={onOpenChange}
      {...deleteResourceProps(t, t("editor.article"), { error: refused?.error })}
      resourceName={entry?.slug ?? ""}
      notice={
        <>
          <MenuDeleteNotice refs={menuRefs} kind="contentEntry" />
          {checks && site.data && entry && (
            <Suspense fallback={null}>
              <DeleteReferences
                site={site.data}
                entry={entry}
                open={open}
                refused={refused?.details as ReferencedDetails | undefined}
                onBlocked={setBlocked}
              />
            </Suspense>
          )}
        </>
      }
      deleteDisabled={(checks && blocked !== false) || refused?.details !== undefined}
      isDeleting={isDeleting}
      onDelete={deleteNow}
    />
  );
}

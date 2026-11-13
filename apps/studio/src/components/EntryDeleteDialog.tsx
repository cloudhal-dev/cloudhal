import type { ContentEntry } from "@cloudhal/core-contracts";
import { DeleteResource } from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useT } from "../i18n/index.tsx";
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
 * (`entry_referenced`); a failed check leaves it on, since the delete itself is guarded.
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
  return (
    <DeleteResource
      open={open}
      onOpenChange={onOpenChange}
      {...deleteResourceProps(t, t("editor.article"))}
      resourceName={entry?.slug ?? ""}
      notice={
        <>
          <MenuDeleteNotice refs={menuRefs} kind="contentEntry" />
          {checks && site.data && entry && (
            <Suspense fallback={null}>
              <DeleteReferences site={site.data} entry={entry} open={open} onBlocked={setBlocked} />
            </Suspense>
          )}
        </>
      }
      deleteDisabled={checks && blocked !== false}
      isDeleting={isDeleting}
      onDelete={onDelete}
    />
  );
}

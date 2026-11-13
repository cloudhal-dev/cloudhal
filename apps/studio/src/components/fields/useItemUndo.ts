import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { useToast } from "../Toast.ts";

const UNDO_MS = 10_000;

/**
 * The undo toast after a repeater item is removed (RFC-0045 §5), scoped to one entry: its toasts
 * close when the editor leaves the entry or unmounts, and an undo for another entry does nothing.
 * When the list can't take the item back (it is full again), the person is told.
 */
export function useItemUndo(entryId: string) {
  const { t } = useI18n("fields");
  const toast = useToast();
  const latest = useRef({ entryId, toast });
  latest.current = { entryId, toast };
  const open = useRef(new Set<string>());
  const count = useRef(0);
  // Closes this entry's toasts when the editor leaves it or unmounts.
  useEffect(
    () => () => {
      for (const id of open.current) latest.current.toast.close(id);
      open.current.clear();
    },
    [entryId],
  );
  return ({ field, legend, undo }: { field: string; legend: string; undo: () => boolean }) => {
    const id = `field-item-removed-${entryId}-${field}-${count.current++}`;
    open.current.add(id);
    toast.notice({
      id,
      title: t("fields.repeater.removedToast", { item: legend }),
      tone: "info",
      timeout: UNDO_MS,
      actions: [
        {
          label: t("fields.repeater.undo"),
          onClick: () => {
            open.current.delete(id);
            if (latest.current.entryId !== entryId) return;
            if (!undo()) latest.current.toast.error(t("fields.repeater.undoFailed"));
          },
        },
      ],
    });
  };
}

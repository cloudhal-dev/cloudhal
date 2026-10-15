import { Badge, Button, Text } from "@cloudflare/kumo";
import { Trash } from "@phosphor-icons/react";

export type CorrectionKind = "correction" | "clarification" | "update";

export interface CorrectionListItem {
  /** Stable key: the correction's id, or a temporary key for one not saved yet. */
  key: string;
  kind: CorrectionKind;
  /** The note as written (markdown shown as text). */
  note: string;
  /** When it was written, formatted by the screen; absent until it is saved. */
  when?: string | undefined;
  /** True while it may still be taken out (not saved yet). */
  removable?: boolean;
}

export interface CorrectionListLabels {
  /** The list's accessible name ("Corrections"). */
  list: string;
  kinds: Record<CorrectionKind, string>;
  /** Shown instead of a time for an item that is not saved yet ("Not saved"). */
  unsaved: string;
  /** Accessible name of the remove button ("Remove correction"). */
  remove: string;
}

export interface CorrectionListProps {
  items: readonly CorrectionListItem[];
  labels: CorrectionListLabels;
  onRemove?: (key: string) => void;
  disabled?: boolean;
}

const KIND_BADGE: Record<CorrectionKind, "warning" | "info" | "neutral"> = {
  correction: "warning",
  clarification: "info",
  update: "neutral",
};

/**
 * An article's corrections in the editor (RFC-0019 §2, DESIGN.md §2ad): newest first, the kind
 * as a badge, the time (or "Not saved") and the note, in a `divide-y` list. Only items that are
 * not saved yet have a remove button; once saved, the store decides what may change.
 */
export function CorrectionList({ items, labels, onRemove, disabled }: CorrectionListProps) {
  return (
    <ol aria-label={labels.list} className="grid divide-y divide-kumo-line">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={KIND_BADGE[item.kind]}>{labels.kinds[item.kind]}</Badge>
              <Text variant="secondary" size="sm" as="span">
                {item.when ?? labels.unsaved}
              </Text>
            </div>
            <Text as="p">{item.note}</Text>
          </div>
          {item.removable && onRemove && (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<Trash />}
              aria-label={labels.remove}
              disabled={disabled}
              onClick={() => onRemove(item.key)}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

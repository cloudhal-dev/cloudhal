import { Button, Checkbox, cn, Text } from "@cloudflare/kumo";
import { X } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactNode, useId } from "react";

export interface BulkAction {
  id: string;
  /** "Approve", "Hide…", "Spam…" (an ellipsis when it opens a dialog). */
  label: string;
  icon?: ReactNode;
  /** `primary` for the one safe, expected action; `secondary` for the rest. Default `secondary`. */
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "secondary-destructive";
  onClick: () => void;
  disabled?: boolean;
  /** Why it is disabled ("Only people can approve comments"): a tooltip and screen-reader text. */
  disabledReason?: string;
  loading?: boolean;
}

export interface BulkActionBarLabels {
  /** Accessible name of the bar ("Bulk actions"). */
  bar: string;
  /** The checkbox: "Select all on this page". */
  selectAll: string;
  /** `(n)` → "12 selected". Announced politely as it changes. */
  selected: (count: number) => string;
  /** The ghost button that clears the selection ("Clear"). Escape does the same. */
  clear: string;
}

export interface BulkActionBarProps {
  /** How many rows are selected. */
  selected: number;
  /** How many rows can be selected (the page), for the all / some / none checkbox. */
  total: number;
  onSelectAll: (checked: boolean) => void;
  onClear: () => void;
  actions: readonly BulkAction[];
  labels: BulkActionBarLabels;
  className?: string;
}

/**
 * The row that replaces a list's toolbar while rows are selected (RFC-0007 §14 queue; DESIGN.md
 * §2w): a select-all checkbox (checked, indeterminate or clear), "12 selected" (a polite live
 * region), the actions — the safe one primary, the rest secondary — and a ghost "Clear". The bar
 * is the toolbar's height so the table does not move; it wraps on phones. Escape clears.
 *
 * Disabled actions keep their reason: Kumo shows `title` as a tooltip on the wrapper, and the
 * reason is also the button's description for screen readers.
 */
export function BulkActionBar({
  selected,
  total,
  onSelectAll,
  onClear,
  actions,
  labels,
  className,
}: BulkActionBarProps) {
  const reasonId = useId();
  const all = total > 0 && selected >= total;
  const some = selected > 0 && !all;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && selected > 0) {
      e.stopPropagation();
      onClear();
    }
  };
  return (
    <fieldset
      aria-label={labels.bar}
      onKeyDown={onKeyDown}
      data-testid="bulk-action-bar"
      className={cn(
        "m-0 flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-kumo-tint px-3 py-1 ring ring-kumo-line",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Checkbox
          checked={all}
          indeterminate={some}
          disabled={total === 0}
          onCheckedChange={(checked) => onSelectAll(checked === true)}
          aria-label={labels.selectAll}
        />
        <span aria-live="polite" aria-atomic="true" className="min-w-0">
          <Text as="span" bold>
            {labels.selected(selected)}
          </Text>
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {actions.map((a) => {
          const reason = a.disabled ? a.disabledReason : undefined;
          return (
            <span key={a.id} className="inline-flex" data-bulk-action={a.id}>
              <Button
                variant={a.variant ?? "secondary"}
                size="sm"
                icon={a.icon}
                disabled={a.disabled || selected === 0}
                loading={a.loading}
                onClick={a.onClick}
                {...(reason ? { title: reason, "aria-describedby": `${reasonId}-${a.id}` } : {})}
              >
                {a.label}
              </Button>
              {reason && (
                <span id={`${reasonId}-${a.id}`} className="sr-only">
                  {reason}
                </span>
              )}
            </span>
          );
        })}
        <Button variant="ghost" size="sm" icon={<X size={16} />} onClick={onClear}>
          {labels.clear}
        </Button>
      </div>
    </fieldset>
  );
}

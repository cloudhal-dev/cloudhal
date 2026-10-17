import { Button, cn } from "@cloudflare/kumo";
import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type TermChipProps = {
  children: ReactNode;
  /** Shown before the label (a star for the primary term). */
  icon?: ReactNode;
  /** Quieter chip for a proposed or otherwise pending term. */
  tone?: "default" | "pending";
  className?: string;
} & (
  | {
      /** Accessible name of the remove button ("Remove AI"), from the screen's catalog. */
      removeLabel: string;
      onRemove: () => void;
    }
  | { removeLabel?: undefined; onRemove?: undefined }
);

/**
 * A removable chip with Kumo `Combobox.Chip`'s anatomy (h-6, hairline ring, overlay fill), for
 * selections made outside a `Combobox` — the tags chosen with the tag `Autocomplete`.
 */
export function TermChip({
  children,
  icon,
  removeLabel,
  onRemove,
  tone = "default",
  className,
}: TermChipProps) {
  return (
    <span
      data-term-chip=""
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-sm ps-2 text-sm ring-1 ring-kumo-hairline",
        tone === "pending" ? "bg-kumo-base text-kumo-subtle" : "bg-kumo-overlay",
        onRemove ? "pe-0.5" : "pe-2",
        className,
      )}
    >
      {icon && <span className="flex shrink-0 items-center text-kumo-subtle">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
      {onRemove && (
        <Button
          variant="ghost"
          size="xs"
          shape="square"
          aria-label={removeLabel}
          icon={<XIcon size={10} />}
          onClick={onRemove}
        />
      )}
    </span>
  );
}

/** A wrapping row of `TermChip`s. */
export function TermChipList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a chip row, not a form control group
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      {children}
    </div>
  );
}

import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export type InsetPanelVariant = "outline" | "recessed";

export interface InsetPanelProps {
  /** `outline`: hairline ring on the surface (summaries, "Now → New" rows). `recessed`: darker fill for quoted, agent-written text. */
  variant?: InsetPanelVariant;
  /** `row` lays children out on one line, wrapping on narrow screens (label left, action right). */
  layout?: "stack" | "row";
  /** Accessible name when the panel stands on its own (`role="group"`). */
  label?: string;
  className?: string;
  children: ReactNode;
}

const VARIANT: Record<InsetPanelVariant, string> = {
  outline: "ring ring-kumo-hairline",
  recessed: "bg-kumo-recessed ring ring-kumo-hairline",
};

/**
 * A flat panel inside a card or dialog — the place for summaries and quoted text that must stand
 * apart from the form around it. Use it instead of hand-made `rounded-lg ring` divs; for a
 * standalone surface use `LayerCard`/`Surface`.
 */
export function InsetPanel({
  variant = "outline",
  layout = "stack",
  label,
  className,
  children,
}: InsetPanelProps) {
  const props = label ? { role: "group" as const, "aria-label": label } : {};
  return (
    <div
      {...props}
      className={cn(
        "min-w-0 rounded-lg px-4 py-3",
        VARIANT[variant],
        layout === "row" ? "flex flex-wrap items-center justify-between gap-3" : "grid gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

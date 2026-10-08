import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export type ColumnsVariant = "2-1" | "1-2" | "1-1";

export interface ColumnsProps {
  /**
   * `2-1`: main + side (dashboards, detail pages); `1-2`: a fixed 13rem navigation column (the
   * settings table of contents) + main capped at a readable 56rem; `1-1`: halves.
   */
  variant?: ColumnsVariant;
  className?: string;
  children: ReactNode;
}

/**
 * Two-column page body that responds to the **content width**, not the viewport: inside
 * `PageLayout` (a `@container/page`) the columns appear only when there is room for them, so the
 * sidebar being open or collapsed never squeezes the side column. Kumo's `Grid` switches at the
 * viewport's `md`, which in an app shell with a sidebar is far too early for a 2:1 split.
 * Each child is a column; give it `grid content-start gap-6` for stacked cards.
 */
export function Columns({ variant = "2-1", className, children }: ColumnsProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-6",
        variant === "2-1" && "@4xl/page:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]",
        variant === "1-2" && "@4xl/page:grid-cols-[13rem_minmax(0,56rem)]",
        variant === "1-1" && "@3xl/page:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

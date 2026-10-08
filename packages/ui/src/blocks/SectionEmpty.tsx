import { cn, Empty } from "@cloudflare/kumo";
import type { ComponentProps } from "react";

export type SectionEmptyProps = ComponentProps<typeof Empty>;

/**
 * Kumo `Empty` without its own frame, for an empty state that sits **inside** something that
 * already has one: a flush `SectionCard`, a table cell, a dialog. A list's empty state on the page
 * is a bare `Empty` (its frame takes the table's place) — never `Empty` inside `LayerCard`, which
 * draws two borders.
 */
export function SectionEmpty({ className, size = "sm", ...props }: SectionEmptyProps) {
  return (
    <Empty
      size={size}
      className={cn("rounded-none border-0 bg-transparent shadow-none ring-0", className)}
      {...props}
    />
  );
}

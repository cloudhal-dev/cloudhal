import { Badge } from "@cloudflare/kumo";
import type { PublishStatus } from "@cloudhal/core-contracts";

export interface StatusBadgeProps {
  status: PublishStatus;
  /** The words, from the screen's catalog (`status.*` in Studio). */
  label: string;
}

const VARIANT: Record<PublishStatus, "secondary" | "warning" | "success" | "outline"> = {
  draft: "secondary",
  review: "warning",
  published: "success",
  archived: "outline",
};

/** Editorial lifecycle badge for pages and content entries. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  // Kumo's Badge does not forward data attributes; the wrapper carries the machine-readable status.
  return (
    <span data-status={status} className="inline-flex">
      {/* biome-ignore lint/suspicious/noExplicitAny: Kumo's Badge variant union is wider than ours */}
      <Badge variant={VARIANT[status] as any}>{label}</Badge>
    </span>
  );
}

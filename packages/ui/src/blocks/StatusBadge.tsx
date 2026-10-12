import { Badge } from "@cloudflare/kumo";
import type { PublishStatus } from "@cloudhal/core-contracts";

export interface StatusBadgeProps {
  status: PublishStatus;
  /** Localised label; defaults to English. */
  label?: string | undefined;
}

const LABEL: Record<PublishStatus, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  archived: "Archived",
};
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
      <Badge variant={VARIANT[status] as any}>{label ?? LABEL[status]}</Badge>
    </span>
  );
}

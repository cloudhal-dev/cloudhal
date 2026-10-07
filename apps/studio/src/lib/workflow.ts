import type { PublishStatus } from "@cloudhal/core-contracts";

/** Allowed editorial transitions (RFC-0001 lifecycle). */
export const TRANSITIONS: Record<PublishStatus, PublishStatus[]> = {
  draft: ["review", "archived"],
  review: ["draft", "published", "archived"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

export function canTransition(from: PublishStatus, to: PublishStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Transitions that need an explicit human approval in Studio. */
export function needsApproval(to: PublishStatus): boolean {
  return to === "published";
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 128) || "untitled"
  );
}

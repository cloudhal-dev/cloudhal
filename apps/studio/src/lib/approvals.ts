/**
 * Helpers for the Approvals screen (ADR-0014): agents' publish / rollback / delete requests that
 * wait for a person in Studio.
 */
import type { Site, Snapshot } from "@cloudhal/core-contracts";
import { ApiRequestError, type Approval, type ApprovalStatus } from "./api.ts";

/** How often the site surface checks for new requests (sidebar badge, overview banner). */
export const APPROVALS_POLL_MS = 15_000;

/** Tools whose approval changes what visitors see or deletes content: confirm before approving. */
export const CONFIRM_TOOLS = ["publish", "rollback", "delete_page", "delete_entry"] as const;

export function needsConfirmation(tool: string): boolean {
  return (CONFIRM_TOOLS as readonly string[]).includes(tool);
}

/** The server answers 409 when a request was decided, used or expired in the meantime. */
export function isNoLongerPending(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

export const STATUS_VARIANT: Record<ApprovalStatus, "success" | "warning" | "error" | "neutral"> = {
  pending: "warning",
  approved: "success",
  denied: "error",
  consumed: "neutral",
  expired: "warning",
};

/** Pending requests by expiry (the next to lapse first); everything else newest first. */
export function splitApprovals(items: readonly Approval[]): {
  pending: Approval[];
  history: Approval[];
} {
  const pending = items
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const history = items
    .filter((a) => a.status !== "pending")
    .sort((a, b) =>
      (b.decidedAt ?? b.consumedAt ?? b.createdAt).localeCompare(
        a.decidedAt ?? a.consumedAt ?? a.createdAt,
      ),
    );
  return { pending, history };
}

/** True when a pending request expires within `withinMs` (default one hour). */
export function expiresSoon(expiresAt: string, now = Date.now(), withinMs = 60 * 60 * 1000) {
  const at = new Date(expiresAt).getTime();
  return at - now <= withinMs;
}

/** Pretty JSON for the argument viewer; undefined when the call had no input. */
export function formatArguments(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "object" && Object.keys(input as object).length === 0) return undefined;
  return JSON.stringify(input, null, 2);
}

/** A string argument of the call (e.g. `snapshotId` for rollback, `pageId` for delete_page). */
export function argument(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * What a publish would roughly change: the live snapshot against the newest snapshot. `publish`
 * snapshots the current state first, so edits made after the newest snapshot are not counted —
 * Studio labels this as an approximation.
 */
export function publishDiffRange(
  site: Pick<Site, "publishedSnapshotId"> | undefined,
  snapshots: readonly Pick<Snapshot, "id" | "createdAt">[] | undefined,
):
  | { kind: "range"; from: string; to: string }
  | { kind: "first" }
  | { kind: "up-to-date" }
  | undefined {
  if (!site || !snapshots) return undefined;
  const latest = [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!site.publishedSnapshotId) return { kind: "first" };
  if (!latest || latest.id === site.publishedSnapshotId) return { kind: "up-to-date" };
  return { kind: "range", from: site.publishedSnapshotId, to: latest.id };
}

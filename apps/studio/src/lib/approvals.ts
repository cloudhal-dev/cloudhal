/**
 * Helpers for the Approvals screen (ADR-0014): agents' publish / rollback / delete requests that
 * wait for a person in Studio.
 */
import type { Site, Snapshot } from "@cloudhal/core-contracts";
import { isKeyMode } from "./agents.ts";
import {
  type AgentKeySummary,
  ApiRequestError,
  type Approval,
  type ApprovalStatus,
  type KeyMode,
} from "./api.ts";
import { ELEVATION_PRESETS } from "./elevation.ts";

/** How often the site surface checks for new requests (sidebar badge, overview banner). */
export const APPROVALS_POLL_MS = 15_000;

/** Tools whose approval changes what visitors see or deletes content: confirm before approving. */
export const CONFIRM_TOOLS = [
  "publish",
  "rollback",
  "delete_page",
  "delete_entry",
  // RFC-0041 §8: destructive field operations (values converted or removed in every entry).
  "change_field_type",
  "remove_field",
] as const;

export function needsConfirmation(tool: string): boolean {
  return (CONFIRM_TOOLS as readonly string[]).includes(tool);
}

/** The server answers 409 `conflict` when a request was decided, used or expired in the meantime. */
export function isNoLongerPending(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.body.error !== "elevation_conflict"
  );
}

/**
 * 409 `elevation_conflict`: the request is still pending, but the agent's key cannot take the
 * elevation now (gone, not yours, or its own mode reached it).
 */
export function isElevationConflict(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.body.error === "elevation_conflict"
  );
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

/** The MCP tool an agent calls to ask for a time-boxed elevation (ADR-0016 addendum). */
export const REQUEST_ELEVATION = "request_elevation";

/** What an agent asked for: a mode, for how long, why, and on which of the owner's keys. */
export interface ElevationRequest {
  mode: KeyMode;
  minutes: number;
  /** The agent's own words (agent-controlled: plain text only); may be empty on odd requests. */
  reason: string;
  keyId: string | undefined;
  /** The key's own mode when it asked (servers since the ADR-0016 follow-up record it). */
  ownMode: KeyMode | undefined;
}

/** The request's `input` read as an elevation request; undefined for every other approval. */
export function elevationRequestOf(
  request: Pick<Approval, "tool" | "input">,
): ElevationRequest | undefined {
  if (request.tool !== REQUEST_ELEVATION || !request.input || typeof request.input !== "object")
    return undefined;
  const input = request.input as Record<string, unknown>;
  if (!isKeyMode(input.mode) || typeof input.minutes !== "number" || !(input.minutes > 0))
    return undefined;
  return {
    mode: input.mode,
    minutes: Math.round(input.minutes),
    reason: typeof input.reason === "string" ? input.reason.trim() : "",
    keyId: typeof input.keyId === "string" ? input.keyId : undefined,
    ownMode: isKeyMode(input.ownMode) ? input.ownMode : undefined,
  };
}

export function isElevationRequest(request: Pick<Approval, "tool" | "input">): boolean {
  return elevationRequestOf(request) !== undefined;
}

/** The server's English prompt names the key's own mode: `… (its own mode is EDITS): "…"`. */
const OWN_MODE_IN_PROMPT = /\(its own mode is ([A-Za-z]+)\)/;

/**
 * The key's own mode, best source first: the owner's key list (current truth), the mode recorded
 * with the request, the server's prompt (older servers), then the mode the agent worked in (which
 * may itself have been an elevation).
 */
export function requestOwnMode(
  request: Pick<Approval, "prompt" | "mode" | "input" | "tool">,
  keys?: readonly Pick<AgentKeySummary, "id" | "mode">[] | undefined,
): KeyMode | undefined {
  const elevation = elevationRequestOf(request);
  const keyId = elevation?.keyId;
  const key = keyId ? keys?.find((k) => k.id === keyId) : undefined;
  if (key && isKeyMode(key.mode)) return key.mode;
  if (elevation?.ownMode) return elevation.ownMode;
  // Requests from older servers only name it in the English prompt.
  const fromPrompt = OWN_MODE_IN_PROMPT.exec(request.prompt)?.[1]?.toLowerCase();
  if (isKeyMode(fromPrompt)) return fromPrompt;
  return isKeyMode(request.mode) ? request.mode : undefined;
}

/**
 * One-click durations when granting a request: the standard presets shorter than what the agent
 * asked for (and allowed by the server), then the request itself. Never longer.
 */
export function grantPresets(requested: number, bounds: { minMinutes: number }): number[] {
  const shorter = ELEVATION_PRESETS.filter((m) => m < requested && m >= bounds.minMinutes);
  return [...shorter, requested];
}

export interface PendingElevation {
  siteId: string;
  request: Approval;
  elevation: ElevationRequest;
}

/**
 * Pending elevation requests by the key they are for (one per key, the server's rule), so the
 * key list can say "Asks for Auto". Requests from several sites are merged; the newest wins.
 */
export function pendingElevationsByKey(
  bySite: ReadonlyArray<{ siteId: string; items: readonly Approval[] | undefined }>,
): Map<string, PendingElevation> {
  const out = new Map<string, PendingElevation>();
  for (const { siteId, items } of bySite) {
    for (const request of items ?? []) {
      const elevation = request.status === "pending" ? elevationRequestOf(request) : undefined;
      if (!elevation?.keyId) continue;
      const seen = out.get(elevation.keyId);
      if (!seen || seen.request.createdAt < request.createdAt)
        out.set(elevation.keyId, { siteId, request, elevation });
    }
  }
  return out;
}

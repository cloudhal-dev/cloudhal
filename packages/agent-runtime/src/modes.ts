/**
 * Agent modes (ADR-0015): how independently an agent works, chosen per API key by its owner —
 * the same idea as an IDE agent's permission modes. A mode never grants scopes; it narrows what
 * the key's scopes allow and decides where a person must approve.
 */
import type { Scope } from "./policy.ts";

export type AgentMode = "plan" | "manual" | "edits" | "auto" | "bypass";

/** In order of increasing autonomy. */
export const AGENT_MODES: readonly AgentMode[] = ["plan", "manual", "edits", "auto", "bypass"];

/** What existing keys and new keys without a choice get. */
export const DEFAULT_AGENT_MODE: AgentMode = "edits";

/** Modes a remote (HTTP, API key) agent may hold. `bypass` is for local stdio only. */
export const REMOTE_AGENT_MODES: readonly AgentMode[] = ["plan", "manual", "edits", "auto"];

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value);
}

/** The scopes a key needs to be useful in a mode (offered by default when creating one). */
export function scopesForMode(mode: AgentMode): Scope[] {
  const read: Scope[] = ["site:read", "content:read", "preview:create"];
  if (mode === "plan") return read;
  return [...read, "content:write", "site:publish", "site:rollback"];
}

/** Limits for an `auto`-mode publish that goes live without a person (see `isLowRiskPublish`). */
export const AUTO_PUBLISH_LIMIT = 20;

export interface PendingChange {
  id: string;
  kind: string;
}

/**
 * Low risk = only articles added or edited, nothing removed, no pages or site settings touched,
 * and at most `AUTO_PUBLISH_LIMIT` changes. Anything else waits for a person even in `auto`.
 */
export function isLowRiskPublish(diff: {
  added: PendingChange[];
  changed: { after: PendingChange }[];
  removed: PendingChange[];
}): { lowRisk: boolean; reason: string } {
  const touched = [...diff.added, ...diff.changed.map((c) => c.after)];
  if (diff.removed.length > 0) return { lowRisk: false, reason: "it removes content" };
  if (touched.length === 0) return { lowRisk: false, reason: "nothing to publish" };
  if (touched.some((n) => n.kind !== "contentEntry"))
    return { lowRisk: false, reason: "it changes pages or site settings" };
  if (touched.length > AUTO_PUBLISH_LIMIT)
    return { lowRisk: false, reason: `it changes more than ${AUTO_PUBLISH_LIMIT} articles` };
  return { lowRisk: true, reason: `${touched.length} article change(s) only` };
}

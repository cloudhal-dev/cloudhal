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

/** Why `auto` mode did or did not let a publish through, as data (Studio words it itself). */
export type AutoCheckCode = "low-risk" | "removes-content" | "nothing" | "structure" | "too-many";

/** The `auto`-mode check behind a publish (stored on audit rows and approvals, ADR-0015). */
export interface AutoCheck {
  rule: "low-risk-publish";
  lowRisk: boolean;
  code: AutoCheckCode;
  /** Pending changes the publish would carry (added + edited + removed). */
  changes: number;
  /** `AUTO_PUBLISH_LIMIT` at the time of the check. */
  limit: number;
}

const AUTO_CHECK_TEXT: Record<AutoCheckCode, (c: AutoCheck) => string> = {
  "low-risk": (c) => `${c.changes} article change(s) only`,
  "removes-content": () => "it removes content",
  nothing: () => "nothing to publish",
  structure: () => "it changes pages, site settings, taxonomies or redirects",
  "too-many": (c) => `it changes more than ${c.limit} articles`,
};

/** English wording of a check, for agents and audit reasons. */
export function describeAutoCheck(check: AutoCheck): string {
  return AUTO_CHECK_TEXT[check.code](check);
}

/**
 * Low risk = only articles added or edited, nothing removed, no pages, site settings, taxonomies,
 * terms or redirects touched (RFC-0002 §6.4), and at most `AUTO_PUBLISH_LIMIT` changes. Anything
 * else waits for a person even in `auto`.
 */
export function checkAutoPublish(diff: {
  added: PendingChange[];
  changed: { after: PendingChange }[];
  removed: PendingChange[];
}): AutoCheck {
  const touched = [...diff.added, ...diff.changed.map((c) => c.after)];
  const base = {
    rule: "low-risk-publish" as const,
    changes: touched.length + diff.removed.length,
    limit: AUTO_PUBLISH_LIMIT,
  };
  const code: AutoCheckCode =
    diff.removed.length > 0
      ? "removes-content"
      : touched.length === 0
        ? "nothing"
        : touched.some((n) => n.kind !== "contentEntry")
          ? "structure"
          : touched.length > AUTO_PUBLISH_LIMIT
            ? "too-many"
            : "low-risk";
  return { ...base, code, lowRisk: code === "low-risk" };
}

/**
 * Time-boxed elevation (ADR-0016): the owner lets a key work in a more autonomous mode until
 * `until`; afterwards it is back in its own mode without anyone doing anything (the effective mode
 * is computed on every call).
 */
export interface ModeElevation {
  mode: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
  /** Actor id of the person who granted it. */
  grantedBy: string;
  grantedAt: string;
  /** Why, in the owner's words (shown in Studio and the audit). */
  reason?: string | undefined;
}

/** Shortest and longest elevation an owner can grant. */
export const ELEVATION_MIN_MINUTES = 5;
export const ELEVATION_MAX_MINUTES = 24 * 60;

/** `a` lets the agent do more on its own than `b` (AGENT_MODES order). */
export function isMoreAutonomous(a: AgentMode, b: AgentMode): boolean {
  return AGENT_MODES.indexOf(a) > AGENT_MODES.indexOf(b);
}

/**
 * Why an elevation request is refused, or undefined when it is acceptable: a remote mode more
 * autonomous than the key's own, for between `ELEVATION_MIN_MINUTES` and `ELEVATION_MAX_MINUTES`.
 */
export function elevationProblem(
  base: AgentMode,
  mode: AgentMode,
  minutes: number,
): string | undefined {
  if (!REMOTE_AGENT_MODES.includes(mode))
    return `mode "${mode}" is not available for API keys (bypass is local only)`;
  if (!isMoreAutonomous(mode, base))
    return `an elevation must be more autonomous than the key's own mode (${base})`;
  if (
    !Number.isInteger(minutes) ||
    minutes < ELEVATION_MIN_MINUTES ||
    minutes > ELEVATION_MAX_MINUTES
  )
    return `minutes must be a whole number between ${ELEVATION_MIN_MINUTES} and ${ELEVATION_MAX_MINUTES}`;
  return undefined;
}

/** The elevation that applies right now, if any (expired or no-longer-higher ones do not). */
export function activeElevation(
  base: AgentMode,
  elevation: ModeElevation | undefined,
  now: Date,
): ModeElevation | undefined {
  if (!elevation || !REMOTE_AGENT_MODES.includes(elevation.mode)) return undefined;
  if (!isMoreAutonomous(elevation.mode, base)) return undefined;
  const until = Date.parse(elevation.until);
  return Number.isFinite(until) && until > now.getTime() ? elevation : undefined;
}

/** How long before an elevation ends that owners and the agent are told (Studio notifications, `get_mode`). */
export const ELEVATION_NOTICE_MINUTES = 10;

/** Whole minutes left until `until` (rounded up; 0 once it has ended). */
export function minutesLeft(until: string, now: Date): number {
  const ms = Date.parse(until) - now.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/** True during the last `ELEVATION_NOTICE_MINUTES` of an elevation. */
export function endsSoon(until: string, now: Date): boolean {
  const left = minutesLeft(until, now);
  return left > 0 && left <= ELEVATION_NOTICE_MINUTES;
}

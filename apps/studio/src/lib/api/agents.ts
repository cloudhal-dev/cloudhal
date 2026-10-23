/** Agents: the audit trail, agent keys and modes, skills, and where agents reach MCP. */
import type { Actor } from "@cloudhal/core-contracts";
import { json, listOf, query, request } from "./http.ts";
import type { Role } from "./team.ts";

/** One row of the audit trail (`packages/agent-runtime/src/audit.ts`). */
export interface AuditRow {
  id: number;
  at: string;
  actor: Actor;
  siteId?: string;
  tool: string;
  decision: "allow" | "deny" | "approval-required";
  reason?: string;
  skill?: string;
  input?: unknown;
  outcome?: "ok" | "error" | "pending";
  snapshotId?: string;
  durationMs?: number;
  /** Agent mode the call ran under (ADR-0015); absent for people and for older rows. */
  mode?: AgentMode;
  /** Why the call waited for a person (`approval-required` rows; absent on older rows). */
  cause?: ApprovalCause;
  /** The `auto`-mode check behind a publish; `lowRisk` on an `allow` row = went live without a person. */
  autoCheck?: AutoCheck;
  /**
   * The call ran under a time-boxed elevation (ADR-0016): `from` is the key's own mode, `until` when
   * the elevation ended; `mode` is then the elevated one.
   */
  elevation?: AuditElevation;
}

/** How an audit row records a time-boxed elevation (ADR-0016). */
export interface AuditElevation {
  from: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
}

/** The elevation a person granted for an agent's request (ADR-0016). */
export interface ElevationGrant {
  from: AgentMode;
  mode: AgentMode;
  minutes: number;
  until: string;
}

/**
 * Why a call waits for a person (packages/agent-runtime/src/policy.ts). `role`: a person asked for
 * something their staff role cannot do alone (an Author's publish that includes others' work,
 * RFC-0005 §6); someone whose role allows it decides.
 */
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode" | "role";

/** Why `auto` mode did or did not let a publish through (packages/agent-runtime/src/modes.ts). */
export type AutoCheckCode =
  | "low-risk"
  | "removes-content"
  | "nothing"
  | "structure"
  | "too-many"
  | "media"
  | "outside-window"
  | "correction"
  /** RFC-0042 §3.5: a live entry gains a derived gate (its collection's expiry) or an earlier one. */
  | "expires";
export interface AutoCheck {
  rule: "low-risk-publish";
  lowRisk: boolean;
  code: AutoCheckCode;
  /** Pending changes the publish carried. */
  changes: number;
  /** Largest publish `auto` mode lets through, at the time of the check. */
  limit: number;
}
export type AuditDecision = AuditRow["decision"];
export type AuditOutcome = NonNullable<AuditRow["outcome"]>;

export interface ActivityPage {
  items: AuditRow[];
  /** Cursor for the next (older) page; `null` when this was the last one. */
  nextBefore: number | null;
}

/**
 * Scopes an agent key can carry (`packages/agent-runtime/src/policy.ts`, `KEY_SCOPES`). The `:own`
 * variants are what Authors' and Contributors' roles hold (RFC-0005 §1); `*` only on older keys.
 */
export type AgentScope =
  | "site:read"
  | "site:write"
  | "content:read"
  | "content:write"
  | "content:write:own"
  | "content:draft:own"
  | "content:propose"
  | "preview:create"
  | "site:publish"
  | "site:publish:own"
  | "site:rollback"
  | "asset:upload"
  | "asset:manage"
  | "analytics:read"
  | "comments:read"
  | "comments:moderate"
  | "comments:moderate:own"
  | "comments:reply"
  | "comments:reply:own"
  | "schedules:read"
  | "schedules:write"
  | "schedules:write:own"
  | "releases:publish"
  | "releases:publish:own"
  | "*";

/** Scopes only a person holds through their role: never on a key (RFC-0005 I7). */
export type PersonScope =
  | "audit:read"
  | "site:settings"
  | "members:invite"
  | "members:manage"
  | "site:create"
  | "agents:manage"
  | "commenters:data"
  /** RFC-0016: in-editor AI commands. */
  | "ai:invoke";
/**
 * Schedule scopes (RFC-0008 §10.1): the calendar, releases and gates (`:own`: one's own nodes),
 * approving releases, and automations (people only). Studio reads them through roles and abilities.
 */
export type ScheduleScope =
  | "schedules:read"
  | "schedules:write"
  | "schedules:write:own"
  | "releases:publish"
  | "releases:publish:own"
  | "automations:manage";
export type AnyScope = AgentScope | PersonScope | ScheduleScope;

/**
 * How independently an agent works (ADR-0015, `packages/agent-runtime/src/modes.ts`). A mode never
 * grants scopes; it narrows them and decides where a person approves.
 */
export type AgentMode = "plan" | "manual" | "edits" | "auto" | "bypass";
/** Modes an API key can hold: `bypass` exists only for the local `cloudhal mcp --mode bypass`. */
export type KeyMode = Exclude<AgentMode, "bypass">;

export interface AgentKeySummary {
  id: string;
  name: string | null;
  /** First characters of the key, for recognition. */
  start: string | null;
  scopes: AgentScope[];
  /** The key's own mode. Keys created before modes read as `edits` on the server. */
  mode: KeyMode;
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
  /** A time-boxed elevation in force right now (ADR-0016); absent when none or expired. */
  elevation?: AgentKeyElevation;
  /** The mode the agent's next call runs in: the elevation's while it lasts, else `mode`. Older servers omit it. */
  effectiveMode?: AgentMode;
  /**
   * What the key can do right now: its scopes narrowed to its creator's current role (RFC-0005 I5).
   * Narrower than `scopes` after a demotion. Older servers omit it.
   */
  effectiveScopes?: AgentScope[];
  /** The agent actor id its calls are recorded under (entries it writes carry it as `author`). */
  agentId?: string;
  /** Who created the key; listed with `?all=1` (Administrators, `agents:manage`). */
  owner?: { userId: string; name: string | null; role: Role | null };
}

/** A more autonomous mode an owner granted a key for a while (ADR-0016). */
export interface AgentKeyElevation {
  mode: KeyMode;
  /** ISO time it ends by itself. */
  until: string;
  /** Actor id (`user_…`) of the person who granted it. */
  grantedBy: string;
  grantedAt: string;
  /** Why, in the owner's words (at most 200 characters; also in the audit log). */
  reason?: string;
}

/** `POST /api/agent-keys/:id/elevation`: a mode more autonomous than the key's own, for a while. */
export interface ElevationInput {
  mode: KeyMode;
  /** Whole minutes within `agentModes.elevation` (5–1440 on current servers). */
  minutes: number;
  reason?: string;
}
/** The create response: the summary plus the plaintext key, returned exactly once. */
export type CreatedAgentKey = AgentKeySummary & { key: string };

/** Where agents reach this Studio's MCP server (streamable HTTP, same origin as the API). */
export function mcpEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/mcp`;
}

export interface AgentModesInfo {
  /** Modes an API key can hold, in order of increasing autonomy. */
  modes: AgentMode[];
  default: AgentMode;
  /** Scopes a key gets in each mode when the owner does not choose them. */
  scopes: Partial<Record<AgentMode, AgentScope[]>>;
  autoPublishLimit: number;
  /**
   * Bounds of a time-boxed elevation, in minutes (ADR-0016), and how long before its end the owner
   * is told (`noticeMinutes`, newer servers). Older servers omit it.
   */
  elevation?: { minMinutes: number; maxMinutes: number; noticeMinutes?: number };
}

/** A skill agents can read over MCP (`GET /api/skills`). */
export interface SkillSummary {
  name: string;
  description: string;
  /** The most a call made under this skill may do (never more than the caller's own scopes). */
  scopes: string[];
  /** Tools that always stop for a person when called under this skill. */
  approval: string[];
  requiresCapabilities: string[];
  /** File names under `references/`. */
  references: string[];
  /** MCP resource id, `skill://<name>/SKILL.md`. */
  resource: string;
}

export const agentsApi = {
  skills: {
    list: () => request<SkillSummary[]>("/api/skills"),
  },
  activity: {
    /** The site's audit trail, newest first; pass `nextBefore` back as `before` for older rows. */
    list: (
      siteId: string,
      options: { limit?: number; before?: number | null; actorId?: string } = {},
    ) =>
      request<ActivityPage>(
        `/api/sites/${siteId}/activity${query({
          limit: options.limit,
          before: options.before,
          actorId: options.actorId,
        })}`,
      ),
    /** Deployment events (members, invites, keys; no site), newest first. `audit:read` (Editor+). */
    deployment: (options: { limit?: number; before?: number | null } = {}) =>
      request<ActivityPage>(
        `/api/activity${query({ limit: options.limit, before: options.before })}`,
      ),
  },
  agentKeys: {
    list: () => request<AgentKeySummary[]>("/api/agent-keys").then(listOf<AgentKeySummary>),
    /** Every key with its `owner` (`agents:manage`, Administrators). */
    listAll: () =>
      request<AgentKeySummary[]>("/api/agent-keys?all=1").then(listOf<AgentKeySummary>),
    /** Without `scopes` the server grants what the mode needs (`scopesForMode`). */
    create: (input: { name: string; mode?: KeyMode; scopes?: AgentScope[] }) =>
      request<CreatedAgentKey>("/api/agent-keys", { method: "POST", ...json(input) }),
    /** Audited; applies on the agent's next call. 400 for `bypass` or an unknown mode. */
    setMode: (id: string, mode: KeyMode) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ mode }),
      }),
    /**
     * "Allow analytics" (RFC-0006 §9.1): adds `analytics:read` to a key made before it existed. Own
     * keys, or any with `agents.manage`; audited. 400 `scope_above_role` when the key's creator
     * cannot read analytics (Contributors). Harmless when the key already holds it.
     */
    allowAnalytics: (id: string) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ addScopes: ["analytics:read"] }),
      }),
    /**
     * "Allow comments" (RFC-0007 §10.1): adds `comments:read` to a key made before comments
     * existed, with the same rules as `allowAnalytics` (Contributors' keys cannot hold it).
     */
    allowComments: (id: string) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ addScopes: ["comments:read"] }),
      }),
    /**
     * A more autonomous mode until the time is up, then the key's own mode again (ADR-0016; audited).
     * Replaces an elevation in force. 400 when the mode is not above the key's own, is bypass, or
     * `minutes` is out of bounds.
     */
    elevate: (id: string, input: ElevationInput) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}/elevation`, {
        method: "POST",
        ...json(input),
      }),
    /** Ends an elevation early (audited); harmless when none is in force. */
    endElevation: (id: string) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}/elevation`, {
        method: "DELETE",
      }),
    remove: (id: string) =>
      request<void>(`/api/agent-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};

/**
 * `/api/instance` — what this Studio deployment offers (for UI that adapts to it), and
 * `/api/skills` — the skills agents see over MCP. Both require a signed-in user.
 */
import {
  ABILITIES,
  type AgentMode,
  AUTO_PUBLISH_LIMIT,
  DEFAULT_AGENT_MODE,
  ELEVATION_MAX_MINUTES,
  ELEVATION_MIN_MINUTES,
  ELEVATION_NOTICE_MINUTES,
  INVITE_ADMIN_MAX_HOURS,
  INVITE_DEFAULT_HOURS,
  INVITE_MAX_HOURS,
  INVITE_MIN_HOURS,
  type LoadedSkill,
  MODE_CAPS,
  REMOTE_AGENT_MODES,
  ROLES,
  type Role,
  roleScopes,
  type Scope,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type { AnalyticsFeature } from "@cloudhal/analytics/service";
import { Hono } from "hono";
import type { Env } from "../context.ts";

export interface InstanceInfo {
  signUp: "first-user" | "closed" | "open" | "unknown";
  features: {
    agentKeys: boolean;
    mcp: boolean;
    activity: boolean;
    previewLinks: boolean;
    deployTransfer: boolean;
    approvals: boolean;
    /** Agents can ask for a time-boxed elevation; a person grants it in Approvals (ADR-0016). */
    elevationRequests: boolean;
    /** Staff roles, members and invites (RFC-0005). */
    members: boolean;
    /**
     * Site analytics (RFC-0006 §8): `store` where events are recorded, `reader` whether they can be
     * read (`none`: recorded but not readable yet, e.g. no Analytics SQL binding), the live window,
     * the daily live-query budget and how daily totals are made.
     */
    analytics: AnalyticsFeature;
  };
  /** The agent modes an API key can hold and what each defaults to (ADR-0015). */
  agentModes: AgentModesInfo;
  /** The server's role rules (RFC-0005 §10.1), so Studio applies them instead of copying them. */
  roles: RolesInfo;
  /** Invite rules (RFC-0005 §7). */
  invites: InvitesInfo;
}

export interface RolesInfo {
  /** Highest rank first. */
  names: Role[];
  scopes: Record<Role, Scope[]>;
  /** The most autonomous mode a role's keys may hold. */
  modeCaps: Record<Role, AgentMode>;
  /** Ability → the scope it needs (`owner`: the Owner only). */
  abilities: typeof ABILITIES;
}

export interface InvitesInfo {
  defaultHours: number;
  minHours: number;
  maxHours: number;
  /** Administrator invites expire sooner. */
  adminMaxHours: number;
  /** `["link"]`, or `["link", "email"]` with a mail sender. */
  delivery: ("link" | "email")[];
}

export function rolesInfo(): RolesInfo {
  return {
    names: [...ROLES],
    scopes: Object.fromEntries(ROLES.map((r) => [r, roleScopes(r)])) as Record<Role, Scope[]>,
    modeCaps: { ...MODE_CAPS },
    abilities: ABILITIES,
  };
}

export function invitesInfo(email: boolean): InvitesInfo {
  return {
    defaultHours: INVITE_DEFAULT_HOURS,
    minHours: INVITE_MIN_HOURS,
    maxHours: INVITE_MAX_HOURS,
    adminMaxHours: INVITE_ADMIN_MAX_HOURS,
    delivery: email ? ["link", "email"] : ["link"],
  };
}

export interface AgentModesInfo {
  /** Modes an owner can give an API key, in order of increasing autonomy (never `bypass`). */
  modes: AgentMode[];
  default: AgentMode;
  /** Scopes a key gets in each mode when the owner does not choose them. */
  scopes: Partial<Record<AgentMode, Scope[]>>;
  /** Largest publish `auto` mode lets through without a person. */
  autoPublishLimit: number;
  /** Bounds of a time-boxed elevation (ADR-0016). */
  elevation: { minMinutes: number; maxMinutes: number; noticeMinutes: number };
}

/** The server's mode rules, so clients do not copy them. */
export function agentModesInfo(): AgentModesInfo {
  return {
    modes: [...REMOTE_AGENT_MODES],
    default: DEFAULT_AGENT_MODE,
    scopes: Object.fromEntries(REMOTE_AGENT_MODES.map((m) => [m, scopesForMode(m)])),
    autoPublishLimit: AUTO_PUBLISH_LIMIT,
    elevation: {
      minMinutes: ELEVATION_MIN_MINUTES,
      maxMinutes: ELEVATION_MAX_MINUTES,
      noticeMinutes: ELEVATION_NOTICE_MINUTES,
    },
  };
}

export interface SkillSummary {
  name: string;
  description: string;
  scopes: string[];
  approval: string[];
  requiresCapabilities: string[];
  references: string[];
  resource: string;
}

export function instanceRoutes(info: () => InstanceInfo, skills: LoadedSkill[]): Hono<Env> {
  return new Hono<Env>()
    .get("/instance", (c) => c.json(info()))
    .get("/skills", async (c) =>
      c.json(
        await Promise.all(
          skills.map(
            async (s): Promise<SkillSummary> => ({
              name: s.manifest.name,
              description: s.manifest.description,
              scopes: s.cloudhal.scopes,
              approval: s.cloudhal.approval,
              requiresCapabilities: s.cloudhal.requiresCapabilities,
              references: await s.references(),
              resource: `skill://${s.manifest.name}/SKILL.md`,
            }),
          ),
        ),
      ),
    );
}

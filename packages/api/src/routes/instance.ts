/**
 * `/api/instance` — what this Studio deployment offers (for UI that adapts to it), and
 * `/api/skills` — the skills agents see over MCP. Both require a signed-in user.
 */
import {
  type AgentMode,
  AUTO_PUBLISH_LIMIT,
  DEFAULT_AGENT_MODE,
  ELEVATION_MAX_MINUTES,
  ELEVATION_MIN_MINUTES,
  type LoadedSkill,
  REMOTE_AGENT_MODES,
  type Scope,
  scopesForMode,
} from "@cloudhal/agent-runtime";
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
  };
  /** The agent modes an API key can hold and what each defaults to (ADR-0015). */
  agentModes: AgentModesInfo;
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
  elevation: { minMinutes: number; maxMinutes: number };
}

/** The server's mode rules, so clients do not copy them. */
export function agentModesInfo(): AgentModesInfo {
  return {
    modes: [...REMOTE_AGENT_MODES],
    default: DEFAULT_AGENT_MODE,
    scopes: Object.fromEntries(REMOTE_AGENT_MODES.map((m) => [m, scopesForMode(m)])),
    autoPublishLimit: AUTO_PUBLISH_LIMIT,
    elevation: { minMinutes: ELEVATION_MIN_MINUTES, maxMinutes: ELEVATION_MAX_MINUTES },
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

/**
 * `/api/instance` — what this Studio deployment offers (for UI that adapts to it), and
 * `/api/skills` — the skills agents see over MCP. Both require a signed-in user.
 */
import type { LoadedSkill } from "@cloudhal/agent-runtime";
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

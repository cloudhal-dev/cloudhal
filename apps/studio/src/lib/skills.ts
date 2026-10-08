import { ALL_GRANTABLE, sortScopes } from "./agents.ts";
import type { AgentScope, SkillSummary } from "./api.ts";

/** `packages/mcp-server/src/server.ts` → `SKILL_META_KEY`. */
export const SKILL_META_KEY = "cloudhal.skill";

export function isAgentScope(scope: string): scope is AgentScope {
  return scope === "*" || (ALL_GRANTABLE as string[]).includes(scope);
}

/** Known scopes in the usual order (read → write → release), unknown ones after, as declared. */
export function orderSkillScopes(scopes: readonly string[]): string[] {
  const known = sortScopes(scopes.filter(isAgentScope));
  return [...known, ...scopes.filter((s) => !isAgentScope(s))];
}

export function matchesSkill(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.scopes.some((s) => s.toLowerCase().includes(q)) ||
    skill.approval.some((s) => s.toLowerCase().includes(q))
  );
}

/**
 * An MCP `tools/call` request made under `skill`: the `_meta` key is what narrows the call to the
 * skill's scopes. The example tool is one the skill gates (or a harmless read).
 */
export function skillCallSnippet(skill: Pick<SkillSummary, "name" | "approval">): string {
  const tool = skill.approval[0] ?? "get_site";
  return JSON.stringify(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: tool,
        arguments: { siteId: "<site id>" },
        _meta: { [SKILL_META_KEY]: skill.name },
      },
    },
    null,
    2,
  );
}

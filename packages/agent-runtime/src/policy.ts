import type { Actor } from "@cloudhal/core-contracts";

/** Scopes follow `area:verb`; `*` grants everything (local human sessions). */
export type Scope =
  | "site:read"
  | "site:write"
  | "content:read"
  | "content:write"
  | "preview:create"
  | "site:publish"
  | "site:rollback"
  | "*";

export const ALL_SCOPES: Scope[] = [
  "site:read",
  "site:write",
  "content:read",
  "content:write",
  "preview:create",
  "site:publish",
  "site:rollback",
];

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolPolicy {
  /** Tool name as exposed over MCP. */
  name: string;
  /** Scopes the caller must hold (any `*` satisfies). */
  scopes: Scope[];
  annotations: ToolAnnotations;
  /** Tools that always need a human decision, independent of scopes. */
  requiresApproval?: boolean;
}

export interface Principal {
  actor: Actor;
  scopes: Scope[];
  /** Skill the agent declared it is running (its frontmatter decides extra approvals). */
  skill?: { name: string; scopes: string[]; approval: string[] } | undefined;
}

export type Decision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "approval-required"; reason: string };

/**
 * The single place that decides whether a tool call may run (ADR-0004). Humans and agents share
 * the same model: scopes come from the session or API key, approvals from annotations and the
 * declared skill. Skills never grant permission — they can only ask for more approval.
 */
export class PolicyEngine {
  readonly #tools = new Map<string, ToolPolicy>();

  constructor(tools: ToolPolicy[]) {
    for (const t of tools) this.#tools.set(t.name, t);
  }

  tool(name: string): ToolPolicy | undefined {
    return this.#tools.get(name);
  }

  evaluate(
    principal: Principal,
    toolName: string,
    options: { confirmed?: boolean } = {},
  ): Decision {
    const tool = this.#tools.get(toolName);
    if (!tool) return { kind: "deny", reason: `unknown tool ${toolName}` };
    const has = (scope: Scope) =>
      principal.scopes.includes("*") || principal.scopes.includes(scope);
    const missing = tool.scopes.filter((s) => !has(s));
    if (missing.length > 0) return { kind: "deny", reason: `missing scope ${missing.join(", ")}` };
    if (principal.skill) {
      // A skill may only call tools inside the scopes it declared.
      const declared = principal.skill.scopes;
      const outside = tool.scopes.filter((s) => !declared.includes(s) && !declared.includes("*"));
      if (outside.length > 0)
        return {
          kind: "deny",
          reason: `skill ${principal.skill.name} did not declare ${outside.join(", ")}`,
        };
    }
    const needsApproval =
      tool.requiresApproval ||
      tool.annotations.destructiveHint === true ||
      (principal.skill?.approval ?? []).includes(toolName);
    if (needsApproval && !options.confirmed) {
      return {
        kind: "approval-required",
        reason: tool.annotations.destructiveHint
          ? `${toolName} is destructive`
          : `${toolName} requires approval`,
      };
    }
    return { kind: "allow" };
  }
}

/** Default scope sets per actor kind. */
export function defaultScopes(actor: Actor): Scope[] {
  switch (actor.kind) {
    case "human":
    case "system":
      return ["*"];
    case "agent":
      return ["site:read", "content:read", "content:write", "preview:create"];
  }
}

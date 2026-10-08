import type { Actor } from "@cloudhal/core-contracts";
import type { AgentMode } from "./modes.ts";

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
  /** Agents only: how independently it works (ADR-0015). Absent = `edits`; people have none. */
  mode?: AgentMode | undefined;
  /** True for the local stdio server (the developer's own machine); enables `bypass`. */
  local?: boolean | undefined;
  /** Set while `mode` comes from a time-boxed elevation (ADR-0016): the key's own mode and the end. */
  elevation?: { from: AgentMode; until: string } | undefined;
  /** The API key an agent authenticated with (lets it ask for an elevation of that key). */
  keyId?: string | undefined;
}

/** The mode that actually applies: `bypass` only counts locally, remote keys fall back to `edits`. */
export function effectiveMode(principal: Principal): AgentMode | undefined {
  if (principal.actor.kind !== "agent") return undefined;
  const mode = principal.mode ?? "edits";
  return mode === "bypass" && !principal.local ? "edits" : mode;
}

/** Why a call waits for a person (stored on approvals and audit rows). */
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode";

export type Decision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | {
      kind: "approval-required";
      reason: string;
      /** Why a person must decide: the tool always asks, it is destructive, the skill asks, or manual mode. */
      cause: ApprovalCause;
      /** `auto` mode: the caller may skip the person when the change is low risk. */
      autoApprove?: "low-risk-publish";
    };

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
    const mode = effectiveMode(principal);
    const writes = tool.annotations.readOnlyHint !== true;
    if (mode === "plan" && writes)
      return { kind: "deny", reason: "plan mode is read-only: propose the change instead" };
    const needsApproval =
      tool.requiresApproval ||
      tool.annotations.destructiveHint === true ||
      (principal.skill?.approval ?? []).includes(toolName) ||
      (mode === "manual" && writes);
    if (needsApproval && !options.confirmed && mode !== "bypass") {
      // A tool that always asks (publish, rollback) says so first; then plain destructive ones.
      const cause: ApprovalCause = tool.requiresApproval
        ? "tool"
        : tool.annotations.destructiveHint
          ? "destructive"
          : (principal.skill?.approval ?? []).includes(toolName)
            ? "skill"
            : "manual-mode";
      const reason = {
        "manual-mode": `manual mode: ${toolName} needs a person's approval`,
        destructive: `${toolName} is destructive`,
        tool: `${toolName} requires approval`,
        skill: `${toolName} requires approval`,
      }[cause];
      // `auto` lets a low-risk publish through; rollback and deletions always wait for a person.
      const auto = mode === "auto" && toolName === "publish";
      return {
        kind: "approval-required",
        reason,
        cause,
        ...(auto ? { autoApprove: "low-risk-publish" as const } : {}),
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

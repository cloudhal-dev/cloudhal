import type { AgentScope } from "./api.ts";

export type GrantableScope = Exclude<AgentScope, "*">;
export type ScopeGroup = "read" | "write" | "release";

/** How the create-key dialog groups scopes: what an agent may see, change, and make live. */
export const SCOPE_GROUPS: Record<ScopeGroup, GrantableScope[]> = {
  read: ["site:read", "content:read"],
  write: ["content:write", "site:write", "preview:create"],
  release: ["site:publish", "site:rollback"],
};
export const ALL_GRANTABLE: GrantableScope[] = Object.values(SCOPE_GROUPS).flat();

/** A new key starts read-only; everything else is an explicit choice. */
export const DEFAULT_SCOPES: GrantableScope[] = [...SCOPE_GROUPS.read];

export function scopeGroup(scope: AgentScope): ScopeGroup | "all" {
  if (scope === "*") return "all";
  for (const [group, scopes] of Object.entries(SCOPE_GROUPS) as Array<
    [ScopeGroup, GrantableScope[]]
  >) {
    if (scopes.includes(scope)) return group;
  }
  return "read";
}

/** Badge variant per scope group: neutral to read, blue tint to write, amber to publish/roll back. */
export function scopeVariant(scope: AgentScope): "secondary" | "info" | "warning" {
  const group = scopeGroup(scope);
  return group === "read" ? "secondary" : group === "write" ? "info" : "warning";
}

/** Keys that can ask to change what is live (publish / roll back) get an explicit warning. */
export function canRelease(scopes: readonly AgentScope[]): boolean {
  return scopes.some((s) => s === "*" || SCOPE_GROUPS.release.includes(s as GrantableScope));
}

/** Stable display order regardless of the order the server returns. */
export function sortScopes(scopes: readonly AgentScope[]): AgentScope[] {
  const order = (s: AgentScope) => (s === "*" ? -1 : ALL_GRANTABLE.indexOf(s));
  return [...scopes].sort((a, b) => order(a) - order(b));
}

/** Tools that always stop for a human decision, whatever the key's scopes (ADR-0004). */
export const APPROVAL_GATED_TOOLS = ["publish", "rollback", "delete_page", "delete_entry"];

export type SnippetKind = "json" | "claude" | "stdio";

/** Client configuration for this Studio's MCP endpoint; `key` fills in a freshly created key. */
export function mcpSnippet(kind: SnippetKind, endpoint: string, key?: string): string {
  const secret = key ?? "<your agent key>";
  if (kind === "json") {
    return JSON.stringify(
      {
        mcpServers: {
          cloudhal: { type: "http", url: endpoint, headers: { "x-api-key": secret } },
        },
      },
      null,
      2,
    );
  }
  if (kind === "claude") {
    return `claude mcp add --transport http cloudhal ${endpoint} \\\n  --header "x-api-key: ${secret}"`;
  }
  return "# Run inside the site project; no key needed on your own machine\ncd my-site\nclaude mcp add cloudhal -- npx cloudhal mcp";
}

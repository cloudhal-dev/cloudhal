import type {
  AgentMode,
  AgentModesInfo,
  AgentScope,
  Approval,
  AuditRow,
  AutoCheck,
  KeyMode,
} from "./api.ts";

export type GrantableScope = Exclude<AgentScope, "*">;
export type ScopeGroup = "read" | "write" | "release";

/** How the create-key dialog groups scopes: what an agent may see, change, and make live. */
export const SCOPE_GROUPS: Record<ScopeGroup, GrantableScope[]> = {
  read: ["site:read", "content:read"],
  write: ["content:write", "site:write", "preview:create"],
  release: ["site:publish", "site:rollback"],
};
export const ALL_GRANTABLE: GrantableScope[] = Object.values(SCOPE_GROUPS).flat();

/** Modes an owner can give an API key, in order of increasing autonomy (ADR-0015). */
export const KEY_MODES: readonly KeyMode[] = ["plan", "manual", "edits", "auto"];

/** What new keys get unless the owner picks otherwise (and what keys without a mode read as). */
export const DEFAULT_MODE: KeyMode = "edits";

export function isKeyMode(value: unknown): value is KeyMode {
  return typeof value === "string" && (KEY_MODES as readonly string[]).includes(value);
}

/**
 * The scopes a key needs to be useful in a mode. The server's own rules come from `/api/instance`
 * (`modeRules`); this copy of `scopesForMode` is the fallback for servers that do not report them.
 */
export function scopesForMode(mode: AgentMode): GrantableScope[] {
  const read: GrantableScope[] = ["site:read", "content:read", "preview:create"];
  if (mode === "plan") return read;
  return [...read, "content:write", "site:publish", "site:rollback"];
}

/** Same set of scopes, in any order. */
export function sameScopes(a: readonly AgentScope[], b: readonly AgentScope[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

/** How much a mode lets an agent do without you: the picker's badge and the auto confirmation. */
export type ModeRisk = "safest" | "recommended" | "caution";
export const MODE_RISK: Record<AgentMode, ModeRisk> = {
  plan: "safest",
  manual: "safest",
  edits: "recommended",
  auto: "caution",
  bypass: "caution",
};

/** Badge tone per mode: neutral read-only, green "asks first", blue default, amber autonomy. */
export function modeVariant(mode: AgentMode): "secondary" | "success" | "info" | "warning" {
  switch (mode) {
    case "plan":
      return "secondary";
    case "manual":
      return "success";
    case "edits":
      return "info";
    default:
      return "warning";
  }
}

/** Largest publish `auto` mode lets through without a person (`AUTO_PUBLISH_LIMIT`). */
export const AUTO_PUBLISH_LIMIT = 20;

/** What happens to each kind of change in each mode (the "How modes work" table, ADR-0015). */
export type ModeRule = "denied" | "waits" | "free" | "lowRisk";
export const MODE_RULES: Record<
  AgentMode,
  { edits: ModeRule; publish: ModeRule; rollback: ModeRule }
> = {
  plan: { edits: "denied", publish: "denied", rollback: "denied" },
  manual: { edits: "waits", publish: "waits", rollback: "waits" },
  edits: { edits: "free", publish: "waits", rollback: "waits" },
  auto: { edits: "free", publish: "lowRisk", rollback: "waits" },
  bypass: { edits: "free", publish: "free", rollback: "free" },
};

/** Audit reason older servers wrote when `auto` mode published without a person. */
const AUTO_APPROVED = /^auto mode: published without approval(?: \((.+)\))?$/;

/** An `auto`-mode publish that went live without a person. */
export function isAutoApproved(row: Pick<AuditRow, "reason" | "decision" | "autoCheck">): boolean {
  if (row.decision !== "allow") return false;
  // Rows written before the structured check (ADR-0015 addendum) only have the English reason.
  return row.autoCheck ? row.autoCheck.lowRisk : AUTO_APPROVED.test(row.reason ?? "");
}

/** How many changes an auto-approved publish carried, so Studio can say it in the person's language. */
export function autoApprovalCount(row: Pick<AuditRow, "reason" | "autoCheck">): number | undefined {
  if (row.autoCheck) return row.autoCheck.changes;
  const detail = AUTO_APPROVED.exec(row.reason ?? "")?.[1];
  const count = /^(\d+) article/.exec(detail ?? "")?.[1];
  return count === undefined ? undefined : Number(count);
}

/** A write that waits only because the agent works in manual mode. */
export function isManualModeRequest(request: Pick<Approval, "prompt" | "cause">): boolean {
  // Older requests carry no `cause`; their policy reason starts with "manual mode:".
  return request.cause
    ? request.cause === "manual-mode"
    : request.prompt.startsWith("manual mode:");
}

export type HeldBackCheck = AutoCheck & { code: Exclude<AutoCheck["code"], "low-risk"> };

/** An `auto`-mode publish that the low-risk check sent to a person instead of publishing. */
export function autoCheckHeldBack(request: {
  autoCheck?: AutoCheck | undefined;
}): HeldBackCheck | undefined {
  const check = request.autoCheck;
  return check && !check.lowRisk && check.code !== "low-risk"
    ? { ...check, code: check.code }
    : undefined;
}

/** The mode rules Studio applies: the server's (`/api/instance`) when reported, else Studio's copy. */
export interface ModeRules {
  /** Key modes to offer, in order (only ones Studio has words for). */
  modes: readonly KeyMode[];
  defaultMode: KeyMode;
  scopesFor: (mode: AgentMode) => GrantableScope[];
  autoPublishLimit: number;
}

export function modeRules(info?: AgentModesInfo | undefined): ModeRules {
  const offered = info?.modes.filter(isKeyMode) ?? [];
  const grantable = (scopes: readonly AgentScope[] | undefined) =>
    scopes?.filter((s): s is GrantableScope => (ALL_GRANTABLE as AgentScope[]).includes(s));
  return {
    modes: offered.length > 0 ? KEY_MODES.filter((m) => offered.includes(m)) : KEY_MODES,
    defaultMode: isKeyMode(info?.default) ? info.default : DEFAULT_MODE,
    scopesFor: (mode) => grantable(info?.scopes[mode]) ?? scopesForMode(mode),
    autoPublishLimit: info?.autoPublishLimit ?? AUTO_PUBLISH_LIMIT,
  };
}

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

/** Stable display order regardless of the order the server returns. */
export function sortScopes(scopes: readonly AgentScope[]): AgentScope[] {
  const order = (s: AgentScope) => (s === "*" ? -1 : ALL_GRANTABLE.indexOf(s));
  return [...scopes].sort((a, b) => order(a) - order(b));
}

/**
 * Tools that wait for a person in every mode an API key can hold (ADR-0004, ADR-0015). Publish used
 * to be one of them; `auto` mode now lets small article publishes through.
 */
export const ALWAYS_GATED_TOOLS = ["rollback", "delete_page", "delete_entry"] as const;

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
  return "# Run inside the site project; no key needed on your own machine\ncd my-site\nclaude mcp add cloudhal -- npx cloudhal mcp --mode edits";
}

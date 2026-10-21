import type {
  AgentMode,
  AgentModesInfo,
  AgentScope,
  AnyScope,
  Approval,
  AuditRow,
  AutoCheck,
  KeyMode,
} from "./api.ts";
import { holds, narrowScopes, weakerScopes } from "./roles.ts";

export type GrantableScope = Exclude<AgentScope, "*">;
export type ScopeGroup = "read" | "write" | "release";

/** How the create-key dialog groups scopes: what an agent may see, change, and make live. */
export const SCOPE_GROUPS: Record<ScopeGroup, GrantableScope[]> = {
  read: ["site:read", "content:read", "analytics:read", "comments:read", "schedules:read"],
  write: [
    "content:propose",
    "content:write",
    "asset:upload",
    "asset:manage",
    "site:write",
    "preview:create",
    "schedules:write",
  ],
  release: ["site:publish", "releases:publish", "site:rollback"],
};

/**
 * Every scope a key can carry, in display order, with the own-limited variants a role narrows to
 * (RFC-0005 §1) next to their full scope and the asset scopes (RFC-0004) with the writes.
 */
const SCOPE_ORDER: GrantableScope[] = [
  "site:read",
  "content:read",
  "analytics:read",
  "comments:read",
  "schedules:read",
  "content:write",
  "content:write:own",
  "content:draft:own",
  "content:propose",
  "site:write",
  "preview:create",
  "schedules:write",
  "schedules:write:own",
  "asset:manage",
  "asset:upload",
  "site:publish",
  "site:publish:own",
  "releases:publish",
  "releases:publish:own",
  "site:rollback",
  "comments:moderate",
  "comments:moderate:own",
  "comments:reply",
  "comments:reply:own",
];
export const ALL_GRANTABLE: GrantableScope[] = SCOPE_ORDER;

/** One checkbox in the create dialog's scope groups, narrowed to the person's role. */
export interface ScopeOption {
  /** What the key gets when ticked: the scope, or the own variant the role holds instead. */
  scope: GrantableScope;
  /** Set when the role narrows `from` to `scope` (an Author's `content:write` → `…:own`). */
  from?: GrantableScope;
  /** The role holds neither the scope nor a weaker variant: shown, but not offered. */
  disabled: boolean;
}

/**
 * The scopes of a group as the person may grant them (RFC-0005 §5.1): each scope the role holds;
 * else its strongest own variant the role holds (unless the group lists that variant itself); else
 * the scope, disabled — never hidden.
 */
export function scopeOptions(group: ScopeGroup, roleScopes?: readonly AnyScope[]): ScopeOption[] {
  return SCOPE_GROUPS[group].map((scope) => {
    if (!roleScopes || holds(roleScopes, scope)) return { scope, disabled: false };
    const weaker = weakerScopes(scope).find((w) => holds(roleScopes, w)) as
      | GrantableScope
      | undefined;
    // A weaker scope the group already offers on its own (`asset:manage` → `asset:upload`) is not
    // repeated as a variant: the stronger one is shown disabled instead.
    if (!weaker || SCOPE_GROUPS[group].includes(weaker)) return { scope, disabled: true };
    return { scope: weaker, from: scope, disabled: false };
  });
}

/** Which group an own variant or asset scope belongs to (for its badge tone). */
const GROUP_OF_VARIANT: Partial<Record<GrantableScope, ScopeGroup>> = {
  "content:write:own": "write",
  "content:draft:own": "write",
  "asset:upload": "write",
  "asset:manage": "write",
  "site:publish:own": "release",
};

/** Modes an owner can give an API key, in order of increasing autonomy (ADR-0015). */
export const KEY_MODES: readonly KeyMode[] = ["plan", "manual", "edits", "auto"];

/** What new keys get unless the owner picks otherwise (and what keys without a mode read as). */
export const DEFAULT_MODE: KeyMode = "edits";

export function isKeyMode(value: unknown): value is KeyMode {
  return typeof value === "string" && (KEY_MODES as readonly string[]).includes(value);
}

/** A key's own mode; keys from servers that predate modes read as `edits`, like the server does. */
export function ownModeOf(key: { mode?: unknown } | undefined): KeyMode {
  return isKeyMode(key?.mode) ? key.mode : DEFAULT_MODE;
}

/**
 * The scopes a key needs to be useful in a mode. The server's own rules come from `/api/instance`
 * (`modeRules`); this copy of `scopesForMode` is the fallback for servers that do not report them.
 */
export function scopesForMode(mode: AgentMode): GrantableScope[] {
  const read: GrantableScope[] = [
    "site:read",
    "content:read",
    "preview:create",
    "analytics:read",
    "comments:read",
    "schedules:read",
  ];
  if (mode === "plan") return [...read, "content:propose"];
  return [
    ...read,
    "content:write",
    "asset:upload",
    "site:publish",
    "site:rollback",
    "schedules:write",
  ];
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

/** Shortest and longest time-boxed elevation (ADR-0016), for servers that do not report them. */
export const ELEVATION_MIN_MINUTES = 5;
export const ELEVATION_MAX_MINUTES = 24 * 60;
/** How long before its end an elevation counts as "ending soon" (ADR-0016), for older servers. */
export const ELEVATION_NOTICE_MINUTES = 10;

/** The mode rules Studio applies: the server's (`/api/instance`) when reported, else Studio's copy. */
export interface ModeRules {
  /** Key modes the server knows, in order (only ones Studio has words for); explanations use these. */
  modes: readonly KeyMode[];
  /**
   * The modes the signed-in person may give a key: `modes` up to their role's cap (RFC-0005 §5.2;
   * a Contributor's keys stop at Edits). Pickers and elevations offer only these.
   */
  keyModes: readonly KeyMode[];
  /** The role's cap when it is below the most autonomous mode, else undefined. */
  cap: KeyMode | undefined;
  /** The person's role scopes, when known: key scopes are narrowed to them (RFC-0005 §5.1). */
  roleScopes: readonly AnyScope[] | undefined;
  defaultMode: KeyMode;
  /** The scopes a key in `mode` gets, narrowed to the person's role. */
  scopesFor: (mode: AgentMode) => GrantableScope[];
  autoPublishLimit: number;
  /** Bounds of a time-boxed elevation, in whole minutes. */
  elevation: { minMinutes: number; maxMinutes: number };
  /** Minutes before its end that an elevation is "ending soon" (notifications, Agents banner). */
  noticeMinutes: number;
}

export function modeRules(
  info?: AgentModesInfo | undefined,
  role?: { cap: AgentMode | undefined; scopes: readonly AnyScope[] | undefined } | undefined,
): ModeRules {
  const offered = info?.modes.filter(isKeyMode) ?? [];
  const grantable = (scopes: readonly AgentScope[] | undefined) =>
    scopes?.filter((s): s is GrantableScope => (ALL_GRANTABLE as AgentScope[]).includes(s));
  const modes = offered.length > 0 ? KEY_MODES.filter((m) => offered.includes(m)) : KEY_MODES;
  const capIndex = role?.cap ? KEY_MODES.indexOf(role.cap as KeyMode) : -1;
  const keyModes = capIndex >= 0 ? modes.filter((m) => KEY_MODES.indexOf(m) <= capIndex) : modes;
  const cap = keyModes.length < modes.length ? keyModes.at(-1) : undefined;
  const roleScopes = role?.scopes;
  const base = (mode: AgentMode) => grantable(info?.scopes[mode]) ?? scopesForMode(mode);
  const preferred = isKeyMode(info?.default) ? info.default : DEFAULT_MODE;
  return {
    modes,
    keyModes,
    cap,
    roleScopes,
    defaultMode: keyModes.includes(preferred) ? preferred : (keyModes.at(-1) ?? preferred),
    scopesFor: (mode) => (roleScopes ? narrowScopes(base(mode), roleScopes) : base(mode)),
    autoPublishLimit: info?.autoPublishLimit ?? AUTO_PUBLISH_LIMIT,
    elevation: validBounds(info?.elevation) ?? {
      minMinutes: ELEVATION_MIN_MINUTES,
      maxMinutes: ELEVATION_MAX_MINUTES,
    },
    noticeMinutes: validNotice(info?.elevation?.noticeMinutes) ?? ELEVATION_NOTICE_MINUTES,
  };
}

function validNotice(minutes: number | undefined): number | undefined {
  return Number.isInteger(minutes) && (minutes as number) > 0 ? minutes : undefined;
}

function validBounds(
  bounds: { minMinutes: number; maxMinutes: number } | undefined,
): { minMinutes: number; maxMinutes: number } | undefined {
  if (!bounds) return undefined;
  const { minMinutes, maxMinutes } = bounds;
  const sane =
    Number.isInteger(minMinutes) &&
    Number.isInteger(maxMinutes) &&
    minMinutes > 0 &&
    minMinutes <= maxMinutes;
  return sane ? { minMinutes, maxMinutes } : undefined;
}

export function scopeGroup(scope: AgentScope): ScopeGroup | "all" {
  if (scope === "*") return "all";
  for (const [group, scopes] of Object.entries(SCOPE_GROUPS) as Array<
    [ScopeGroup, GrantableScope[]]
  >) {
    if (scopes.includes(scope)) return group;
  }
  return GROUP_OF_VARIANT[scope] ?? "read";
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

/**
 * MCP clients Studio shows setup for (docs/agents/clients.md); `stdio` is the local server. Every
 * remote snippet sends the key as `Authorization: Bearer` (the server also takes `x-api-key`).
 */
export const REMOTE_CLIENTS = ["claude", "codex", "cursor", "vscode", "generic"] as const;
export type McpClient = (typeof REMOTE_CLIENTS)[number] | "stdio";

/** The environment variable the snippets read the key from where a client takes one. */
const KEY_ENV = "CLOUDHAL_API_KEY";

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Setup per client, in the formats of docs/agents/clients.md; `key` fills in a fresh key. */
const SNIPPETS: Record<McpClient, (endpoint: string, key: string) => string> = {
  claude: (endpoint, key) =>
    `claude mcp add --transport http cloudhal ${endpoint} \\\n  --header "Authorization: Bearer ${key}"`,
  // Codex reads the key from the environment and sends it as `Authorization: Bearer`.
  codex: (endpoint, key) =>
    `export ${KEY_ENV}="${key}"\ncodex mcp add cloudhal --url ${endpoint} \\\n  --bearer-token-env-var ${KEY_ENV}`,
  cursor: (endpoint, key) =>
    json({
      mcpServers: { cloudhal: { url: endpoint, headers: { Authorization: `Bearer ${key}` } } },
    }),
  // VS Code asks for the key once and keeps it in its secret storage, so the file holds none.
  vscode: (endpoint) =>
    json({
      inputs: [
        {
          type: "promptString",
          id: "cloudhal-key",
          // i18n-ignore: written into the person's .vscode/mcp.json, as in docs/agents/clients.md
          description: "Cloudhal agent key",
          password: true,
        },
      ],
      servers: {
        cloudhal: {
          type: "http",
          url: endpoint,
          // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code's own input variable
          headers: { Authorization: "Bearer ${input:cloudhal-key}" },
        },
      },
    }),
  generic: (endpoint, key) =>
    json({
      mcpServers: {
        cloudhal: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${key}` } },
      },
    }),
  stdio: () =>
    "# Run inside the site project; no key needed on your own machine\ncd my-site\nclaude mcp add cloudhal -- npx cloudhal mcp --mode edits",
};

/** Client configuration for this Studio's MCP endpoint; `key` fills in a freshly created key. */
export function mcpSnippet(client: McpClient, endpoint: string, key?: string): string {
  return SNIPPETS[client](endpoint, key ?? "<your agent key>");
}

/** The highlighter language of a client's snippet. */
export function snippetLang(client: McpClient): "json" | "bash" {
  return client === "cursor" || client === "vscode" || client === "generic" ? "json" : "bash";
}

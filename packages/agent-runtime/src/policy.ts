import type { Actor } from "@cloudhal/core-contracts";
import type { AgentMode } from "./modes.ts";
import type { Role } from "./roles.ts";

/**
 * Scopes follow `area:verb`; `*` grants everything (the Owner, local stdio, auth-less servers).
 * RFC-0005 §1 adds own-limited variants (`…:own`) and person-only scopes. A stronger scope implies
 * the weaker ones (`implies`).
 */
export type Scope =
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
  | "commenters:data"
  | "audit:read"
  | "site:settings"
  | "members:invite"
  | "members:manage"
  | "agents:manage"
  // RFC-0008 §10.1: schedules — the calendar, releases, gates, automations and runs.
  | "schedules:read"
  | "schedules:write"
  | "schedules:write:own"
  | "releases:publish"
  | "releases:publish:own"
  | "automations:manage"
  // RFC-0016: in-editor AI commands (people only: agents bring their own model).
  | "ai:invoke"
  | "*";

/**
 * Tool scopes: what agent keys may hold and what MCP tools require (I7). `*`, and the person-only
 * scopes, are never grantable to a key.
 */
export const KEY_SCOPES: readonly Scope[] = [
  "site:read",
  "site:write",
  "content:read",
  "content:write",
  "content:write:own",
  "content:draft:own",
  // RFC-0014 §5 (ADR-0028): file body proposals a person accepts or rejects; changes no content,
  // so `plan` keys hold it. Every write variant implies it.
  "content:propose",
  "preview:create",
  "site:publish",
  "site:publish:own",
  "site:rollback",
  "asset:upload",
  "asset:manage",
  // RFC-0006 §9.1: read-only site analytics (aggregates, no personal data). Implies nothing and
  // nothing implies it except `*`.
  "analytics:read",
  // RFC-0007 §10.1: reader comments. Reading carries no email or IP hash (the contract has no
  // field for them); moderating and replying have own variants for Authors' entries.
  "comments:read",
  "comments:moderate",
  "comments:moderate:own",
  "comments:reply",
  "comments:reply:own",
  // RFC-0008 §10.1: read the schedule; create and change releases and gates (`own`: only one's
  // own nodes); approve releases and let `auto`-mode releases run without a person (`own`: every
  // item is one's own). `releases:publish` is implied by `site:publish`; it exists on its own so
  // an owner can give a key "schedule, never publish now".
  "schedules:read",
  "schedules:write",
  "schedules:write:own",
  "releases:publish",
  "releases:publish:own",
];

/** Scopes only a person holds (through their role): never stored on a key, never satisfy a tool. */
export const PERSON_SCOPES: readonly Scope[] = [
  "audit:read",
  "site:settings",
  "members:invite",
  "members:manage",
  "agents:manage",
  // RFC-0007 §10.1: commenter emails, a commenter's export and erasure — people only.
  "commenters:data",
  // RFC-0008 §10.1 (D7): creating, editing, resuming, running and deleting automations — standing
  // rules of autonomy stay with people.
  "automations:manage",
  // RFC-0016 (D6): in-editor AI commands; agents bring their own model.
  "ai:invoke",
];

/** @deprecated use `KEY_SCOPES` (what a key may carry). */
export const ALL_SCOPES: Scope[] = [...KEY_SCOPES];

/** Every scope except `*`. */
export const SCOPES: readonly Scope[] = [...KEY_SCOPES, ...PERSON_SCOPES];

export function isScope(value: unknown): value is Scope {
  return value === "*" || (typeof value === "string" && (SCOPES as string[]).includes(value));
}

export function isKeyScope(value: unknown): value is Scope {
  return typeof value === "string" && (KEY_SCOPES as string[]).includes(value);
}

/** Direct implications (the lattice of RFC-0005 §1); `implies` follows them transitively. */
const IMPLIES: Partial<Record<Scope, readonly Scope[]>> = {
  "content:write": ["content:write:own"],
  "content:write:own": ["content:draft:own"],
  "content:draft:own": ["content:propose"],
  // RFC-0008 §10.1: publishing later is no more power than publishing now.
  "site:publish": ["site:publish:own", "releases:publish"],
  "site:publish:own": ["releases:publish:own"],
  "releases:publish": ["releases:publish:own"],
  "schedules:write": ["schedules:write:own"],
  "asset:manage": ["asset:upload"],
  "members:manage": ["members:invite"],
  "comments:moderate": ["comments:moderate:own"],
  "comments:reply": ["comments:reply:own"],
};

/** `a` grants at least what `b` grants. */
export function implies(a: Scope, b: Scope): boolean {
  if (a === "*" || a === b) return true;
  return (IMPLIES[a] ?? []).some((x) => implies(x, b));
}

/** The scopes `scope` implies, strongest first (not including itself). */
export function weakerScopes(scope: Scope): Scope[] {
  const out: Scope[] = [];
  const walk = (s: Scope) => {
    for (const x of IMPLIES[s] ?? []) {
      if (!out.includes(x)) out.push(x);
      walk(x);
    }
  };
  walk(scope);
  return out;
}

/** Does a set of scopes grant `scope` (directly, through `*`, or through a stronger scope)? */
export function holds(scopes: readonly string[], scope: Scope): boolean {
  return scopes.some((s) => isScope(s) && implies(s, scope));
}

/**
 * The own limit an allowed call carries (RFC-0005 §9): the caller holds only an own variant of the
 * tool's scope, so the handler must check the target. `draft` = never-published entries, status
 * draft/review only.
 */
export type OwnLimit =
  | { level: "own" | "draft"; target: "entry" }
  | { level: "own"; target: "changeset" }
  /** RFC-0007 §10.1: each comment's entry must be the person's own (its author, or their agent). */
  | { level: "own"; target: "comment" }
  /**
   * RFC-0008 §10.1: every node a release (or a gate) touches must be the person's own — an entry
   * whose author is the person or one of their agents (`ownOnlyChangeSet`'s rule).
   */
  | { level: "own"; target: "release" };

/** Own variants that satisfy a tool scope with a limit, strongest first. */
const OWN_VARIANTS: Partial<Record<Scope, readonly { scope: Scope; level: "own" | "draft" }[]>> = {
  "content:write": [
    { scope: "content:write:own", level: "own" },
    { scope: "content:draft:own", level: "draft" },
  ],
  "site:publish": [{ scope: "site:publish:own", level: "own" }],
  "comments:moderate": [{ scope: "comments:moderate:own", level: "own" }],
  "comments:reply": [{ scope: "comments:reply:own", level: "own" }],
  "schedules:write": [{ scope: "schedules:write:own", level: "own" }],
  "releases:publish": [{ scope: "releases:publish:own", level: "own" }],
};

/**
 * What a call does, decided from its arguments (RFC-0007 §10.2), for tools whose policy depends
 * on them (`moderate_comments` may hide in `edits` mode but never approve):
 *
 * | Class | Meaning | plan | manual | edits | auto | bypass (local) |
 * |---|---|---|---|---|---|---|
 * | `read` | changes nothing | ✓ | ✓ | ✓ | ✓ | ✓ |
 * | `advisory` | changes only notes people read before deciding (labels) | ✗ | ✓ | ✓ | ✓ | ✓ |
 * | `reduce` | reversible, can only make something less visible | ✗ | waits | ✓ | ✓ | ✓ |
 * | `publish` | makes content public, or removes it, at a time | ✗ | waits | waits | low-risk in window ✓, else waits | ✓ |
 * | `person` | makes something public | ✗ | waits | waits | waits | **waits** |
 * | `propose` | files a proposal a person accepts or rejects; changes no content (ADR-0028) | ✓ | ✓ | ✓ | ✓ | ✓ |
 *
 * `person` calls wait with cause `tool` in every mode, `bypass` included, and for people calling
 * over MCP too (they are asked in their own client). `publish` (RFC-0008 §10.3) follows ADR-0015's
 * publish rules instead: in `auto` mode the decision carries `autoApprove: "low-risk-release"` and
 * the server applies the low-risk check and the window rule (§10.7) to the release itself.
 * Tools without `classify`, or whose `classify` returns nothing for a call, behave as before.
 */
export type CallClass = "read" | "advisory" | "reduce" | "publish" | "person" | "propose";

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
  /**
   * The own variants of the tool's scope satisfy it with a limit (RFC-0005 §9): `entry` — the
   * handler checks the target entry; `changeset` — a publish must be own-only.
   */
  own?: "entry" | "changeset" | "comment" | "release";
  /** Per-argument policy (RFC-0007 §10.2); `evaluate` receives the call's arguments. */
  classify?: (args: Record<string, unknown>) => CallClass | undefined;
  /**
   * The scopes a `propose` call needs instead of `scopes` (ADR-0028): proposing an edit to a body
   * needs `content:propose`, not the write it proposes.
   */
  proposeScopes?: Scope[];
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
  /**
   * RFC-0008 §11.2: the key is an automation's key (`purpose: "automation"` in its metadata). It
   * works only inside an open run of that automation, except `begin_run` and `get_mode`.
   */
  automationId?: string | undefined;
  /**
   * The person behind the call (RFC-0005): for people themselves, for agents the person who created
   * the key. Absent when there is no membership source (auth-less servers, local stdio): such
   * principals are not role-bound.
   */
  person?: PersonRef | undefined;
}

/** A staff member as the policy layer sees them. */
export interface PersonRef {
  /** Actor id (`user_…`), the form `author` and audit rows use. */
  id: string;
  /** Better Auth user id. */
  userId: string;
  role: Role;
  name?: string | undefined;
}

/** The mode that actually applies: `bypass` only counts locally, remote keys fall back to `edits`. */
export function effectiveMode(principal: Principal): AgentMode | undefined {
  if (principal.actor.kind !== "agent") return undefined;
  const mode = principal.mode ?? "edits";
  return mode === "bypass" && !principal.local ? "edits" : mode;
}

/**
 * Why a call waits for a person (stored on approvals and audit rows). `role`: the caller's role
 * allows less than the call (an Author's publish that is not own-only, RFC-0005 §6).
 */
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode" | "role";

export type Decision =
  | { kind: "allow"; limit?: OwnLimit }
  | { kind: "deny"; reason: string; code?: "missing_scope" | "mode" | "skill" }
  | {
      kind: "approval-required";
      reason: string;
      /** Why a person must decide: the tool always asks, it is destructive, the skill asks, or manual mode. */
      cause: ApprovalCause;
      /**
       * `auto` mode: the caller may skip the person when the change is low risk — a publish now
       * (`low-risk-publish`, ADR-0015) or a release inside the key's window (`low-risk-release`,
       * RFC-0008 §10.7).
       */
      autoApprove?: "low-risk-publish" | "low-risk-release";
      /** The own limit the call runs under once approved. */
      limit?: OwnLimit;
    };

/**
 * The single place that decides whether a tool call may run (ADR-0004). Humans and agents share
 * the same model: scopes come from the role or API key, approvals from annotations and the
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

  /** Every tool, in registration order (a run envelope lists the ones a run may call). */
  tools(): ToolPolicy[] {
    return [...this.#tools.values()];
  }

  evaluate(
    principal: Principal,
    toolName: string,
    options: { confirmed?: boolean; args?: Record<string, unknown> | undefined } = {},
  ): Decision {
    const tool = this.#tools.get(toolName);
    if (!tool) return { kind: "deny", reason: `unknown tool ${toolName}` };
    const cls = tool.classify?.(options.args ?? {});
    const required = cls === "propose" && tool.proposeScopes ? tool.proposeScopes : tool.scopes;
    let limit: OwnLimit | undefined;
    const missing: Scope[] = [];
    for (const s of required) {
      // Person-only scopes never satisfy a tool (I7), not even through `*`.
      if (PERSON_SCOPES.includes(s)) {
        missing.push(s);
        continue;
      }
      if (holds(principal.scopes, s)) continue;
      const variant = tool.own
        ? OWN_VARIANTS[s]?.find((v) => holds(principal.scopes, v.scope))
        : undefined;
      if (variant && !limit) {
        limit =
          tool.own === "changeset"
            ? { level: "own", target: "changeset" }
            : tool.own === "comment"
              ? { level: "own", target: "comment" }
              : tool.own === "release"
                ? { level: "own", target: "release" }
                : { level: variant.level, target: "entry" };
        continue;
      }
      missing.push(s);
    }
    if (missing.length > 0)
      return { kind: "deny", reason: `missing scope ${missing.join(", ")}`, code: "missing_scope" };
    if (principal.skill) {
      // A skill may only call tools inside the scopes it declared (own variants count).
      const declared = principal.skill.scopes;
      const covered = (s: Scope) =>
        holds(declared, s) ||
        (tool.own !== undefined && (OWN_VARIANTS[s] ?? []).some((v) => holds(declared, v.scope)));
      const outside = required.filter((s) => !covered(s));
      if (outside.length > 0)
        return {
          kind: "deny",
          reason: `skill ${principal.skill.name} did not declare ${outside.join(", ")}`,
          code: "skill",
        };
    }
    const mode = effectiveMode(principal);
    const limited = limit ? { limit } : {};
    if (cls)
      return classified(tool, cls, principal, mode, {
        confirmed: options.confirmed === true,
        limited,
      });
    const writes = tool.annotations.readOnlyHint !== true;
    if (mode === "plan" && writes)
      return {
        kind: "deny",
        reason: "plan mode is read-only: propose the change instead",
        code: "mode",
      };
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
        role: `${toolName} needs someone whose role allows it`,
      }[cause];
      // `auto` lets a low-risk publish through; rollback and deletions always wait for a person.
      const auto = mode === "auto" && toolName === "publish";
      return {
        kind: "approval-required",
        reason,
        cause,
        ...(auto ? { autoApprove: "low-risk-publish" as const } : {}),
        ...limited,
      };
    }
    return { kind: "allow", ...limited };
  }
}

/** The decision for a classified call (RFC-0007 §10.2), after the scope and skill checks. */
function classified(
  tool: ToolPolicy,
  cls: CallClass,
  principal: Principal,
  mode: AgentMode | undefined,
  o: { confirmed: boolean; limited: { limit?: OwnLimit } },
): Decision {
  // Reading changes nothing; a proposal changes nothing until a person accepts it, so `plan`
  // mode may propose (ADR-0015's follow-up, ADR-0028).
  if (cls === "read" || cls === "propose") return { kind: "allow", ...o.limited };
  if (mode === "plan")
    return {
      kind: "deny",
      reason: "plan mode is read-only: propose the change instead",
      code: "mode",
    };
  if (o.confirmed) return { kind: "allow", ...o.limited };
  const wait = (cause: ApprovalCause, reason: string): Decision => ({
    kind: "approval-required",
    reason,
    cause,
    ...o.limited,
  });
  // A person makes something public, in every mode — `bypass` included — and people over MCP
  // are asked in their own client.
  if (cls === "person")
    return wait("tool", `${tool.name} makes something public: a person decides`);
  if ((principal.skill?.approval ?? []).includes(tool.name))
    return wait("skill", `${tool.name} requires approval`);
  // RFC-0008 §10.3: scheduled publishing follows ADR-0015's publish rules. `bypass` (local only)
  // lets it through; `auto` may skip the person for a low-risk release inside the window, which
  // the server decides from the release; every other mode, and people over MCP, wait.
  if (cls === "publish") {
    if (mode === "bypass") return { kind: "allow", ...o.limited };
    return {
      kind: "approval-required",
      reason: `${tool.name} makes content public or removes it at a time: a person approves it`,
      cause: mode === "manual" ? "manual-mode" : "tool",
      ...(mode === "auto" ? { autoApprove: "low-risk-release" as const } : {}),
      ...o.limited,
    };
  }
  // Labels are notes people read before deciding: free in `manual` (a waiting label would be the
  // person's own work); reductions wait there.
  if (cls === "reduce" && mode === "manual")
    return wait("manual-mode", `manual mode: ${tool.name} needs a person's approval`);
  return { kind: "allow", ...o.limited };
}

/**
 * Default scope sets per actor kind, for principals without a membership source (auth-less
 * servers, tests, local scripts). With auth, a person's scopes come from their role (RFC-0005 I1).
 */
export function defaultScopes(actor: Actor): Scope[] {
  switch (actor.kind) {
    case "human":
    case "system":
      return ["*"];
    case "agent":
      return [
        "site:read",
        "content:read",
        "content:write",
        "preview:create",
        "asset:upload",
        "analytics:read",
        // RFC-0007 D2: agents read comments (never an email or IP hash).
        "comments:read",
        // RFC-0008 §10.1: agents read the schedule.
        "schedules:read",
      ];
  }
}

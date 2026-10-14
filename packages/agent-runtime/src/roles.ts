/**
 * Staff roles (RFC-0005 §2, ADR-0018): named sets of the policy engine's scopes, so people and
 * agents stay one kind of actor and an agent key never does more than the person who created it.
 * This module is the single source for the policy engine, REST, MCP and Studio (via `/api/instance`).
 */
import { AGENT_MODES, type AgentMode, isMoreAutonomous, REMOTE_AGENT_MODES } from "./modes.ts";
import { holds, isKeyScope, KEY_SCOPES, type Scope, weakerScopes } from "./policy.ts";

export type Role = "owner" | "administrator" | "editor" | "author" | "contributor";

/** Highest rank first: Owner > Administrator > Editor > Author > Contributor. */
export const ROLES: readonly Role[] = ["owner", "administrator", "editor", "author", "contributor"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Higher is more senior. */
export function rank(role: Role): number {
  return ROLES.length - ROLES.indexOf(role);
}

// RFC-0016 (D6): every role may use in-editor AI; the owner's switch and the daily cap limit it.
const READ: Scope[] = ["site:read", "content:read", "preview:create", "ai:invoke"];
const EDITOR: Scope[] = [
  ...READ,
  "content:write",
  "site:publish",
  "site:rollback",
  "site:write",
  "asset:manage",
  "audit:read",
  "members:invite",
  "analytics:read",
  // RFC-0007 §10.1 (D6): every comment; commenter emails through the person-only scope.
  "comments:read",
  "comments:moderate",
  "comments:reply",
  "commenters:data",
  // RFC-0008 §10.2: every release and gate (`releases:publish` comes with `site:publish`), and
  // automations — an automation's key is narrowed to its owner's role on every call (ADR-0018).
  "schedules:read",
  "schedules:write",
  "automations:manage",
];

/**
 * Role → scopes (RFC-0005 §2.1). Implied scopes are not repeated. The Owner holds `*`, so a future
 * scope reaches the Owner without a migration; Administrator holds every non-wildcard scope.
 */
export const ROLE_SCOPES: Readonly<Record<Role, readonly Scope[]>> = {
  // RFC-0008 §10.2: Contributors read the schedule and make draft releases and requests of their
  // own work; they approve nothing.
  contributor: [
    ...READ,
    "content:draft:own",
    "asset:upload",
    "schedules:read",
    "schedules:write:own",
  ],
  // RFC-0006 §9.1: Authors and above read analytics; Contributors do not in v1.
  // RFC-0007 §10.1 (D6): Authors read comments and moderate and reply on their own entries;
  // Contributors get no comment scopes in v1.
  // RFC-0008 §10.2: Authors schedule and approve their own releases (`releases:publish:own`
  // comes with `site:publish:own`).
  author: [
    ...READ,
    "content:write:own",
    "site:publish:own",
    "asset:upload",
    "analytics:read",
    "comments:read",
    "comments:moderate:own",
    "comments:reply:own",
    "schedules:read",
    "schedules:write:own",
  ],
  editor: EDITOR,
  administrator: [...EDITOR, "site:settings", "members:manage", "agents:manage"],
  owner: ["*"],
};

export function roleScopes(role: Role): Scope[] {
  return [...ROLE_SCOPES[role]];
}

/**
 * The most autonomous mode a key created by this role may hold (RFC-0005 §5.2): a Contributor has
 * no publish power, so `auto` would be meaningless. `bypass` stays local only.
 */
export function modeCap(role: Role): AgentMode {
  return role === "contributor" ? "edits" : "auto";
}

export const MODE_CAPS: Readonly<Record<Role, AgentMode>> = Object.fromEntries(
  ROLES.map((r) => [r, modeCap(r)]),
) as Record<Role, AgentMode>;

/** `mode`, lowered to `cap` when it is more autonomous. */
export function clampMode(mode: AgentMode, cap: AgentMode): AgentMode {
  return isMoreAutonomous(mode, cap) ? cap : mode;
}

/** Remote modes a role's keys may hold, least autonomous first. */
export function modesFor(role: Role): AgentMode[] {
  const cap = modeCap(role);
  return REMOTE_AGENT_MODES.filter((m) => AGENT_MODES.indexOf(m) <= AGENT_MODES.indexOf(cap));
}

/**
 * Narrows a key's scopes to a role (RFC-0005 §5.1): keeps each key scope the role holds; else the
 * strongest weaker variant the role holds; else drops it. Person-only scopes and `*` never survive
 * on a key (I7).
 *
 * `narrow(["content:write","site:publish"], author)` → `["content:write:own","site:publish:own"]`.
 */
export function narrow(keyScopes: readonly string[], roleScopeSet: readonly Scope[]): Scope[] {
  const out: Scope[] = [];
  const add = (s: Scope) => {
    if (!out.includes(s)) out.push(s);
  };
  for (const k of keyScopes) {
    if (k === "*") {
      for (const s of KEY_SCOPES) if (holds(roleScopeSet, s)) add(s);
      continue;
    }
    if (!isKeyScope(k)) continue;
    if (holds(roleScopeSet, k)) add(k);
    else {
      const weaker = weakerScopes(k).find((w) => holds(roleScopeSet, w));
      if (weaker) add(weaker);
    }
  }
  return out;
}

/** Scopes a key requested that the role cannot give it (after narrowing nothing is dropped). */
export function scopesAboveRole(requested: readonly Scope[], role: Role): Scope[] {
  return requested.filter((s) => !holds(ROLE_SCOPES[role], s));
}

/** Why a member action breaks the rank rule (RFC-0005 §3, I4, I12), as data. */
export type RankProblem =
  | "self"
  | "owner_role"
  | "target_is_owner"
  | "role_too_high"
  | "not_allowed";

const RANK_TEXT: Record<RankProblem, string> = {
  self: "nobody changes their own role or removes themselves",
  owner_role: "the owner role moves only by ownership transfer",
  target_is_owner: "the Owner cannot be demoted or removed; transfer ownership first",
  role_too_high: "your role cannot give this role",
  not_allowed: "your role cannot manage members",
};

export function describeRankProblem(problem: RankProblem): string {
  return RANK_TEXT[problem];
}

/** May `inviter` invite someone as `role`? Editors invite Contributors and Authors only (†). */
export function inviteProblem(inviter: Role, role: Role): RankProblem | undefined {
  if (role === "owner") return "owner_role";
  const scopes = ROLE_SCOPES[inviter];
  if (holds(scopes, "members:manage")) return undefined;
  if (!holds(scopes, "members:invite")) return "not_allowed";
  return role === "contributor" || role === "author" ? undefined : "role_too_high";
}

export function canInvite(inviter: Role, role: Role): boolean {
  return inviteProblem(inviter, role) === undefined;
}

/** Roles `inviter` may invite, highest first. */
export function invitableRoles(inviter: Role): Role[] {
  return ROLES.filter((r) => canInvite(inviter, r));
}

export interface MemberRef {
  userId: string;
  role: Role;
}

/** May `actor` change `target`'s role to `to`? */
export function roleChangeProblem(
  actor: MemberRef,
  target: MemberRef,
  to: Role,
): RankProblem | undefined {
  if (actor.userId === target.userId) return "self";
  if (!holds(ROLE_SCOPES[actor.role], "members:manage")) return "not_allowed";
  if (target.role === "owner") return "target_is_owner";
  if (to === "owner") return "owner_role";
  return undefined;
}

/** May `actor` remove `target`? */
export function removalProblem(actor: MemberRef, target: MemberRef): RankProblem | undefined {
  if (actor.userId === target.userId) return "self";
  if (!holds(ROLE_SCOPES[actor.role], "members:manage")) return "not_allowed";
  if (target.role === "owner") return "target_is_owner";
  return undefined;
}

/**
 * What a person can do, for UI gating (RFC-0005 I16: cosmetic; the server decides). Each ability
 * is a scope check except `ownership.transfer` (Owner only).
 */
export const ABILITIES = {
  "entries.create": "content:draft:own",
  "entries.editOwnPublished": "content:write:own",
  "entries.editAny": "content:write",
  "pages.write": "content:write",
  "publish.own": "site:publish:own",
  "publish.any": "site:publish",
  rollback: "site:rollback",
  "structure.write": "site:write",
  "assets.upload": "asset:upload",
  "assets.manage": "asset:manage",
  "activity.all": "audit:read",
  "settings.write": "site:settings",
  "members.invite": "members:invite",
  "members.manage": "members:manage",
  "agents.manage": "agents:manage",
  // RFC-0006 §9.1: reading analytics; changing the site's analytics settings (Administrator).
  "analytics.read": "analytics:read",
  "analytics.settings": "site:settings",
  // RFC-0007 §10.1: the comment queue; moderating and replying (`:own` on one's own entries is
  // enough for the first of each pair); commenter emails and erasure; the site's comment settings.
  "comments.read": "comments:read",
  "comments.moderate": "comments:moderate:own",
  "comments.moderateAny": "comments:moderate",
  "comments.reply": "comments:reply:own",
  "comments.replyAny": "comments:reply",
  "commenters.data": "commenters:data",
  "comments.settings": "site:settings",
  // RFC-0008 §10.1: the calendar; releases and gates of one's own nodes, and of anyone's;
  // approving releases (own, any); automations; the kill switch and daily cap.
  "schedules.read": "schedules:read",
  "schedules.write": "schedules:write:own",
  "schedules.writeAny": "schedules:write",
  "releases.approve": "releases:publish:own",
  "releases.approveAny": "releases:publish",
  "automations.manage": "automations:manage",
  "schedules.settings": "site:settings",
  // RFC-0016: in-editor AI commands; the site's AI settings (Administrator).
  "ai.invoke": "ai:invoke",
  "ai.settings": "site:settings",
  "ownership.transfer": "owner",
} as const satisfies Record<string, Scope | "owner">;

export type Ability = keyof typeof ABILITIES;

/** The ability map for a person (`role` undefined: no membership source, everything allowed). */
export function abilities(
  role: Role | undefined,
  scopes: readonly Scope[],
): Record<Ability, boolean> {
  return Object.fromEntries(
    Object.entries(ABILITIES).map(([ability, need]) => [
      ability,
      need === "owner" ? role === undefined || role === "owner" : holds(scopes, need),
    ]),
  ) as Record<Ability, boolean>;
}

/** Invite expiry (RFC-0005 §7.1): 7 days by default, 1 hour to 14 days, Administrator ≤ 72 h. */
export const INVITE_DEFAULT_HOURS = 7 * 24;
export const INVITE_MIN_HOURS = 1;
export const INVITE_MAX_HOURS = 14 * 24;
export const INVITE_ADMIN_MAX_HOURS = 72;

/** The longest an invite for `role` may last. */
export function inviteMaxHours(role: Role): number {
  return role === "administrator" ? INVITE_ADMIN_MAX_HOURS : INVITE_MAX_HOURS;
}

/** Why an expiry is refused for an invite as `role`, or undefined. */
export function inviteExpiryProblem(role: Role, hours: number): string | undefined {
  const max = inviteMaxHours(role);
  if (!Number.isInteger(hours) || hours < INVITE_MIN_HOURS || hours > max)
    return `expiresInHours must be a whole number between ${INVITE_MIN_HOURS} and ${max}${role === "administrator" ? " for Administrator invites" : ""}`;
  return undefined;
}

/** The default expiry for an invite as `role` (Administrator invites are capped). */
export function inviteDefaultHours(role: Role): number {
  return Math.min(INVITE_DEFAULT_HOURS, inviteMaxHours(role));
}

/**
 * Staff roles (RFC-0005, ADR-0018) for Studio: pure helpers over the server's role rules
 * (`/api/instance` → `roles`, `invites`) and the signed-in person (`/api/me`). Gating in Studio is
 * cosmetic (I16): it hides or disables what the server would refuse and says why; the server
 * decides. A copy of the rules is kept for servers (and tests) that do not report them, like
 * `scopesForMode` in `agents.ts`.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import type {
  Ability,
  AgentMode,
  AgentScope,
  AnyScope,
  InvitesInfo,
  Member,
  Role,
  RolesInfo,
} from "./api.ts";

/** Highest rank first: Owner > Administrator > Editor > Author > Contributor. */
export const ROLES: readonly Role[] = ["owner", "administrator", "editor", "author", "contributor"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Higher is more senior. */
export function rank(role: Role): number {
  return ROLES.length - ROLES.indexOf(role);
}

// ---- the scope lattice (packages/agent-runtime/src/policy.ts, RFC-0005 §1) --------------------

const IMPLIES: Partial<Record<AnyScope, readonly AnyScope[]>> = {
  "content:write": ["content:write:own"],
  "content:write:own": ["content:draft:own"],
  "site:publish": ["site:publish:own"],
  "asset:manage": ["asset:upload"],
  "members:manage": ["members:invite"],
  "comments:moderate": ["comments:moderate:own"],
  "comments:reply": ["comments:reply:own"],
};

/** `a` grants `b` (directly or through the lattice); `*` grants everything. */
export function implies(a: AnyScope, b: AnyScope): boolean {
  if (a === "*" || a === b) return true;
  return (IMPLIES[a] ?? []).some((x) => implies(x, b));
}

export function holds(scopes: readonly AnyScope[], scope: AnyScope): boolean {
  return scopes.some((s) => implies(s, scope));
}

/** The scopes `scope` implies, strongest first (not itself). */
export function weakerScopes(scope: AnyScope): AnyScope[] {
  const out: AnyScope[] = [];
  const walk = (s: AnyScope) => {
    for (const x of IMPLIES[s] ?? []) {
      if (!out.includes(x)) out.push(x);
      walk(x);
    }
  };
  walk(scope);
  return out;
}

/** Scopes an agent key may carry (`KEY_SCOPES`): never `*` or a person-only scope. */
export const KEY_SCOPES: readonly Exclude<AgentScope, "*">[] = [
  "site:read",
  "site:write",
  "content:read",
  "content:write",
  "content:write:own",
  "content:draft:own",
  "preview:create",
  "site:publish",
  "site:publish:own",
  "site:rollback",
  "asset:upload",
  "asset:manage",
  "analytics:read",
  "comments:read",
  "comments:moderate",
  "comments:moderate:own",
  "comments:reply",
  "comments:reply:own",
];

/**
 * Narrows a key's scopes to a role (RFC-0005 §5.1): keeps each scope the role holds; else the
 * strongest weaker variant it holds; else drops it. `narrow(["content:write"], author)` →
 * `["content:write:own"]`.
 */
export function narrowScopes(
  keyScopes: readonly AgentScope[],
  roleScopeSet: readonly AnyScope[],
): Exclude<AgentScope, "*">[] {
  const out: Exclude<AgentScope, "*">[] = [];
  const add = (s: Exclude<AgentScope, "*">) => {
    if (!out.includes(s)) out.push(s);
  };
  const isKey = (s: AnyScope): s is Exclude<AgentScope, "*"> =>
    (KEY_SCOPES as readonly string[]).includes(s);
  for (const k of keyScopes) {
    if (k === "*") {
      for (const s of KEY_SCOPES) if (holds(roleScopeSet, s)) add(s);
      continue;
    }
    if (holds(roleScopeSet, k)) add(k);
    else {
      const weaker = weakerScopes(k).find((w) => holds(roleScopeSet, w));
      if (weaker && isKey(weaker)) add(weaker);
    }
  }
  return out;
}

/** Same set, any order. */
export function sameScopeSet(a: readonly AnyScope[], b: readonly AnyScope[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

// ---- the server's role rules, with Studio's copy as the fallback ------------------------------

const READ: AnyScope[] = ["site:read", "content:read", "preview:create"];
const EDITOR: AnyScope[] = [
  ...READ,
  "content:write",
  "site:publish",
  "site:rollback",
  "site:write",
  "asset:manage",
  "audit:read",
  "members:invite",
  "analytics:read",
  "comments:read",
  "comments:moderate",
  "comments:reply",
  "commenters:data",
];

/** Role → scopes (`ROLE_SCOPES`, RFC-0005 §2.1), for servers that do not report them. */
export const FALLBACK_ROLE_SCOPES: Record<Role, AnyScope[]> = {
  contributor: [...READ, "content:draft:own", "asset:upload"],
  author: [
    ...READ,
    "content:write:own",
    "site:publish:own",
    "asset:upload",
    "analytics:read",
    "comments:read",
    "comments:moderate:own",
    "comments:reply:own",
  ],
  editor: EDITOR,
  administrator: [...EDITOR, "site:settings", "members:manage", "agents:manage"],
  owner: ["*"],
};

/** Ability → the scope it needs (`ABILITIES`); `owner` = the Owner only. */
export const FALLBACK_ABILITIES: Record<Ability, AnyScope | "owner"> = {
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
  "analytics.read": "analytics:read",
  "analytics.settings": "site:settings",
  "comments.read": "comments:read",
  "comments.moderate": "comments:moderate:own",
  "comments.moderateAny": "comments:moderate",
  "comments.reply": "comments:reply:own",
  "comments.replyAny": "comments:reply",
  "commenters.data": "commenters:data",
  "comments.settings": "site:settings",
  "ownership.transfer": "owner",
};

/** The roles' rules Studio applies: the server's when reported, else the copy above. */
export interface RoleRules {
  names: readonly Role[];
  scopes: Record<Role, AnyScope[]>;
  modeCaps: Record<Role, AgentMode>;
  abilities: Record<Ability, AnyScope | "owner">;
}

export function roleRules(info?: RolesInfo | undefined): RoleRules {
  const names = info?.names.filter(isRole) ?? [];
  return {
    names: names.length > 0 ? ROLES.filter((r) => names.includes(r)) : ROLES,
    scopes: { ...FALLBACK_ROLE_SCOPES, ...(info?.scopes ?? {}) },
    modeCaps: {
      owner: "auto",
      administrator: "auto",
      editor: "auto",
      author: "auto",
      contributor: "edits",
      ...(info?.modeCaps ?? {}),
    },
    abilities: { ...FALLBACK_ABILITIES, ...(info?.abilities ?? {}) },
  };
}

/** Whether `role` has `ability` under `rules`. */
export function roleCan(rules: RoleRules, role: Role, ability: Ability): boolean {
  const need = rules.abilities[ability];
  if (need === "owner") return role === "owner";
  return holds(rules.scopes[role] ?? [], need);
}

/**
 * The least senior role that has `ability` — for "Only Editors and above can publish". `owner`
 * for Owner-only abilities.
 */
export function minimumRole(rules: RoleRules, ability: Ability): Role {
  for (const role of [...rules.names].reverse()) if (roleCan(rules, role, ability)) return role;
  return "owner";
}

// ---- members: the rank rule (RFC-0005 §3, I4) ------------------------------------------------

/** Why a member action breaks the rank rule (`details.problem` of a 403 `rank`). */
export type RankProblem =
  | "self"
  | "owner_role"
  | "target_is_owner"
  | "role_too_high"
  | "not_allowed";

export interface Manager {
  userId: string | undefined;
  /** `members.manage` from `/api/me`. */
  canManage: boolean;
}

/** May the signed-in person change `target`'s role (to anything)? */
export function roleChangeProblem(actor: Manager, target: Member): RankProblem | undefined {
  if (actor.userId !== undefined && actor.userId === target.userId) return "self";
  if (!actor.canManage) return "not_allowed";
  if (target.role === "owner") return "target_is_owner";
  return undefined;
}

/** May the signed-in person remove `target` (or issue a reset link for them)? */
export function removalProblem(actor: Manager, target: Member): RankProblem | undefined {
  return roleChangeProblem(actor, target);
}

/** Roles a member's role can be changed to: every role but the Owner (ownership moves by transfer). */
export function assignableRoles(rules: RoleRules): Role[] {
  return rules.names.filter((r) => r !== "owner");
}

/** Members, Owner first, then by rank, then by name. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort(
    (a, b) => rank(b.role) - rank(a.role) || a.name.localeCompare(b.name, undefined),
  );
}

// ---- invites (RFC-0005 §7) -------------------------------------------------------------------

/** Expiry choices, in hours: 1 hour, 1 day, 3 days, 7 days, 14 days. */
export const INVITE_PRESETS = [1, 24, 72, 168, 336] as const;
export type InvitePreset = (typeof INVITE_PRESETS)[number];

/** The server's invite rules, else Studio's copy. */
export function inviteRules(info?: InvitesInfo | undefined): InvitesInfo {
  return (
    info ?? {
      defaultHours: 168,
      minHours: 1,
      maxHours: 336,
      adminMaxHours: 72,
      delivery: ["link"],
    }
  );
}

/** The longest an invite for `role` may last: Administrator invites are capped (72 h). */
export function inviteMaxHours(rules: InvitesInfo, role: Role): number {
  return role === "administrator" ? Math.min(rules.adminMaxHours, rules.maxHours) : rules.maxHours;
}

/** Presets within the bounds for `role`. */
export function invitePresets(rules: InvitesInfo, role: Role): InvitePreset[] {
  const max = inviteMaxHours(rules, role);
  return INVITE_PRESETS.filter((h) => h >= rules.minHours && h <= max);
}

/** The preselected expiry for `role`: the server's default, capped for Administrators. */
export function inviteDefaultHours(rules: InvitesInfo, role: Role): number {
  const presets = invitePresets(rules, role);
  const wanted = Math.min(rules.defaultHours, inviteMaxHours(rules, role));
  return presets.includes(wanted as InvitePreset) ? wanted : (presets.at(-1) ?? wanted);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && EMAIL.test(v);
}

/**
 * When a link expires, rounded to its largest unit ("in 7 days", "in 1 hour"): a fresh 7-day
 * invite is a few seconds short of 7 days and must not read "in 6 days".
 */
export function expiresIn(iso: string, locale: string, now: number = Date.now()): string {
  // Whole minutes first, so 59.98 minutes reads "in 1 hour", not "in 60 minutes".
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) >= 1440) return rtf.format(Math.round(minutes / 1440), "day");
  if (Math.abs(minutes) >= 60) return rtf.format(Math.round(minutes / 60), "hour");
  return rtf.format(Math.round(minutes), "minute");
}

/** Pending invites expire on their own; one that has passed reads as expired before the refetch. */
export function inviteExpired(invite: { expiresAt: string }, now: number = Date.now()): boolean {
  return Date.parse(invite.expiresAt) <= now;
}

// ---- tokens in links (RFC-0005 §7.1) ---------------------------------------------------------

export const INVITE_TOKEN_PREFIX = "chinv_";
export const RESET_TOKEN_PREFIX = "chrst_";

const taken = new Map<string, string>();

/**
 * Reads a `#chinv_…` / `#chrst_…` token from the address bar and removes it at once with
 * `history.replaceState`, so it never stays in history, screenshots or `Referer`s and never reaches
 * a server log. The token lives only in memory (this tab) and is sent in POST bodies only. Calling
 * it again (React re-renders, StrictMode) returns the token taken the first time.
 */
export function takeHashToken(prefix: string): string | undefined {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash.startsWith(prefix)) {
      taken.set(prefix, hash);
      const { pathname, search } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${search}`);
      return hash;
    }
  } catch {
    // no window (tests without a DOM): nothing to take
  }
  return taken.get(prefix);
}

/** Forgets a taken token (after it was used, or the link turned out to be dead). */
export function forgetHashToken(prefix: string): void {
  taken.delete(prefix);
}

// ---- password strength (guidance only; the server checks length) ------------------------------

export type Strength = "empty" | "tooShort" | "weak" | "fair" | "strong";

/** A rough strength for guidance under a new-password field: length and character variety. */
export function passwordStrength(password: string, min = 8): Strength {
  if (!password) return "empty";
  if (password.length < min) return "tooShort";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 14 && kinds >= 2) return "strong";
  if (password.length >= 12 || kinds >= 3) return "fair";
  return "weak";
}

// ---- own work (RFC-0005 §4) ------------------------------------------------------------------

/** Who "I" am for ownership: the person's actor id and the agents of their own keys. */
export interface Self {
  actorId: string | undefined;
  agentIds: ReadonlySet<string>;
}

export function isOwnEntry(entry: Pick<ContentEntry, "author">, self: Self): boolean {
  const id = entry.author?.id;
  if (!id) return false;
  return id === self.actorId || self.agentIds.has(id);
}

export type EntryAccess = "edit" | "notOwn" | "published";

/**
 * Whether the signed-in person may change an entry (I9): Editors and above any entry; Authors their
 * own in any status; Contributors their own while it was never published. Cosmetic: the server
 * checks the same rule with 403 `not_own`.
 */
export function entryAccess(
  entry: Pick<ContentEntry, "author" | "publishedAt" | "status">,
  can: { editAny: boolean; editOwnPublished: boolean },
  self: Self,
): EntryAccess {
  if (can.editAny) return "edit";
  if (!isOwnEntry(entry, self)) return "notOwn";
  if (can.editOwnPublished) return "edit";
  const draftOnly = !entry.publishedAt && (entry.status === "draft" || entry.status === "review");
  return draftOnly ? "edit" : "published";
}

/** Anything with a last change (pages, entries, terms, redirects, taxonomies). */
interface Changed {
  updatedAt: string;
}

/**
 * Studio's guess whether publishing now is "own-only" for an Author (RFC-0005 §4): nothing but
 * their own articles changed publicly since the live snapshot. It labels the button ("Publish" or
 * "Request publish") and is an approximation — deletions are invisible here — so the server's
 * answer (200, or 202 with a request) always decides what happened.
 */
export function ownOnlyGuess(input: {
  /** When the live snapshot was taken; undefined: nothing is live yet (the first publish). */
  liveAt: string | undefined;
  entries: readonly (Pick<ContentEntry, "author" | "status" | "publishedAt"> & Changed)[];
  structure: readonly Changed[];
  self: Self;
}): boolean {
  const { liveAt } = input;
  if (!liveAt) return false;
  const after = (x: Changed) => x.updatedAt > liveAt;
  if (input.structure.some(after)) return false;
  return input.entries
    .filter(after)
    .filter((e) => e.status === "published" || e.publishedAt !== undefined)
    .every((e) => isOwnEntry(e, input.self));
}

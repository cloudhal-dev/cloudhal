/** The signed-in person, the deployment, staff roles, members, invites and password resets. */
import type { Actor } from "@cloudhal/core-contracts";
import type { AgentMode, AgentModesInfo, AgentScope, AnyScope } from "./agents.ts";
import type { AiTransportKind } from "./ai.ts";
import type { AnalyticsFeature } from "./analytics.ts";
import type { CommentsFeature } from "./comments-types.ts";
import { json, listOf, request } from "./http.ts";
import type { SchedulerStatus, SchedulesFeature } from "./schedules-types.ts";

/** What this Studio deployment offers (`GET /api/instance`, packages/api/src/routes/instance.ts). */
export interface InstanceInfo {
  /** Who may create an account: only the first person, nobody, anybody, or not reported. */
  signUp: "first-user" | "closed" | "open" | "unknown";
  features: {
    agentKeys: boolean;
    mcp: boolean;
    activity: boolean;
    previewLinks: boolean;
    deployTransfer: boolean;
    /** Agents' gated calls wait for a person in Studio (ADR-0014). Older servers omit it. */
    approvals?: boolean;
    /** Agents can ask for a time-boxed elevation; a person grants it in Approvals (ADR-0016). */
    elevationRequests?: boolean;
    /** Staff roles, members and invites (RFC-0005). Older servers omit it. */
    members?: boolean;
    /** Site analytics (RFC-0006 §8). Older servers omit it: read as not running. */
    analytics?: AnalyticsFeature;
    /** Reader comments (RFC-0007 §12). Older servers omit it: read as not available. */
    comments?: CommentsFeature;
    /** Schedules (RFC-0008 §13). Older servers omit it: read as not available. */
    schedules?: SchedulesFeature;
    /** In-editor AI (RFC-0016): how the server reaches Workers AI. Older servers omit it. */
    ai?: AiTransportKind;
  };
  /** The server's agent-mode rules (ADR-0015). Older servers omit it; Studio then uses its own copy. */
  agentModes?: AgentModesInfo;
  /** The server's role rules (RFC-0005 §10.1). Older servers omit it. */
  roles?: RolesInfo;
  /** Invite rules (RFC-0005 §7). Older servers omit it. */
  invites?: InvitesInfo;
  /** How a forgotten password is reset (RFC-0011): `email` when the server can send. */
  passwordReset?: ("admin" | "email")[];
}

// ---- staff roles, members and invites (RFC-0005, packages/api/src/routes/{members,invites}.ts) ----

/** Staff roles, highest rank first (`packages/agent-runtime/src/roles.ts`). */
export type Role = "owner" | "administrator" | "editor" | "author" | "contributor";

/** What a person can do, for UI gating only — the server decides (RFC-0005 I16). */
export type Ability =
  | "entries.create"
  | "entries.editOwnPublished"
  | "entries.editAny"
  | "pages.write"
  | "publish.own"
  | "publish.any"
  | "rollback"
  | "structure.write"
  | "assets.upload"
  | "assets.manage"
  | "activity.all"
  | "settings.write"
  | "members.invite"
  | "members.manage"
  | "agents.manage"
  | "analytics.read"
  | "analytics.settings"
  | "comments.read"
  | "comments.moderate"
  | "comments.moderateAny"
  | "comments.reply"
  | "comments.replyAny"
  | "commenters.data"
  | "comments.settings"
  | "schedules.read"
  | "schedules.write"
  | "schedules.writeAny"
  | "releases.approve"
  | "releases.approveAny"
  | "automations.manage"
  | "schedules.settings"
  | "ai.invoke"
  | "ai.settings"
  | "ownership.transfer";

export interface RolesInfo {
  /** Highest rank first. */
  names: Role[];
  /** Role → the scopes it holds (implied scopes are not repeated; the Owner holds `*`). */
  scopes: Record<Role, AnyScope[]>;
  /** The most autonomous mode a role's agent keys may hold. */
  modeCaps: Record<Role, AgentMode>;
  /** Ability → the scope it needs (`owner`: the Owner only). */
  abilities: Record<Ability, AnyScope | "owner">;
}

export interface InvitesInfo {
  /** Hours an invite lasts unless the inviter picks otherwise. */
  defaultHours: number;
  minHours: number;
  maxHours: number;
  /** Administrator invites expire sooner. */
  adminMaxHours: number;
  /** `["link"]`, or `["link", "email"]` when the server can send email. */
  delivery: ("link" | "email")[];
}

/** `GET /api/me`: who is signed in and what their role lets them do. */
export interface Me {
  actor: Actor;
  /** `null` without a membership (removed meanwhile) or on servers without roles. */
  role?: Role | null;
  member?: boolean;
  scopes?: AnyScope[];
  /** Ability map for gating (cosmetic). Older servers omit it: everything reads as allowed. */
  can?: Partial<Record<Ability, boolean>>;
  /** Roles this person may invite, highest first. */
  invitableRoles?: Role[];
  /** Better Auth user id (members are keyed by it). */
  userId?: string;
  /** RFC-0034 A2: the sites this person is limited to, with their role on each. */
  sites?: SiteRoles;
}

/** `{siteId: role}`: the sites an Editor, Author or Contributor works on (RFC-0034 A2). */
export type SiteRoles = Partial<Record<string, Role>>;

export interface Member {
  userId: string;
  /** The actor id (`user_…`) entries, snapshots and activity record. */
  actorId: string;
  name: string;
  role: Role;
  joinedAt: string;
  /** Only for callers with `members:manage` (Administrators and the Owner). */
  email?: string;
  /** Limited to these sites (absent: every site). */
  sites?: SiteRoles;
}

/** How one of a demoted person's agent keys was narrowed (RFC-0005 §5.3). */
export interface KeyNarrowing {
  keyId: string;
  name: string | null;
  scopes: { from: AgentScope[]; to: AgentScope[] };
  mode: { from: AgentMode; to: AgentMode };
  elevationEnded: boolean;
}

export interface MemberRemoval {
  userId: string;
  role: Role;
  keysDisabled: number;
  invitesCanceled: number;
  requestsDenied: number;
}

export type InviteStatus = "pending" | "accepted" | "rejected" | "canceled";

export interface Invite {
  id: string;
  email: string;
  role: Role;
  status: InviteStatus;
  delivery: "link" | "email";
  inviter: { userId: string; name: string | null };
  createdAt: string;
  expiresAt: string;
  /** The account it created or re-admitted; `null` while pending (or accepted without an account). */
  acceptedUserId: string | null;
  acceptedAt: string | null;
  /** The sites the new member will be limited to. */
  sites?: SiteRoles;
}

export interface NewInvite {
  email: string;
  role: Role;
  expiresInHours?: number;
  delivery?: "link" | "email";
  sites?: SiteRoles;
}

/** `POST /api/invites`: the link (`<studio>/invite#chinv_…`) comes back once, never again. */
export interface CreatedInvite {
  invite: Invite;
  /** Absent with `delivery: "email"` (the server mailed it). */
  url?: string;
}

/** `POST /api/invites/inspect`: what the link is for; nothing is consumed. */
export interface InviteDetails {
  email: string;
  role: Role;
  inviterName: string | null;
  deploymentName: string;
  expiresAt: string;
  /** `existing`: the email already has an account (a removed person invited back). */
  account: "new" | "existing";
}

/** `POST /api/password-reset/inspect`. */
export interface ResetDetails {
  name: string;
  email: string;
  expiresAt: string;
}

export type SignUpPolicy = InstanceInfo["signUp"];

/** The on/off features (`analytics` is an object of its own). */
export type InstanceFeature = Exclude<
  keyof InstanceInfo["features"],
  "analytics" | "comments" | "schedules" | "ai"
>;

export const teamApi = {
  me: () => request<Me>("/api/me"),
  /** The person's role and abilities on one site (RFC-0034 A2); 404 for a site they are not on. */
  meOnSite: (siteId: string) => request<Me>(`/api/me?siteId=${encodeURIComponent(siteId)}`),
  instance: () => request<InstanceInfo>("/api/instance"),
  /**
   * Is scheduled work running (RFC-0008 §8.7, §13)? 404 on servers without schedules. The rest of
   * the schedules client loads with its screens (`lib/schedules-api.ts`).
   */
  scheduler: () => request<SchedulerStatus>("/api/scheduler"),
  members: {
    /** Everyone with a membership; `email` only for `members:manage`. 404 on servers without roles. */
    list: () => request<{ items: Member[] }>("/api/members").then((r) => listOf<Member>(r?.items)),
    /** 403 `rank` (`details.problem`), 409 `conflict` when the member changed meanwhile. */
    setRole: (userId: string, role: Role) =>
      request<{ member: Member; keysNarrowed: KeyNarrowing[] }>(
        `/api/members/${encodeURIComponent(userId)}`,
        { method: "PATCH", ...json({ role }) },
      ),
    /** Limits an Editor, Author or Contributor to sites (`{}` lifts it); 400 `invalid_sites`. */
    setSites: (userId: string, sites: SiteRoles) =>
      request<{ member: Member }>(`/api/members/${encodeURIComponent(userId)}/sites`, {
        method: "PUT",
        ...json({ sites }),
      }),
    /** Deletes the membership, signs them out, disables their keys, cancels invites and requests. */
    remove: (userId: string) =>
      request<MemberRemoval>(`/api/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
    /** Owner only, to an Administrator; 403 `wrong_password`, 409 `not_administrator`. */
    transferOwnership: (userId: string, password: string) =>
      request<{ from: string; to: string }>("/api/members/transfer-ownership", {
        method: "POST",
        ...json({ userId, password }),
      }),
    /** A one-time link (`<studio>/reset-password#chrst_…`), valid one hour; voids older ones. */
    passwordReset: (userId: string) =>
      request<{ url: string; expiresAt: string }>(
        `/api/members/${encodeURIComponent(userId)}/password-reset`,
        { method: "POST" },
      ),
  },
  invites: {
    /** Pending invites, plus accepted ones whose account was not created. */
    list: () => request<{ items: Invite[] }>("/api/invites").then((r) => r.items),
    /**
     * Re-inviting an email replaces its pending invite. 403 `rank`, 400 `invalid_expiry` /
     * `delivery_unavailable`, 409 `already_member` / `too_many_invites`, 429 `rate_limited`.
     */
    create: (input: NewInvite) =>
      request<CreatedInvite>("/api/invites", { method: "POST", ...json(input) }),
    revoke: (id: string) =>
      request<{ invite: Invite }>(`/api/invites/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Public: what an invite link is for. The token travels in the body only; 410 `invite_gone`. */
    inspect: (token: string) =>
      request<InviteDetails>("/api/invites/inspect", { method: "POST", ...json({ token }) }),
    /**
     * Public: creates (or re-admits) the account and signs it in. 409 `signed_in_as_other` /
     * `already_member`, 410, 400 `weak_password` / `name_required`, 403 `wrong_password`.
     */
    accept: (input: { token: string; password: string; name?: string }) =>
      request<{ user: { id: string; actorId: string; name: string; email: string }; role: Role }>(
        "/api/invites/accept",
        { method: "POST", ...json(input) },
      ),
  },
  passwordReset: {
    /**
     * Public (RFC-0011): mails a reset link if the address belongs to a member. Always 202, the same
     * for anyone; 404 `email_unavailable` when the server cannot send email; 429 `rate_limited`.
     */
    request: (email: string) =>
      request<{ ok: true }>("/api/password-reset/request", { method: "POST", ...json({ email }) }),
    /** Public: whose reset link this is. 410 `reset_gone`. */
    inspect: (token: string) =>
      request<ResetDetails>("/api/password-reset/inspect", { method: "POST", ...json({ token }) }),
    /** Public: sets the password and signs the person out everywhere. */
    complete: (token: string, password: string) =>
      request<{ ok: true }>("/api/password-reset/complete", {
        method: "POST",
        ...json({ token, password }),
      }),
  },
};

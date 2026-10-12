import type {
  Actor,
  AnalyticsChannel,
  AnalyticsDevice,
  Asset,
  ContentEntry,
  Menu,
  NodeRef,
  Page,
  PublishStatus,
  Redirect,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";

import type {
  FromPagesPreview,
  MenuDiffSummary,
  MenuPreviewResponse,
  MenuReference,
  MenusOverview,
  MenuWrite,
  ResolvedMenu,
} from "./menus.ts";

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  readonly status: number;
  readonly body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res
    .json()
    .catch(() => ({ error: "invalid_json", message: res.statusText }))) as T | ApiError;
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError);
  return body as T;
}

const json = (data: unknown) => ({ body: JSON.stringify(data) });

/** Builds `?a=1&b=2` from the values that are set (empty string when none are). */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** One row of the audit trail (`packages/agent-runtime/src/audit.ts`). */
export interface AuditRow {
  id: number;
  at: string;
  actor: Actor;
  siteId?: string;
  tool: string;
  decision: "allow" | "deny" | "approval-required";
  reason?: string;
  skill?: string;
  input?: unknown;
  outcome?: "ok" | "error" | "pending";
  snapshotId?: string;
  durationMs?: number;
  /** Agent mode the call ran under (ADR-0015); absent for people and for older rows. */
  mode?: AgentMode;
  /** Why the call waited for a person (`approval-required` rows; absent on older rows). */
  cause?: ApprovalCause;
  /** The `auto`-mode check behind a publish; `lowRisk` on an `allow` row = went live without a person. */
  autoCheck?: AutoCheck;
  /**
   * The call ran under a time-boxed elevation (ADR-0016): `from` is the key's own mode, `until` when
   * the elevation ended; `mode` is then the elevated one.
   */
  elevation?: AuditElevation;
}

/** How an audit row records a time-boxed elevation (ADR-0016). */
export interface AuditElevation {
  from: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
}

/** The elevation a person granted for an agent's request (ADR-0016). */
export interface ElevationGrant {
  from: AgentMode;
  mode: AgentMode;
  minutes: number;
  until: string;
}

/**
 * Why a call waits for a person (packages/agent-runtime/src/policy.ts). `role`: a person asked for
 * something their staff role cannot do alone (an Author's publish that includes others' work,
 * RFC-0005 §6); someone whose role allows it decides.
 */
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode" | "role";

/** Why `auto` mode did or did not let a publish through (packages/agent-runtime/src/modes.ts). */
export type AutoCheckCode =
  | "low-risk"
  | "removes-content"
  | "nothing"
  | "structure"
  | "too-many"
  | "media";
export interface AutoCheck {
  rule: "low-risk-publish";
  lowRisk: boolean;
  code: AutoCheckCode;
  /** Pending changes the publish carried. */
  changes: number;
  /** Largest publish `auto` mode lets through, at the time of the check. */
  limit: number;
}
export type AuditDecision = AuditRow["decision"];
export type AuditOutcome = NonNullable<AuditRow["outcome"]>;

export interface ActivityPage {
  items: AuditRow[];
  /** Cursor for the next (older) page; `null` when this was the last one. */
  nextBefore: number | null;
}

/**
 * Scopes an agent key can carry (`packages/agent-runtime/src/policy.ts`, `KEY_SCOPES`). The `:own`
 * variants are what Authors' and Contributors' roles hold (RFC-0005 §1); `*` only on older keys.
 */
export type AgentScope =
  | "site:read"
  | "site:write"
  | "content:read"
  | "content:write"
  | "content:write:own"
  | "content:draft:own"
  | "preview:create"
  | "site:publish"
  | "site:publish:own"
  | "site:rollback"
  | "asset:upload"
  | "asset:manage"
  | "analytics:read"
  | "*";

/** Scopes only a person holds through their role: never on a key (RFC-0005 I7). */
export type PersonScope =
  | "audit:read"
  | "site:settings"
  | "members:invite"
  | "members:manage"
  | "agents:manage";
export type AnyScope = AgentScope | PersonScope;

/**
 * How independently an agent works (ADR-0015, `packages/agent-runtime/src/modes.ts`). A mode never
 * grants scopes; it narrows them and decides where a person approves.
 */
export type AgentMode = "plan" | "manual" | "edits" | "auto" | "bypass";
/** Modes an API key can hold: `bypass` exists only for the local `cloudhal mcp --mode bypass`. */
export type KeyMode = Exclude<AgentMode, "bypass">;

export interface AgentKeySummary {
  id: string;
  name: string | null;
  /** First characters of the key, for recognition. */
  start: string | null;
  scopes: AgentScope[];
  /** The key's own mode. Keys created before modes read as `edits` on the server. */
  mode: KeyMode;
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
  /** A time-boxed elevation in force right now (ADR-0016); absent when none or expired. */
  elevation?: AgentKeyElevation;
  /** The mode the agent's next call runs in: the elevation's while it lasts, else `mode`. Older servers omit it. */
  effectiveMode?: AgentMode;
  /**
   * What the key can do right now: its scopes narrowed to its creator's current role (RFC-0005 I5).
   * Narrower than `scopes` after a demotion. Older servers omit it.
   */
  effectiveScopes?: AgentScope[];
  /** The agent actor id its calls are recorded under (entries it writes carry it as `author`). */
  agentId?: string;
  /** Who created the key; listed with `?all=1` (Administrators, `agents:manage`). */
  owner?: { userId: string; name: string | null; role: Role | null };
}

/** A more autonomous mode an owner granted a key for a while (ADR-0016). */
export interface AgentKeyElevation {
  mode: KeyMode;
  /** ISO time it ends by itself. */
  until: string;
  /** Actor id (`user_…`) of the person who granted it. */
  grantedBy: string;
  grantedAt: string;
  /** Why, in the owner's words (at most 200 characters; also in the audit log). */
  reason?: string;
}

/** `POST /api/agent-keys/:id/elevation`: a mode more autonomous than the key's own, for a while. */
export interface ElevationInput {
  mode: KeyMode;
  /** Whole minutes within `agentModes.elevation` (5–1440 on current servers). */
  minutes: number;
  reason?: string;
}
/** The create response: the summary plus the plaintext key, returned exactly once. */
export type CreatedAgentKey = AgentKeySummary & { key: string };

export interface SnapshotDiff {
  added: NodeRef[];
  removed: NodeRef[];
  changed: Array<{ before: NodeRef; after: NodeRef }>;
  /** With `?assignments=1`: how each added or changed entry's term assignments moved. */
  assignments?: AssignmentDelta[];
  /** With `?menus=1`: what changed in each menu (RFC-0003). */
  menus?: MenuDiffSummary[];
}

/** One entry's term changes in one taxonomy between two snapshots (packages/api snapshots route). */
export interface AssignmentDelta {
  entryId: string;
  taxonomy: string;
  added: string[];
  removed: string[];
  /** Present when the primary term changed; `null` = none. */
  primary?: { from: string | null; to: string | null };
}

// ---- taxonomy (RFC-0002 §6.1, packages/api/src/routes/{taxonomies,terms,redirects}.ts) ----------

/** How many entries use a term (`termUsage`): all statuses, published, and the latest update. */
export interface TermUsage {
  total: number;
  published: number;
  lastUsedAt?: string;
}

export interface TermListItem {
  term: Term;
  usage: TermUsage;
}

export interface TermDetail {
  term: Term;
  usage: TermUsage;
  /** Redirects whose source is this term (its earlier archive paths). */
  redirects: Redirect[];
}

/**
 * Why a term's archive answers the way it does (RFC-0002 §7, the renderer's `archiveState`):
 * `indexed`; `thin` and `noindex` are a 200 with `noindex,follow`; `empty`, `proposed`, `internal`
 * and `archiveOff` a 404; `retired` a 410.
 */
export type ArchiveReason =
  | "indexed"
  | "thin"
  | "noindex"
  | "empty"
  | "proposed"
  | "internal"
  | "retired"
  | "archiveOff";

/** `POST …/terms/:id/preview`: the archive page with the unsaved text, and its public state. */
export interface TermPreview {
  html: string;
  archive: {
    status: 200 | 404 | 410;
    indexable: boolean;
    reason: ArchiveReason;
    /** Published articles the archive lists (sub-categories included). */
    total: number;
    minEntriesToIndex: number;
    path: string;
  };
}

/** A new taxonomy as Studio sends it (the server adds ids, revision and timestamps). */
export type NewTaxonomy = Omit<
  Taxonomy,
  "id" | "siteId" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
>;

/** An entry as a governance preview lists it. */
export interface EntrySummary {
  id: string;
  title: string;
  collection: string;
  slug: string;
  locale: string;
  status: PublishStatus;
}

export interface PlannedRedirect {
  from: string;
  to: string;
  status: 301;
  match: "prefix";
  reason: "slug-change" | "merge" | "retire";
}

/** What a governance operation would do (`dryRun: true`); nothing is written. */
export interface GovernancePreview {
  entries: { count: number; items: EntrySummary[]; rewritten: boolean };
  redirects: PlannedRedirect[];
  /** Existing redirects that follow the term to its new path. */
  repointed: number;
  /** The operation would touch more entries than one batch may (400). */
  tooLarge?: { entries: number; limit: number };
  /** Review/published entries that would lose their required primary category. */
  blocked?: { code: "required_term"; count: number; items: EntrySummary[] };
  /** The public archive disappears without a redirect: 410 (retired) or 404 (made internal). */
  archiveGone?: "gone" | "not_found";
  /** The archive becomes public at this path. */
  archiveAppears?: string;
}

export interface GovernanceResult {
  opId: string;
  terms: Term[];
  entries: number;
  redirects: Redirect[];
}

/** A governance answer: what changed and the one snapshot it took (`null` when nothing changed). */
export interface GovernanceResponse {
  result: GovernanceResult;
  snapshot: Snapshot | null;
}

export type GovernanceOp =
  | { op: "rename"; slug: string; reclaim?: boolean }
  | { op: "merge"; into: string }
  | { op: "retire"; redirectTo?: string }
  | { op: "parent"; parentId: string | null }
  | { op: "visibility"; visibility: Term["visibility"] }
  | { op: "review"; decision: "approve" | "reject" }
  | { op: "review"; decision: "merge"; into: string };

function governanceBody(op: GovernanceOp, rev: number, dryRun: boolean): Record<string, unknown> {
  const { op: _op, ...rest } = op;
  return { ...rest, rev, ...(dryRun ? { dryRun: true } : {}) };
}

export type NewTerm = Omit<
  Term,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId"
> & { reclaim?: boolean };

/** A manual redirect as a person enters it (the server sets `reason: "manual"`). */
export type NewRedirect = Pick<Redirect, "from" | "to" | "status" | "match"> &
  Partial<Pick<Redirect, "note">>;

/** `POST /migrations/tags-to-terms` (packages/core-ts/src/tags-migration.ts). */
export interface TagsMigrationResult {
  migrationId: string;
  dryRun: boolean;
  resumed: boolean;
  upToDate: boolean;
  taxonomiesCreated: string[];
  tags: string[];
  termsCreated: number;
  termsReused: number;
  entries: number;
  skipped: { entryId: string; reason: string }[];
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
}

export interface TagsRevertResult {
  migrationId: string;
  restored: number;
  edited: string[];
  termsDeleted: number;
  taxonomiesDeleted: string[];
  snapshotId: string;
}

/** Entries query: collection, the RFC-0002 §5 filter, statuses. */
export interface EntryListQuery {
  collection?: string;
  filter?: string;
  status?: PublishStatus[];
}

/** Where agents reach this Studio's MCP server (streamable HTTP, same origin as the API). */
export function mcpEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/mcp`;
}

/** True when the server answered 404 for a feature it does not run (audit log, agent keys). */
export function isNotEnabled(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/** The API error code (`body.error`) of a failed request, e.g. `rank` or `invite_gone`. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.body.error : undefined;
}

/** `details.<field>` of a failed request (`rank` → `problem`, `cannot_decide` → `code`). */
export function errorDetail(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  const details = error.body.details as Record<string, unknown> | undefined;
  const value = details?.[field];
  return typeof value === "string" ? value : undefined;
}

/** Normalises a publish answer: the site (200/201), or a `role` request (202, RFC-0005 §6). */
export function publishResultOf(
  body: Site | RoleRequest | ({ snapshot: Snapshot; site: Site } & Partial<RoleRequest>),
): PublishResult {
  if ("request" in body && body.request) {
    const snapshot = "snapshot" in body ? body.snapshot : undefined;
    return { kind: "requested", request: body.request, reason: body.reason ?? "", snapshot };
  }
  if ("snapshot" in body && "site" in body && body.site)
    return { kind: "published", site: body.site, snapshot: body.snapshot };
  return { kind: "published", site: body as Site };
}

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
  };
  /** The server's agent-mode rules (ADR-0015). Older servers omit it; Studio then uses its own copy. */
  agentModes?: AgentModesInfo;
  /** The server's role rules (RFC-0005 §10.1). Older servers omit it. */
  roles?: RolesInfo;
  /** Invite rules (RFC-0005 §7). Older servers omit it. */
  invites?: InvitesInfo;
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
}

export interface Member {
  userId: string;
  /** The actor id (`user_…`) entries, snapshots and activity record. */
  actorId: string;
  name: string;
  role: Role;
  joinedAt: string;
  /** Only for callers with `members:manage` (Administrators and the Owner). */
  email?: string;
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
}

export interface NewInvite {
  email: string;
  role: Role;
  expiresInHours?: number;
  delivery?: "link" | "email";
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

/** A person's publish their role cannot make alone became a request (HTTP 202, cause `role`). */
export interface RoleRequest {
  request: Approval;
  /** The server's reason (English), e.g. "it includes 2 published article(s) by someone else". */
  reason: string;
}

/** What a publish did: went live, or became a request an Editor decides. */
export type PublishResult =
  | { kind: "published"; site: Site; snapshot?: Snapshot | undefined }
  | ({ kind: "requested"; snapshot?: Snapshot | undefined } & RoleRequest);

export interface AgentModesInfo {
  /** Modes an API key can hold, in order of increasing autonomy. */
  modes: AgentMode[];
  default: AgentMode;
  /** Scopes a key gets in each mode when the owner does not choose them. */
  scopes: Partial<Record<AgentMode, AgentScope[]>>;
  autoPublishLimit: number;
  /**
   * Bounds of a time-boxed elevation, in minutes (ADR-0016), and how long before its end the owner
   * is told (`noticeMinutes`, newer servers). Older servers omit it.
   */
  elevation?: { minMinutes: number; maxMinutes: number; noticeMinutes?: number };
}
export type SignUpPolicy = InstanceInfo["signUp"];

/**
 * One thing that needs the signed-in owner's attention (`GET /api/notifications`, ADR-0016 addendum
 * "told before it ends"). Derived from current state on every request; `id` is stable, so a client
 * can show each one once. Named `StudioNotification` so it never shadows the DOM `Notification`.
 */
export type StudioNotification =
  | ElevationEndingNotification
  | ElevationRequestNotification
  | MemberJoinedNotification
  | RoleChangedNotification;

/** Someone the person invited accepted (RFC-0005 §7; the last 7 days). */
export interface MemberJoinedNotification {
  /** `member-joined:<inviteId>`. */
  id: string;
  kind: "member-joined";
  inviteId: string;
  userId: string;
  name: string | null;
  role: Role;
  at: string;
}

/** Someone changed the person's own role (RFC-0005 open question 4; the last 7 days). */
export interface RoleChangedNotification {
  /** `role-changed:<auditRowId>`. */
  id: string;
  kind: "role-changed";
  from: Role;
  to: Role;
  by: Actor;
  at: string;
}

/** One of the owner's elevations ends within `noticeMinutes`: extend it or let it end. */
export interface ElevationEndingNotification {
  /** `elevation-ending:<keyId>:<until>` — a new elevation (an extension) gets a new id. */
  id: string;
  kind: "elevation-ending";
  keyId: string;
  keyName: string | null;
  /** The elevated mode. */
  mode: AgentMode;
  /** The key's own mode, which applies again afterwards. */
  from: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
  /** Whole minutes left when the server answered (Studio recomputes it from `until`). */
  minutesLeft: number;
}

/** An agent asks for an elevation of one of the owner's keys and waits in a site's Approvals. */
export interface ElevationRequestNotification {
  /** `elevation-request:<approvalId>`. */
  id: string;
  kind: "elevation-request";
  approvalId: string;
  siteId: string;
  agent: Actor;
  keyId?: string;
  mode: AgentMode;
  minutes: number;
  /** The agent's own words: agent-controlled, so plain text only. May be empty. */
  reason: string;
  createdAt: string;
  expiresAt: string;
}

export interface NotificationsPage {
  /** Elevations ending soonest first, then the newest requests. */
  items: StudioNotification[];
  /** Minutes before its end that an elevation shows up here. */
  noticeMinutes: number;
}
/** The on/off features (`analytics` is an object of its own). */
export type InstanceFeature = Exclude<keyof InstanceInfo["features"], "analytics">;

/** A skill agents can read over MCP (`GET /api/skills`). */
export interface SkillSummary {
  name: string;
  description: string;
  /** The most a call made under this skill may do (never more than the caller's own scopes). */
  scopes: string[];
  /** Tools that always stop for a person when called under this skill. */
  approval: string[];
  requiresCapabilities: string[];
  /** File names under `references/`. */
  references: string[];
  /** MCP resource id, `skill://<name>/SKILL.md`. */
  resource: string;
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "consumed" | "expired";

/** An agent's gated call waiting for (or decided by) a person (ADR-0014, `/api/sites/:id/approvals`). */
export interface Approval {
  id: string;
  siteId?: string;
  tool: string;
  input?: unknown;
  actor: Actor;
  /** Server-built question; may quote agent-controlled titles, so it is shown as plain text only. */
  prompt: string;
  /** The mode the agent worked in when it asked (absent on older requests). */
  mode?: AgentMode;
  /** Why a person must decide (absent on older requests). */
  cause?: ApprovalCause;
  /** An `auto`-mode publish: the low-risk check that sent it to a person. */
  autoCheck?: AutoCheck;
  /** A granted `request_elevation`: what the person granted (possibly shorter than asked). */
  grant?: ElevationGrant;
  /**
   * Pending items: whether the signed-in person may approve it (RFC-0005 §6). Older servers omit
   * it (everyone could decide).
   */
  canDecide?: boolean;
  /** A person's own request (cause `role`): why their role could not do it alone (English). */
  reason?: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  /** Actor id of the person who decided. */
  decidedBy?: string;
  consumedAt?: string;
}

/** What a preview link renders: the current drafts or one snapshot. */
export type PreviewTarget = "live" | { snapshot: string };

export interface PreviewLinkInput {
  target: PreviewTarget;
  /** Absolute path on the site, e.g. `/blog/hello`. */
  path?: string;
  ttlSeconds?: number;
}

/** A signed, expiring link (`POST /api/sites/:id/preview-links`). */
export interface PreviewLink {
  token: string;
  /** `https://<primary domain><path>?cloudhal-preview=<token>`; null when the site has no domain. */
  url: string | null;
  expiresAt: string;
  target: PreviewTarget;
  path: string;
}

export type NewPage = Omit<
  Page,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId"
>;
export type NewEntry = Omit<
  ContentEntry,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId" | "author"
>;

/** Thin typed client over the Cloudhal API; every mutation sends the full document (CAS on `rev`). */
// ---- media library (RFC-0004 §6.1, packages/api/src/routes/assets.ts) -------------------------

/** One row of `GET /assets`: the asset, its site-relative URL (live once published), its uses. */
export interface AssetListItem {
  asset: Asset;
  url: string;
  usage: number;
}

export interface AssetListPage {
  assets: AssetListItem[];
  nextCursor?: string;
}

export interface AssetListQuery {
  kind?: Asset["kind"][] | undefined;
  status?: Asset["status"][] | undefined;
  q?: string | undefined;
  unused?: boolean | undefined;
  missingAlt?: boolean | undefined;
  uploadedBy?: "human" | "agent" | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** Where an asset is used: the node, the slot and (when it still exists) its title and path. */
export interface AssetUse {
  nodeId: string;
  nodeKind: string;
  field: string;
  title?: string;
  path?: string;
  status?: string;
}

export interface AssetDetail extends AssetListItem {
  /** Public checksum file (`<url>.sha256`), live once published. */
  checksumUrl?: string;
  uses: AssetUse[];
  blob?: {
    state: "uploading" | "stored" | "deleting" | "purged";
    purge?: { reason: string; legal: boolean; by: string; at: string };
  };
  /** The caller may edit the details: their own upload, or `asset:manage`. */
  editable: boolean;
}

/** Editable fields of `PUT /assets/:id`; a field set to `null` is removed. */
export interface AssetPatch {
  title?: Record<string, string> | null;
  alt?: Record<string, string> | null;
  caption?: Record<string, string> | null;
  credit?: string | null;
  license?: Asset["license"] | null;
  decorative?: boolean;
  slug?: string;
}

/** One file of `POST /assets/uploads` (RFC-0004 §5.5). */
export interface UploadFileRequest {
  filename: string;
  bytes: number;
  mediaType: string;
  sha256?: string;
  keepMetadata?: boolean;
  image?: { blurhash?: string; lqip?: string };
  /** In the site's default locale (or `locale`). */
  alt?: string;
  decorative?: boolean;
  title?: string;
  locale?: string;
}

/** What the server answered for one file, in request order. */
export type UploadTicket =
  | { index: number; filename: string; existing: AssetListItem }
  | {
      index: number;
      filename: string;
      uploadId: string;
      url: string;
      method: "PUT";
      headers: Record<string, string>;
      expiresAt: string;
    }
  | { index: number; filename: string; error: { code: string; message: string } };

/** The answer of the streamed `PUT` (201 new, 200 already in the library). */
export interface UploadResult extends AssetListItem {
  existing: boolean;
  /** `gps` / `metadata-kept` when a person kept the photo's metadata. */
  warnings: string[];
}

const assetPath = (siteId: string, id: string) =>
  `/api/sites/${siteId}/assets/${encodeURIComponent(id)}`;

// ---- site analytics (RFC-0006, packages/api/src/routes/analytics.ts) ----------------------------

/** Where events are recorded, whether Studio can read them, and how (`GET /api/instance`). */
export interface AnalyticsFeature {
  /** The deployment records analytics (`analytics.enabled` in cloudhal.json). */
  enabled: boolean;
  store: "wae" | "sql" | "none";
  /** `none` with a store: visits are recorded but cannot be read yet ("can't read yet"). */
  reader: "binding" | "sql" | "none";
  /** Days of live data (older ranges come from daily totals only). */
  liveDays: number;
  /** Uncached live queries per UTC day; `null` when not budgeted. */
  budget: number | null;
  /** `on-read`: no cron trigger; daily totals are computed when someone opens Analytics. */
  rollups: "scheduled" | "on-read";
  defaults: {
    enabled: boolean;
    uniqueVisitors: boolean;
    vitalsOneIn: AnalyticsVitalsOneIn;
    rollupRetentionDays?: number | null;
  };
}

/** Vitals sampling: one page view in N (0 = off). */
export type AnalyticsVitalsOneIn = 0 | 1 | 2 | 5 | 10 | 20;

/** A site's analytics settings: its row, or the deployment defaults (`rev` 0, `stored` false). */
export interface AnalyticsSettings {
  siteId: string;
  enabled: boolean;
  uniqueVisitors: boolean;
  vitalsOneIn: AnalyticsVitalsOneIn;
  /** `null`: keep daily totals forever. */
  rollupRetentionDays: number | null;
  planHint: "free" | "paid" | null;
  rev: number;
  stored: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export type AnalyticsSettingsPatch = Partial<
  Pick<
    AnalyticsSettings,
    "enabled" | "uniqueVisitors" | "vitalsOneIn" | "rollupRetentionDays" | "planHint"
  >
>;

export interface AnalyticsStatus {
  siteId: string;
  feature: AnalyticsFeature;
  settings: AnalyticsSettings;
  lastRollup: { day: string; finishedAt: string | null; source: string } | null;
  budget: { day: string; used: number; limit: number; spent: boolean } | null;
  /** Yesterday's request estimate for the Workers Free warning; `null` when unreadable. */
  quota: {
    day: string;
    pageviews: number;
    beacons: number;
    requests: number;
    /** People's HTML 200 renders that day (cache misses); `null` when not known. */
    renders?: number | null;
    /** Estimated cache-hit ratio that day (0–1), Cloudflare only. */
    cacheHitRatio?: number | null;
  } | null;
}

export type AnalyticsRangePreset = "today" | "7d" | "30d" | "90d" | "12m";
export type AnalyticsDimension =
  | "node"
  | "refHost"
  | "channel"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "country"
  | "device"
  | "browser"
  | "os";
export type AnalyticsRenderReport = "errors" | "redirects" | "crawlers";
export type { AnalyticsChannel, AnalyticsDevice };

/** A range by preset, or `from`/`to` (ISO dates or instants, UTC, `to` exclusive). */
export interface AnalyticsRangeQuery {
  range?: AnalyticsRangePreset;
  from?: string;
  to?: string;
  /** One of `node:<id>`, `channel:<channel>`, `country:<ISO2>`, `device:<device>`. */
  filter?: string;
}

/** Every analytics read: where the answer came from and whether it is complete. */
export interface AnalyticsEnvelope<T> {
  range: { from: string; to: string };
  source: "live" | "rollups" | "mixed";
  /** Approximate (sampled or distinct counts, merged percentiles). */
  estimated: boolean;
  /** Part of the range could not be read (budget spent, older than live data, no reader). */
  partial?: boolean;
  generatedAt: string;
  data: T;
}

export interface AnalyticsTotals {
  pageviews: number;
  visits: number;
  /** Daily unique visitors, summed; `null` when the mode was off. */
  visitors: number | null;
  /** Pages rendered for people (cache misses); `null` when not known. */
  renders?: number | null;
}

export interface AnalyticsSummary extends AnalyticsTotals {
  viewsPerVisit: number | null;
  /** **Estimated** cache-hit ratio, 1 − renders ÷ page views (0–1); Cloudflare only, else `null`. */
  cacheHitRatio?: number | null;
  previous?: AnalyticsTotals & { range: { from: string; to: string } };
  /** Relative change (0.12 = +12 %); `null` where the previous value was 0. */
  change?: { pageviews: number | null; visits: number | null; visitors: number | null };
}

export interface AnalyticsSeries {
  interval: "hour" | "day";
  points: { t: string; pageviews: number; visits: number }[];
}

/** A page, article or archive as the current graph knows it. */
export interface AnalyticsNode {
  nodeId: string;
  kind: "page" | "entry" | "archive" | null;
  /** `false`: it no longer exists ("No longer exists"). */
  exists: boolean;
  title: string | null;
  path: string | null;
  status: string | null;
}

export interface AnalyticsTopRow {
  key: string;
  pageviews: number;
  visits: number;
  /** Top content only. */
  node?: AnalyticsNode;
}

export interface AnalyticsTop {
  dimension: AnalyticsDimension;
  rows: AnalyticsTopRow[];
}

export interface AnalyticsVitalsMetric {
  metric: "lcp" | "inp" | "cls" | "ttfb" | "fcp";
  p75: number | null;
  samples: number;
  good: number | null;
  needsImprovement: number | null;
  poor: number | null;
}

export type AnalyticsRenders =
  | {
      report: "errors";
      /** `path` is what visitors requested: show it as plain text, never as a link. */
      rows: {
        path: string;
        status: number;
        refPath: string | null;
        hits: number;
        lastSeen: string | null;
      }[];
    }
  | {
      report: "redirects";
      rows: {
        path: string;
        status: number;
        redirectTo: string;
        nodeId: string | null;
        hits: number;
      }[];
    }
  | {
      report: "crawlers";
      rows: {
        crawler: string;
        class: "search" | "ai" | "social" | "monitor" | "other";
        hits: number;
      }[];
    };

export interface AnalyticsNodeStats {
  node: AnalyticsNode;
  summary: AnalyticsSummary;
  series: AnalyticsSeries;
  channels: AnalyticsTopRow[];
  referrers: AnalyticsTopRow[];
  countries: AnalyticsTopRow[];
  devices: AnalyticsTopRow[];
  vitals: { metrics: AnalyticsVitalsMetric[] };
  /** Earlier paths (slug changes) and the redirects they left, with hits in the range. */
  oldPaths: { from: string; to: string; status: number; reason: string; hits: number }[];
  redirectHits: number;
}

function analyticsQuery(
  q: AnalyticsRangeQuery,
  extra: Record<string, string | number | undefined> = {},
): string {
  return query({ range: q.range, from: q.from, to: q.to, filter: q.filter, ...extra });
}

const analyticsPath = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}/analytics`;

export const api = {
  me: () => request<Me>("/api/me"),
  instance: () => request<InstanceInfo>("/api/instance"),
  members: {
    /** Everyone with a membership; `email` only for `members:manage`. 404 on servers without roles. */
    list: () => request<{ items: Member[] }>("/api/members").then((r) => r.items),
    /** 403 `rank` (`details.problem`), 409 `conflict` when the member changed meanwhile. */
    setRole: (userId: string, role: Role) =>
      request<{ member: Member; keysNarrowed: KeyNarrowing[] }>(
        `/api/members/${encodeURIComponent(userId)}`,
        { method: "PATCH", ...json({ role }) },
      ),
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
  notifications: {
    /** What needs the signed-in person's attention; 404 on servers without it (see `isNotEnabled`). */
    list: () => request<NotificationsPage>("/api/notifications"),
  },
  skills: {
    list: () => request<SkillSummary[]>("/api/skills"),
  },
  approvals: {
    /** Newest first; all statuses unless `status` is given. 404 when approvals are disabled. */
    list: (siteId: string, status?: ApprovalStatus) =>
      request<{ items: Approval[] }>(
        `/api/sites/${encodeURIComponent(siteId)}/approvals${query({ status })}`,
      ).then((r) => r.items),
    /**
     * 409 when the request is no longer pending (decided, consumed or expired meanwhile); 409
     * `state_changed` when a person's publish request no longer matches the site (it is closed);
     * 403 `cannot_decide` (`details.code`). Approving a person's publish request publishes it and
     * answers with `published`.
     */
    decide: (siteId: string, id: string, decision: "approve" | "deny") =>
      request<Approval & { published?: { site: Site; snapshotId: string } }>(
        `/api/sites/${encodeURIComponent(siteId)}/approvals/${encodeURIComponent(id)}/${decision}`,
        { method: "POST" },
      ),
    /**
     * Approves an agent's `request_elevation` (ADR-0016 addendum): the server grants the elevation
     * on the agent's key with the approver's rights and answers with the request `consumed`.
     * `minutes` may shorten the request (400 when it would extend it) and is sent only when given.
     * 409 `conflict` when the request is no longer pending; 409 `elevation_conflict` (still pending)
     * when the key is gone, not yours or can no longer
     * take it (the request then stays pending).
     */
    grantElevation: (siteId: string, id: string, minutes?: number) =>
      request<Approval>(
        `/api/sites/${encodeURIComponent(siteId)}/approvals/${encodeURIComponent(id)}/approve`,
        { method: "POST", ...(minutes === undefined ? {} : json({ minutes })) },
      ),
  },
  previewLinks: {
    /** 404 when the server has no preview secret (see `isNotEnabled`). */
    create: (siteId: string, input: PreviewLinkInput) =>
      request<PreviewLink>(`/api/sites/${encodeURIComponent(siteId)}/preview-links`, {
        method: "POST",
        ...json(input),
      }),
  },
  sites: {
    list: () => request<Site[]>("/api/sites"),
    get: (id: string) => request<Site>(`/api/sites/${id}`),
    update: (site: Site) =>
      request<Site>(`/api/sites/${site.id}`, { method: "PUT", ...json(site) }),
  },
  pages: {
    list: (siteId: string) => request<Page[]>(`/api/sites/${siteId}/pages`),
    get: (siteId: string, id: string) => request<Page>(`/api/sites/${siteId}/pages/${id}`),
    create: (siteId: string, page: NewPage) =>
      request<{ page: Page; site: Site }>(`/api/sites/${siteId}/pages`, {
        method: "POST",
        ...json(page),
      }),
    update: (page: Page) =>
      request<Page>(`/api/sites/${page.siteId}/pages/${page.id}`, { method: "PUT", ...json(page) }),
    remove: (page: Page) =>
      request<{ site: Site }>(`/api/sites/${page.siteId}/pages/${page.id}?rev=${page.rev}`, {
        method: "DELETE",
      }),
  },
  entries: {
    /** `filter` is sent encoded, so its `+` survives as `%2B` (RFC-0002 §5). 400 on an unknown term. */
    list: (siteId: string, q?: string | EntryListQuery) => {
      const o = typeof q === "string" ? { collection: q } : (q ?? {});
      return request<ContentEntry[]>(
        `/api/sites/${siteId}/entries${query({
          collection: o.collection,
          filter: o.filter,
          status: o.status?.join(","),
        })}`,
      );
    },
    get: (siteId: string, id: string) =>
      request<ContentEntry>(`/api/sites/${siteId}/entries/${id}`),
    create: (siteId: string, entry: NewEntry) =>
      request<ContentEntry>(`/api/sites/${siteId}/entries`, { method: "POST", ...json(entry) }),
    update: (entry: ContentEntry) =>
      request<ContentEntry>(`/api/sites/${entry.siteId}/entries/${entry.id}`, {
        method: "PUT",
        ...json(entry),
      }),
    remove: (entry: ContentEntry) =>
      request<void>(`/api/sites/${entry.siteId}/entries/${entry.id}?rev=${entry.rev}`, {
        method: "DELETE",
      }),
  },
  snapshots: {
    list: (siteId: string) => request<Snapshot[]>(`/api/sites/${siteId}/snapshots`),
    /**
     * With `publish: true` an Author whose change set is not all their own gets 202 with a `role`
     * request instead (see `publishResultOf`); a Contributor gets 403 `missing_scope`.
     */
    create: (siteId: string, input: { label?: string; publish?: boolean }) =>
      request<{ snapshot: Snapshot; site: Site } & Partial<RoleRequest>>(
        `/api/sites/${siteId}/snapshots`,
        { method: "POST", ...json(input) },
      ),
    /** Live at once, or (202) a request an Editor decides (RFC-0005 §6). */
    publish: (siteId: string, snapshotId: string) =>
      request<Site | RoleRequest>(`/api/sites/${siteId}/snapshots/${snapshotId}/publish`, {
        method: "POST",
      }).then((r): PublishResult => publishResultOf(r)),
    rollback: (siteId: string, snapshotId: string) =>
      request<{ site: Site; snapshot: Snapshot }>(
        `/api/sites/${siteId}/snapshots/${snapshotId}/rollback`,
        { method: "POST" },
      ),
    get: (siteId: string, id: string) => request<Snapshot>(`/api/sites/${siteId}/snapshots/${id}`),
    /** What changed going from snapshot `from` to snapshot `to` (+ term assignment deltas). */
    diff: (
      siteId: string,
      from: string,
      to: string,
      options: { assignments?: boolean; menus?: boolean } = {},
    ) =>
      request<SnapshotDiff>(
        `/api/sites/${siteId}/snapshots/${from}/diff/${to}${query({
          assignments: options.assignments ? 1 : undefined,
          menus: options.menus ? 1 : undefined,
        })}`,
      ),
  },
  taxonomies: {
    list: (siteId: string) => request<Taxonomy[]>(`/api/sites/${siteId}/taxonomies`),
    /** One snapshot; 400 `reserved_key`, 409 `path_conflict` or a taken key, 422 `invalid_labels`. */
    create: (siteId: string, taxonomy: NewTaxonomy) =>
      request<{ taxonomy: Taxonomy; snapshot: Snapshot }>(`/api/sites/${siteId}/taxonomies`, {
        method: "POST",
        ...json(taxonomy),
      }),
    update: (taxonomy: Taxonomy) =>
      request<{ taxonomy: Taxonomy; snapshot: Snapshot }>(
        `/api/sites/${taxonomy.siteId}/taxonomies/${taxonomy.id}`,
        { method: "PUT", ...json(taxonomy) },
      ),
  },
  terms: {
    /** Terms with usage; `status` narrows, `q` matches names, synonyms and slugs. */
    list: (siteId: string, q: { taxonomy?: string; status?: Term["status"][]; q?: string } = {}) =>
      request<{ items: TermListItem[] }>(
        `/api/sites/${siteId}/terms${query({ taxonomy: q.taxonomy, status: q.status?.join(","), q: q.q })}`,
      ).then((r) => r.items),
    get: (siteId: string, id: string) =>
      request<TermDetail>(`/api/sites/${siteId}/terms/${encodeURIComponent(id)}`),
    /** People create active, public terms directly; 409 `slug_taken`, 422 `invalid_labels`. */
    create: (siteId: string, term: NewTerm) =>
      request<{ term: Term; snapshot: Snapshot }>(`/api/sites/${siteId}/terms`, {
        method: "POST",
        ...json(term),
      }),
    /** Text and presentation only (names, synonyms, description, SEO, image, position). */
    update: (term: Term) =>
      request<{ term: Term; snapshot: Snapshot }>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}`,
        { method: "PUT", ...json(term) },
      ),
    /**
     * The archive page with the editor's unsaved names, intro, SEO and image, and what the public
     * route answers with them. Nothing is written.
     */
    previewDraft: (term: Pick<Term, "id" | "siteId" | "labels" | "image">) =>
      request<TermPreview>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/preview`,
        { method: "POST", ...json({ labels: term.labels, image: term.image ?? null }) },
      ),
    /** Previews a governance operation without writing anything. */
    preview: (term: Term, op: GovernanceOp) =>
      request<{ preview: GovernancePreview }>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/${op.op}`,
        { method: "POST", ...json(governanceBody(op, term.rev, true)) },
      ).then((r) => r.preview),
    /** One batch, one snapshot (RFC-0002 §4.3); 409 `too_large` over 400 entries. */
    govern: (term: Term, op: GovernanceOp) =>
      request<GovernanceResponse>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/${op.op}`,
        { method: "POST", ...json(governanceBody(op, term.rev, false)) },
      ),
  },
  redirects: {
    list: (siteId: string) => request<Redirect[]>(`/api/sites/${siteId}/redirects`),
    create: (siteId: string, input: NewRedirect) =>
      request<{ redirect: Redirect; snapshot: Snapshot }>(`/api/sites/${siteId}/redirects`, {
        method: "POST",
        ...json(input),
      }),
    update: (redirect: Redirect) =>
      request<{ redirect: Redirect; snapshot: Snapshot }>(
        `/api/sites/${redirect.siteId}/redirects/${encodeURIComponent(redirect.id)}`,
        { method: "PUT", ...json(redirect) },
      ),
    remove: (redirect: Redirect) =>
      request<{ snapshot: Snapshot }>(
        `/api/sites/${redirect.siteId}/redirects/${encodeURIComponent(redirect.id)}?rev=${redirect.rev}`,
        { method: "DELETE" },
      ),
  },
  /** Navigation menus (RFC-0003 §5): reads for every member, writes for Editor and above. */
  menus: {
    /** Menus, the well-known keys without one (with the derived header) and the limits. */
    list: (siteId: string) => request<MenusOverview>(`/api/sites/${siteId}/menus`),
    get: (siteId: string, menuId: string, locale?: string) =>
      request<{ menu: Menu; locale: string; resolved: ResolvedMenu }>(
        `/api/sites/${siteId}/menus/${encodeURIComponent(menuId)}${query({ locale })}`,
      ),
    /** One snapshot; 409 `key_taken`. */
    create: (siteId: string, input: { key: string; maxDepth?: number; items?: Menu["items"] }) =>
      request<MenuWrite>(`/api/sites/${siteId}/menus`, { method: "POST", ...json(input) }),
    /** Whole tree with `rev` (CAS); 409 `conflict` carries the current menu in `details.current`. */
    save: (
      siteId: string,
      menuId: string,
      body: { rev: number; maxDepth: number; items: Menu["items"] },
    ) =>
      request<MenuWrite>(`/api/sites/${siteId}/menus/${encodeURIComponent(menuId)}`, {
        method: "PUT",
        ...json(body),
      }),
    remove: (menu: Pick<Menu, "id" | "siteId" | "rev">) =>
      request<{ snapshot: Snapshot }>(
        `/api/sites/${menu.siteId}/menus/${encodeURIComponent(menu.id)}?rev=${menu.rev}`,
        { method: "DELETE" },
      ),
    /** "Create menu from current pages": a dry run (nothing written) or the real thing. */
    fromPagesPreview: (siteId: string, input: { key: string; categories: boolean }) =>
      request<FromPagesPreview>(`/api/sites/${siteId}/menus/from-pages`, {
        method: "POST",
        ...json({ ...input, dryRun: true }),
      }),
    fromPages: (siteId: string, input: { key: string; categories: boolean }) =>
      request<MenuWrite>(`/api/sites/${siteId}/menus/from-pages`, {
        method: "POST",
        ...json(input),
      }),
    /** Resolves unsaved trees (or the stored menu / derived default) for the preview. */
    preview: (
      siteId: string,
      input: {
        locale?: string;
        path?: string;
        menus: { key: string; items?: Menu["items"] }[];
      },
    ) =>
      request<MenuPreviewResponse>(`/api/sites/${siteId}/menus/preview`, {
        method: "POST",
        ...json(input),
      }),
    /** Menus and items that link to a page, article or term ("Used in menus"). */
    references: (siteId: string, kind: "page" | "contentEntry" | "term", id: string) =>
      request<{ items: MenuReference[] }>(
        `/api/sites/${siteId}/menus/references${query({ kind, id })}`,
      ).then((r) => r.items),
  },
  migrations: {
    /** `dryRun` writes nothing; a real run snapshots before and after. */
    tagsToTerms: (siteId: string, dryRun: boolean) =>
      request<TagsMigrationResult>(`/api/sites/${siteId}/migrations/tags-to-terms`, {
        method: "POST",
        ...json({ dryRun }),
      }),
    revertTagsToTerms: (siteId: string, migrationId: string) =>
      request<TagsRevertResult>(`/api/sites/${siteId}/migrations/tags-to-terms/revert`, {
        method: "POST",
        ...json({ migrationId }),
      }),
  },
  activity: {
    /** The site's audit trail, newest first; pass `nextBefore` back as `before` for older rows. */
    list: (
      siteId: string,
      options: { limit?: number; before?: number | null; actorId?: string } = {},
    ) =>
      request<ActivityPage>(
        `/api/sites/${siteId}/activity${query({
          limit: options.limit,
          before: options.before,
          actorId: options.actorId,
        })}`,
      ),
    /** Deployment events (members, invites, keys; no site), newest first. `audit:read` (Editor+). */
    deployment: (options: { limit?: number; before?: number | null } = {}) =>
      request<ActivityPage>(
        `/api/activity${query({ limit: options.limit, before: options.before })}`,
      ),
  },
  agentKeys: {
    list: () => request<AgentKeySummary[]>("/api/agent-keys"),
    /** Every key with its `owner` (`agents:manage`, Administrators). */
    listAll: () => request<AgentKeySummary[]>("/api/agent-keys?all=1"),
    /** Without `scopes` the server grants what the mode needs (`scopesForMode`). */
    create: (input: { name: string; mode?: KeyMode; scopes?: AgentScope[] }) =>
      request<CreatedAgentKey>("/api/agent-keys", { method: "POST", ...json(input) }),
    /** Audited; applies on the agent's next call. 400 for `bypass` or an unknown mode. */
    setMode: (id: string, mode: KeyMode) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ mode }),
      }),
    /**
     * "Allow analytics" (RFC-0006 §9.1): adds `analytics:read` to a key made before it existed. Own
     * keys, or any with `agents.manage`; audited. 400 `scope_above_role` when the key's creator
     * cannot read analytics (Contributors). Harmless when the key already holds it.
     */
    allowAnalytics: (id: string) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ addScopes: ["analytics:read"] }),
      }),
    /**
     * A more autonomous mode until the time is up, then the key's own mode again (ADR-0016; audited).
     * Replaces an elevation in force. 400 when the mode is not above the key's own, is bypass, or
     * `minutes` is out of bounds.
     */
    elevate: (id: string, input: ElevationInput) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}/elevation`, {
        method: "POST",
        ...json(input),
      }),
    /** Ends an elevation early (audited); harmless when none is in force. */
    endElevation: (id: string) =>
      request<AgentKeySummary>(`/api/agent-keys/${encodeURIComponent(id)}/elevation`, {
        method: "DELETE",
      }),
    remove: (id: string) =>
      request<void>(`/api/agent-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  /** The media library (RFC-0004 §6.1). Bytes go up only through `lib/uploads.ts` with a ticket. */
  assets: {
    list: (siteId: string, q: AssetListQuery = {}) =>
      request<AssetListPage>(
        `/api/sites/${siteId}/assets${query({
          kind: q.kind?.join(","),
          status: q.status?.join(","),
          q: q.q?.trim() || undefined,
          unused: q.unused ? 1 : undefined,
          missingAlt: q.missingAlt ? 1 : undefined,
          uploadedBy: q.uploadedBy,
          cursor: q.cursor,
          limit: q.limit,
        })}`,
      ),
    get: (siteId: string, id: string) => request<AssetDetail>(assetPath(siteId, id)),
    update: (asset: Asset, patch: AssetPatch) =>
      request<Asset>(assetPath(asset.siteId, asset.id), {
        method: "PUT",
        ...json({ rev: asset.rev, ...patch }),
      }),
    retire: (asset: Asset) =>
      request<Asset>(`${assetPath(asset.siteId, asset.id)}/retire`, {
        method: "POST",
        ...json({ rev: asset.rev }),
      }),
    restore: (asset: Asset) =>
      request<Asset>(`${assetPath(asset.siteId, asset.id)}/restore`, {
        method: "POST",
        ...json({ rev: asset.rev }),
      }),
    remove: (asset: Asset) =>
      request<void>(`${assetPath(asset.siteId, asset.id)}?rev=${asset.rev}`, {
        method: "DELETE",
      }),
    /** Takedown (Owner): the bytes go from every snapshot; the URL answers 410 (451 when legal). */
    purge: (asset: Asset, input: { reason: string; legal: boolean }) =>
      request<{ asset: Asset; status: 410 | 451 }>(`${assetPath(asset.siteId, asset.id)}/purge`, {
        method: "POST",
        ...json(input),
      }),
    /** Lets the same bytes be uploaded again after a takedown (Owner). */
    liftPurge: (siteId: string, sha256: string) =>
      request<{ lifted: boolean; asset?: Asset }>(
        `/api/sites/${siteId}/media/${encodeURIComponent(sha256)}/lift-purge`,
        { method: "POST", ...json({}) },
      ),
    /** Step 1 of an upload: signed, single-use tickets (at most 20 files per request). */
    requestUploads: (siteId: string, files: UploadFileRequest[]) =>
      request<{ files: UploadTicket[] }>(`/api/sites/${siteId}/assets/uploads`, {
        method: "POST",
        ...json({ files }),
      }),
    /** Studio's own, session-authenticated copy of the bytes (drafts included, never cached). */
    contentUrl: (siteId: string, id: string) => `${assetPath(siteId, id)}/content`,
  },
  /** Site analytics (RFC-0006 §9.2): reads for Authors and above, settings for Administrators. */
  analytics: {
    status: (siteId: string) => request<AnalyticsStatus>(`${analyticsPath(siteId)}/status`),
    summary: (siteId: string, q: AnalyticsRangeQuery = {}, compare = false) =>
      request<AnalyticsEnvelope<AnalyticsSummary>>(
        `${analyticsPath(siteId)}/summary${analyticsQuery(q, { compare: compare ? "previous" : undefined })}`,
      ),
    series: (siteId: string, q: AnalyticsRangeQuery = {}, interval?: "hour" | "day") =>
      request<AnalyticsEnvelope<AnalyticsSeries>>(
        `${analyticsPath(siteId)}/series${analyticsQuery(q, { interval })}`,
      ),
    top: (
      siteId: string,
      dimension: AnalyticsDimension,
      q: AnalyticsRangeQuery = {},
      limit?: number,
    ) =>
      request<AnalyticsEnvelope<AnalyticsTop>>(
        `${analyticsPath(siteId)}/top/${dimension}${analyticsQuery(q, { limit })}`,
      ),
    vitals: (siteId: string, q: AnalyticsRangeQuery = {}) =>
      request<AnalyticsEnvelope<{ metrics: AnalyticsVitalsMetric[] }>>(
        `${analyticsPath(siteId)}/vitals${analyticsQuery(q)}`,
      ),
    renders: <R extends AnalyticsRenderReport>(
      siteId: string,
      report: R,
      q: Omit<AnalyticsRangeQuery, "filter"> = {},
      limit?: number,
    ) =>
      request<AnalyticsEnvelope<Extract<AnalyticsRenders, { report: R }>>>(
        `${analyticsPath(siteId)}/renders/${report}${analyticsQuery(q, { limit })}`,
      ),
    node: (
      siteId: string,
      nodeId: string,
      q: Omit<AnalyticsRangeQuery, "filter"> = {},
      compare = false,
    ) =>
      request<AnalyticsEnvelope<AnalyticsNodeStats>>(
        `${analyticsPath(siteId)}/nodes/${encodeURIComponent(nodeId)}${analyticsQuery(q, { compare: compare ? "previous" : undefined })}`,
      ),
    /** A download link: CSV of the daily totals (complete, rolled-up days). */
    exportUrl: (siteId: string, q: Omit<AnalyticsRangeQuery, "filter"> = {}) =>
      `${analyticsPath(siteId)}/export${analyticsQuery(q)}`,
    settings: (siteId: string) =>
      request<{ settings: AnalyticsSettings; feature: AnalyticsFeature }>(
        `${analyticsPath(siteId)}/settings`,
      ),
    /** CAS on `rev` (0 while the site uses the defaults): 409 `conflict` when it changed meanwhile. */
    updateSettings: (siteId: string, rev: number, patch: AnalyticsSettingsPatch) =>
      request<{ settings: AnalyticsSettings; purged: boolean; saltDeleted: boolean }>(
        `${analyticsPath(siteId)}/settings`,
        { method: "PUT", ...json({ rev, ...patch }) },
      ),
  },
  /** Draft previews are whole HTML documents for a sandboxed `<iframe>`, not JSON. */
  preview: {
    page: (siteId: string, pageId: string) => `/api/sites/${siteId}/pages/${pageId}/preview`,
    entry: (siteId: string, entryId: string) => `/api/sites/${siteId}/entries/${entryId}/preview`,
    /** A term's archive page as saved (the editor shows the unsaved draft via `terms.previewDraft`). */
    term: (siteId: string, termId: string) =>
      `/api/sites/${siteId}/terms/${encodeURIComponent(termId)}/preview`,
  },
};

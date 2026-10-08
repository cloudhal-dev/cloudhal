import type {
  Actor,
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

/** Why a call waits for a person (packages/agent-runtime/src/policy.ts). */
export type ApprovalCause = "tool" | "destructive" | "skill" | "manual-mode";

/** Why `auto` mode did or did not let a publish through (packages/agent-runtime/src/modes.ts). */
export type AutoCheckCode = "low-risk" | "removes-content" | "nothing" | "structure" | "too-many";
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

/** Scopes an agent key can carry (`packages/agent-runtime/src/policy.ts`). */
export type AgentScope =
  | "site:read"
  | "site:write"
  | "content:read"
  | "content:write"
  | "preview:create"
  | "site:publish"
  | "site:rollback"
  | "*";

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
  };
  /** The server's agent-mode rules (ADR-0015). Older servers omit it; Studio then uses its own copy. */
  agentModes?: AgentModesInfo;
}

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
export type StudioNotification = ElevationEndingNotification | ElevationRequestNotification;

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
export type InstanceFeature = keyof InstanceInfo["features"];

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
export const api = {
  me: () => request<{ actor: { kind: string; id: string; name?: string } }>("/api/me"),
  instance: () => request<InstanceInfo>("/api/instance"),
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
    /** 409 when the request is no longer pending (decided, consumed or expired meanwhile). */
    decide: (siteId: string, id: string, decision: "approve" | "deny") =>
      request<Approval>(
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
    create: (siteId: string, input: { label?: string; publish?: boolean }) =>
      request<{ snapshot: Snapshot; site: Site }>(`/api/sites/${siteId}/snapshots`, {
        method: "POST",
        ...json(input),
      }),
    publish: (siteId: string, snapshotId: string) =>
      request<Site>(`/api/sites/${siteId}/snapshots/${snapshotId}/publish`, { method: "POST" }),
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
  },
  agentKeys: {
    list: () => request<AgentKeySummary[]>("/api/agent-keys"),
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
  /** Draft previews are whole HTML documents for a sandboxed `<iframe>`, not JSON. */
  preview: {
    page: (siteId: string, pageId: string) => `/api/sites/${siteId}/pages/${pageId}/preview`,
    entry: (siteId: string, entryId: string) => `/api/sites/${siteId}/entries/${entryId}/preview`,
  },
};

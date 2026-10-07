import type { Actor, ContentEntry, NodeRef, Page, Site, Snapshot } from "@cloudhal/core-contracts";

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

export interface AgentKeySummary {
  id: string;
  name: string | null;
  /** First characters of the key, for recognition. */
  start: string | null;
  scopes: AgentScope[];
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
}
/** The create response: the summary plus the plaintext key, returned exactly once. */
export type CreatedAgentKey = AgentKeySummary & { key: string };

export interface SnapshotDiff {
  added: NodeRef[];
  removed: NodeRef[];
  changed: Array<{ before: NodeRef; after: NodeRef }>;
}

/** Where agents reach this Studio's MCP server (streamable HTTP, same origin as the API). */
export function mcpEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/mcp`;
}

/** True when the server answered 404 for a feature it does not run (audit log, agent keys). */
export function isNotEnabled(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
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
    list: (siteId: string, collection?: string) =>
      request<ContentEntry[]>(
        `/api/sites/${siteId}/entries${collection ? `?collection=${encodeURIComponent(collection)}` : ""}`,
      ),
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
    /** What changed going from snapshot `from` to snapshot `to`. */
    diff: (siteId: string, from: string, to: string) =>
      request<SnapshotDiff>(`/api/sites/${siteId}/snapshots/${from}/diff/${to}`),
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
    create: (input: { name: string; scopes: AgentScope[] }) =>
      request<CreatedAgentKey>("/api/agent-keys", { method: "POST", ...json(input) }),
    remove: (id: string) =>
      request<void>(`/api/agent-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  /** Draft previews are whole HTML documents for a sandboxed `<iframe>`, not JSON. */
  preview: {
    page: (siteId: string, pageId: string) => `/api/sites/${siteId}/pages/${pageId}/preview`,
    entry: (siteId: string, entryId: string) => `/api/sites/${siteId}/entries/${entryId}/preview`,
  },
};

/** Snapshots, publishing and body proposals. */
import type { Actor, NodeRef, Site, Snapshot } from "@cloudhal/core-contracts";
import type { BodyDiff } from "@cloudhal/core-ts/body-blocks";
import type { MenuDiffSummary } from "../menus.ts";
import type { Approval } from "./approvals.ts";
import { json, query, request } from "./http.ts";

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

/** RFC-0014 body proposals (`@cloudhal/core-ts` `BodyProposal`), as Studio lists them. */
export interface BodyProposal {
  id: string;
  siteId: string;
  nodeId: string;
  sectionId?: string;
  baseRev: number;
  ops: unknown[];
  actor: Actor;
  note?: string;
  status: "open" | "accepted" | "partial" | "rejected" | "stale";
  createdAt: string;
  decidedBy?: Actor;
  decidedAt?: string;
}

/** `GET …/proposals`: open ones carry what accepting would change now, or why it can't. */
/** One operation of a proposal as it reads against the body now (`@cloudhal/core-ts`). */
export interface ProposalStep {
  op: "replace" | "replaceText" | "insert" | "move" | "delete";
  before?: string;
  after?: string;
}

export interface ProposalItem {
  proposal: BodyProposal;
  /** Open proposals: each operation, to accept some of them. */
  steps?: ProposalStep[];
  diff?: BodyDiff;
  problem?: string;
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

export const historyApi = {
  proposals: {
    /** Open proposals on one article or page, newest first. */
    list: (siteId: string, nodeId: string) =>
      request<{ items: ProposalItem[] }>(`/api/sites/${siteId}/proposals${query({ nodeId })}`).then(
        (r) => r.items,
      ),
    /** What accepting only the operations `ops` would change now. */
    preview: (siteId: string, id: string, ops: number[]) =>
      request<{ diff?: BodyDiff; problem?: string }>(
        `/api/sites/${siteId}/proposals/${encodeURIComponent(id)}/preview`,
        { method: "POST", ...json({ ops }) },
      ),
    /** Applies it (or the operations `ops`); 409 `stale` when the text changed since. */
    accept: (siteId: string, id: string, ops?: number[]) =>
      request<{ proposal: BodyProposal }>(
        `/api/sites/${siteId}/proposals/${encodeURIComponent(id)}/accept`,
        { method: "POST", ...json(ops ? { ops } : {}) },
      ),
    reject: (siteId: string, id: string) =>
      request<{ proposal: BodyProposal }>(
        `/api/sites/${siteId}/proposals/${encodeURIComponent(id)}/reject`,
        { method: "POST", ...json({}) },
      ),
  },
  snapshots: {
    list: (siteId: string) => request<Snapshot[]>(`/api/sites/${siteId}/snapshots`),
    /** One page or article as a snapshot holds it (drafts included; `content:read`). */
    node: <T>(siteId: string, snapshotId: string, nodeId: string) =>
      request<T>(
        `/api/sites/${siteId}/snapshots/${encodeURIComponent(snapshotId)}/nodes/${encodeURIComponent(nodeId)}`,
      ),
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
};

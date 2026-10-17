/** Approval requests (ADR-0014). */
import type { Actor, Site } from "@cloudhal/core-contracts";
import type { BodyDiff } from "@cloudhal/core-ts/body-blocks";
import type { AgentMode, ApprovalCause, AutoCheck, ElevationGrant } from "./agents.ts";
import { json, query, request } from "./http.ts";

/** What a pending approval request would change (RFC-0014 §5): a body, block by block. */
export interface ApprovalChanges {
  kind: "body";
  nodeId: string;
  sectionId?: string;
  title: string;
  diff: BodyDiff;
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "consumed" | "expired";

/** An agent's gated call waiting for (or decided by) a person (ADR-0014, `/api/sites/:id/approvals`). */
export interface Approval {
  id: string;
  siteId?: string;
  /** RFC-0008 §10.4: the release a release tool's request is for. */
  releaseId?: string;
  /** RFC-0008 §11.2: the automation run that filed it. */
  runId?: string;
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
  /** Pending `edit_body` requests: what approving would change now (RFC-0014 §5). */
  changes?: ApprovalChanges;
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

export const approvalsApi = {
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
  /**
   * Approve or deny. A person's publish request answers `published`; an agent's comment request
   * is carried out on approve (RFC-0007 §10.3) and answers the tool's `result` — or 409
   * `state_changed` when the comments moved after the agent asked, `carry_out_failed` when the
   * call itself failed.
   */
  decide: (siteId: string, id: string, decision: "approve" | "deny") =>
    request<Approval & { published?: { site: Site; snapshotId: string }; result?: unknown }>(
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
};

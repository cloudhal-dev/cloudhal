/** Reader comments: the types (the calls are in `comments.ts`). */
import type { Actor, Comment, CommentLabel } from "@cloudhal/core-contracts";

// ---- reader comments (RFC-0007 §12–§13, packages/api/src/routes/comments.ts) ----------------

export type ReaderCommentStatus = Comment["status"];
export type CommentLabelName = CommentLabel["label"];
export type CommentReasonCode = NonNullable<NonNullable<Comment["moderation"]>["reasonCode"]>;
export type CommentModerateAction = "approve" | "restore" | "hide" | "spam" | "hold";
export type CommentThreadMode = "default" | "open" | "closed" | "hidden";
export type CommentThreadState = "open" | "closed" | "hidden" | "off";
export type CommentReportReason = "spam" | "abuse" | "personal-data" | "illegal-content" | "other";

/** A comment as Studio sees it: the contract plus its entry and open reports (never an email). */
export interface CommentView extends Comment {
  entry: { title: string; path: string } | null;
  reports: { count: number; reasons: CommentReportReason[] };
}

export type CommentCounts = Record<ReaderCommentStatus | "reported", number>;

export interface CommentListQuery {
  status?: ReaderCommentStatus | "reported";
  node?: string;
  label?: CommentLabelName;
  since?: string;
  cursor?: string;
  limit?: number;
  order?: "newest" | "oldest";
}

export interface CommentModerationResult {
  id: string;
  ok: boolean;
  status?: ReaderCommentStatus;
  rev?: number;
  error?: "conflict" | "not_found" | "not_own" | "invalid_transition";
}

export interface CommentModerationResponse {
  results: CommentModerationResult[];
  /** `queued`: the live page updates within a minute (§8.4). */
  purge: "queued" | "none";
}

/** One row of a comment's moderation history (a statement of reasons, DSA Art. 17). */
export interface CommentEventRow {
  id: string;
  commentId: string;
  action: string;
  actor: Actor;
  reasonCode: CommentReasonCode | null;
  note: string | null;
  automated: boolean;
  approvalId: string | null;
  at: string;
}

export interface CommentReportRow {
  id: string;
  commentId: string;
  reason: CommentReportReason;
  /** Untrusted reader text: render as plain text. */
  details: string | null;
  hasEmail: boolean;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export interface CommentThreadView {
  nodeId: string;
  mode: CommentThreadMode;
  rev: number;
  closesAt: string | null;
  state: CommentThreadState;
}

export interface CommentSummary {
  range: "today" | "7d" | "30d";
  since: string;
  counts: CommentCounts;
  pending: { count: number; oldestAt: string | null; medianAt: string | null };
  busiestThreads: { nodeId: string; comments: number; title: string | null }[];
  labels: Partial<Record<CommentLabelName, number>>;
  unansweredQuestions: number;
  dailyCap: { used: number; cap: number; paused: boolean };
  purge: { pending: number; takedowns: number };
}

export interface CommentRetention {
  pendingDays: number;
  spamDays: number;
  deletedDays: number;
  hiddenDays: number | null;
  clientDataDays: number;
  resolvedReportDays: number;
}

/** A site's comment settings (`@cloudhal/comments` `CommentSettings`); `rev` 0 = the defaults. */
export interface CommentSettings {
  siteId: string;
  enabled: boolean;
  showWhenOff: boolean;
  collections: Record<string, { enabled: boolean; closeAfterDays?: number | null }>;
  closeAfterDays: number | null;
  protection: "pow" | "turnstile";
  turnstileSiteKey: string | null;
  allowWithoutScript: boolean;
  /**
   * Also accept posts without JavaScript while Turnstile is on (default false): they carry no
   * Turnstile token. Without it, turning on Turnstile turns these posts off.
   */
  allowWithoutScriptWithTurnstile: boolean;
  linkLimit: number;
  watchWords: string[];
  blockedWords: string[];
  dailyCap: number;
  aiLabels: "off" | "workers-ai";
  retention: CommentRetention;
  planHint: "free" | "paid" | null;
  rev: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type CommentSettingsPatch = Partial<
  Omit<CommentSettings, "siteId" | "rev" | "updatedAt" | "updatedBy" | "retention">
> & { retention?: Partial<CommentRetention> };

/** A commenter with their email: `commenters:data` (Editors and above) only. */
export interface Commenter {
  id: string;
  email: string;
  firstSeen: string;
  commentIds: string[];
  reportIds: string[];
}

export interface CommentEraseResult {
  comments: number;
  reports: number;
  emailDeleted: boolean;
  nodeIds: string[];
}

export interface CommentBan {
  id: string;
  subject: "email" | "ip";
  until: string | null;
  reasonCode: CommentReasonCode;
  note: string | null;
  by: Actor;
  at: string;
}

/** `features.comments` of `/api/instance`. */
export interface CommentsFeature {
  available: boolean;
  protection: ("pow" | "turnstile")[];
  aiLabels: boolean;
  /** Emails and secrets can be read and stored (`CLOUDHAL_COMMENTS_KEY`). */
  keys: boolean;
  purge: { pending: number };
}

/** The comment notifications (RFC-0007 §13). */
export type CommentNotification =
  | {
      id: string;
      kind: "comments-pending";
      siteId: string;
      count: number;
      oldestAt: string | null;
      at: string;
    }
  | { id: string; kind: "comments-reported"; siteId: string; count: number; at: string }
  | { id: string; kind: "comments-paused"; siteId: string; cap: number; day: string; at: string }
  | {
      id: string;
      kind: "comments-purge-waiting";
      siteId: string;
      tags: number;
      since: string;
      at: string;
    }
  | {
      id: string;
      kind: "comments-approval";
      siteId: string;
      approvalId: string;
      tool: string;
      agent: Actor;
      createdAt: string;
      expiresAt: string;
      at: string;
    };

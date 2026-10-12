/**
 * Types and constants shared by the pure rules, the pipeline and the stores (RFC-0007 §4, §11,
 * §15.1). The stored and returned record is the `Comment` contract from `@cloudhal/core-contracts`;
 * everything here is either a store input or a view that never carries an email, an IP hash or a
 * challenge (invariant C1).
 */
import type {
  Actor,
  Comment,
  CommentLabel,
  CommentModeration,
  CommentStatus,
} from "@cloudhal/core-contracts";

export type CommentId = string;
export type LabelName = CommentLabel["label"];
export type LabelSource = CommentLabel["source"];
export type ModerationAction = CommentModeration["action"];
export type ReasonCode = NonNullable<CommentModeration["reasonCode"]>;
export type { Actor, Comment, CommentLabel, CommentModeration, CommentStatus };

export const COMMENT_STATUSES = [
  "pending",
  "approved",
  "hidden",
  "spam",
  "deleted",
] as const satisfies readonly CommentStatus[];

export const LABELS = [
  "spam-suspect",
  "toxic",
  "off-topic",
  "question",
  "needs-reply",
  "praise",
  "personal-data",
  "links",
  "watch-word",
  "instruction-like",
] as const satisfies readonly LabelName[];

export const REASON_CODES = [
  "spam",
  "abuse",
  "off-topic",
  "personal-data",
  "illegal-content",
  "legal-order",
  "author-request",
  "erasure-request",
  "duplicate",
  "other",
] as const satisfies readonly ReasonCode[];

/** Replies are shown two levels deep (§4.3). A constant, not a setting. */
export const COMMENT_DISPLAY_DEPTH = 2;
/** Top-level comments per rendered page (§8.1). */
export const RENDER_PAGE_SIZE = 50;
/** Ids per moderation or label call (§4.4, §11.1). */
export const MAX_BULK = 50;
export const MAX_LABELS = 32;
/** Plain-text limits after normalising (§6.4). */
export const TEXT_MIN = 2;
export const TEXT_MAX = 5000;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const NOTE_MAX = 500;
export const REPORT_DETAILS_MAX = 1000;
/** Links above this refuse the comment (`400 invalid`), whatever `link_limit` says. */
export const LINK_HARD_LIMIT = 10;

/** `proof` column: how a stored comment or report got past the bot check. */
export type CommentProof = "pow" | "turnstile" | "none" | "staff" | "import";

/** A per-entry thread override (`comment_threads`). */
export type ThreadMode = "default" | "open" | "closed" | "hidden";
/** The effective state of an entry's thread (§4.5). */
export type ThreadState = "open" | "closed" | "hidden" | "off";

export interface ThreadRow {
  readonly siteId: string;
  readonly nodeId: string;
  readonly mode: ThreadMode;
  /** Explicit close time; `null` = computed from the entry's publication. */
  readonly closesAt: string | null;
  readonly rev: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface ThreadInput {
  readonly mode: ThreadMode;
  /** Omitted: keep the stored value. `null`: clear it. */
  readonly closesAt?: string | null;
}

/** Which actions a moderation op may take (the contract's minus `erase`, which has its own path). */
export type ModerateAction = Exclude<ModerationAction, "erase">;

export interface ModerationOp {
  readonly ids: readonly CommentId[];
  readonly action: ModerateAction;
  readonly actor: Actor;
  /** Required for hide, spam and delete (§4.2). */
  readonly reasonCode?: ReasonCode;
  readonly note?: string;
  /** The `rev` each comment had when the caller read it (CAS per comment). */
  readonly expectedRevs: Readonly<Record<CommentId, number>>;
  /** Set when a person approved an agent's request (ADR-0014); kept on the events. */
  readonly approvalId?: string;
  /** For `:own` scopes: comments on other entries answer `not_own` (RFC-0005 §9). */
  readonly ownNodeIds?: readonly string[];
  /** Statements appended to the same batch, last (the audit row). */
  readonly audit?: readonly AuditStatement[];
}

export type ModerationError = "conflict" | "not_found" | "not_own" | "invalid_transition";

export type ModerationResult =
  | {
      readonly id: CommentId;
      readonly ok: true;
      readonly status: CommentStatus;
      readonly rev: number;
    }
  | { readonly id: CommentId; readonly ok: false; readonly error: ModerationError };

export interface LabelItem {
  readonly commentId: CommentId;
  readonly add?: readonly LabelName[];
  readonly remove?: readonly LabelName[];
  /** 0–100, recorded on the labels this item adds. */
  readonly confidence?: number;
}

export interface LabelOp {
  readonly items: readonly LabelItem[];
  readonly actor: Actor;
  /** Who sets the labels. Agents may add and remove only `agent` labels. */
  readonly source: Extract<LabelSource, "agent" | "person" | "classifier">;
  /** Optional CAS per comment; comments without an entry are labelled at their current `rev`. */
  readonly expectedRevs?: Readonly<Record<CommentId, number>>;
  readonly ownNodeIds?: readonly string[];
  readonly audit?: readonly AuditStatement[];
}

/** A person's reply on the site's behalf (approved at once, §4.2). */
export interface StaffReply {
  /** The comment answered; it must be approved. */
  readonly commentId: CommentId;
  readonly text: string;
  /** The person who wrote or approved the reply (`user_…`). */
  readonly person: { readonly id: string; readonly name: string };
  readonly badge: "author" | "team";
  /** The agent that drafted the text, when one did. */
  readonly draftedBy?: Actor;
  readonly approvalId?: string;
  readonly audit?: readonly AuditStatement[];
}

/** One extra statement a caller appends to a store batch (an audit row). */
export interface AuditStatement {
  readonly sql: string;
  readonly params?: readonly (string | number | null)[];
}

export interface CommentQuery {
  readonly status?: CommentStatus | "reported";
  readonly nodeId?: string;
  readonly nodeIds?: readonly string[];
  readonly label?: LabelName;
  /** Comments created at or after this instant. */
  readonly since?: string;
  readonly cursor?: string;
  /** 1–50, default 20. */
  readonly limit?: number;
  /** Default `newest`. */
  readonly order?: "newest" | "oldest";
}

export type CommentCounts = Record<CommentStatus | "reported", number>;

export interface CountQuery {
  readonly nodeId?: string;
  readonly nodeIds?: readonly string[];
}

/** What the pipeline hands the store after step 11 (§6.2 step 12). */
export interface PreparedSubmission {
  readonly id: CommentId;
  readonly nodeId: string;
  readonly parentId?: CommentId;
  readonly inReplyToId?: CommentId;
  readonly name: string;
  readonly text: string;
  readonly status: "pending" | "spam";
  readonly labels: readonly CommentLabel[];
  readonly moderation?: CommentModeration;
  readonly email?: PreparedEmail;
  readonly ipHmac: string | null;
  readonly challengeId: string | null;
  readonly proof: Extract<CommentProof, "pow" | "turnstile" | "none">;
  readonly createdAt: string;
  /** When this month's salt was not stored yet: insert it in the same batch (§9.2). */
  readonly newSalt?: { readonly month: string; readonly salt: string };
}

export interface PreparedEmail {
  /** A fresh `cmr_…` id; the stored id wins when the address is already known. */
  readonly id: string;
  readonly hmac: string;
  readonly ciphertext: string;
  readonly iv: string;
}

export type ReportReason = "spam" | "abuse" | "personal-data" | "illegal-content" | "other";

export interface PreparedReport {
  readonly id: string;
  readonly commentId: CommentId;
  readonly reason: ReportReason;
  readonly details: string | null;
  readonly email?: PreparedEmail;
  readonly ipHmac: string | null;
  readonly challengeId: string | null;
  readonly createdAt: string;
  readonly newSalt?: { readonly month: string; readonly salt: string };
}

export type SubmitResult =
  | { readonly id: string }
  | { readonly duplicate: true }
  /** Another isolate stored a different salt for the month first; recompute and retry once. */
  | { readonly saltConflict: true };

export interface EraseTarget {
  /** Every comment and report of a commenter (`cmr_…`). */
  readonly commenterId?: string;
  /** Or these comments (a guest who left no email, §9.4). */
  readonly commentIds?: readonly CommentId[];
}

export interface EraseResult {
  readonly comments: number;
  readonly reports: number;
  readonly emailDeleted: boolean;
  /** Entries whose live page must be purged (takedown). */
  readonly nodeIds: readonly string[];
}

/** A rendered page of a thread (§8.1): approved comments, oldest first, two levels deep. */
export interface RenderPage {
  readonly items: readonly RenderItem[];
  /** Approved comments in the thread. */
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

export type RenderItem =
  | { readonly comment: Comment; readonly replies: readonly Comment[] }
  /** A top-level comment no longer public with approved replies under it: "This comment was removed". */
  | {
      readonly removed: { readonly id: CommentId; readonly createdAt: string };
      readonly replies: readonly Comment[];
    };

export interface CommentEvent {
  readonly id: string;
  readonly commentId: CommentId;
  readonly action: ModerationAction | "label" | "reply";
  readonly actor: Actor;
  readonly reasonCode: ReasonCode | null;
  readonly note: string | null;
  readonly automated: boolean;
  readonly approvalId: string | null;
  readonly op: string | null;
  readonly at: string;
}

export interface CommentReport {
  readonly id: string;
  readonly commentId: CommentId;
  readonly reason: ReportReason;
  /** Untrusted reader text. */
  readonly details: string | null;
  readonly hasEmail: boolean;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolution: string | null;
}

export type BanSubject = "email" | "ip";

export interface CommentBan {
  readonly id: string;
  readonly subject: BanSubject;
  readonly until: string | null;
  readonly reasonCode: ReasonCode;
  readonly note: string | null;
  readonly by: Actor;
  readonly at: string;
}

/** A commenter as people with `commenters:data` see them (§9.4). */
export interface Commenter {
  readonly id: string;
  readonly email: string;
  readonly firstSeen: string;
  readonly commentIds: readonly CommentId[];
  readonly reportIds: readonly string[];
}

/** UTC month `YYYY-MM`. */
export const utcMonth = (d: Date): string => d.toISOString().slice(0, 7);
/** UTC day `YYYY-MM-DD`. */
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
/** 00:00 UTC of `d`'s day, as an ISO instant. */
export const utcDayStart = (d: Date): string => `${utcDay(d)}T00:00:00.000Z`;

/** Adds milliseconds to an ISO instant. */
export const addMs = (iso: string | Date, ms: number): string =>
  new Date((typeof iso === "string" ? Date.parse(iso) : iso.getTime()) + ms).toISOString();

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

/** Coerces a D1/SQLite number (which may arrive as a string or bigint) to a number. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** True for a human actor (`approve`, `restore` and replies need one, §0.1 decision 3). */
export const isPerson = (actor: Actor): boolean => actor.kind === "human";

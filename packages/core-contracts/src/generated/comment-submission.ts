/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * What a browser may send to the site Worker's comment endpoints (RFC-0007): `POST /__cloudhal/comments` (a comment) and `POST /__cloudhal/comments/report` (a report). Forms post application/x-www-form-urlencoded and the comments module posts JSON; the server builds this object from either (the endpoint sets `kind`, the server sets `schemaVersion`) and checks it with the precompiled validator before anything else reads it. Everything in it is untrusted. It is loose where the server normalises (it trims, NFC-normalises and re-checks text against the stored Comment contract) and strict where a browser has no business sending something: there is no field for a status, a site, an author kind, a label, an IP address or anything the server derives itself.
 */
export type CommentSubmission = CommentPostSubmission | CommentReportSubmission;
/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 */
export type SchemaVersion = 1;
/**
 * The signed proof-of-work challenge from `GET /__cloudhal/comments/challenge`, as issued (base64url segments joined by dots).
 */
export type SubmissionChallenge = string;
/**
 * The counter that solves the challenge, in decimal.
 */
export type SubmissionSolution = string;
/**
 * Cloudflare Turnstile's response token, when the site turned Turnstile on.
 */
export type SubmissionTurnstileToken = string;
/**
 * A field people never see. The schema accepts any short value so that a filled honeypot gets the same answer as a real submission ("held for moderation") and nothing is stored.
 */
export type SubmissionHoneypot = string;
export type SubmissionCommentId = string;

/**
 * A new comment or a reply.
 */
export interface CommentPostSubmission {
  schemaVersion: SchemaVersion;
  kind: "comment";
  /**
   * The entry commented on. The server accepts it only for a published entry with an open thread, and works out the page to return to itself.
   */
  nodeId: string;
  /**
   * The comment replied to; it must be approved and in the same thread. The server decides `parentId`/`inReplyToId` of the stored comment.
   */
  parentId?: string;
  /**
   * The display name as typed (the form says it is shown publicly).
   */
  name: string;
  /**
   * Optional and never shown. Kept only for moderation, erasure and export requests (v1.1: reply notifications after double opt-in).
   */
  email?: string;
  /**
   * The comment as typed; the server trims and normalises it, then requires 2 to 5,000 characters.
   */
  body: string;
  challenge?: SubmissionChallenge;
  solution?: SubmissionSolution;
  turnstileToken?: SubmissionTurnstileToken;
  website?: SubmissionHoneypot;
}
/**
 * A reader's notice that a comment breaks the site's rules or the law (EU DSA Art. 16). A report never hides anything by itself: it puts the comment in front of a person.
 */
export interface CommentReportSubmission {
  schemaVersion: SchemaVersion;
  kind: "report";
  commentId: SubmissionCommentId;
  reason: "spam" | "abuse" | "personal-data" | "illegal-content" | "other";
  /**
   * Why, as typed; at most 1,000 characters after normalising.
   */
  details?: string;
  /**
   * Optional, never shown: where the site may answer the notice.
   */
  email?: string;
  challenge?: SubmissionChallenge;
  solution?: SubmissionSolution;
  turnstileToken?: SubmissionTurnstileToken;
  website?: SubmissionHoneypot;
}

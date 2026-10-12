/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * A comment id: `cmt_` and 6 to 32 letters or digits.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentId".
 */
export type CommentId = string;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Who wrote the comment, discriminated by `kind`. There is deliberately no email, address or account handle here.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentAuthor".
 */
export type CommentAuthor =
  GuestCommentAuthor | ReaderCommentAuthor | StaffCommentAuthor | ErasedCommentAuthor;
/**
 * Plain text chosen by the commenter (or the staff member's name), NFC-normalised and trimmed by the server: 1 to 80 characters, no control characters, no bidirectional overrides, no surrounding whitespace.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentDisplayName".
 */
export type CommentDisplayName = string;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * Lifecycle. `pending` waits for a person (every guest comment starts here); `approved` is public; `hidden` is withdrawn and reversible; `spam` is never shown and is deleted after the retention period; `deleted` is a soft delete, hard-deleted after the retention period unless approved replies keep it as a tombstone.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentStatus".
 */
export type CommentStatus = "pending" | "approved" | "hidden" | "spam" | "deleted";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;

/**
 * A reader comment on a published content entry, as stored in D1 (outside the site graph), returned to people and agents, and exported (RFC-0007). It is not a graph node: it never enters a snapshot, a diff or a site bundle, and a content rollback never changes it. The record carries no personal data beyond the display name the commenter chose: an email address, an IP address or its hash, a user agent and a proof-of-work challenge live in separate columns and tables that this contract cannot express (additionalProperties: false), so no reader of the contract — Studio lists, MCP tools, exports — can leak them. Text is plain text; renderers escape it and turn only https links into anchors with rel="ugc nofollow noopener noreferrer".
 */
export interface Comment {
  schemaVersion: SchemaVersion;
  id: CommentId;
  siteId: Id;
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  nodeId: string;
  /**
   * A comment id: `cmt_` and 6 to 32 letters or digits.
   */
  parentId?: string;
  /**
   * A comment id: `cmt_` and 6 to 32 letters or digits.
   */
  inReplyToId?: string;
  /**
   * Where the comment came from: `native` (the site's own form or Studio), `import` (an importer; see `origin`). `webmention` and `activitypub` are reserved for later RFCs and are refused by v1 writers.
   */
  source: "native" | "import" | "webmention" | "activitypub";
  origin?: CommentOrigin;
  author: CommentAuthor;
  body?: CommentBody;
  status: CommentStatus;
  /**
   * Advisory labels from rules, classifiers, agents and people. Labels never change what readers see; only a status change does.
   *
   * @maxItems 32
   */
  labels?: CommentLabel[];
  moderation?: CommentModeration;
  createdAt: Timestamp;
  /**
   * RFC 3339 / ISO 8601 instant in UTC.
   */
  editedAt?: string;
  rev: Revision;
}
/**
 * For imported comments: the system and its id, so importers are idempotent.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentOrigin".
 */
export interface CommentOrigin {
  system: "cloudhal" | "disqus" | "wordpress";
  /**
   * The comment's id in that system: printable ASCII, at most 200 characters.
   */
  id: string;
}
/**
 * A guest: only the display name they typed. Guest comments are always held for moderation in v1.
 */
export interface GuestCommentAuthor {
  kind: "guest";
  name: CommentDisplayName;
}
/**
 * A verified reader (v1.1: email code or magic link on the site's own host). `readerId` is the site's reader account id, never the email.
 */
export interface ReaderCommentAuthor {
  kind: "reader";
  readerId: Id;
  name: CommentDisplayName;
}
/**
 * A reply on the site's behalf. It is always attributed to a person (`personId` is a staff actor id, `user_…`): an agent may draft the text (`draftedBy`), but a person approved it. `draftedBy` names the agent that drafted the text, when one did (shown in Studio and the audit, not on the public page).
 */
export interface StaffCommentAuthor {
  kind: "staff";
  /**
   * The person who wrote or approved the reply.
   */
  personId: string;
  name: CommentDisplayName;
  /**
   * What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`.
   */
  badge: "author" | "team";
  draftedBy?: Actor;
}
/**
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * The commenter's identity was erased on request (RFC-0007 privacy model). Pages show a localised "Anonymous".
 */
export interface ErasedCommentAuthor {
  kind: "erased";
}
/**
 * The comment text. v1 has only `text`: plain text with line breaks, no markup. A later RFC may add a restricted Markdown format. Absent only when the text was deleted (status `deleted`, or an erasure that removed the text); the record then stays as a tombstone while approved replies hang under it.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentBody".
 */
export interface CommentBody {
  format: "text";
  /**
   * NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio.
   */
  text: string;
}
/**
 * An advisory label. `rule` labels come from the submission pipeline (word lists, link count, instruction-like text); `classifier` from an opt-in classifier (Workers AI, Akismet); `agent` from `label_comments`; `person` from Studio. `by` is the agent or person that set it (absent for rules and classifiers).
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentLabel".
 */
export interface CommentLabel {
  label:
    | "spam-suspect"
    | "toxic"
    | "off-topic"
    | "question"
    | "needs-reply"
    | "praise"
    | "personal-data"
    | "links"
    | "watch-word"
    | "instruction-like";
  source: "rule" | "classifier" | "agent" | "person";
  by?: Actor;
  /**
   * 0 to 100, when the source reports one.
   */
  confidence?: number;
  at: Timestamp;
}
/**
 * The latest moderation decision, kept as a statement of reasons (EU DSA Art. 17). The full history is in `comment_events`. Approvals are always a person's decision; agents may only hide, mark as spam or hold.
 *
 * This interface was referenced by `Comment`'s JSON-Schema
 * via the `definition` "CommentModeration".
 */
export interface CommentModeration {
  action: "approve" | "hide" | "spam" | "hold" | "restore" | "delete" | "erase";
  actor: Actor;
  at: Timestamp;
  /**
   * Required by writers for hide, spam, delete and erase.
   */
  reasonCode?:
    | "spam"
    | "abuse"
    | "off-topic"
    | "personal-data"
    | "illegal-content"
    | "legal-order"
    | "author-request"
    | "erasure-request"
    | "duplicate"
    | "other";
  /**
   * Free text from the moderator, plain text, at most 500 characters.
   */
  note?: string;
  /**
   * True when the decision was taken without a person (an agent, a rule or a ban), as a statement of reasons must say.
   */
  automated: boolean;
}

/**
 * Errors of the comments layer. Each carries a stable `code` the API maps to a status:
 * `invalid_settings` / `invalid_input` 400, `not_found` 404, `conflict` 409 (CAS on `rev`),
 * `forbidden` 403 (an agent asked for what only a person may do, RFC-0007 §0.1 decision 3).
 */
export type CommentsErrorCode =
  | "invalid_settings"
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "forbidden";

export class CommentsError extends Error {
  override readonly name: string = "CommentsError";
  readonly code: CommentsErrorCode;

  constructor(code: CommentsErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
  }
}

/** A settings or thread value outside its allowed set (400). */
export class CommentSettingsError extends CommentsError {
  override readonly name = "CommentSettingsError";
  constructor(message: string) {
    super("invalid_settings", message);
  }
}

/** A write with a stale `rev` (409). */
export class CommentConflictError extends CommentsError {
  override readonly name = "CommentConflictError";
  constructor(message = "comments changed somewhere else; reload and retry") {
    super("conflict", message);
  }
}

/** Input a person or agent can fix (400). */
export class CommentInputError extends CommentsError {
  override readonly name = "CommentInputError";
  constructor(message: string) {
    super("invalid_input", message);
  }
}

/** The comment, thread or commenter does not exist on this site (404). */
export class CommentNotFoundError extends CommentsError {
  override readonly name = "CommentNotFoundError";
  constructor(message = "not found") {
    super("not_found", message);
  }
}

/** Only a person may do this (approve, restore, reply, erase), in every mode (403). */
export class CommentForbiddenError extends CommentsError {
  override readonly name = "CommentForbiddenError";
  constructor(message: string) {
    super("forbidden", message);
  }
}

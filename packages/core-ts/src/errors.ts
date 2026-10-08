export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
  readonly kind: string;
  readonly id: string;
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.kind = kind;
    this.id = id;
  }
}

/** Optimistic-locking failure: the node was modified since it was read. */
export class ConflictError extends Error {
  override readonly name = "ConflictError";
  readonly kind: string;
  readonly id: string;
  readonly expectedRev: number;
  readonly actualRev: number | undefined;
  constructor(kind: string, id: string, expectedRev: number, actualRev: number | undefined) {
    super(
      `${kind} ${id}: expected rev ${expectedRev} but found ${actualRev === undefined ? "none (deleted)" : actualRev}`,
    );
    this.kind = kind;
    this.id = id;
    this.expectedRev = expectedRev;
    this.actualRev = actualRev;
  }
}

/** A uniqueness rule was violated (e.g. two pages with the same locale + path). */
export class UniqueConstraintError extends Error {
  override readonly name = "UniqueConstraintError";
  readonly kind: string;
  readonly key: string;
  constructor(kind: string, key: string) {
    super(`${kind} with key "${key}" already exists`);
    this.kind = kind;
    this.key = key;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  return /UNIQUE constraint failed/i.test(msg);
}

/**
 * Why a taxonomy, term, redirect or assignment write was refused (RFC-0002 §3). Callers map codes
 * to API/MCP errors; `details` carries machine-readable context (counts, ids, suggestions).
 */
export type InvariantCode =
  /** Invariant 1: `primary` is not one of `ids`. */
  | "primary_not_assigned"
  /** Invariant 2: a review/published entry lacks a required taxonomy's primary term. */
  | "required_term"
  /** Invariant 3: unknown taxonomy key, a term of another taxonomy or site, or a collection the taxonomy does not apply to. */
  | "invalid_assignment"
  /** Invariant 4: a retired term was assigned. */
  | "term_not_assignable"
  /** Invariant 5: more terms than `maxPerEntry`, or more than 60 term ids on one entry. */
  | "too_many_terms"
  /** Invariant 7: a reserved taxonomy key, or an attempt to change a key. */
  | "reserved_key"
  /** A field the operation may not change (e.g. a term's slug through `updateTerm`). */
  | "immutable_field"
  /** Invariant 8: the slug is in use or reserved by a term's slug history. */
  | "slug_taken"
  /** Invariant 9: parent in a flat taxonomy, or a parent that is retired / of another taxonomy. */
  | "invalid_parent"
  /** Invariant 9: the move would create a cycle. */
  | "cycle"
  /** Invariant 9: the hierarchy would be deeper than 5 levels. */
  | "too_deep"
  /** Invariants 10, 11: the term's status does not allow the operation. */
  | "invalid_status"
  /** Invariant 11: proposed terms are not allowed in this taxonomy (`allowNewTerms: none`). */
  | "not_allowed"
  /** Invariant 12: labels lack the site's default locale, or an alternative name collides. */
  | "invalid_labels"
  /** Invariant 13: an archive base path collides with a page, a collection or another taxonomy. */
  | "path_conflict"
  /** Invariant 14: a redirect from a served path, to itself, into a loop, or 302 outside manual. */
  | "invalid_redirect"
  /** A governance operation would touch more than 400 entries (or 1,000 statements). */
  | "too_large";

export class InvariantError extends Error {
  override readonly name = "InvariantError";
  readonly code: InvariantCode;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: InvariantCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** The `op_guards` assertion of a multi-node batch failed: a node moved since it was read. */
export function isOpGuardViolation(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  return /NOT NULL constraint failed: op_guards\.ok/i.test(msg);
}

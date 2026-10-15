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
  /** A governance operation would touch more than 400 entries (or 1,000 statements); a menu over 500 items or 100 per level. */
  | "too_large"
  /** RFC-0003 invariant 9: a menu item targets a node that does not exist in the site (or a retired term). */
  | "unknown_target"
  /** RFC-0003: a menu operation names an item id the menu does not have. */
  | "unknown_item"
  /** RFC-0003 invariants 6, 7: a label is empty, too long, has control characters, a locale the site lacks, or the default locale is missing. */
  | "invalid_label"
  /** RFC-0003 invariants 2, 3, 8: duplicate or malformed item ids, an empty group, a bad external link or operation. */
  | "invalid_menu"
  /** RFC-0003 invariant 1: the site already has a menu under this key. */
  | "key_taken"
  // ── RFC-0004 (assets and media) ──
  /** The file's (sniffed) type is not accepted, or not from this actor (SVG from agents). */
  | "unsupported_type"
  /** The declared type or file extension disagrees with the sniffed type. */
  | "type_mismatch"
  /** An image over 12,000 px per side or 50 megapixels. */
  | "too_many_pixels"
  /** An SVG with script, event handlers, external references or a DTD. */
  | "svg_unsafe"
  /** Metadata that cannot be stripped safely (AVIF with Exif or XMP, answer 14). */
  | "metadata_unsupported"
  /** The site's media storage quota would be exceeded. */
  | "quota_exceeded"
  /** The content was taken down (invariant 11). */
  | "purged"
  /** Invariant 9: the asset is referenced; `details.uses` lists where. */
  | "in_use"
  /** Invariant 7: an `assetId` or `asset:<id>` that names no asset of this site. */
  | "unknown_asset"
  /** Invariant 6: a retired asset was newly referenced. */
  | "retired_asset"
  /** The server-side fetch refused the URL (scheme, host, address, redirect, allowlist). */
  | "fetch_blocked"
  /** The server-side fetch failed (network, status, size, time, content type). */
  | "fetch_failed"
  /** Garbage collection holds the content right now; try again in a few seconds. */
  | "retry"
  /** Invariant 12: the path is reserved for media URLs (`/media/<16 hex>/…`). */
  | "reserved_path"
  /** A site bundle references media bytes the target does not have. */
  | "missing_media"
  /** Invariants 4 and 5: the asset's fields break a kind, storage or immutability rule. */
  | "invalid_asset"
  // ── RFC-0008 (time gates) ──
  /** `availability` without a gate, with a gate that does not parse, or `from` not before `until`. */
  | "invalid_availability"
  /** S15: the site's renderer has not confirmed it enforces gates; `availability` is refused. */
  | "gates_unsupported"
  /** §4.1: `Site.timeZone` is not a zone the writing runtime knows (`Intl.supportedValuesOf`, `UTC`). */
  | "invalid_time_zone"
  // ── RFC-0008 (releases) ──
  /** §6.2: the node is held by a release awaiting approval, scheduled or running; unschedule it first. */
  | "scheduled_locked"
  // ── RFC-0015 (block registry) ──
  /** A component section's props break its block type's schema (`details.issues`). */
  | "invalid_props"
  // ── RFC-0020 (surfaces) ──
  /** A surface breaks its tree, catalog, bindings or limits (`details.issues`, JSON Pointers). */
  | "invalid_surface";

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

/**
 * RFC-0008 §6.2: a node held by a release (awaiting approval, scheduled or running) is locked — an
 * update or delete is refused (`409 scheduled_locked`), as is publishing a snapshot that would move
 * its live version. `details` names the node, the release, its state and its time; people may
 * "Unschedule and edit" or "Edit and re-approve", agents ask a person.
 */
export class ScheduledLockedError extends InvariantError {
  readonly nodeId: string;
  readonly releaseId: string;
  constructor(hold: {
    nodeId: string;
    releaseId: string;
    state: string;
    executeAt?: string | undefined;
    title?: string | undefined;
  }) {
    super(
      "scheduled_locked",
      `${hold.nodeId} is scheduled in release ${hold.releaseId}${hold.executeAt ? ` for ${hold.executeAt}` : ""} (${hold.state}); it is locked until the release is unscheduled, edited and re-approved, or finished`,
      {
        nodeId: hold.nodeId,
        releaseId: hold.releaseId,
        state: hold.state,
        ...(hold.executeAt ? { executeAt: hold.executeAt } : {}),
        ...(hold.title ? { title: hold.title } : {}),
      },
    );
    this.nodeId = hold.nodeId;
    this.releaseId = hold.releaseId;
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

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

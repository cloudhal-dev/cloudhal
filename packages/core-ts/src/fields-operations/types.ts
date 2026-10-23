/**
 * RFC-0041 §6: the four field operations, their reports and results. Shared by the runner, the
 * API routes and the CLI.
 */
import type { Actor, FieldDefinition, FieldOption } from "@cloudhal/core-contracts";
import type { FieldType } from "../fields/types.ts";
import type { SiteGraphStore } from "../store.ts";

/** `metadata["cloudhal.migration"]` of an operation's snapshots. */
export const FIELD_MIGRATION = "0041-field";
export const META = {
  kind: "cloudhal.migration",
  id: "cloudhal.migration.id",
  phase: "cloudhal.migration.phase",
  op: "cloudhal.migration.op",
} as const;
/** Entries rewritten per batch (as the tags migration). */
export const FIELD_OPERATION_BATCH = 200;
/** What one request does before it answers `done: false` (RFC-0041 §6, "Runs and budgets"). */
export const FIELD_OPERATION_BUDGET = { entries: 2000, ms: 20_000 } as const;

export type FieldOperationName =
  | "rename_field"
  | "change_field_type"
  | "set_field_localized"
  | "remove_field";

export const FIELD_OPERATIONS: readonly FieldOperationName[] = [
  "rename_field",
  "change_field_type",
  "set_field_localized",
  "remove_field",
];

/** One operation as requested: what an agent tool, the API and the CLI send. */
export type FieldOperation =
  | { op: "rename_field"; collection: string; from: string; to: string }
  | {
      op: "change_field_type";
      collection: string;
      key: string;
      type: FieldType;
      /** The options of a new select (default: the field's own when it already is one). */
      options?: FieldOption[] | undefined;
      multiple?: boolean | undefined;
      /** Drop values the table cannot convert; without it such values refuse the operation. */
      onInvalid?: "clear" | undefined;
    }
  | { op: "set_field_localized"; collection: string; key: string; localized: boolean }
  | { op: "remove_field"; collection: string; key: string };

/** Counts of what happens to values (per locale too). */
export interface FieldValueCounts {
  /** Entries whose `fields` change. */
  touched: number;
  /** Values moved to the new key. */
  moved: number;
  /** Values converted to the new type. */
  converted: number;
  /** Values dropped: unconvertible with `onInvalid: "clear"`, or translations' copies. */
  cleared: number;
  /** Values deleted by `remove_field`. */
  removed: number;
  /** Values the table cannot convert (refuse the operation unless `onInvalid: "clear"`). */
  unconvertible: number;
}

export interface FieldOperationSample {
  entryId: string;
  locale: string;
  kind: "moved" | "converted" | "cleared" | "removed" | "unconvertible";
  before: unknown;
  after: unknown;
  reason?: string;
}

/** The dry run: what the approval prompt and Studio's dialog are built from. */
export interface FieldOperationReport extends FieldValueCounts {
  op: FieldOperationName;
  collection: string;
  /** The field as it is (for a rename, its current key). */
  key: string;
  /** Entries of the collection read. */
  entries: number;
  /** Entries holding a value that stays as it is. */
  unchanged: number;
  /** The same counts per locale. */
  locales: Record<string, FieldValueCounts>;
  /** Up to 5 values before and after (unconvertible ones first). */
  samples: FieldOperationSample[];
  definition: { before: FieldDefinition; after: FieldDefinition | null };
  /** Why running it would be refused (values the table cannot convert, without `clear`). */
  refusal?: { code: "field_values_unconvertible"; message: string } | undefined;
}

export interface FieldOperationResult {
  /** The `before` snapshot's id; empty for a dry run of an operation not started. */
  operationId: string;
  dryRun: boolean;
  /** Every phase ran: the marker is gone and the `after` snapshot exists. */
  done: boolean;
  /** An interrupted or budget-limited run was continued. */
  resumed: boolean;
  report: FieldOperationReport;
  /** Entries rewritten by this call. */
  rewritten: number;
  /** Entries changed meanwhile, retried by the next call. */
  skipped: { entryId: string; reason: string }[];
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
}

export type FieldOperationState = "running" | "done" | "reverting" | "reverted";

export interface FieldOperationStatus {
  operationId: string;
  operation: FieldOperation;
  state: FieldOperationState;
  /** Entries still to rewrite (running) or to restore (reverting). */
  pending: number;
  beforeSnapshotId: string;
  afterSnapshotId?: string;
  revertSnapshotId?: string;
}

export interface FieldRevertResult {
  operationId: string;
  done: boolean;
  /** Entries given their earlier values back exactly. */
  restored: number;
  /** Entries edited since the operation: converted back through the marker instead. */
  edited: string[];
  skipped: { entryId: string; reason: string }[];
  snapshotId?: string;
}

/** What every call takes. */
export interface FieldOperationOptions {
  actor: Actor;
  /** The clock of `updatedAt` stamps (default: now). */
  now?: (() => Date) | undefined;
  /** Stop after this much and answer `done: false` (default `FIELD_OPERATION_BUDGET`). */
  budget?: { entries?: number; ms?: number } | undefined;
}

/** The store plus the clock. */
export interface OperationContext {
  readonly store: SiteGraphStore;
  readonly stamp: () => string;
  readonly started: number;
  readonly budget: { entries: number; ms: number };
}

export function operationContext(
  store: SiteGraphStore,
  options: Pick<FieldOperationOptions, "now" | "budget">,
): OperationContext {
  const now = options.now ?? (() => new Date());
  return {
    store,
    stamp: () => now().toISOString(),
    started: Date.now(),
    budget: {
      entries: options.budget?.entries ?? FIELD_OPERATION_BUDGET.entries,
      ms: options.budget?.ms ?? FIELD_OPERATION_BUDGET.ms,
    },
  };
}

/** The field key the operation names (a rename's current key). */
export const operationKey = (op: FieldOperation): string =>
  op.op === "rename_field" ? op.from : op.key;

/** The field key once the operation is done. */
export const finalKey = (op: FieldOperation): string => (op.op === "rename_field" ? op.to : op.key);

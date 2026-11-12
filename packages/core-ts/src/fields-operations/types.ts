/**
 * RFC-0041 §6: the four field operations, their reports and results. Shared by the runner, the
 * API routes and the CLI.
 */
import type {
  Actor,
  FieldDefinition,
  FieldOption,
  SubFieldDefinition,
} from "@cloudhal/core-contracts";
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

/**
 * One operation as requested: what an agent tool, the API and the CLI send. RFC-0045 §7: `sub`
 * names a repeater's sub-field (`from`/`key` is then the repeater), which the operation renames,
 * converts or removes in every item.
 */
export type FieldOperation =
  | { op: "rename_field"; collection: string; from: string; to: string; sub?: string | undefined }
  | {
      op: "change_field_type";
      collection: string;
      key: string;
      type: FieldType;
      sub?: string | undefined;
      /** The options of a new select (default: the field's own when it already is one). */
      options?: FieldOption[] | undefined;
      multiple?: boolean | undefined;
      /** RFC-0045: a reference's target collections (required to a reference). */
      collections?: string[] | undefined;
      /** RFC-0045: a multiple reference's or a repeater's item cap. */
      maxItems?: number | undefined;
      /** RFC-0045: a repeater's sub-fields (required to a repeater) and the one naming items. */
      subFields?: SubFieldDefinition[] | undefined;
      itemLabel?: string | undefined;
      /** Drop values the table cannot convert; without it such values refuse the operation. */
      onInvalid?: "clear" | undefined;
    }
  | {
      op: "set_field_localized";
      collection: string;
      key: string;
      localized: boolean;
      /** Refused: sub-fields share their repeater's `localized`. */
      sub?: string | undefined;
    }
  | { op: "remove_field"; collection: string; key: string; sub?: string | undefined };

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
  /**
   * RFC-0045 §7: entries whose value stopped converting while the operation ran (a target
   * archived, a second entry with the same title, a target deleted). They keep the operation
   * running; continuing it with `onInvalid: "clear"` drops them.
   */
  unconvertible: { entryId: string; reason: string }[];
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
  /**
   * RFC-0045 §7: restored references whose group has no member left in the site (in a collection
   * the field allows), dropped from the restored value.
   */
  dropped: { entryId: string; field: string; targetId: string }[];
  /** Edited entries whose value does not convert back (see `FieldOperationResult`). */
  unconvertible: { entryId: string; reason: string }[];
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
  /**
   * RFC-0045 §7: continuing or reverting, drop the values that no longer convert (the way out of
   * an operation whose values became unconvertible while it ran).
   */
  onInvalid?: "clear" | undefined;
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

/** The field key the operation names (a rename's current key; with `sub`, the repeater). */
export const operationKey = (op: FieldOperation): string =>
  op.op === "rename_field" ? op.from : op.key;

/** The field key once the operation is done (a sub-field rename keeps the repeater's). */
export const finalKey = (op: FieldOperation): string =>
  op.op === "rename_field" && op.sub === undefined ? op.to : operationKey(op);

/** Every field key the operation rewrites in entries (a rename's both). */
export const operationKeys = (op: FieldOperation): string[] => [
  ...new Set([operationKey(op), finalKey(op)]),
];

/** The sub-field the operation names (RFC-0045 `sub`), if any. */
export const operationSub = (op: FieldOperation): string | undefined => op.sub;

/** `speakers.name` for a sub-field operation, else the field key. */
export const operationPath = (op: FieldOperation): string =>
  op.sub === undefined ? operationKey(op) : `${operationKey(op)}.${op.sub}`;

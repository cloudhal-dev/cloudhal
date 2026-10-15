/**
 * Corrections (RFC-0019 §2): notices appended to an entry when a published story changes in
 * substance. The store owns their time and their history:
 *
 * - **Time is the server's.** A new item gets the write's time; an existing item keeps its own.
 * - **Append-only once live.** An item that is in the live version of the entry can no longer be
 *   removed or change kind; only a person (a caller that says so) may edit its note.
 *
 * Worker-safe: pure functions over contract types.
 */
import type { ContentEntry, Correction } from "@cloudhal/core-contracts";
import { InvariantError } from "./errors.ts";

export type CorrectionKind = Correction["kind"];
export const CORRECTION_KINDS: readonly CorrectionKind[] = [
  "correction",
  "clarification",
  "update",
];

/** What a caller may send for a correction: the store fills in `id` and `at` for new items. */
export type CorrectionInput = Pick<Correction, "kind" | "note"> & Partial<Correction>;

export interface CorrectionRules {
  /** The item ids in the live version of the entry (they are locked). */
  readonly live: ReadonlySet<string>;
  /** The write's time, given to new items. */
  readonly at: string;
  /** A person with `site:publish` may edit a live item's note (the edit is audited by the caller). */
  readonly personEdit?: boolean;
  readonly newId: () => string;
}

/**
 * The corrections to store, from what the caller sent and what is stored. Throws
 * `correction_locked` when a live item is removed, changes kind or (without `personEdit`) note.
 */
export function prepareCorrections(
  sent: readonly CorrectionInput[] | undefined,
  stored: readonly Correction[] | undefined,
  rules: CorrectionRules,
): Correction[] | undefined {
  const before = new Map((stored ?? []).map((c) => [c.id, c]));
  const kept = new Set<string>();
  const out: Correction[] = [];
  for (const item of sent ?? []) {
    const old = item.id ? before.get(item.id) : undefined;
    if (!old || kept.has(old.id)) {
      // New: the store's id and time; a caller cannot name the snapshot either.
      out.push({ id: rules.newId(), kind: item.kind, at: rules.at, note: item.note });
      continue;
    }
    kept.add(old.id);
    if (rules.live.has(old.id)) {
      if (item.kind !== old.kind)
        throw locked(old.id, "a published correction keeps its kind; append a new one instead");
      if (item.note !== old.note && !rules.personEdit)
        throw locked(old.id, "only a person may edit a published correction's note");
    }
    out.push({
      id: old.id,
      kind: item.kind,
      at: old.at,
      note: item.note,
      ...(old.snapshotId ? { snapshotId: old.snapshotId } : {}),
    });
  }
  for (const id of rules.live)
    if (before.has(id) && !kept.has(id))
      throw locked(
        id,
        "a published correction cannot be removed; a retraction is a new correction",
      );
  return out.length > 0 ? out : undefined;
}

function locked(id: string, why: string): InvariantError {
  return new InvariantError("correction_locked", `correction ${id}: ${why}`, { correctionId: id });
}

/** Ids of `after`'s corrections that `before` does not have. */
export function addedCorrections(
  before: Pick<ContentEntry, "corrections"> | undefined,
  after: Pick<ContentEntry, "corrections"> | undefined,
): string[] {
  const had = new Set((before?.corrections ?? []).map((c) => c.id));
  return (after?.corrections ?? []).filter((c) => !had.has(c.id)).map((c) => c.id);
}

/** The newest correction (by time), if any: its time is the entry's visible "Updated" date. */
export function latestCorrection(entry: Pick<ContentEntry, "corrections">): Correction | undefined {
  let latest: Correction | undefined;
  for (const c of entry.corrections ?? [])
    if (!latest || Date.parse(c.at) >= Date.parse(latest.at)) latest = c;
  return latest;
}

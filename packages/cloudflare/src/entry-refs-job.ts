/**
 * RFC-0045 §2.4, rollout step 7: the admin Worker's `refs.rebuild` system job. It runs the
 * one-time per-site `entry_refs` rebuild (`rebuildEntryRefs`: per node, anchored on each node's
 * read hash, resumable by cursor, never a site-wide `DELETE`) every five minutes, offset from
 * `lists.backfill`, until every site is done; from then on a run costs its two discovery reads.
 * It is a safety net: the gate (§1) means no reference value existed before the types were
 * enabled, so it should find nothing to change.
 *
 * The declared `cost` is the run's statement budget, which `rebuildEntryRefs` enforces on every
 * statement it issues, so the tick's meter never sees more.
 */
import { rebuildEntryRefs } from "@cloudhal/core-ts";
import type { SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";

const EVERY_MS = 5 * 60_000;
/** Half-way between `lists.backfill`'s marks, so the two rarely share a tick's budget. */
const OFFSET_MS = 150_000;

/** The next five-minute mark plus 2:30 strictly after `after` (UTC). */
export const everyFiveMinutesOffset = (after: Date): Date =>
  new Date((Math.floor((after.getTime() - OFFSET_MS) / EVERY_MS) + 1) * EVERY_MS + OFFSET_MS);

export function entryRefsJob(
  sql: SqlDriver,
  o: { paid: boolean; log: (line: string) => void },
): SystemJobDefinition {
  // Discovery is two statements, a chunk of 100 entries about five; the free tick allows 40 in all.
  const budget = o.paid
    ? { entries: 2000, ms: 20_000, statements: 150 }
    : { entries: 200, ms: 5_000, statements: 12 };
  return {
    name: "refs.rebuild",
    cost: budget.statements,
    next: everyFiveMinutesOffset,
    async run() {
      const r = await rebuildEntryRefs(sql, { budget });
      const written = r.sites.reduce((n, s) => n + s.written, 0);
      const waiting = r.sites.filter((s) => !s.done).length;
      if (r.sites.length > 0)
        o.log(
          `refs rebuild: ${written} entr${written === 1 ? "y" : "ies"} checked, ${r.sites.length - waiting} site(s) done, ${waiting} not yet${r.exhausted ? " (more next run)" : ""}`,
        );
    },
  };
}

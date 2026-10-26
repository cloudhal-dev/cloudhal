/**
 * RFC-0042 §4, #110: the admin Worker's `lists.backfill` system job. Every five minutes it makes
 * listed collections' `entry_list_values` ready again where a settings change, a field
 * operation, an import, a race or a deployment from before migration 0029 left them not ready
 * (`rebuildListValues`, resumable and guarded, so a run cut short loses nothing), within a budget
 * that fits the tick plan. On the paid plan it also removes rows of collections that list no
 * fields any more. Until a collection is ready, its listings scan as before.
 *
 * The declared `cost` is the run's statement budget, which `rebuildListValues` enforces on every
 * statement it issues (discovery, chunks and tidy alike), so the tick's meter never sees more.
 * Each run starts at another not-ready collection, so a busy one cannot hold the rest back.
 */
import { rebuildListValues } from "@cloudhal/core-ts";
import type { SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";

const EVERY_MS = 5 * 60_000;

/** The next five-minute mark strictly after `after` (UTC). */
export const everyFiveMinutes = (after: Date): Date =>
  new Date((Math.floor(after.getTime() / EVERY_MS) + 1) * EVERY_MS);

export function listValuesJob(
  sql: SqlDriver,
  o: { paid: boolean; log: (line: string) => void },
): SystemJobDefinition {
  // Discovery is two statements, a chunk of 100 entries about five; the free tick allows 40 in all.
  const budget = o.paid
    ? { entries: 2000, ms: 20_000, statements: 150 }
    : { entries: 200, ms: 5_000, statements: 16 };
  return {
    name: "lists.backfill",
    cost: budget.statements,
    next: everyFiveMinutes,
    async run({ now }) {
      const start = Math.floor(now.getTime() / EVERY_MS);
      const r = await rebuildListValues(sql, { budget, tidy: o.paid, start });
      const written = r.collections.reduce((n, c) => n + c.written, 0);
      const waiting = r.collections.filter((c) => !c.ready).length;
      if (written + r.tidied > 0 || r.exhausted)
        o.log(
          `lists backfill: ${written} entr${written === 1 ? "y" : "ies"} indexed, ${r.tidied} row(s) tidied, ${waiting} collection(s) not ready${r.exhausted ? " (more next run)" : ""}`,
        );
    },
  };
}

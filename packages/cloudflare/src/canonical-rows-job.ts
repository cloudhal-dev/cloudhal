/**
 * RFC-0045 §2.4: the admin Worker's `nodes.canonical` system job. Once an hour it rewrites site
 * rows an older import stored verbatim in canonical form, one CAS each, so the definitions and
 * collections anchors compare equal text (`canonicalizeSiteRows`). It reads one statement and
 * writes at most `limit` more, which is its declared cost.
 */
import { canonicalizeSiteRows } from "@cloudhal/core-ts";
import type { SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";

const HOUR_MS = 60 * 60_000;
const LIMIT = 10;

/** The next full hour strictly after `after` (UTC). */
const everyHour = (after: Date): Date =>
  new Date((Math.floor(after.getTime() / HOUR_MS) + 1) * HOUR_MS);

export function canonicalRowsJob(sql: SqlDriver, log: (line: string) => void): SystemJobDefinition {
  return {
    name: "nodes.canonical",
    cost: 1 + LIMIT,
    next: everyHour,
    async run() {
      const r = await canonicalizeSiteRows(sql, { limit: LIMIT });
      if (r.rewritten > 0) log(`canonical rows: ${r.rewritten} site row(s) rewritten`);
    },
  };
}

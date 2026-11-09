/**
 * RFC-0044 §3 "Lifetime": the scheduler's hourly system job that deletes dynamically registered
 * OAuth clients nobody used for 30 days (`pruneDcrClients`), on the admin Worker's tick and on
 * Node's (`cloudhal studio`, `dev`, `mcp`). It runs whether DCR is on or off: clients registered
 * while it was on still age out. Bounded: at most `PRUNE_BATCH` clients per run, one batch.
 */
import { hourlyAt, type SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";
import { pruneDcrClients } from "./auth/oauth-registration.ts";

export function oauthClientsPruneJob(
  sql: SqlDriver,
  log: (line: string) => void,
): SystemJobDefinition {
  return {
    name: "oauth.clients.prune",
    // One batch of six statements.
    cost: 6,
    next: hourlyAt(41),
    async run({ now }) {
      const deleted = await pruneDcrClients(sql, { now });
      if (deleted > 0) log(`oauth clients: ${deleted} unused registration(s) deleted`);
    },
  };
}

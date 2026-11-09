/**
 * RFC-0044 §3 "Lifetime": the scheduler's hourly system job that deletes unused OAuth clients
 * (`pruneDcrClients`, `pruneCimdClients`): dynamically registered ones nobody used for 30 days, and clients from
 * metadata documents nobody connected through or fetched for a day (the next authorization
 * stores them again). On the admin Worker's tick and on Node's (`cloudhal studio`, `dev`,
 * `mcp`), whether DCR and CIMD are on or off. Bounded: one kind per run (alternate hours), at most
 * `PRUNE_BATCH` clients, one batch.
 */
import { hourlyAt, type SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";
import { pruneCimdClients, pruneDcrClients } from "./auth/oauth-client-rows.ts";

export function oauthClientsPruneJob(
  sql: SqlDriver,
  log: (line: string) => void,
): SystemJobDefinition {
  return {
    name: "oauth.clients.prune",
    // One batch of six statements: one kind per run, so the job fits next to the other hourly
    // jobs in a free plan's tick (DCR clients in even UTC hours, document clients in odd ones).
    cost: 6,
    // The hourly jobs' :17 watermark: due jobs run by time, then name, so this one runs after
    // the analytics rollup and the comments job and waits for the next minute when a free
    // plan's tick is full.
    next: hourlyAt(17),
    async run({ now }) {
      if (now.getUTCHours() % 2 === 0) {
        const n = await pruneDcrClients(sql, { now });
        if (n > 0) log(`oauth clients: ${n} unused registration(s) deleted`);
      } else {
        const n = await pruneCimdClients(sql, { now });
        if (n > 0) log(`oauth clients: ${n} unused document client(s) deleted`);
      }
    },
  };
}

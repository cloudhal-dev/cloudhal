/**
 * RFC-0044 §3 "Lifetime": the scheduler's hourly system job that deletes unused OAuth clients:
 * dynamically registered ones nobody used for 30 days (`pruneDcrClients`, one batch of 50), and
 * document clients nobody connected through or fetched for three hours (`pruneCimdClients`, up
 * to four batches of 50 while they come back full; the next authorization stores them again).
 * On the admin Worker's tick and on Node's (`cloudhal studio`, `dev`, `mcp`), whether DCR and
 * CIMD are on or off.
 */
import { hourlyAt, type SystemJobDefinition } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";
import { CIMD_PRUNE_BATCHES, pruneCimdClients, pruneDcrClients } from "./auth/oauth-client-rows.ts";

export function oauthClientsPruneJob(
  sql: SqlDriver,
  log: (line: string) => void,
  /** The deployment's limits (`DcrLimits.unusedDays`, `CimdLimits.unusedHours`); default theirs. */
  limits: { readonly dcrUnusedDays?: number; readonly cimdUnusedHours?: number } = {},
): SystemJobDefinition {
  return {
    name: "oauth.clients.prune",
    // Batches of six statements: one for DCR, up to CIMD_PRUNE_BATCHES for documents.
    cost: 6 * (1 + CIMD_PRUNE_BATCHES),
    // The hourly jobs' :17 watermark: due jobs run by time, then name, so this one runs after
    // the analytics rollup and the comments job and waits for the next minute when a free
    // plan's tick is full.
    next: hourlyAt(17),
    async run({ now }) {
      const dcr = await pruneDcrClients(sql, {
        now,
        ...(limits.dcrUnusedDays !== undefined ? { unusedDays: limits.dcrUnusedDays } : {}),
      });
      const cimd = await pruneCimdClients(sql, {
        now,
        ...(limits.cimdUnusedHours !== undefined ? { unusedHours: limits.cimdUnusedHours } : {}),
      });
      if (dcr + cimd > 0)
        log(
          `oauth clients: ${dcr} unused registration(s), ${cimd} unused document client(s) deleted`,
        );
    },
  };
}

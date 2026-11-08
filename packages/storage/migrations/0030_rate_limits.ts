import type { Migration } from "../src/migrate.ts";

/**
 * #168 item 8: Cloudhal's own fixed-window counters (`StaffStore.hit`: the hourly per-address
 * reset-mail cap, the per-minute public token buckets, each agent key's window) leave Better
 * Auth's `rateLimit` table (0005). Better Auth prunes that table by its own 60 s window and so
 * deleted the hourly counters too, which let the reset-mail cap restart every minute.
 *
 * `rate_limits`: one row per counter key (`cloudhal:…`), its `count` in the window that began at
 * `window_start` (epoch ms). Nothing prunes it by age; a stale row is reset by the next hit. The
 * old `cloudhal:` rows in `rateLimit` are deleted (Better Auth would prune them anyway), so a
 * counter restarts once at upgrade.
 */
export const migration0030RateLimits: Migration = {
  name: "0030_rate_limits",
  sql: `
CREATE TABLE rate_limits (
  key TEXT NOT NULL PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
DELETE FROM "rateLimit" WHERE "key" LIKE 'cloudhal:%';
`,
};

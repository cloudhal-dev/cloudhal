/**
 * RFC-0044 §3: the OAuth client rows anonymous callers can make the server store, and their
 * bounds. Dynamic registration (`dcr.ts`) and metadata documents (`cimd-discovery.ts`) each have a
 * cap, and the hourly `oauth.clients.prune` job (`oauth-prune-job.ts`) deletes the unused ones with
 * every provider row of theirs in one atomic batch per kind.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { CIMD_LIMITS, DCR_LIMITS } from "./oauth-registration.ts";

/**
 * A dynamically registered client: no discovery source (CIMD sets `cimd`) and no owner (the
 * provider records the member or reference only for registrations made with a session or an
 * initial access token, which this server never accepts).
 */
export const dcrClient = (t = "") =>
  `${t}"clientDiscoveryId" IS NULL AND ${t}"userId" IS NULL AND ${t}"referenceId" IS NULL`;

/** How many dynamically registered clients exist (the cap, §3). */
export async function countDcrClients(sql: SqlDriver): Promise<number> {
  const row = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "oauthClient" WHERE ${dcrClient()}`,
  );
  return Number(row?.n ?? 0);
}

/** The most clients one pruning pass deletes (D1 prefers short statements). */
export const PRUNE_BATCH = 50;

/** The clients a metadata document made (`cimd()` stores them under its discovery id). */
export const cimdClient = (t = "") => `${t}"clientDiscoveryId" = 'cimd'`;

/** How many document clients are stored (the cap). */
export async function countCimdClients(sql: SqlDriver): Promise<number> {
  const row = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "oauthClient" WHERE ${cimdClient()}`,
  );
  return Number(row?.n ?? 0);
}

interface PruneKind {
  readonly where: (alias: string) => string;
  readonly since: "createdAt" | "updatedAt";
  readonly cutoff: string;
  readonly limit: number;
  /** Only these clients (eviction's pick), each still checked against the predicate. */
  readonly ids?: readonly string[] | undefined;
}

/**
 * Deletes unused clients of one kind, at most `limit`: no live connection, no connection made,
 * used or ended since `cutoff`, and the client's own row older than it (`since`: when it was
 * registered, or when its document was last fetched). A client with a live connection is never
 * deleted, however idle: ending it is its member's decision ("Connected agents"). Every row the
 * provider keeps for the client goes in the same atomic batch, each statement selecting the same
 * clients (the predicate reads only `oauthClient` and `agent_grants`, which the batch changes
 * last). Returns how many were deleted.
 */
async function pruneKind(sql: SqlDriver, kind: PruneKind): Promise<number> {
  const ids = kind.ids ?? [];
  const only = ids.length ? ` AND c."clientId" IN (${ids.map(() => "?").join(", ")})` : "";
  const prunable = `SELECT c."clientId" FROM "oauthClient" c WHERE ${kind.where("c.")} AND c."${kind.since}" < ?${only} AND NOT EXISTS (SELECT 1 FROM agent_grants g WHERE g.client_id = c."clientId" AND (g.revoked_at IS NULL OR g.created_at >= ? OR g.last_used_at >= ? OR g.revoked_at >= ?)) ORDER BY c."${kind.since}", c."clientId" LIMIT ${Math.max(1, Math.floor(kind.limit))}`;
  const { cutoff } = kind;
  const params = [cutoff, ...ids, cutoff, cutoff, cutoff];
  const code = (path: string) =>
    `CASE WHEN json_valid("value") THEN json_extract("value", '${path}') END`;
  const results = await sql.batch([
    { sql: `DELETE FROM "oauthAccessToken" WHERE "clientId" IN (${prunable})`, params },
    { sql: `DELETE FROM "oauthRefreshToken" WHERE "clientId" IN (${prunable})`, params },
    { sql: `DELETE FROM "oauthConsent" WHERE "clientId" IN (${prunable})`, params },
    { sql: `DELETE FROM "oauthClientResource" WHERE "clientId" IN (${prunable})`, params },
    {
      sql: `DELETE FROM "verification" WHERE "value" LIKE '%authorization_code%' AND ${code("$.type")} = 'authorization_code' AND ${code("$.query.client_id")} IN (${prunable})`,
      params,
    },
    { sql: `DELETE FROM "oauthClient" WHERE "clientId" IN (${prunable})`, params },
  ]);
  return results.at(-1)?.changes ?? 0;
}

const hoursBefore = (now: Date, hours: number) =>
  new Date(now.getTime() - hours * 3_600_000).toISOString();

/** Dynamically registered clients unused for `unusedDays` since they registered (§3: 30). */
export function pruneDcrClients(
  sql: SqlDriver,
  options: { readonly now: Date; readonly unusedDays?: number },
): Promise<number> {
  const days = options.unusedDays ?? DCR_LIMITS.unusedDays;
  return pruneKind(sql, {
    where: dcrClient,
    since: "createdAt",
    cutoff: hoursBefore(options.now, days * 24),
    limit: PRUNE_BATCH,
  });
}

/** Batches one pruning run deletes document clients in, at most (a burst drains in hours). */
export const CIMD_PRUNE_BATCHES = 4;

/**
 * Document clients nobody connected through and nobody fetched for `unusedHours` (default 3),
 * in up to `CIMD_PRUNE_BATCHES` batches while each comes back full: the next authorization
 * fetches the document and stores the client again.
 */
export async function pruneCimdClients(
  sql: SqlDriver,
  options: { readonly now: Date; readonly unusedHours?: number },
): Promise<number> {
  const cutoff = hoursBefore(options.now, options.unusedHours ?? CIMD_LIMITS.unusedHours);
  let total = 0;
  for (let i = 0; i < CIMD_PRUNE_BATCHES; i++) {
    const n = await pruneKind(sql, {
      where: cimdClient,
      since: "updatedAt",
      cutoff,
      limit: PRUNE_BATCH,
    });
    total += n;
    if (n < PRUNE_BATCH) break;
  }
  return total;
}

/** How many of the oldest unused document clients eviction looks at for a non-exempt one. */
export const EVICT_CANDIDATES = 50;

/**
 * Makes room for one document client (the cap): deletes the oldest one with no live connection
 * and no use since `before` whose **host** is not exempt. The host is read from the URL, never
 * matched with `LIKE` over the whole `client_id` (`%` also spans `/`, so a path could pass for
 * an exempt host). The candidates are read first; the pick is deleted in one atomic batch that
 * checks the predicate again. How many went (0 or 1).
 */
export async function evictCimdClient(
  sql: SqlDriver,
  input: { readonly before: Date; readonly isExempt: (host: string) => boolean },
): Promise<number> {
  const cutoff = input.before.toISOString();
  const candidates = await sql.all<{ clientId: string }>(
    `SELECT c."clientId" FROM "oauthClient" c WHERE ${cimdClient("c.")} AND c."updatedAt" < ? AND NOT EXISTS (SELECT 1 FROM agent_grants g WHERE g.client_id = c."clientId" AND (g.revoked_at IS NULL OR g.created_at >= ? OR g.last_used_at >= ? OR g.revoked_at >= ?)) ORDER BY c."updatedAt", c."clientId" LIMIT ${EVICT_CANDIDATES}`,
    [cutoff, cutoff, cutoff, cutoff],
  );
  const victim = candidates.find((r) => !input.isExempt(hostnameOf(r.clientId)));
  if (!victim) return 0;
  return pruneKind(sql, {
    where: cimdClient,
    since: "updatedAt",
    cutoff,
    limit: 1,
    ids: [victim.clientId],
  });
}

/** A client id's host name, lower case; "" when it is not a URL (never exempt). */
function hostnameOf(clientId: string): string {
  try {
    return new URL(clientId).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Records a failed refetch of a document client on its row: the validation time is cleared, so
 * the row is never served as fresh or stale again until a fetch succeeds.
 */
export async function markCimdFetchFailed(sql: SqlDriver, clientId: string): Promise<void> {
  await sql.run(
    `UPDATE "oauthClient" SET "updatedAt" = ? WHERE "clientId" = ? AND ${cimdClient()}`,
    [new Date(0).toISOString(), clientId],
  );
}

/** Both kinds, as the hourly job runs them; how many of each were deleted. */
export async function pruneUnusedClients(
  sql: SqlDriver,
  options: { readonly now: Date },
): Promise<{ dcr: number; cimd: number }> {
  return { dcr: await pruneDcrClients(sql, options), cimd: await pruneCimdClients(sql, options) };
}

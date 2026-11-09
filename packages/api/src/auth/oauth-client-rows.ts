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

/**
 * Deletes one kind of unused client, at most `PRUNE_BATCH`: no live connection, no connection
 * made, used or ended since `cutoff`, and the client's own row older than it (`since`: when it
 * was registered, or when its document was last fetched). A client with a live connection is
 * never pruned, however idle: ending it is its member's decision ("Connected agents"). Every row
 * the provider keeps for the client goes in the same atomic batch, each statement selecting the
 * same clients (the predicate reads only `oauthClient` and `agent_grants`, which the batch
 * changes last). Returns how many were deleted.
 */
async function pruneKind(
  sql: SqlDriver,
  kind: { readonly where: (alias: string) => string; readonly since: "createdAt" | "updatedAt" },
  cutoff: string,
): Promise<number> {
  const prunable = `SELECT c."clientId" FROM "oauthClient" c WHERE ${kind.where("c.")} AND c."${kind.since}" < ? AND NOT EXISTS (SELECT 1 FROM agent_grants g WHERE g.client_id = c."clientId" AND (g.revoked_at IS NULL OR g.created_at >= ? OR g.last_used_at >= ? OR g.revoked_at >= ?)) ORDER BY c."${kind.since}", c."clientId" LIMIT ${PRUNE_BATCH}`;
  const params = [cutoff, cutoff, cutoff, cutoff];
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

const cutoffOf = (now: Date, days: number) =>
  new Date(now.getTime() - days * 86_400_000).toISOString();

/** Dynamically registered clients unused for `unusedDays` since they registered (§3: 30). */
export function pruneDcrClients(
  sql: SqlDriver,
  options: { readonly now: Date; readonly unusedDays?: number },
): Promise<number> {
  const days = options.unusedDays ?? DCR_LIMITS.unusedDays;
  return pruneKind(sql, { where: dcrClient, since: "createdAt" }, cutoffOf(options.now, days));
}

/**
 * Document clients nobody connected through and nobody fetched for `unusedDays` (default 1): the
 * next authorization fetches the document and stores the client again.
 */
export function pruneCimdClients(
  sql: SqlDriver,
  options: { readonly now: Date; readonly unusedDays?: number },
): Promise<number> {
  const days = options.unusedDays ?? CIMD_LIMITS.unusedDays;
  return pruneKind(sql, { where: cimdClient, since: "updatedAt" }, cutoffOf(options.now, days));
}

/** Both kinds, as the hourly job runs them; how many of each were deleted. */
export async function pruneUnusedClients(
  sql: SqlDriver,
  options: { readonly now: Date },
): Promise<{ dcr: number; cimd: number }> {
  return { dcr: await pruneDcrClients(sql, options), cimd: await pruneCimdClients(sql, options) };
}

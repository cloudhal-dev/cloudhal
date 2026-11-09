/**
 * RFC-0044 §3 (Phase 3): how OAuth clients that were not created by the server get a
 * `client_id`, and the operator's switches for it (§10: Worker vars, or the environment on Node).
 *
 * - **CIMD** (`CLOUDHAL_MCP_CIMD`, on unless `off`): a client names an HTTPS URL as its
 *   `client_id`; the server fetches the document there through the runtime's SSRF-safe transport
 *   (`cimd-fetch.ts`). `CLOUDHAL_MCP_CLIENT_HOSTS` limits which hosts may serve one.
 * - **DCR** (`CLOUDHAL_MCP_DCR`, on unless `off`): RFC 7591 `POST /api/auth/oauth2/register`,
 *   public clients only, with rate limits, a cap and pruning (`dcr.ts`, `pruneDcrClients`).
 *
 * With both off, only clients already in the database can connect (none, unless an operator made
 * one): an unknown `client_id` is refused at `/oauth2/authorize`.
 */
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import type { SqlDriver } from "@cloudhal/storage";

export interface DcrLimits {
  /** Registrations per client address per hour (§3: 10). */
  readonly perAddressPerHour: number;
  /** Registrations per installation per day (§3: 300). */
  readonly perDay: number;
  /** Dynamically registered clients that may exist at once (§3: 5,000; beyond it 503). */
  readonly maxClients: number;
  /** A client nobody used for this many days is deleted by the hourly job (§3: 30). */
  readonly unusedDays: number;
}

export const DCR_LIMITS: DcrLimits = {
  perAddressPerHour: 10,
  perDay: 300,
  maxClients: 5_000,
  unusedDays: 30,
};

/**
 * Outbound metadata fetches across every isolate (Cloudhal's `rate_limits`, not the plugin's
 * per-instance budget, which a Worker rebuilds on every request): per client origin and in all.
 */
export const CIMD_FETCH_LIMITS = { perOriginPerMinute: 30, perMinute: 120 } as const;

export interface OauthRegistration {
  /** CIMD's transport (`cimdFetch(...)`); absent: CIMD is off. */
  readonly cimd?: ClientMetadataResourceFetch | undefined;
  /** Dynamic client registration; absent or false: `/register` is not served or advertised. */
  readonly dcr?: boolean | undefined;
  /**
   * `CLOUDHAL_MCP_CLIENT_HOSTS`: hosts a CIMD document may be served from, and hosts a DCR
   * client may redirect to (`localhost` admits loopback redirects). Empty: any host.
   */
  readonly clientHosts?: readonly string[] | undefined;
  /** Overrides of `DCR_LIMITS` (tests). */
  readonly limits?: Partial<DcrLimits> | undefined;
}

/** The variables both runtimes read (RFC-0044 §10). */
export interface OauthRegistrationEnv {
  readonly CLOUDHAL_MCP_CIMD?: string | undefined;
  readonly CLOUDHAL_MCP_DCR?: string | undefined;
  readonly CLOUDHAL_MCP_CLIENT_HOSTS?: string | undefined;
}

const off = (value: string | undefined) => value?.trim().toLowerCase() === "off";

/** A DNS label: 1–63 of `a-z`, `0-9` and `-`, not starting or ending with `-`. */
function isLabel(label: string): boolean {
  if (label.length === 0 || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  for (const c of label)
    if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "-")) return false;
  return true;
}

/** A host pattern an operator may list: a DNS name, or `*.` and one. */
function isHostPattern(pattern: string): boolean {
  const name = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
  return name.length > 0 && name.length <= 253 && name.split(".").every(isLabel);
}

/** `CLOUDHAL_MCP_CLIENT_HOSTS` as a list; throws on an entry that is not a host name. */
export function parseClientHosts(value: string | undefined): string[] {
  const hosts = (value ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const h of hosts)
    if (!isHostPattern(h))
      throw new Error(`CLOUDHAL_MCP_CLIENT_HOSTS: "${h}" is not a host name (or *.host)`);
  return hosts;
}

/**
 * The registration a runtime runs, from its variables and its CIMD transport. A list of client
 * hosts that does not parse turns registration off (fail closed) and says why in `problem`.
 */
export function oauthRegistrationFrom(
  env: OauthRegistrationEnv,
  cimd: ClientMetadataResourceFetch,
): OauthRegistration & { readonly problem?: string } {
  let clientHosts: string[];
  try {
    clientHosts = parseClientHosts(env.CLOUDHAL_MCP_CLIENT_HOSTS);
  } catch (e) {
    return { dcr: false, problem: e instanceof Error ? e.message : String(e) };
  }
  return {
    ...(off(env.CLOUDHAL_MCP_CIMD) ? {} : { cimd }),
    dcr: !off(env.CLOUDHAL_MCP_DCR),
    ...(clientHosts.length > 0 ? { clientHosts } : {}),
  };
}

export function dcrLimits(registration: OauthRegistration | undefined): DcrLimits {
  return { ...DCR_LIMITS, ...registration?.limits };
}

/**
 * A dynamically registered client: no discovery source (CIMD sets `cimd`) and no owner (the
 * provider records the member or reference only for registrations made with a session or an
 * initial access token, which this server never accepts).
 */
export const DCR_CLIENT = `"clientDiscoveryId" IS NULL AND "userId" IS NULL AND "referenceId" IS NULL`;

/** How many dynamically registered clients exist (the cap, §3). */
export async function countDcrClients(sql: SqlDriver): Promise<number> {
  const row = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "oauthClient" WHERE ${DCR_CLIENT}`,
  );
  return Number(row?.n ?? 0);
}

/** The most clients one pruning pass deletes (D1 prefers short statements). */
export const PRUNE_BATCH = 50;

/**
 * Deletes dynamically registered clients unused for `unusedDays` (§3 "Lifetime"): registered
 * before the cutoff, no live connection, and no connection made, used or ended since the cutoff.
 * A client with a live connection is never pruned, however idle: ending it is its member's
 * decision ("Connected agents"). Every row the provider keeps for the client goes in the same
 * atomic batch, each statement selecting the same clients (the predicate reads only
 * `oauthClient` and `agent_grants`, which the batch changes last). Returns how many were deleted.
 */
export async function pruneDcrClients(
  sql: SqlDriver,
  options: { readonly now: Date; readonly unusedDays?: number },
): Promise<number> {
  const days = options.unusedDays ?? DCR_LIMITS.unusedDays;
  const cutoff = new Date(options.now.getTime() - days * 86_400_000).toISOString();
  const prunable = `SELECT c."clientId" FROM "oauthClient" c WHERE c."clientDiscoveryId" IS NULL AND c."userId" IS NULL AND c."referenceId" IS NULL AND c."createdAt" < ? AND NOT EXISTS (SELECT 1 FROM agent_grants g WHERE g.client_id = c."clientId" AND (g.revoked_at IS NULL OR g.created_at >= ? OR g.last_used_at >= ? OR g.revoked_at >= ?)) ORDER BY c."createdAt", c."clientId" LIMIT ${PRUNE_BATCH}`;
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

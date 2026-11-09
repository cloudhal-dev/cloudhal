/**
 * RFC-0044 §3: Client ID Metadata Documents, with Cloudhal's bounds around `@better-auth/cimd`'s
 * discovery. The plugin keeps its validation cache in one plugin instance, which a Worker builds
 * for every request, so on its own it would fetch a stored client's document on every
 * `getClient` (authorize, consent, every token refresh), and anonymous callers could make it
 * store a client row for every new URL. Around the plugin's `resolve`:
 *
 * 1. **Host list.** With `CLOUDHAL_MCP_CLIENT_HOSTS` set, a document host off the list is refused,
 *    stored or not (a stored one resolves to nothing, so it cannot authorize).
 * 2. **Stored and fresh: no fetch.** A stored client whose row was validated within
 *    `freshMinutes` (the row's `updatedAt`, which the plugin sets on every fetch) is used as it
 *    is, on every runtime: no network, no budget.
 * 3. **Cap.** A document not stored yet is refused (`temporarily_unavailable`, 503) once
 *    `maxClients` document clients exist; the hourly job prunes unused ones
 *    (`oauth-client-rows.ts`).
 * 4. **Budgets** in `rate_limits`, spent only before a real fetch: every fetch counts against the
 *    caller's address (the runtime's trusted header, #165/#169); a document not stored yet also
 *    against its origin and the installation. A stored client is never blocked by them: when a
 *    budget is spent it is served from its row (stale-if-exhausted), so anonymous calls that use
 *    up a budget cannot stop members' clients from connecting or refreshing.
 *
 * Then the plugin fetches and validates (`client_id` = URL, the MCP profile, size, media type) and
 * stores or refreshes the row. A failed refetch of a stored client is refused, not served stale:
 * a document that disappeared or changed badly ends the client.
 */
import { type CimdOptions, createCimdClientDiscovery } from "@better-auth/cimd";
import type { GenericEndpointContext } from "@better-auth/core";
import {
  type ClientDiscovery,
  type ClientMetadataResourceFetch,
  extendOAuthProvider,
} from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import type { CimdLimits } from "./oauth-registration.ts";
import { hostMatches } from "./redirect-policy.ts";

export interface CimdGuard {
  readonly limits: CimdLimits;
  readonly clientHosts?: readonly string[] | undefined;
  /** Stored document clients (`countCimdClients`). */
  readonly count: () => Promise<number>;
  /** One hit of a fixed-window counter (`StaffStore.hit`); false once `max` is passed. */
  readonly hit: (key: string, windowMs: number, max: number) => Promise<boolean>;
  /** The caller's address from the runtime's trusted header. */
  readonly address: (headers: Headers | undefined) => string;
  readonly now: () => Date;
}

type StoredClient = Parameters<ClientDiscovery["resolve"]>[2];

const unavailable = (status: "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE", description: string) =>
  new APIError(status, { error: "temporarily_unavailable", error_description: description });

function updatedAtOf(client: NonNullable<StoredClient>): number {
  const value = (client as { updatedAt?: Date | string | number | null }).updatedAt;
  return value === null || value === undefined ? Number.NaN : new Date(value).getTime();
}

/** Spends one fetch: the caller's budget, and for a new document its origin's and the total. */
async function spend(guard: CimdGuard, url: URL, stored: boolean, address: string) {
  const { limits } = guard;
  if (!(await guard.hit(`cloudhal:cimd:addr:${address}`, 60_000, limits.perAddressPerMinute)))
    return false;
  if (stored) return true;
  return (
    (await guard.hit(`cloudhal:cimd:origin:${url.origin}`, 60_000, limits.perOriginPerMinute)) &&
    (await guard.hit("cloudhal:cimd:all", 60_000, limits.perMinute))
  );
}

async function guardedResolve(
  inner: ClientDiscovery,
  guard: CimdGuard,
  input: { ctx: GenericEndpointContext; clientId: string; existing: StoredClient },
): Promise<StoredClient> {
  const { ctx, clientId, existing } = input;
  if (!inner.matches(clientId)) return null;
  const url = new URL(clientId);
  const hosts = guard.clientHosts;
  if (hosts && hosts.length > 0 && !hosts.some((p) => hostMatches(url.hostname, p))) {
    if (existing) return null;
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client",
      error_description: "client_id URL is not on this server's list of client hosts",
    });
  }
  const freshMs = guard.limits.freshMinutes * 60_000;
  if (existing && guard.now().getTime() - updatedAtOf(existing) < freshMs) return existing;
  if (!existing && (await guard.count()) >= guard.limits.maxClients)
    throw unavailable(
      "SERVICE_UNAVAILABLE",
      "this server stores no more clients right now; try again later",
    );
  if (!(await spend(guard, url, Boolean(existing), guard.address(ctx.headers)))) {
    if (existing) return existing;
    throw unavailable(
      "TOO_MANY_REQUESTS",
      "too many client metadata fetches; try again in a minute",
    );
  }
  return inner.resolve(ctx, clientId, existing);
}

/**
 * The `cimd()` plugin with Cloudhal's guard (same id, MCP 2026-07-28 profile, the runtime's
 * transport). Each instance keeps the plugin's bounded cache (500 entries).
 */
export function guardedCimd(
  fetch: ClientMetadataResourceFetch,
  guard: CimdGuard,
): BetterAuthPlugin {
  const options: CimdOptions = {
    fetchClientMetadataResource: fetch,
    metadataProfile: "mcp-2026-07-28",
    metadataRevalidationInterval: guard.limits.freshMinutes * 60,
    maxCacheEntries: 500,
  };
  const inner = createCimdClientDiscovery(options);
  const discovery: ClientDiscovery = {
    ...inner,
    resolve: (ctx, clientId, existing) => guardedResolve(inner, guard, { ctx, clientId, existing }),
  };
  return {
    id: "cimd",
    init(ctx) {
      extendOAuthProvider(ctx, { clientDiscovery: discovery });
    },
  } as BetterAuthPlugin;
}

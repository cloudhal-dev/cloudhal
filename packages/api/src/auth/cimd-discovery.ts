/**
 * RFC-0044 §3: Client ID Metadata Documents, with Cloudhal's bounds around `@better-auth/cimd`'s
 * discovery. On its own the plugin would fetch a stored client's document whenever its cache
 * missed (on Workers, every `getClient`: authorize, consent, every token refresh), keep its own
 * per-process fetch windows (on Node, for the life of the process), and store a client row for
 * every new URL. Around the plugin's `resolve`:
 *
 * 1. **Host list.** With `CLOUDHAL_MCP_CLIENT_HOSTS` set, a document host off the list is refused,
 *    stored or not (a stored one resolves to nothing, so it cannot authorize or refresh).
 * 2. **Stored and fresh: no fetch.** A stored client whose row was validated within
 *    `freshMinutes` (the row's `updatedAt`, which the plugin sets on every fetch) is used as it
 *    is, on every runtime. This is the only cache: the plugin's own is off, and its own fetch
 *    windows are set out of reach, so Cloudhal's budgets are the only ones.
 * 3. **The caller's budget first**, for every fetch: past it, that caller gets 429 (stored client
 *    or not), so nobody can make the server serve an outdated row by spending their own budget.
 * 4. **A document not stored yet** also spends its origin's and the installation's budget, and
 *    needs room: at `maxClients` the oldest grantless client not fetched for `evictMinutes` is
 *    evicted, else 503. Hosts on the host list and the well-known clients' document hosts are
 *    exempt from the cap and never evicted.
 * 5. **Refetch.** A stored client older than the window is fetched again and replaced by the
 *    document. If the fetch fails, the failure is recorded on the row (its validation time is
 *    cleared) and the client is refused until a fetch succeeds. Only when the plugin itself
 *    declines to fetch (its rate limit, which Cloudhal sets out of reach) is a stored row served
 *    as it is, and only while it is younger than `maxStaleHours`.
 *
 * The plugin validates (`client_id` = URL, the MCP profile, size, media type) and stores or
 * refreshes the row.
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

/** Document hosts of the well-known clients (RFC-0044 §11): exempt from the cap and eviction. */
export const WELL_KNOWN_DOCUMENT_HOSTS: readonly string[] = [
  "claude.ai",
  "claude.com",
  "chatgpt.com",
  "openai.com",
  "vscode.dev",
  "github.com",
];

export interface CimdGuard {
  readonly limits: CimdLimits;
  readonly clientHosts?: readonly string[] | undefined;
  /** Stored document clients (`countCimdClients`). */
  readonly count: () => Promise<number>;
  /**
   * Deletes the oldest document client with no live connection and no use since `before`,
   * whose host is not in `exempt`; how many went (0 or 1).
   */
  readonly evict: (input: { before: Date; exempt: readonly string[] }) => Promise<number>;
  /** Records a failed refetch on the row (its validation time cleared). */
  readonly markFailed: (clientId: string) => Promise<void>;
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
  const ms = value === null || value === undefined ? Number.NaN : new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Hosts exempt from the cap and from eviction: the host list's and the well-known clients'. */
export function exemptHosts(guard: Pick<CimdGuard, "clientHosts">): string[] {
  return [...WELL_KNOWN_DOCUMENT_HOSTS, ...(guard.clientHosts ?? [])];
}

function isExempt(host: string, exempt: readonly string[]): boolean {
  return exempt.some(
    (p) => hostMatches(host, p) || (!p.startsWith("*.") && hostMatches(host, `*.${p}`)),
  );
}

/** The plugin's own "not now" (its fetch windows): no fetch happened. */
function pluginDeclined(e: unknown): boolean {
  return (
    e instanceof APIError &&
    (e.body as { error?: unknown } | undefined)?.error === "temporarily_unavailable"
  );
}

/** Room for a document not stored yet (`maxClients`), evicting an unused one if needed. */
async function admit(guard: CimdGuard, host: string): Promise<void> {
  const exempt = exemptHosts(guard);
  if (isExempt(host, exempt) || (await guard.count()) < guard.limits.maxClients) return;
  const before = new Date(guard.now().getTime() - guard.limits.evictMinutes * 60_000);
  if ((await guard.evict({ before, exempt })) > 0) return;
  throw unavailable(
    "SERVICE_UNAVAILABLE",
    "this server stores no more clients right now; try again later",
  );
}

/** Exported for the suite's unit cases; the plugin calls it through `guardedCimd`. */
export async function guardedResolve(
  inner: ClientDiscovery,
  guard: CimdGuard,
  input: { ctx: GenericEndpointContext; clientId: string; existing: StoredClient },
): Promise<StoredClient> {
  const { ctx, clientId, existing } = input;
  if (!inner.matches(clientId)) return null;
  const url = new URL(clientId);
  const { limits } = guard;
  const hosts = guard.clientHosts;
  if (hosts && hosts.length > 0 && !hosts.some((p) => hostMatches(url.hostname, p))) {
    if (existing) return null;
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client",
      error_description: "client_id URL is not on this server's list of client hosts",
    });
  }
  const age = existing ? guard.now().getTime() - updatedAtOf(existing) : Number.POSITIVE_INFINITY;
  if (existing && age < limits.freshMinutes * 60_000) return existing;
  const tooMany = () =>
    unavailable("TOO_MANY_REQUESTS", "too many client metadata fetches; try again in a minute");
  const address = guard.address(ctx.headers);
  if (!(await guard.hit(`cloudhal:cimd:addr:${address}`, 60_000, limits.perAddressPerMinute)))
    throw tooMany();
  if (!existing) {
    await admit(guard, url.hostname);
    if (
      !(await guard.hit(`cloudhal:cimd:origin:${url.origin}`, 60_000, limits.perOriginPerMinute)) ||
      !(await guard.hit("cloudhal:cimd:all", 60_000, limits.perMinute))
    )
      throw tooMany();
  }
  try {
    return await inner.resolve(ctx, clientId, existing);
  } catch (e) {
    if (existing && pluginDeclined(e) && age < limits.maxStaleHours * 3_600_000) return existing;
    if (existing && !pluginDeclined(e)) await guard.markFailed(clientId);
    throw e;
  }
}

/** Plugin windows Cloudhal's budgets always reach first (the plugin requires positive integers). */
const OUT_OF_REACH = 1_000_000;

/**
 * The `cimd()` plugin with Cloudhal's guard (same id, MCP 2026-07-28 profile, the runtime's
 * transport).
 */
export function guardedCimd(
  fetch: ClientMetadataResourceFetch,
  guard: CimdGuard,
): BetterAuthPlugin {
  const options: CimdOptions = {
    fetchClientMetadataResource: fetch,
    metadataProfile: "mcp-2026-07-28",
    // The stored row is the cache (step 2): the plugin's own would outlive a changed document.
    metadataRevalidationInterval: 0,
    maxCacheEntries: 500,
    // Cloudhal's budgets in `rate_limits` are the only ones (steps 3 and 4): on Node the
    // plugin's windows would last the life of the process and could be drained anonymously.
    metadataFetchPolicy: {
      minimumFetchInterval: 0,
      maximumConcurrentFetches: OUT_OF_REACH,
      maximumConcurrentFetchesPerOrigin: OUT_OF_REACH,
      maximumFetchesPerMinute: OUT_OF_REACH,
      maximumFetchesPerOriginPerMinute: OUT_OF_REACH,
    },
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

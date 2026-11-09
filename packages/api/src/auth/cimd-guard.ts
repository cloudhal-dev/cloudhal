/**
 * The CIMD guard's wiring (`cimd-discovery.ts`): Cloudhal's `rate_limits` budgets, the cap and
 * its eviction, failure marking on the row, and the caller's trusted address.
 */
import type { StaffStore } from "../staff.ts";
import type { CimdGuard } from "./cimd-discovery.ts";
import { countCimdClients, evictCimdClient, markCimdFetchFailed } from "./oauth-client-rows.ts";
import { cimdLimits } from "./oauth-registration.ts";
import type { AuthOptions } from "./types.ts";

export function cimdGuardFor(
  options: AuthOptions,
  staff: StaffStore,
  runtime: { readonly now: () => Date; readonly ipHeader: string | undefined },
): CimdGuard {
  const registration = options.mcpOauth?.registration;
  return {
    limits: cimdLimits(registration),
    clientHosts: registration?.clientHosts,
    count: () => countCimdClients(options.sql),
    evict: (input) => evictCimdClient(options.sql, input),
    markFailed: (clientId) => markCimdFetchFailed(options.sql, clientId),
    hit: (key, windowMs, max) => staff.hit(key, windowMs, max),
    // The runtime's trusted address (#165); without one, one shared bucket as elsewhere.
    address: (headers) => headers?.get(runtime.ipHeader ?? "cf-connecting-ip") ?? "unknown",
    now: runtime.now,
  };
}

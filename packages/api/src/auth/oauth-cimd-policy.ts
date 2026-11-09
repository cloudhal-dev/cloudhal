/**
 * RFC-0044 §3: the operator's policy before a Client ID Metadata Document is fetched (the
 * plugin's `isMetadataDocumentUrlAllowed`; the transport enforces the network rules).
 *
 * - `CLOUDHAL_MCP_CLIENT_HOSTS`: when set, the document's host must be on it.
 * - A fetch budget across isolates in `rate_limits` (#173): 30 per client origin and 120 in all per
 *   minute. The plugin's own budget lives in one plugin instance, which a Worker rebuilds on every
 *   request, so it cannot bound what anonymous `/authorize` calls make the server fetch.
 */
import { APIError } from "better-auth/api";
import type { StaffStore } from "../staff.ts";
import { CIMD_FETCH_LIMITS } from "./oauth-registration.ts";
import { hostMatches } from "./redirect-policy.ts";

export async function metadataDocumentAllowed(
  staff: StaffStore,
  url: string,
  clientHosts: readonly string[] | undefined,
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    clientHosts &&
    clientHosts.length > 0 &&
    !clientHosts.some((p) => hostMatches(parsed.hostname, p))
  )
    return false;
  const perOrigin = await staff.hit(
    `cloudhal:cimd:origin:${parsed.origin}`,
    60_000,
    CIMD_FETCH_LIMITS.perOriginPerMinute,
  );
  const overall =
    perOrigin && (await staff.hit("cloudhal:cimd:all", 60_000, CIMD_FETCH_LIMITS.perMinute));
  if (!overall)
    throw new APIError("TOO_MANY_REQUESTS", {
      error: "temporarily_unavailable",
      error_description: "too many client metadata fetches; try again in a minute",
    });
  return true;
}

/**
 * What the site Worker enforces, asked over the `SITE` binding (RFC-0008 §7.6–§7.7). An older site
 * Worker ignores time gates and would show embargoed content, so the admin Worker lets nobody
 * write `availability` (REST, MCP, bundle import) until the site Worker answers
 * `GET /__cloudhal/features` with `{ "gates": 1 }` or more (invariant S15).
 */
import { GATES_FEATURE_VERSION, type GateSupport } from "@cloudhal/core-ts/availability";
import type { SiteFetch } from "./purge.ts";

const FEATURES_URL = "https://site.internal/__cloudhal/features";

/** The features the site Worker reports, or `undefined` when it does not answer (older Workers). */
export async function siteFeatures(
  fetch: SiteFetch,
  token: string,
): Promise<{ gates?: number } | undefined> {
  const res = await fetch(FEATURES_URL, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await res.body?.cancel();
    return undefined;
  }
  const body = (await res.json().catch(() => undefined)) as { gates?: unknown } | undefined;
  return typeof body?.gates === "number" ? { gates: body.gates } : {};
}

/**
 * The store's gate capability for one admin Worker isolate. A confirmation is remembered as a
 * plain value (`remember`/`confirmed`, nothing awaited across requests, ADR-0012); a refusal or an
 * error is asked again on the next write that sets gates, so deploying the site Worker is enough.
 */
export function siteGateSupport(options: {
  readonly fetch: SiteFetch | undefined;
  readonly token: string | undefined;
  readonly confirmed: () => boolean;
  readonly remember: () => void;
  readonly log?: (line: string) => void;
}): GateSupport {
  return {
    enforced: async () => {
      if (options.confirmed()) return true;
      if (!options.fetch || !options.token) return false;
      try {
        const features = await siteFeatures(options.fetch, options.token);
        if ((features?.gates ?? 0) < GATES_FEATURE_VERSION) {
          options.log?.("site Worker does not enforce time gates yet: availability is refused");
          return false;
        }
        options.remember();
        return true;
      } catch (e) {
        options.log?.(`features check failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
  };
}

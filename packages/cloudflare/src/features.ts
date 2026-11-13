/**
 * What the site Worker enforces, asked over the `SITE` binding (RFC-0008 §7.6–§7.7). An older site
 * Worker ignores time gates and would show embargoed content, so the admin Worker lets nobody
 * write `availability` (REST, MCP, bundle import) until the site Worker answers
 * `GET /__cloudhal/features` with `{ "gates": 1 }` or more (invariant S15), nor a collection's
 * `expiry` until it answers `{ "gates": 2 }` (derived gates, RFC-0042 §3.6).
 */
import { AVAILABILITY_GATES_VERSION, type GateSupport } from "@cloudhal/core-ts/availability";
import { FIELDS_FEATURE_VERSION, type FieldTypeSupport } from "@cloudhal/core-ts/fields";
import type { SiteFetch } from "./purge.ts";

const FEATURES_URL = "https://site.internal/__cloudhal/features";

/** The features the site Worker reports, or `undefined` when it does not answer (older Workers). */
export async function siteFeatures(
  fetch: SiteFetch,
  token: string,
): Promise<{ gates?: number; fields?: number } | undefined> {
  const res = await fetch(FEATURES_URL, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await res.body?.cancel();
    return undefined;
  }
  const body = (await res.json().catch(() => undefined)) as
    | { gates?: unknown; fields?: unknown }
    | undefined;
  return {
    ...(typeof body?.gates === "number" ? { gates: body.gates } : {}),
    ...(typeof body?.fields === "number" ? { fields: body.fields } : {}),
  };
}

/**
 * The store's gate capability for one admin Worker isolate. A confirmation is remembered as a
 * plain value (`remember`/`confirmed`, nothing awaited across requests, ADR-0012): the gates
 * version the site Worker reported (`true` reads as 1, what Workers before RFC-0042 answered). A
 * refusal or an error is asked again on the next write that needs gates, so deploying the site
 * Worker is enough.
 */
export function siteGateSupport(options: {
  readonly fetch: SiteFetch | undefined;
  readonly token: string | undefined;
  readonly confirmed: () => boolean | number;
  readonly remember: (version: number) => void;
  readonly log?: (line: string) => void;
}): GateSupport {
  const known = () => {
    const c = options.confirmed();
    return c === true ? AVAILABILITY_GATES_VERSION : c === false ? 0 : c;
  };
  return {
    enforced: async (_siteId, version = AVAILABILITY_GATES_VERSION) => {
      if (known() >= version) return true;
      if (!options.fetch || !options.token) return false;
      try {
        const gates = (await siteFeatures(options.fetch, options.token))?.gates ?? 0;
        if (gates > known() && gates >= AVAILABILITY_GATES_VERSION) options.remember(gates);
        if (gates < version) {
          options.log?.(
            version > AVAILABILITY_GATES_VERSION
              ? "site Worker does not enforce derived gates yet: collection expiry is refused"
              : "site Worker does not enforce time gates yet: availability is refused",
          );
          return false;
        }
        return true;
      } catch (e) {
        options.log?.(`features check failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
  };
}

/**
 * RFC-0045 §1: the store's reference and repeater capability for one admin Worker isolate, the
 * twin of `siteGateSupport`: yes once the site Worker answers `{ "fields": 2 }` or more (kept as
 * a plain value); a refusal or an error is asked again. Built in rollout step 2; the admin Worker's
 * store takes it from rollout step 7 (`siteSupport`), so a site Worker older than step 3 keeps the
 * types refused.
 */
export function siteFieldTypeSupport(options: {
  readonly fetch: SiteFetch | undefined;
  readonly token: string | undefined;
  readonly confirmed: () => boolean;
  readonly remember: () => void;
  readonly log?: (line: string) => void;
}): FieldTypeSupport {
  return {
    supported: async () => {
      if (options.confirmed()) return true;
      if (!options.fetch || !options.token) return false;
      try {
        const fields = (await siteFeatures(options.fetch, options.token))?.fields ?? 0;
        if (fields < FIELDS_FEATURE_VERSION) {
          options.log?.("site Worker does not read reference and repeater fields yet");
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

/** What one admin Worker isolate has confirmed so far (plain values, nothing awaited, ADR-0012). */
export interface SiteConfirmations {
  /** The gates version the site Worker reported; 0: none yet. */
  gates: number;
  /** The site Worker reported `fields: 2` or more (RFC-0045). */
  fields: boolean;
}

/**
 * The store's capabilities for one request, both asked of the site Worker over `fetch` and
 * remembered in `confirmed`: time gates (S15) and reference and repeater fields (RFC-0045 §1).
 */
export function siteSupport(options: {
  readonly fetch: SiteFetch | undefined;
  readonly token: string | undefined;
  readonly confirmed: SiteConfirmations;
  readonly log?: (line: string) => void;
}): { gates: GateSupport; fieldTypes: FieldTypeSupport } {
  const { fetch, token, confirmed, log } = options;
  const common = { fetch, token, ...(log ? { log } : {}) };
  return {
    gates: siteGateSupport({
      ...common,
      confirmed: () => confirmed.gates,
      remember: (version) => {
        confirmed.gates = version;
      },
    }),
    fieldTypes: siteFieldTypeSupport({
      ...common,
      confirmed: () => confirmed.fields,
      remember: () => {
        confirmed.fields = true;
      },
    }),
  };
}

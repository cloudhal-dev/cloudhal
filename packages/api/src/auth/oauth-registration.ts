/**
 * RFC-0044 §3 (Phase 3): how OAuth clients that were not created by the server get a
 * `client_id`, and the operator's switches for it (§10: Worker vars, or the environment on Node).
 *
 * - **CIMD** (`CLOUDHAL_MCP_CIMD`, on unless `off`): a client names an HTTPS URL as its
 *   `client_id`; the server fetches the document there through the runtime's SSRF-safe transport
 *   (`cimd-fetch.ts`), at most hourly per client (`cimd-discovery.ts`), with a cap and pruning.
 * - **DCR** (`CLOUDHAL_MCP_DCR`, on unless `off`): RFC 7591 `POST /api/auth/oauth2/register`,
 *   public clients only, with rate limits, a cap and pruning (`dcr.ts`, `oauth-client-rows.ts`).
 *   Off, the clients it registered earlier cannot start a new authorization either.
 * - `CLOUDHAL_MCP_CLIENT_HOSTS` limits the hosts documents come from and every redirect goes to;
 *   `CLOUDHAL_MCP_REDIRECT_SCHEMES` adds private-use redirect schemes (`redirect-policy.ts`).
 *
 * With both off, no client registered by either path can start an authorization.
 */
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { schemeProblem } from "./redirect-policy.ts";

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

export interface CimdLimits {
  /** Metadata fetches per caller address per minute, whoever the client is. */
  readonly perAddressPerMinute: number;
  /** Fetches of documents not stored yet, per client origin and in all, per minute. */
  readonly perOriginPerMinute: number;
  readonly perMinute: number;
  /** Clients from metadata documents that may be stored at once (beyond it 503). */
  readonly maxClients: number;
  /** A stored document younger than this is used without fetching it again (minutes). */
  readonly freshMinutes: number;
  /** A document client with no connection and no fetch for this many days is deleted. */
  readonly unusedDays: number;
}

/**
 * Outbound metadata fetches and stored document clients, counted across every isolate in
 * Cloudhal's `rate_limits` (the plugin's own budget lives in one instance, which a Worker rebuilds
 * on every request). A stored client is fetched at most once per `freshMinutes`; only documents
 * not stored yet spend the shared per-origin budget, so anonymous callers cannot starve the
 * clients members already use. The next authorization recreates a pruned client from its
 * document, so unused rows go after a day.
 */
export const CIMD_LIMITS: CimdLimits = {
  perAddressPerMinute: 20,
  perOriginPerMinute: 30,
  perMinute: 120,
  maxClients: 5_000,
  freshMinutes: 60,
  unusedDays: 1,
};

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
  /**
   * `CLOUDHAL_MCP_REDIRECT_SCHEMES`: private-use redirect schemes allowed besides the built-in
   * ones (`cursor`, `vscode`) and reverse-domain schemes (`redirect-policy.ts`).
   */
  readonly redirectSchemes?: readonly string[] | undefined;
  /** Overrides of `DCR_LIMITS` (tests). */
  readonly limits?: Partial<DcrLimits> | undefined;
  /** Overrides of `CIMD_LIMITS` (tests). */
  readonly cimdLimits?: Partial<CimdLimits> | undefined;
}

/** The variables both runtimes read (RFC-0044 §10). */
export interface OauthRegistrationEnv {
  readonly CLOUDHAL_MCP_CIMD?: string | undefined;
  readonly CLOUDHAL_MCP_DCR?: string | undefined;
  readonly CLOUDHAL_MCP_CLIENT_HOSTS?: string | undefined;
  readonly CLOUDHAL_MCP_REDIRECT_SCHEMES?: string | undefined;
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

/** `CLOUDHAL_MCP_REDIRECT_SCHEMES` as a list; throws on an entry `isPrivateUseScheme` refuses. */
export function parseRedirectSchemes(value: string | undefined): string[] {
  const schemes = (value ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const scheme of schemes)
    if (schemeProblem(scheme))
      throw new Error(`CLOUDHAL_MCP_REDIRECT_SCHEMES: "${scheme}" cannot be a redirect scheme`);
  return schemes;
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
  let redirectSchemes: string[];
  try {
    clientHosts = parseClientHosts(env.CLOUDHAL_MCP_CLIENT_HOSTS);
    redirectSchemes = parseRedirectSchemes(env.CLOUDHAL_MCP_REDIRECT_SCHEMES);
  } catch (e) {
    return { dcr: false, problem: e instanceof Error ? e.message : String(e) };
  }
  return {
    ...(off(env.CLOUDHAL_MCP_CIMD) ? {} : { cimd }),
    dcr: !off(env.CLOUDHAL_MCP_DCR),
    ...(clientHosts.length > 0 ? { clientHosts } : {}),
    ...(redirectSchemes.length > 0 ? { redirectSchemes } : {}),
  };
}

export function dcrLimits(registration: OauthRegistration | undefined): DcrLimits {
  return { ...DCR_LIMITS, ...registration?.limits };
}

export function cimdLimits(registration: OauthRegistration | undefined): CimdLimits {
  return { ...CIMD_LIMITS, ...registration?.cimdLimits };
}

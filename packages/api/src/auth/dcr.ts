/**
 * RFC-0044 §3: dynamic client registration (RFC 7591), the limited fallback for clients without a
 * Client ID Metadata Document (Cursor). The endpoint is anonymous, so Cloudhal checks everything
 * before the provider sees the request, then registers the client server-side with a clean body
 * (no cookie, no `Authorization`, so never as a member and never with an initial access token):
 *
 * 1. rate limits in `rate_limits` (#173): 10 per client address per hour and 300 per installation
 *    per day, counted for every attempt, valid or not;
 * 2. at most 5,000 registered clients (503 beyond it), pruned after 30 unused days;
 * 3. the metadata: `client_name` 1–100 characters; `redirect_uris` 1–10, each https or loopback
 *    http (and on `CLOUDHAL_MCP_CLIENT_HOSTS` when set); public clients only
 *    (`token_endpoint_auth_method` `none`, also when absent: no secret is ever minted);
 *    `grant_types` ⊆ {`authorization_code`, `refresh_token`} with `authorization_code`;
 *    `response_types` = [`code`]. Only these fields, `application_type` and `scope` reach the
 *    provider: logos, URIs, contacts, JWKS and software statements are dropped, never stored.
 *
 * Errors are RFC 7591 §3.2.2 bodies (`invalid_client_metadata`, `invalid_redirect_uri`).
 */

import type { SqlDriver } from "@cloudhal/storage";
import type { StaffStore } from "../staff.ts";
import { countDcrClients, type DcrLimits } from "./oauth-registration.ts";
import { redirectUrisProblem } from "./redirect-policy.ts";

/** RFC-0044 §3: "Body ≤ 5 KB". */
export const DCR_MAX_BODY_BYTES = 5 * 1024;
const NAME_MAX = 100;
const GRANTS: ReadonlySet<string> = new Set(["authorization_code", "refresh_token"]);

/** A refusal with its HTTP status and RFC 7591 / RFC 6749 error body. */
export class RegistrationError extends Error {
  override readonly name = "RegistrationError";
  readonly status: 400 | 413 | 429 | 503;
  readonly error: string;
  constructor(status: RegistrationError["status"], error: string, description: string) {
    super(description);
    this.status = status;
    this.error = error;
  }
  body(): { error: string; error_description: string } {
    return { error: this.error, error_description: this.message };
  }
}

const invalid = (description: string) =>
  new RegistrationError(400, "invalid_client_metadata", description);

/** The body the provider registers: the checked fields only. */
export function registrationBody(
  raw: unknown,
  clientHosts: readonly string[] | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw invalid("the body must be a JSON object");
  const m = raw as Record<string, unknown>;
  const name = typeof m.client_name === "string" ? m.client_name.trim() : "";
  if (name.length === 0 || name.length > NAME_MAX)
    throw invalid(`client_name is required (1–${NAME_MAX} characters)`);
  const redirect = redirectUrisProblem(m.redirect_uris, clientHosts);
  if (redirect) throw new RegistrationError(400, "invalid_redirect_uri", redirect);
  const auth = m.token_endpoint_auth_method ?? "none";
  if (auth !== "none")
    throw invalid("only public clients may register here (token_endpoint_auth_method none)");
  const grants = m.grant_types === undefined ? ["authorization_code"] : m.grant_types;
  if (!Array.isArray(grants) || !grants.every((g) => typeof g === "string"))
    throw invalid("grant_types must be a list of strings");
  // Clients send one grant union to every server: keep what this server issues.
  const kept = [...new Set(grants.filter((g) => GRANTS.has(g)))];
  if (!kept.includes("authorization_code"))
    throw invalid("grant_types must include authorization_code");
  if (
    m.response_types !== undefined &&
    !(
      Array.isArray(m.response_types) &&
      m.response_types.length === 1 &&
      m.response_types[0] === "code"
    )
  )
    throw invalid('response_types must be ["code"]');
  if (
    m.application_type !== undefined &&
    m.application_type !== "web" &&
    m.application_type !== "native"
  )
    throw invalid("application_type must be web or native");
  if (m.scope !== undefined && (typeof m.scope !== "string" || m.scope.length > 1000))
    throw invalid("scope must be a space-separated string");
  return {
    client_name: name,
    redirect_uris: [...(m.redirect_uris as string[])],
    token_endpoint_auth_method: "none",
    grant_types: kept,
    response_types: ["code"],
    ...(m.application_type !== undefined ? { application_type: m.application_type } : {}),
    ...(typeof m.scope === "string" && m.scope.trim() ? { scope: m.scope.trim() } : {}),
  };
}

export interface DcrDeps {
  readonly sql: SqlDriver;
  readonly staff: StaffStore;
  readonly limits: DcrLimits;
  readonly clientHosts?: readonly string[] | undefined;
  /** The provider's server-side `registerOAuthClient` (no HTTP, no session). */
  readonly register: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/** Registers one public client for an anonymous caller at `address`; RFC 7591's response body. */
export async function registerDcrClient(
  d: DcrDeps,
  input: { readonly text: string; readonly address: string },
): Promise<Record<string, unknown>> {
  const { limits } = d;
  if (
    !(await d.staff.hit(`cloudhal:dcr:addr:${input.address}`, 3_600_000, limits.perAddressPerHour))
  )
    throw new RegistrationError(429, "rate_limited", "too many registrations; try again later");
  if (!(await d.staff.hit("cloudhal:dcr:day", 86_400_000, limits.perDay)))
    throw new RegistrationError(
      429,
      "rate_limited",
      "this server takes no more registrations today; try again tomorrow",
    );
  if (new TextEncoder().encode(input.text).byteLength > DCR_MAX_BODY_BYTES)
    throw new RegistrationError(413, "invalid_client_metadata", "the metadata is larger than 5 KB");
  let raw: unknown;
  try {
    raw = JSON.parse(input.text);
  } catch {
    throw invalid("the body must be JSON");
  }
  const body = registrationBody(raw, d.clientHosts);
  if ((await countDcrClients(d.sql)) >= limits.maxClients)
    throw new RegistrationError(
      503,
      "temporarily_unavailable",
      "this server has too many registered clients; try again later",
    );
  return d.register(body);
}

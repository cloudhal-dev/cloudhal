/**
 * RFC-0044 §4: consent is Cloudhal's. Studio's screen posts here; the requested scopes are
 * narrowed by the member's **installation** role (`narrow(requested, roleScopes(role))`, so a site
 * role can only narrow further, which #173's step-up cap relies on), the mode is capped like a
 * key's, the provider's consent endpoint is called with the scopes the member kept, and the
 * `agent_grants` row, `agent_owner` and the audit row are written in one batch.
 */

import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import {
  type AgentMode,
  type AuditEntry,
  AuditLog,
  clampMode,
  isKeyScope,
  modeCap,
  modesFor,
  narrow,
  REMOTE_AGENT_MODES,
  type Role,
  roleScopes,
  type Scope,
} from "@cloudhal/agent-runtime";
import {
  type ClientKind,
  clientKind,
  displayName,
  documentHost,
  lookalikeOf,
} from "./client-identity.ts";
import type { AuthDeps } from "./deps.ts";
import { type AgentGrant, agentIdForGrant } from "./grants.ts";
import { SERVER_KEY_HEADER } from "./instance.ts";
import { OFFLINE_ACCESS } from "./oauth.ts";
import { AuthError } from "./types.ts";

/** One requested scope and what the member's role turns it into (`null`: not in the role). */
export interface ConsentScope {
  readonly requested: Scope;
  readonly granted: Scope | null;
}

export interface ConsentInfo {
  readonly client: {
    readonly id: string;
    /** The self-asserted name, made safe to show (`displayName`: plain, at most 100). */
    readonly name: string;
    /** How the server knows the client (`client-identity.ts`). */
    readonly kind: ClientKind;
    /** The `client_id` host of a metadata-document client (`claude.ai`), else absent. */
    readonly host?: string | undefined;
    /** The well-known client the name looks like, when this is not that client (`Claude`). */
    readonly lookalike?: string | undefined;
  };
  /**
   * Where the browser is sent back: its host, and whether it is this computer (loopback); for a
   * native app's private-use scheme, `app` (the scheme) and no host.
   */
  readonly redirect: {
    readonly host: string;
    readonly loopback: boolean;
    readonly app?: string | undefined;
  };
  /** Every registered redirect URI is loopback (the spec's extra warning). */
  readonly loopbackOnly: boolean;
  readonly scopes: readonly ConsentScope[];
  /** The client asked for a refresh token (`offline_access`). */
  readonly offlineAccess: boolean;
  readonly modes: readonly AgentMode[];
  readonly defaultMode: AgentMode;
  /** The member's live grant for this client: a step-up shows its scopes pre-checked. */
  readonly existing?: { readonly scopes: readonly Scope[]; readonly mode: AgentMode } | undefined;
  /** RFC-0034 A2: the sites a site-limited member's agent will reach. */
  readonly sites?: readonly string[] | undefined;
}

interface ClientRow {
  clientId: string;
  name?: string | null;
  clientDiscoveryId?: string | null;
  userId?: string | null;
  referenceId?: string | null;
  redirectUris?: string[] | string | null;
  disabled?: boolean | null;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostOf(uri: string): { host: string; loopback: boolean; app?: string } | undefined {
  try {
    const url = new URL(uri);
    // A private-use scheme opens an app on this computer: its "host" is the app's to read.
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return { host: "", loopback: true, app: url.protocol.slice(0, -1) };
    return { host: url.host, loopback: LOOPBACK.has(url.hostname) };
  } catch {
    return undefined;
  }
}

function listOf(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return value.split(",").filter(Boolean);
  }
}

/** The requested key scopes, each with what the role gives (inv. 1; person-only never appears). */
export function consentScopes(requested: readonly string[], role: Role): ConsentScope[] {
  const held = roleScopes(role);
  return requested
    .filter((s): s is Scope => isKeyScope(s))
    .map((s) => ({ requested: s, granted: narrow([s], held)[0] ?? null }));
}

/** The signed authorization request the provider sent the browser to the consent page with. */
async function signedRequest(d: AuthDeps, oauthQuery: string) {
  if (oauthQuery.length > 8192 || !(await verifyOAuthQueryParams(oauthQuery, d.secret)))
    throw new AuthError("this authorization request is invalid or expired; start again", {
      code: "invalid_request",
    });
  const query = new URLSearchParams(oauthQuery);
  const clientId = query.get("client_id") ?? "";
  const client = clientId
    ? await (await d.context()).adapter.findOne<ClientRow>({
        model: "oauthClient",
        where: [{ field: "clientId", value: clientId }],
      })
    : null;
  if (!client || client.disabled)
    throw new AuthError("unknown client", { status: 404, code: "not_found" });
  const requested = (query.get("scope") ?? "").split(" ").filter(Boolean);
  return { query, client, requested };
}

/** What Studio's consent screen shows (§4). */
export async function consentInfo(
  d: AuthDeps,
  headers: Headers,
  oauthQuery: string,
): Promise<ConsentInfo> {
  const who = await d.caller(headers, "sign in to connect an agent");
  const { query, client, requested } = await signedRequest(d, oauthQuery);
  const redirect = hostOf(query.get("redirect_uri") ?? "") ?? { host: "", loopback: false };
  const registered = listOf(client.redirectUris);
  const existing = await d.grants.live(who.userId, client.clientId);
  const cap = modeCap(who.member.role);
  const host = documentHost(client);
  const kind = clientKind(client);
  const name = displayName(client.name, client.clientId);
  const lookalike = lookalikeOf(name, client);
  const sites = who.member.sites ? Object.keys(who.member.sites) : undefined;
  return {
    client: {
      id: client.clientId,
      name,
      kind,
      ...(host ? { host } : {}),
      ...(lookalike ? { lookalike } : {}),
    },
    redirect,
    loopbackOnly: registered.length > 0 && registered.every((u) => hostOf(u)?.loopback),
    scopes: consentScopes(requested, who.member.role),
    offlineAccess: requested.includes(OFFLINE_ACCESS),
    modes: modesFor(who.member.role),
    defaultMode: clampMode(existing?.mode ?? "edits", cap),
    ...(existing ? { existing: { scopes: existing.scopes, mode: existing.mode } } : {}),
    ...(sites ? { sites } : {}),
  };
}

/** Forwards the decision to the provider; the URL the browser goes to next. */
async function forward(
  d: AuthDeps,
  headers: Headers,
  body: Record<string, unknown>,
): Promise<string> {
  const origin = new URL(d.endpoints?.issuer ?? "http://invalid").origin;
  const address = d.addressHeader ? headers.get(d.addressHeader) : null;
  const response = await d.instance.handler(
    new Request(`${d.endpoints?.issuer}/oauth2/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin,
        cookie: headers.get("cookie") ?? "",
        [SERVER_KEY_HEADER]: d.internal.serverKey,
        ...(d.addressHeader && address ? { [d.addressHeader]: address } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const answer = (await response.json().catch(() => ({}))) as { url?: unknown; message?: unknown };
  if (!response.ok || typeof answer.url !== "string")
    throw new AuthError(
      typeof answer.message === "string" ? answer.message : "the authorization server refused",
      { code: "consent_failed" },
    );
  return answer.url;
}

export interface ConsentInput {
  headers: Headers;
  oauthQuery: string;
  accept: boolean;
  /** The requested scopes the member left ticked. */
  scopes: readonly string[];
  mode: AgentMode;
  /** The audit row (`connect_agent`), written in the grant's batch. */
  audit: (grant: { agentId: string; scopes: readonly Scope[] }) => AuditEntry;
}

/**
 * The member's decision: scopes narrowed by the installation role, the mode capped, the
 * provider's consent, then the grant, `agent_owner` and the audit row in one batch.
 */
export async function giveConsent(
  d: AuthDeps,
  input: ConsentInput,
): Promise<{ redirect: string; grant?: AgentGrant }> {
  if (!d.endpoints) throw new AuthError("OAuth is off", { status: 404, code: "not_found" });
  const who = await d.caller(input.headers, "sign in to connect an agent");
  const { client, requested } = await signedRequest(d, input.oauthQuery);
  if (!input.accept)
    return {
      redirect: await forward(d, input.headers, { accept: false, oauth_query: input.oauthQuery }),
    };
  const role = who.member.role;
  const kept = consentScopes(requested, role).filter(
    (s) => s.granted !== null && input.scopes.includes(s.requested),
  );
  const effective = narrow(
    kept.map((s) => s.requested),
    roleScopes(role),
  );
  if (effective.length === 0)
    throw new AuthError("choose at least one permission your role holds", {
      code: "no_scope",
    });
  if (!REMOTE_AGENT_MODES.includes(input.mode))
    throw new AuthError("unknown mode", { code: "bad_request" });
  d.capProblem(role, input.mode);
  // The provider records the requested scopes the member kept (its consent must be a subset of
  // the request); the token carries them, and the grant caps them on every call.
  const providerScopes = [
    ...kept.map((s) => s.requested),
    ...(requested.includes(OFFLINE_ACCESS) ? [OFFLINE_ACCESS] : []),
  ];
  const now = d.now().toISOString();
  // The grant first: the provider's consent resumes its authorize step, and Cloudhal's check of
  // that step (`oauth-hooks.ts`, reading the request's query) forgets a stored consent the live
  // grant does not cover, and the code exchange accepts only codes newer than the live grant. One batch: the
  // grant, the person behind the agent actor (RFC-0005 §4, as `recordAgent` does for a key) and
  // the audit row. If the provider call then fails: a new grant has no token yet; on a step-up of
  // a live grant, the scopes and mode the member approved already apply to the connection's
  // existing tokens, which their own `scope` claims still cap (no scope they were not issued).
  const grant = await d.grants.consent(
    {
      userId: who.userId,
      clientId: client.clientId,
      clientName: displayName(client.name, client.clientId),
      scopes: effective,
      mode: input.mode,
    },
    (grantId) => {
      const agentId = agentIdForGrant(grantId);
      return [
        {
          sql: "INSERT INTO agent_owner (agent_id, user_id, key_id, created_at) VALUES (?, ?, NULL, ?) ON CONFLICT (agent_id) DO NOTHING",
          params: [agentId, who.userId, now],
        },
        AuditLog.statement(input.audit({ agentId, scopes: effective })),
      ];
    },
  );
  const redirect = await forward(d, input.headers, {
    accept: true,
    scope: providerScopes.join(" "),
    oauth_query: input.oauthQuery,
  });
  return { redirect, grant };
}

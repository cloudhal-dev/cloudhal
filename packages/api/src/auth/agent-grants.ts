/**
 * RFC-0044 §4: the connections of OAuth MCP clients as Studio lists them, and their revocation.
 * Consent itself is `agent-consent.ts`.
 */
import {
  type AgentMode,
  type AuditEntry,
  AuditLog,
  clampMode,
  modeCap,
  narrow,
  type Role,
  roleScopes,
  type Scope,
} from "@cloudhal/agent-runtime";
import { consentInfo, giveConsent } from "./agent-consent.ts";
import {
  type ClientKind,
  clientKind,
  displayName,
  documentHost,
  lookalikeOf,
} from "./client-identity.ts";
import type { AuthDeps } from "./deps.ts";
import { type AgentGrant, agentIdForGrant, providerRevocation } from "./grants.ts";
import { actorIdForUser, roleScopesHold } from "./key-rows.ts";
import { AuthError } from "./types.ts";

export type { ConsentInfo, ConsentInput, ConsentScope } from "./agent-consent.ts";
export { consentScopes } from "./agent-consent.ts";

export interface AgentGrantSummary {
  readonly id: string;
  readonly agentId: string;
  readonly clientId: string;
  /** Self-asserted, made safe to show (`displayName`: plain, at most 100). */
  readonly clientName: string;
  /**
   * How the server knows the client, as the consent screen showed it (`client-identity.ts`): a
   * document client's host, a self-registered one's look-alike warning.
   */
  readonly client: {
    readonly kind: ClientKind;
    readonly host?: string | undefined;
    readonly lookalike?: string | undefined;
  };
  readonly scopes: readonly Scope[];
  /** What a call can use now: the grant narrowed to the owner's current role. */
  readonly effectiveScopes: readonly Scope[];
  readonly mode: AgentMode;
  readonly effectiveMode: AgentMode;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  /** With `all`: whose connection it is. */
  readonly owner?:
    | { readonly userId: string; readonly name: string | null; readonly role: Role | null }
    | undefined;
}

/** The provider's client rows of the listed grants, by `clientId` (chunks within D1's limits). */
async function clientRows(d: AuthDeps, ids: readonly string[]): Promise<Map<string, ClientRow>> {
  const out = new Map<string, ClientRow>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90);
    const rows = await d.sql.all<ClientRow & Record<string, unknown>>(
      `SELECT "clientId", "clientDiscoveryId", "userId", "referenceId" FROM "oauthClient" WHERE "clientId" IN (${chunk.map(() => "?").join(", ")})`,
      chunk,
    );
    for (const r of rows) out.set(r.clientId, r);
  }
  return out;
}

type ClientRow = {
  clientId: string;
  clientDiscoveryId?: string | null;
  userId?: string | null;
  referenceId?: string | null;
};

/** A grant's client as the consent screen named it; a missing row reads by its id's shape. */
function identityOf(
  grant: AgentGrant,
  row: ClientRow | undefined,
): AgentGrantSummary["client"] & {
  name: string;
} {
  const client: ClientRow = row ?? {
    clientId: grant.clientId,
    clientDiscoveryId: grant.clientId.startsWith("https://") ? "cimd" : null,
  };
  const name = displayName(grant.clientName, grant.clientId);
  const host = documentHost(client);
  const lookalike = lookalikeOf(name, client);
  return {
    name,
    kind: clientKind(client),
    ...(host ? { host } : {}),
    ...(lookalike ? { lookalike } : {}),
  };
}

export function createAgentGrantService(d: AuthDeps) {
  const summary = (
    grant: AgentGrant,
    role: Role | undefined,
    row: ClientRow | undefined,
  ): AgentGrantSummary => {
    const { name, ...client } = identityOf(grant, row);
    return {
      id: grant.id,
      agentId: agentIdForGrant(grant.id),
      clientId: grant.clientId,
      clientName: name,
      client,
      scopes: grant.scopes,
      effectiveScopes: role ? narrow(grant.scopes, roleScopes(role)) : [],
      mode: grant.mode,
      effectiveMode: role ? clampMode(grant.mode, modeCap(role)) : grant.mode,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    };
  };

  const list = async (headers: Headers, all: boolean): Promise<AgentGrantSummary[]> => {
    const who = await d.caller(headers, "sign in to see connected agents");
    const manage = all && roleScopesHold(who.member.role, "agents:manage");
    if (!manage) {
      const own = await d.grants.listOf(who.userId);
      const rows = await clientRows(
        d,
        own.map((g) => g.clientId),
      );
      return own.map((g) => summary(g, who.member.role, rows.get(g.clientId)));
    }
    const grants = await d.grants.listAll();
    const rows = await clientRows(
      d,
      grants.map((g) => g.clientId),
    );
    const out: AgentGrantSummary[] = [];
    // One membership read per owner, not per connection.
    const owners = new Map<string, Awaited<ReturnType<typeof d.staffStore.member>>>();
    for (const g of grants) {
      if (!owners.has(g.userId)) owners.set(g.userId, await d.staffStore.member(g.userId));
      const owner = owners.get(g.userId);
      out.push({
        ...summary(g, owner?.role, rows.get(g.clientId)),
        owner: { userId: g.userId, name: owner?.name ?? null, role: owner?.role ?? null },
      });
    }
    return out;
  };

  /** Ends a connection: the grant row, the provider's consent and refresh tokens, at once. */
  const revoke = async (input: {
    headers: Headers;
    id: string;
    audit: (grant: AgentGrant) => AuditEntry;
  }): Promise<AgentGrant> => {
    const who = await d.caller(input.headers, "sign in to disconnect an agent");
    const grant = await d.grants.byId(input.id);
    const mine = grant?.userId === who.userId;
    const manage = roleScopesHold(who.member.role, "agents:manage");
    // Someone else's connection is invisible without agents:manage (no existence oracle).
    if (!grant || grant.revokedAt || (!mine && !manage))
      throw new AuthError("unknown connection", { status: 404, code: "not_found" });
    // One batch: the grant, the provider's consent and refresh tokens, the audit row.
    await d.grants.revoke(grant.id, [
      ...providerRevocation(grant.userId, grant.clientId, d.now().toISOString()),
      AuditLog.statement(input.audit(grant)),
    ]);
    return grant;
  };

  return {
    info: (headers: Headers, oauthQuery: string) => consentInfo(d, headers, oauthQuery),
    consent: (input: Parameters<typeof giveConsent>[1]) => giveConsent(d, input),
    list,
    revoke,
  };
}

export type AgentGrantService = ReturnType<typeof createAgentGrantService>;

/** The person-classed actor of a consent or revoke (RFC-0044 Security: approval points). */
export const personActor = (userId: string, name: string | null) => ({
  kind: "human" as const,
  id: actorIdForUser(userId),
  ...(name ? { name } : {}),
});

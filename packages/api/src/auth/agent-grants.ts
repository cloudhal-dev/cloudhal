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
import type { AuthDeps } from "./deps.ts";
import { type AgentGrant, agentIdForGrant } from "./grants.ts";
import { actorIdForUser, roleScopesHold } from "./key-rows.ts";
import { AuthError } from "./types.ts";

export type { ConsentInfo, ConsentInput, ConsentScope } from "./agent-consent.ts";
export { consentScopes } from "./agent-consent.ts";

export interface AgentGrantSummary {
  readonly id: string;
  readonly agentId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly Scope[];
  /** What a call can use now: the grant narrowed to the owner's current role. */
  readonly effectiveScopes: readonly Scope[];
  readonly mode: AgentMode;
  readonly effectiveMode: AgentMode;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  /** With `all`: whose connection it is. */
  readonly owner?: { readonly userId: string; readonly name: string | null } | undefined;
}

export function createAgentGrantService(d: AuthDeps) {
  const summary = (grant: AgentGrant, role: Role | undefined): AgentGrantSummary => ({
    id: grant.id,
    agentId: agentIdForGrant(grant.id),
    clientId: grant.clientId,
    clientName: grant.clientName,
    scopes: grant.scopes,
    effectiveScopes: role ? narrow(grant.scopes, roleScopes(role)) : [],
    mode: grant.mode,
    effectiveMode: role ? clampMode(grant.mode, modeCap(role)) : grant.mode,
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
  });

  const list = async (headers: Headers, all: boolean): Promise<AgentGrantSummary[]> => {
    const who = await d.caller(headers, "sign in to see connected agents");
    const manage = all && roleScopesHold(who.member.role, "agents:manage");
    if (!manage) return (await d.grants.listOf(who.userId)).map((g) => summary(g, who.member.role));
    const grants = await d.grants.listAll();
    const out: AgentGrantSummary[] = [];
    // One membership read per owner, not per connection.
    const owners = new Map<string, Awaited<ReturnType<typeof d.staffStore.member>>>();
    for (const g of grants) {
      if (!owners.has(g.userId)) owners.set(g.userId, await d.staffStore.member(g.userId));
      const owner = owners.get(g.userId);
      out.push({
        ...summary(g, owner?.role),
        owner: { userId: g.userId, name: owner?.name ?? null },
      });
    }
    return out;
  };

  /** Ends a connection: the grant row first (authoritative), then the provider's consent and tokens. */
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
    const audit = AuditLog.statement(input.audit(grant));
    await d.grants.revoke(grant.id, [audit]);
    await d.revokeProviderGrant(grant.userId, grant.clientId);
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

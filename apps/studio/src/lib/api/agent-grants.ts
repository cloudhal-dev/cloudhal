/**
 * RFC-0044 §4: OAuth connections of remote MCP clients (`/api/agent-grants`) and the consent
 * screen's API. Consent is given here, never at the provider's own endpoint: the server narrows
 * the scopes by the member's role, caps the mode and records the grant.
 */
import type { AgentScope, KeyMode } from "./agents.ts";
import { json, listOf, request } from "./http.ts";

/** One requested scope and what the member's role turns it into (`null`: not in the role). */
export interface ConsentScope {
  requested: AgentScope;
  granted: AgentScope | null;
}

/** What the consent screen shows (`GET /api/agent-grants/consent`). */
export interface ConsentInfo {
  client: { id: string; name: string; host?: string };
  redirect: { host: string; loopback: boolean };
  loopbackOnly: boolean;
  scopes: ConsentScope[];
  offlineAccess: boolean;
  modes: KeyMode[];
  defaultMode: KeyMode;
  existing?: { scopes: AgentScope[]; mode: KeyMode };
  sites?: string[];
}

export interface AgentGrantSummary {
  id: string;
  agentId: string;
  clientId: string;
  clientName: string;
  scopes: AgentScope[];
  effectiveScopes: AgentScope[];
  mode: KeyMode;
  effectiveMode: KeyMode;
  createdAt: string;
  lastUsedAt: string | null;
  owner?: { userId: string; name: string | null };
}

export const agentGrantsApi = {
  /** `signed`: the signed authorization request, the consent page's own query string. */
  consentInfo: (signed: string) =>
    request<ConsentInfo>(`/api/agent-grants/consent?request=${encodeURIComponent(signed)}`),
  /** `{redirect}`: where the browser goes next (the client, with a code or `access_denied`). */
  consent: (input: { request: string; accept: boolean; scopes: AgentScope[]; mode: KeyMode }) =>
    request<{ redirect: string }>("/api/agent-grants/consent", {
      method: "POST",
      ...json(input),
    }),
  list: () => request<AgentGrantSummary[]>("/api/agent-grants").then(listOf<AgentGrantSummary>),
  revoke: (id: string) =>
    request<void>(`/api/agent-grants/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

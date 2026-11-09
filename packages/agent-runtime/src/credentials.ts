/**
 * Which credential an agent principal works with (RFC-0044 §5 inv. 5): an API key (`keyId`) or
 * an OAuth connection (`grantId`). Both are agents. Code that gives a key something of its own
 * (an `auto` release approval, an elevation, an automation run) asks here instead of testing
 * `keyId` alone, so a connection is never mistaken for the person behind it.
 */
import type { Principal } from "./policy.ts";

export type AgentCredential =
  | { readonly kind: "key"; readonly id: string }
  | { readonly kind: "grant"; readonly id: string };

/** The remote agent's credential; `undefined` for people and the local stdio server. */
export function agentCredential(principal: Principal): AgentCredential | undefined {
  if (principal.actor.kind !== "agent" || principal.local) return undefined;
  if (principal.keyId) return { kind: "key", id: principal.keyId };
  if (principal.grantId) return { kind: "grant", id: principal.grantId };
  return undefined;
}

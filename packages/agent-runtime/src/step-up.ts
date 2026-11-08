/**
 * RFC-0044 §1 step-up: which scopes an OAuth connection must add for a call it was denied. The
 * answer comes from the same decision the MCP handler makes (`PolicyEngine.evaluate`), so it
 * follows the own-variant lattice, a propose call's `proposeScopes`, and the member's role on the
 * call's site (RFC-0034 A2), not their installation role.
 */
import {
  holds,
  isKeyScope,
  ownVariantsOf,
  type PolicyEngine,
  type Principal,
  type Scope,
} from "./policy.ts";
import { narrow, roleScopes } from "./roles.ts";
import { forInstallation, forSite, INSTALLATION_SCOPES, isSiteLimited } from "./site-access.ts";

/**
 * The scopes to ask for so that `principal` may make the call `toolName(args)`, each the
 * strongest one a token can hold on the call's site: given by the member's role there and by
 * their installation role, which caps what consent issues (`site:publish:own` for an Author, not
 * `site:publish`). Undefined when the call is not denied for a missing scope, when the principal
 * has no person behind it, when the roles cannot give every missing scope, or when the call
 * would still be denied with them (plan mode, a skill that does not cover it): a challenge would
 * then make the client re-authorize for nothing, or loop.
 */
export function stepUpScopes(
  policy: PolicyEngine,
  principal: Principal,
  toolName: string,
  args: Record<string, unknown> = {},
): Scope[] | undefined {
  const tool = policy.tool(toolName);
  if (!tool || !principal.person) return undefined;
  // The handler judges the call as the principal acts on its site (`handleToolCall`).
  const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
  const onSite = (p: Principal) => (siteId ? forSite(p, siteId) : forInstallation(p));
  const sited = onSite(principal);
  const person = sited?.person;
  if (!sited || !person) return undefined;
  const decision = policy.evaluate(sited, toolName, { args });
  if (decision.kind !== "deny" || decision.code !== "missing_scope" || !decision.missing?.length)
    return undefined;
  // Consent caps a token by the installation role, as key creation does; `forSite` then caps it
  // by the site role. Only scopes both give survive, so only those are asked for.
  const installation = roleScopes(principal.person.role);
  const both = narrow(roleScopes(person.role), installation);
  const grantable =
    !siteId && isSiteLimited(person) ? both.filter((s) => !INSTALLATION_SCOPES.includes(s)) : both;
  const asked: Scope[] = [];
  for (const scope of decision.missing) {
    const pick = [scope, ...ownVariantsOf(tool, scope)].find(
      (s) => isKeyScope(s) && holds(grantable, s),
    );
    if (!pick) return undefined;
    if (!asked.includes(pick)) asked.push(pick);
  }
  // The call as it would run after consent must not be denied for any reason (scope, mode,
  // skill): otherwise the client would re-authorize for nothing, or loop.
  const granted = narrow([...(principal.keyScopes ?? principal.scopes), ...asked], installation);
  const after = onSite({ ...principal, scopes: granted, keyScopes: granted });
  if (!after) return undefined;
  return policy.evaluate(after, toolName, { args }).kind === "deny" ? undefined : asked;
}

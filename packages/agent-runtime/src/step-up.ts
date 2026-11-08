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
import { roleScopes } from "./roles.ts";
import { forInstallation, forSite, INSTALLATION_SCOPES, isSiteLimited } from "./site-access.ts";

/**
 * The scopes to ask for so that `principal` may make the call `toolName(args)`, each the
 * strongest one the member's role on the call's site gives a token (`site:publish:own` for an
 * Author, not `site:publish`). Undefined when the call is not denied for a missing scope, when
 * the principal has no person behind it, or when the role cannot give every missing scope (a
 * challenge would then make the client loop).
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
  const sited = siteId ? forSite(principal, siteId) : forInstallation(principal);
  const person = sited?.person;
  if (!sited || !person) return undefined;
  const decision = policy.evaluate(sited, toolName, { args });
  if (decision.kind !== "deny" || decision.code !== "missing_scope" || !decision.missing?.length)
    return undefined;
  const role = roleScopes(person.role);
  const grantable =
    !siteId && isSiteLimited(person) ? role.filter((s) => !INSTALLATION_SCOPES.includes(s)) : role;
  const asked: Scope[] = [];
  for (const scope of decision.missing) {
    const pick = [scope, ...ownVariantsOf(tool, scope)].find(
      (s) => isKeyScope(s) && holds(grantable, s),
    );
    if (!pick) return undefined;
    if (!asked.includes(pick)) asked.push(pick);
  }
  // With them the scope check must pass, or the client would re-authorize for nothing.
  const after = policy.evaluate({ ...sited, scopes: [...sited.scopes, ...asked] }, toolName, {
    args,
  });
  return after.kind === "deny" && after.code === "missing_scope" ? undefined : asked;
}

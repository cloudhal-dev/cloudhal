/**
 * Per-site roles (RFC-0034 §2, phase A2; RFC-0005 open question 10). The Owner and Administrators
 * act on every site of the installation. An Editor, Author or Contributor with site assignments
 * works only on those sites, each with its own role (never above Editor); without assignments
 * their installation role applies to every site, as before.
 *
 * REST and MCP resolve the principal once per request, before the site is known; `forSite` turns it
 * into the principal for one site, so every later check (scopes, own-only limits, mode caps,
 * approvals) sees that site's role.
 */
import type { PersonRef, Principal } from "./policy.ts";
import { clampMode, modeCap, narrow, type Role, roleScopes } from "./roles.ts";

/** Roles that may be limited to sites; Owner and Administrators always cover the installation. */
export const SITE_ROLES: readonly Role[] = ["editor", "author", "contributor"];

export function isSiteRole(role: Role): boolean {
  return SITE_ROLES.includes(role);
}

/** True when the person works only on assigned sites. */
export function isSiteLimited(person: PersonRef | undefined): boolean {
  return person?.sites !== undefined && isSiteRole(person.role);
}

/** The person's role on `siteId`, or undefined when they may not open it. */
export function siteRoleOf(person: PersonRef, siteId: string): Role | undefined {
  if (!isSiteLimited(person)) return person.role;
  return person.sites?.[siteId];
}

/** The sites among `siteIds` the principal may open (all of them when it is not site-limited). */
export function visibleSites<T extends string>(
  principal: Principal | undefined,
  siteIds: readonly T[],
): T[] {
  const person = principal?.person;
  if (!person || !isSiteLimited(person)) return [...siteIds];
  return siteIds.filter((id) => person.sites?.[id] !== undefined);
}

/**
 * The principal as it acts on `siteId`: undefined when it may not open the site; otherwise its
 * scopes and the person's role are that site's. An agent's own key scopes are narrowed to the
 * site role again, and its mode is capped by it (I5, I6).
 */
export function forSite(principal: Principal, siteId: string): Principal | undefined {
  const person = principal.person;
  if (!person || !isSiteLimited(person)) return principal;
  const role = person.sites?.[siteId];
  if (!role) return undefined;
  const sitePerson: PersonRef = { ...person, role };
  if (principal.actor.kind !== "agent")
    return { ...principal, scopes: roleScopes(role), person: sitePerson };
  const mode = principal.mode;
  return {
    ...principal,
    scopes: narrow(principal.keyScopes ?? principal.scopes, roleScopes(role)),
    person: sitePerson,
    ...(mode ? { mode: clampMode(mode, modeCap(role)) } : {}),
  };
}

/**
 * Scopes that act on the whole installation (its team, its activity, every agent): a site-limited
 * person does not hold them outside a site, so they cannot invite people or read installation-wide
 * activity. Inside one of their sites, `forSite` gives that site's role.
 */
export const INSTALLATION_SCOPES: readonly string[] = [
  "members:invite",
  "members:manage",
  "agents:manage",
  "audit:read",
  "site:create",
];

/** The principal outside any one site: a site-limited person loses `INSTALLATION_SCOPES`. */
export function forInstallation(principal: Principal): Principal {
  if (!isSiteLimited(principal.person)) return principal;
  return { ...principal, scopes: principal.scopes.filter((s) => !INSTALLATION_SCOPES.includes(s)) };
}

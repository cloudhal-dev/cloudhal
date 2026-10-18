/** `GET /api/me`: who is calling and what they may do. */
import {
  abilities,
  forInstallation,
  forSite,
  invitableRoles,
  isSiteLimited,
} from "@cloudhal/agent-runtime";
import type { Context } from "hono";
import type { Env } from "../context.ts";
import { notFound, unauthorized } from "../errors.ts";

/**
 * RFC-0005 §10.1: `role` (null without a membership), `scopes`, the `can` ability map for UI
 * gating (cosmetic, I16) and the roles they may invite. Agents see their actor and their effective
 * scopes. RFC-0034 A2: `?siteId=` answers with the person's role and abilities on that site, and a
 * site-limited person gets their `sites` (and invites nobody).
 */
export function meHandler(membership: boolean) {
  return (c: Context<Env>) => {
    const signedIn = c.get("principal");
    if (!signedIn) throw unauthorized();
    const siteId = c.req.query("siteId");
    const principal = siteId ? forSite(signedIn, siteId) : forInstallation(signedIn);
    if (!principal) throw notFound("site not found");
    const role = principal.person?.role ?? null;
    const limited = isSiteLimited(signedIn.person);
    if (principal.actor.kind === "agent")
      return c.json({
        actor: principal.actor,
        role,
        member: !membership || role !== null,
        scopes: principal.scopes,
        ...(principal.person
          ? { person: { id: principal.person.id, role: principal.person.role } }
          : {}),
      });
    return c.json({
      actor: principal.actor,
      role,
      member: !membership || role !== null,
      scopes: principal.scopes,
      can: abilities(membership ? (role ?? "contributor") : undefined, principal.scopes),
      invitableRoles: !membership
        ? invitableRoles("owner")
        : role && !limited
          ? invitableRoles(role)
          : [],
      ...(principal.person ? { userId: principal.person.userId } : {}),
      ...(limited ? { sites: signedIn.person?.sites } : {}),
    });
  };
}

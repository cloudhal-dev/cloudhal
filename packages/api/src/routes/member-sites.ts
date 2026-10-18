/**
 * RFC-0034 A2: which sites a member works on.
 *
 * - `PUT /api/members/:userId/sites` ← {sites: {siteId: role}} limits an Editor, Author or
 *   Contributor to those sites (an empty map lifts the limit); `members:manage`, and only for
 *   someone of lower rank.
 * - Invites carry the same map (`sites`), applied when the invite is accepted.
 * - A site-limited person sees the members who share a site with them, and only those sites.
 */
import {
  inviteProblem,
  isRole,
  isSiteLimited,
  type PersonRef,
  rank,
} from "@cloudhal/agent-runtime";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { type SiteRoles, siteRolesProblem } from "../site-members.ts";
import type { MemberRow } from "../staff.ts";
import { auditEvent, me, memberView, rankError } from "./members.ts";

/** A `sites` body field, checked against the role it limits and the installation's sites. */
export async function parseSites(
  c: Context<Env>,
  role: MemberRow["role"],
  value: unknown,
): Promise<SiteRoles | undefined> {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value))
    throw badRequest("sites must be an object of siteId → role");
  const siteIds = (await c.get("store").listSites()).map((s) => s.id);
  const problem = siteRolesProblem(role, value as Record<string, unknown>, siteIds);
  if (problem) throw apiError(400, "invalid_sites", problem);
  return Object.keys(value).length > 0 ? (value as SiteRoles) : undefined;
}

/** An invite's role (the inviter must outrank it) and the sites it limits the new member to. */
export async function inviteTarget(
  c: Context<Env>,
  inviter: PersonRef,
  body: Record<string, unknown>,
): Promise<{ role: MemberRow["role"]; sites: SiteRoles | undefined }> {
  if (!isRole(body.role))
    throw badRequest("role must be administrator, editor, author or contributor");
  const problem = inviteProblem(inviter.role, body.role);
  if (problem) throw rankError(problem);
  return { role: body.role, sites: await parseSites(c, body.role, body.sites) };
}

/** The members a person may see: everyone, or for a site-limited person those sharing a site. */
export function visibleMembers(viewer: PersonRef, members: readonly MemberRow[]): MemberRow[] {
  if (!isSiteLimited(viewer)) return [...members];
  const mine = Object.keys(viewer.sites ?? {});
  return members.flatMap((m) => {
    if (!m.sites) return [m];
    const shared = Object.entries(m.sites).filter(([id]) => mine.includes(id));
    return shared.length > 0 ? [{ ...m, sites: Object.fromEntries(shared) }] : [];
  });
}

export function memberSiteRoutes(): Hono<Env> {
  return new Hono<Env>().put("/:userId/sites", async (c) => {
    const { person, actor, staff } = me(c);
    const target = await staff.store.member(param(c, "userId"));
    if (!target) throw notFound("member not found");
    if (rank(person.role) <= rank(target.role))
      throw apiError(403, "rank", "only someone of higher rank changes a member's sites");
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { sites?: unknown };
    if (body.sites === undefined) throw badRequest("sites is required ({} lifts the limit)");
    const sites = (await parseSites(c, target.role, body.sites)) ?? {};
    await staff.store.setSites(target.userId, sites);
    await auditEvent(
      c.get("audit"),
      actor,
      "member.sites",
      { userId: target.userId, from: target.sites ?? null, to: sites },
      `${target.name}: ${Object.keys(sites).length > 0 ? `${Object.keys(sites).length} site(s)` : "every site"}`,
    );
    const updated = (await staff.store.member(target.userId)) as MemberRow;
    return c.json({ member: memberView(updated, true) });
  });
}

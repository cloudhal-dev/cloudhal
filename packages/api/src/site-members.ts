/**
 * Per-site roles over SQL (RFC-0034 phase A2): `site_members` rows limit an Editor, Author or
 * Contributor to their sites, each with its role (`@cloudhal/agent-runtime` `forSite` applies
 * them). Writers are guarded statements for the caller's batch (AGENTS.md rule 4).
 *
 * Worker-safe: no Node imports.
 */
import { isRole, isSiteRole, type Role } from "@cloudhal/agent-runtime";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";

/** `{siteId: role}`: the sites a member is limited to. */
export type SiteRoles = Readonly<Record<string, Role>>;

const ORG = "deployment";
const SITE_ROLE_LIST = "('editor', 'author', 'contributor')";

/** `invitation.sites` → the assignments; undefined for none or anything malformed. */
export function parseSiteRoles(value: unknown): SiteRoles | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const out: Record<string, Role> = {};
    for (const [siteId, role] of Object.entries(raw))
      if (isRole(role) && isSiteRole(role)) out[siteId] = role;
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** One member's assignments (undefined: every site). */
export async function siteRolesOf(sql: SqlDriver, userId: string): Promise<SiteRoles | undefined> {
  const rows = await sql.all<{ site_id: string; role: string }>(
    "SELECT site_id, role FROM site_members WHERE user_id = ? ORDER BY site_id",
    [userId],
  );
  return toRoles(rows);
}

/** Every member's assignments, by user id. */
export async function allSiteRoles(sql: SqlDriver): Promise<Map<string, SiteRoles>> {
  const rows = await sql.all<{ user_id: string; site_id: string; role: string }>(
    "SELECT user_id, site_id, role FROM site_members ORDER BY user_id, site_id",
  );
  const byUser = new Map<string, { site_id: string; role: string }[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const out = new Map<string, SiteRoles>();
  for (const [userId, list] of byUser) {
    const roles = toRoles(list);
    if (roles) out.set(userId, roles);
  }
  return out;
}

function toRoles(rows: readonly { site_id: string; role: string }[]): SiteRoles | undefined {
  const out: Record<string, Role> = {};
  for (const r of rows) if (isRole(r.role) && isSiteRole(r.role)) out[r.site_id] = r.role;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Replaces a member's assignments; written only while the member still holds a site role (a
 * concurrent promotion to Administrator voids the rows). An empty map lifts the limit.
 */
export function replaceSiteRoles(userId: string, roles: SiteRoles, at: string): SqlStatement[] {
  const guard = `EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND "userId" = ? AND "role" IN ${SITE_ROLE_LIST})`;
  return [
    { sql: "DELETE FROM site_members WHERE user_id = ?", params: [userId] },
    ...Object.entries(roles).map(([siteId, role]) => ({
      sql: `INSERT INTO site_members (site_id, user_id, role, created_at) SELECT ?, ?, ?, ? WHERE ${guard}`,
      params: [siteId, userId, role, at, ORG, userId],
    })),
  ];
}

/** The invite's assignments as rows, guarded on the invite being accepted by this user. */
export function inviteSiteRoles(
  inviteId: string,
  userId: string,
  roles: SiteRoles,
  at: string,
): SqlStatement[] {
  const guard = `EXISTS (SELECT 1 FROM "invitation" WHERE "id" = ? AND "status" = 'accepted' AND "acceptedUserId" = ?)`;
  return Object.entries(roles).map(([siteId, role]) => ({
    sql: `INSERT INTO site_members (site_id, user_id, role, created_at) SELECT ?, ?, ?, ? WHERE ${guard}`,
    params: [siteId, userId, role, at, inviteId, userId],
  }));
}

/**
 * Why `roles` cannot be assigned to someone whose installation role is `role`, or undefined.
 * Only Editors, Authors and Contributors are limited; a site role never exceeds Editor, and every
 * site must exist.
 */
export function siteRolesProblem(
  role: Role,
  roles: Record<string, unknown>,
  siteIds: readonly string[],
): string | undefined {
  const entries = Object.entries(roles);
  if (entries.length === 0) return undefined;
  if (!isSiteRole(role))
    return "Owners and Administrators work on every site; only Editors, Authors and Contributors are limited to sites";
  if (entries.length > 500) return "at most 500 sites";
  for (const [siteId, r] of entries) {
    if (!siteIds.includes(siteId)) return `unknown site ${siteId}`;
    if (!isRole(r) || !isSiteRole(r))
      return `${siteId}: a site role is editor, author or contributor`;
  }
  return undefined;
}

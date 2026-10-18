import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0034 phase A2 (RFC-0005 open question 10): per-site roles. A row limits an Editor, Author or
 * Contributor to that site with that role; a member without rows keeps their installation role on
 * every site. `invitation.sites` carries the assignments (JSON `{siteId: role}`) until the invite
 * is accepted, when they become rows in the same batch as the membership.
 */
export const migration0028SiteMembers: Migration = {
  name: "0028_site_members",
  sql: `
CREATE TABLE site_members (
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX site_members_user ON site_members (user_id);
ALTER TABLE "invitation" ADD COLUMN "sites" text;
`,
};

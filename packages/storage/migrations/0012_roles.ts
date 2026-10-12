import type { Migration } from "../src/migrate.ts";

/**
 * Staff roles and invites (RFC-0005 §11, ADR-0018). Additive.
 *
 * 1. `invitation` columns, declared to Better Auth as the organization plugin's invitation
 *    `additionalFields` (`packages/api/src/auth.ts`); the types are what Better Auth 1.7.7 emits for
 *    them (`string` → text, `date` → date). The token hash is unique (only `SHA-256(token)` is
 *    stored; RFC-0005 §7.1).
 * 2. The deployment organization (`id` and `slug` `deployment`, named after the first site), unless
 *    it exists.
 * 3. A `member` row for every existing user: the earliest (`createdAt`, then `id`) becomes `owner`,
 *    any others `administrator` (the closest role to their former `*` that keeps exactly one Owner).
 *    Two unique indexes then hold the invariants in the database itself: one membership per user
 *    and organization, and at most one Owner (I2).
 * 4. `agent_owner`: which person an agent actor belongs to (the creator of the key it used), kept
 *    after the key is deleted so ownership of agent-written entries survives (RFC-0005 §4; the
 *    server-side form of the optional `Actor.onBehalfOf`, §8). Back-filled from `apikey`.
 * 5. `password_reset`: administrator-issued one-time reset links (open question 6), stored like
 *    invite tokens (hash only).
 *
 * Keys are not changed: their effective scopes are computed per call (§5.1).
 */
export const migration0012Roles: Migration = {
  name: "0012_roles",
  sql: `
ALTER TABLE "invitation" ADD COLUMN "tokenHash" text;
ALTER TABLE "invitation" ADD COLUMN "delivery" text;
ALTER TABLE "invitation" ADD COLUMN "acceptedUserId" text;
ALTER TABLE "invitation" ADD COLUMN "acceptedAt" date;
ALTER TABLE "invitation" ADD COLUMN "canceledBy" text;
ALTER TABLE "invitation" ADD COLUMN "canceledAt" date;
CREATE UNIQUE INDEX "invitation_tokenHash_uidx" ON "invitation" ("tokenHash");
CREATE INDEX "invitation_status_idx" ON "invitation" ("organizationId", "status");
INSERT INTO "organization" ("id", "name", "slug", "createdAt")
  SELECT 'deployment',
         COALESCE((SELECT json_extract(body, '$.name') FROM nodes WHERE kind = 'site' ORDER BY created_at, id LIMIT 1), 'Cloudhal'),
         'deployment',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE NOT EXISTS (SELECT 1 FROM "organization" WHERE "id" = 'deployment');
INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
  SELECT 'mem_' || u."id",
         'deployment',
         u."id",
         CASE
           WHEN u."id" = (SELECT "id" FROM "user" ORDER BY "createdAt", "id" LIMIT 1)
             AND NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = 'deployment' AND "role" = 'owner')
           THEN 'owner'
           ELSE 'administrator'
         END,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM "user" u
  WHERE NOT EXISTS (SELECT 1 FROM "member" m WHERE m."userId" = u."id" AND m."organizationId" = 'deployment');
CREATE UNIQUE INDEX "member_org_user_uidx" ON "member" ("organizationId", "userId");
CREATE UNIQUE INDEX "member_one_owner_uidx" ON "member" ("organizationId") WHERE "role" = 'owner';
CREATE TABLE agent_owner (
  agent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_owner_user ON agent_owner (user_id);
INSERT INTO agent_owner (agent_id, user_id, key_id, created_at)
  SELECT 'agent_' || substr("id", 1, 32), "referenceId", "id", strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM "apikey"
  WHERE length("id") >= 6 AND "id" NOT GLOB '*[^A-Za-z0-9]*';
CREATE TABLE password_reset (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX password_reset_user ON password_reset (user_id);
`,
};

import type { Migration } from "../src/migrate.ts";

/**
 * Agent layer (Sprint 5): the audit log every policy decision and tool call is written to, and the
 * Better Auth `apikey` table (`@better-auth/api-key` 1.7.7 DDL) for non-interactive agent credentials.
 */
export const migration0003Agent: Migration = {
  name: "0003_agent",
  sql: `
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  site_id TEXT,
  tool TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  skill TEXT,
  input TEXT,
  outcome TEXT,
  snapshot_id TEXT,
  duration_ms INTEGER
);
CREATE INDEX audit_site_at ON audit (site_id, at);
CREATE INDEX audit_actor_at ON audit (actor_id, at);
create table "apikey" ("id" text not null primary key, "configId" text not null, "name" text, "start" text, "referenceId" text not null, "prefix" text, "key" text not null, "refillInterval" integer, "refillAmount" integer, "lastRefillAt" date, "enabled" integer, "rateLimitEnabled" integer, "rateLimitTimeWindow" integer, "rateLimitMax" integer, "requestCount" integer, "remaining" integer, "lastRequest" date, "expiresAt" date, "createdAt" date not null, "updatedAt" date not null, "permissions" text, "metadata" text);
create index "apikey_configId_idx" on "apikey" ("configId");
create index "apikey_referenceId_idx" on "apikey" ("referenceId");
create index "apikey_key_idx" on "apikey" ("key");
`,
};

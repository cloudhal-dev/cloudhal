import type { Migration } from "../src/migrate.ts";

/** The agent mode a call ran under (ADR-0015), so the activity feed can show it. */
export const migration0007AuditMode: Migration = {
  name: "0007_audit_mode",
  sql: `ALTER TABLE audit ADD COLUMN mode TEXT;`,
};

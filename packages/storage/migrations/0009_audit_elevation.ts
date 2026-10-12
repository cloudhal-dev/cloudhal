import type { Migration } from "../src/migrate.ts";

/** Calls made under a time-boxed elevation (ADR-0016) record the key's own mode and the end (JSON). */
export const migration0009AuditElevation: Migration = {
  name: "0009_audit_elevation",
  sql: `ALTER TABLE audit ADD COLUMN elevation TEXT;`,
};

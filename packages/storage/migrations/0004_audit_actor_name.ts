import type { Migration } from "../src/migrate.ts";

/** Keeps the actor's display name next to its id so activity feeds need no join. */
export const migration0004AuditActorName: Migration = {
  name: "0004_audit_actor_name",
  sql: `ALTER TABLE audit ADD COLUMN actor_name TEXT;`,
};

import type { Migration } from "../src/migrate.ts";

/**
 * What the server did when it carried an approved request out itself (JSON), e.g. the elevation it
 * granted for an agent's `request_elevation` — possibly shorter than asked (ADR-0016).
 */
export const migration0010ApprovalResult: Migration = {
  name: "0010_approval_result",
  sql: `ALTER TABLE approvals ADD COLUMN result TEXT;`,
};

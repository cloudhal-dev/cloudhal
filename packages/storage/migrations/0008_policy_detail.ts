import type { Migration } from "../src/migrate.ts";

/**
 * Policy detail as data (ADR-0015): approvals record the mode the agent worked in and why a person
 * must decide; approvals and audit rows keep the `auto`-mode check behind a publish (JSON), so
 * Studio no longer parses English reasons.
 */
export const migration0008PolicyDetail: Migration = {
  name: "0008_policy_detail",
  sql: `
ALTER TABLE approvals ADD COLUMN mode TEXT;
ALTER TABLE approvals ADD COLUMN cause TEXT;
ALTER TABLE approvals ADD COLUMN auto_check TEXT;
ALTER TABLE audit ADD COLUMN cause TEXT;
ALTER TABLE audit ADD COLUMN auto_check TEXT;
`,
};

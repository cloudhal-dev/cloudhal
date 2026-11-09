import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0044 §3 (review of #178): an index on the kind of an OAuth client and when its document was
 * last validated. Anonymous `/oauth2/authorize` calls count the stored metadata-document clients
 * (`clientDiscoveryId = 'cimd'`, the cap), evict the oldest unused one, and the hourly job prunes
 * them by `updatedAt`; without the index each of these reads the whole `oauthClient` table. A new
 * migration, because 0031 is already on `main`. Plain SQL; additive.
 */
export const migration0032OauthClientKindIndex: Migration = {
  name: "0032_oauth_client_kind_index",
  sql: `
CREATE INDEX "oauthClient_clientDiscoveryId_updatedAt_idx" ON "oauthClient" ("clientDiscoveryId", "updatedAt");
`,
};

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type BlobStore, migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { GATES_ENFORCED } from "./availability.ts";
import type { BlockRegistry, PropsSchema } from "./blocks.ts";
import { rebuildListValues } from "./list-values/backfill.ts";
import { FIELDS_SUPPORTED } from "./references/definitions.ts";
import { rebuildEntryRefs } from "./references/rebuild-job.ts";
import { SiteGraphStore, type SiteGraphStoreOptions } from "./store.ts";

export interface LocalStore {
  readonly store: SiteGraphStore;
  /** The underlying driver, for services that keep their own tables (audit log, auth). */
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly dataDir: string;
  close(): Promise<void>;
}

/**
 * Opens (or creates) the local, offline store under `dataDir`:
 * `<dataDir>/data.db` (SQLite via better-sqlite3) and `<dataDir>/blobs/` (filesystem blob store).
 * This is what `cloudhal dev` and self-hosted installs use.
 *
 * @param options.blocks the deployment's block registry (the theme's `src/blocks.ts`, RFC-0015
 *   §6); built-ins only when absent
 * @param options.themeSettings the theme's design settings (`src/settings.ts`, RFC-0017 §1)
 */
export async function openLocalStore(
  dataDir: string,
  options: {
    blocks?: BlockRegistry | undefined;
    themeSettings?: PropsSchema | undefined;
    themeDesign?: string | undefined;
    /**
     * After every publish, rollback and `notifyPublished` (the store's hook): the self-hosted
     * Node server rebuilds its static site (#150). Failures go to the store's hook error log.
     */
    onPublished?: SiteGraphStoreOptions["onPublished"] | undefined;
  } = {},
): Promise<LocalStore> {
  const dir = path.resolve(dataDir);
  await mkdir(path.join(dir, "blobs"), { recursive: true });
  const sql = await BetterSqlite3Driver.open(path.join(dir, "data.db"));
  await migrate(sql, migrations);
  // RFC-0042 §4: list values for collections listed before migration 0029 or left unfinished.
  await rebuildListValues(sql);
  // RFC-0045 §2.4, rollout step 7: `entry_refs` checked once per site (a safety net; resumes).
  await rebuildEntryRefs(sql);
  const blobs = new FsBlobStore(path.join(dir, "blobs"));
  // The renderer that serves this store runs in the same process: it enforces gates (S15) and
  // reads reference and repeater fields (RFC-0045 §1, rollout step 7).
  const store = new SiteGraphStore({
    sql,
    blobs,
    gates: GATES_ENFORCED,
    fieldTypes: FIELDS_SUPPORTED,
    ...(options.blocks ? { blocks: options.blocks } : {}),
    ...(options.themeSettings ? { themeSettings: options.themeSettings } : {}),
    ...(options.themeDesign ? { themeDesign: options.themeDesign } : {}),
    ...(options.onPublished ? { onPublished: options.onPublished } : {}),
  });
  return { store, sql, blobs, dataDir: dir, close: () => sql.close() };
}

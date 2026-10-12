import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type BlobStore, migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { GATES_ENFORCED } from "./availability.ts";
import { SiteGraphStore } from "./store.ts";

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
 */
export async function openLocalStore(dataDir: string): Promise<LocalStore> {
  const dir = path.resolve(dataDir);
  await mkdir(path.join(dir, "blobs"), { recursive: true });
  const sql = await BetterSqlite3Driver.open(path.join(dir, "data.db"));
  await migrate(sql, migrations);
  const blobs = new FsBlobStore(path.join(dir, "blobs"));
  // The renderer that serves this store runs in the same process and enforces gates (S15).
  const store = new SiteGraphStore({ sql, blobs, gates: GATES_ENFORCED });
  return { store, sql, blobs, dataDir: dir, close: () => sql.close() };
}

import { type SqlDriver, type SqlStatement, StorageError } from "./types.ts";

export interface Migration {
  /** Unique, sortable name, e.g. "0001_init". */
  readonly name: string;
  /** One or more SQL statements separated by `;` at end of line. No semicolons inside string literals. */
  readonly sql: string;
}

const MIGRATIONS_TABLE = "_migrations";

/** Splits a migration file into statements (semicolon at end of line, comments stripped). */
export function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Applies pending migrations in order. Each migration is one atomic `batch` (its statements plus the
 * bookkeeping row), so a failing migration leaves the database at the previous migration.
 */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[],
): Promise<{ applied: string[] }> {
  await driver.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const rows = await driver.all<{ name: string }>(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`,
  );
  const done = new Set(rows.map((r) => r.name));
  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set<string>();
  for (const m of sorted) {
    if (names.has(m.name)) throw new StorageError(`duplicate migration name "${m.name}"`);
    names.add(m.name);
  }
  const applied: string[] = [];
  for (const m of sorted) {
    if (done.has(m.name)) continue;
    const statements: SqlStatement[] = splitStatements(m.sql).map((sql) => ({ sql }));
    statements.push({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`,
      params: [m.name, new Date().toISOString()],
    });
    try {
      await driver.batch(statements);
    } catch (cause) {
      throw new StorageError(`migration "${m.name}" failed: ${(cause as Error).message}`, cause);
    }
    applied.push(m.name);
  }
  return { applied };
}

export async function appliedMigrations(driver: SqlDriver): Promise<string[]> {
  const rows = await driver
    .all<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`)
    .catch(() => []);
  return rows.map((r) => r.name);
}

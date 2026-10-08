/**
 * Conformance suites: every SqlDriver / BlobStore adapter must pass these. Import from
 * "@cloudhal/storage/testing" inside a vitest file and call with a factory.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  BlobIntegrityError,
  type BlobStore,
  SQL_LIMITS,
  type SqlDriver,
  StorageError,
  StorageLimitError,
  sha256OfBytes,
} from "./types.ts";

export interface SqlDriverFactory {
  create(): Promise<SqlDriver>;
  dispose?(): Promise<void>;
}

export function describeSqlDriverConformance(label: string, factory: SqlDriverFactory): void {
  describe(`SqlDriver conformance: ${label}`, () => {
    let driver: SqlDriver;

    beforeEach(async () => {
      driver = await factory.create();
      await driver.exec("DROP TABLE IF EXISTS t");
      await driver.exec(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL, n INTEGER, b BLOB)",
      );
    });

    afterAll(async () => {
      await driver?.close();
      await factory.dispose?.();
    });

    it("run/get/all round-trip values", async () => {
      const r = await driver.run("INSERT INTO t (v, n, b) VALUES (?, ?, ?)", [
        "a",
        42,
        new Uint8Array([1, 2, 3]),
      ]);
      expect(r.changes).toBe(1);
      expect(r.lastRowId).toBe(1);
      const row = await driver.get<{
        id: number;
        v: string;
        n: number;
        b: Uint8Array | ArrayBuffer;
      }>("SELECT id, v, n, b FROM t WHERE id = ?", [1]);
      expect(row?.v).toBe("a");
      expect(row?.n).toBe(42);
      expect(Array.from(new Uint8Array(row?.b as ArrayBuffer))).toEqual([1, 2, 3]);
      await driver.run("INSERT INTO t (v, n) VALUES (?, ?)", ["b", null]);
      const all = await driver.all<{ v: string; n: number | null }>(
        "SELECT v, n FROM t ORDER BY id",
      );
      expect(all).toEqual([
        { v: "a", n: 42 },
        { v: "b", n: null },
      ]);
      expect(await driver.get("SELECT v FROM t WHERE id = 999")).toBeUndefined();
    });

    it("batch is atomic: a failing statement rolls back the whole batch", async () => {
      await expect(
        driver.batch([
          { sql: "INSERT INTO t (v) VALUES (?)", params: ["x"] },
          { sql: "INSERT INTO nope (v) VALUES (?)", params: ["y"] },
        ]),
      ).rejects.toThrow();
      const count = await driver.get<{ n: number }>("SELECT count(*) AS n FROM t");
      expect(count?.n).toBe(0);
    });

    it("batch reports per-statement changes", async () => {
      const results = await driver.batch([
        { sql: "INSERT INTO t (v) VALUES (?)", params: ["x"] },
        { sql: "INSERT INTO t (v) VALUES (?)", params: ["y"] },
        { sql: "UPDATE t SET n = 1 WHERE v = ?", params: ["nothing"] },
      ]);
      expect(results.map((r) => r.changes)).toEqual([1, 1, 0]);
    });

    it("compare-and-swap on a revision column reports 1 change on success and 0 on conflict", async () => {
      await driver.run("INSERT INTO t (id, v, n) VALUES (1, 'node', 3)");
      const ok = await driver.run("UPDATE t SET v = ?, n = n + 1 WHERE id = ? AND n = ?", [
        "node2",
        1,
        3,
      ]);
      expect(ok.changes).toBe(1);
      const stale = await driver.run("UPDATE t SET v = ?, n = n + 1 WHERE id = ? AND n = ?", [
        "node3",
        1,
        3,
      ]);
      expect(stale.changes).toBe(0);
      expect((await driver.get<{ n: number }>("SELECT n FROM t WHERE id = 1"))?.n).toBe(4);
    });

    it("rejects interactive transactions (D1 parity)", async () => {
      await expect(driver.run("BEGIN TRANSACTION")).rejects.toThrow();
    });

    it("enforces the D1 bound-parameter limit", async () => {
      const params = Array.from({ length: SQL_LIMITS.maxBoundParams + 1 }, (_, i) => i);
      const placeholders = params.map(() => "?").join(", ");
      await expect(driver.all(`SELECT ${placeholders}`, params)).rejects.toThrow(StorageLimitError);
    });

    it("rejects an empty batch", async () => {
      await expect(driver.batch([])).rejects.toThrow(StorageError);
    });

    it("exec runs multi-statement DDL", async () => {
      await driver.exec("CREATE TABLE a (x INTEGER);\nCREATE TABLE b (y INTEGER);");
      await driver.run("INSERT INTO a (x) VALUES (1)");
      await driver.run("INSERT INTO b (y) VALUES (2)");
      expect((await driver.get<{ y: number }>("SELECT y FROM b"))?.y).toBe(2);
      await driver.exec("DROP TABLE a; DROP TABLE b;");
    });
  });
}

export interface BlobStoreFactory {
  create(): Promise<BlobStore>;
  dispose?(): Promise<void>;
}

export function describeBlobStoreConformance(label: string, factory: BlobStoreFactory): void {
  describe(`BlobStore conformance: ${label}`, () => {
    let store: BlobStore;
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    beforeEach(async () => {
      store = await factory.create();
      for (const k of await store.list()) await store.delete(k);
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("put/get/head/delete", async () => {
      expect(await store.get("nodes/a.json")).toBeNull();
      expect(await store.head("nodes/a.json")).toBeNull();
      await store.put("nodes/a.json", enc.encode('{"a":1}'), { contentType: "application/json" });
      expect(dec.decode((await store.get("nodes/a.json")) as Uint8Array)).toBe('{"a":1}');
      expect((await store.head("nodes/a.json"))?.size).toBe(7);
      await store.delete("nodes/a.json");
      expect(await store.get("nodes/a.json")).toBeNull();
      await store.delete("nodes/a.json"); // idempotent
    });

    it("overwrites and lists by prefix in sorted order", async () => {
      await store.put("x/2", enc.encode("two"));
      await store.put("x/1", enc.encode("one"));
      await store.put("y/1", enc.encode("yes"));
      await store.put("x/1", enc.encode("uno"));
      expect(await store.list("x/")).toEqual(["x/1", "x/2"]);
      expect(await store.list()).toEqual(["x/1", "x/2", "y/1"]);
      expect(dec.decode((await store.get("x/1")) as Uint8Array)).toBe("uno");
    });

    it("stores binary data without corruption", async () => {
      const bytes = new Uint8Array(1024).map((_, i) => i % 256);
      await store.put("bin", bytes);
      expect(Array.from((await store.get("bin")) as Uint8Array)).toEqual(Array.from(bytes));
    });

    // RFC-0004 §4.1: integrity, ranges, streams and key rules.
    const media = enc.encode("content-addressed bytes");
    const mediaSha = async () => sha256OfBytes(media);
    const wrongSha = "0".repeat(64);
    const streamOf = (...parts: Uint8Array[]) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      });

    it("put with a mismatched sha256 stores nothing; a matching one stores", async () => {
      await expect(store.put("media/s/a", media, { sha256: wrongSha })).rejects.toThrow(
        BlobIntegrityError,
      );
      expect(await store.head("media/s/a")).toBeNull();
      await store.put("media/s/a", media, { sha256: await mediaSha() });
      expect(dec.decode((await store.get("media/s/a")) as Uint8Array)).toBe(
        "content-addressed bytes",
      );
    });

    it("refuses keys with '..', empty segments, backslashes or other characters", async () => {
      for (const key of ["../x", "a/../b", "a//b", "/a", "a/", "a\\b", "", "a/./b", "a b", "ä"]) {
        await expect(store.put(key, media), key).rejects.toThrow(StorageError);
        await expect(store.get(key), key).rejects.toThrow(StorageError);
      }
    });

    it("streams with ranges and suffixes (getStream)", async () => {
      if (!store.getStream) return;
      await store.put("media/s/r", media);
      const read = async (s: { body: ReadableStream<Uint8Array> } | null) =>
        dec.decode(await new Response(s?.body).arrayBuffer());
      const whole = await store.getStream("media/s/r");
      expect(whole?.size).toBe(media.byteLength);
      expect(await read(whole)).toBe("content-addressed bytes");
      const part = await store.getStream("media/s/r", { range: { offset: 8, length: 9 } });
      expect(part?.range).toEqual({ offset: 8, length: 9 });
      expect(part?.size).toBe(media.byteLength);
      expect(await read(part)).toBe("addressed");
      const open = await store.getStream("media/s/r", { range: { offset: 18 } });
      expect(await read(open)).toBe("bytes");
      const suffix = await store.getStream("media/s/r", { range: { suffix: 5 } });
      expect(suffix?.range).toEqual({ offset: 18, length: 5 });
      expect(await read(suffix)).toBe("bytes");
      expect(await store.getStream("media/s/missing")).toBeNull();
      await expect(
        store.getStream("media/s/r", { range: { offset: media.byteLength } }),
      ).rejects.toThrow(StorageError);
    });

    it("putStream verifies size and sha256 before anything is visible", async () => {
      if (!store.putStream) return;
      const sha256 = await mediaSha();
      const size = media.byteLength;
      await expect(
        store.putStream("media/s/p", streamOf(media.slice(0, 5)), { size, sha256 }),
      ).rejects.toThrow(BlobIntegrityError);
      expect(await store.head("media/s/p")).toBeNull();
      await expect(
        store.putStream("media/s/p", streamOf(media, enc.encode("!")), { size, sha256 }),
      ).rejects.toThrow(BlobIntegrityError);
      expect(await store.head("media/s/p")).toBeNull();
      await expect(
        store.putStream("media/s/p", streamOf(media), { size, sha256: wrongSha }),
      ).rejects.toThrow(BlobIntegrityError);
      expect(await store.head("media/s/p")).toBeNull();
      await store.putStream("media/s/p", streamOf(media.slice(0, 7), media.slice(7)), {
        size,
        sha256,
        contentType: "text/plain",
      });
      expect(dec.decode((await store.get("media/s/p")) as Uint8Array)).toBe(
        "content-addressed bytes",
      );
      expect(await store.list()).toEqual(["media/s/p"]);
    });
  });
}

/**
 * Drops every user table so a shared database can be reused between tests. Foreign keys are
 * enforced (D1 cannot turn them off), so tables are dropped in rounds until none are left:
 * a table that still has dependants fails this round and succeeds once they are gone.
 */
export async function dropAllTables(driver: SqlDriver): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const tables = await driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    );
    if (tables.length === 0) return;
    let dropped = 0;
    for (const t of tables) {
      try {
        await driver.exec(`DROP TABLE IF EXISTS "${t.name}"`);
        dropped++;
      } catch {
        // referenced by another table; retry next round
      }
    }
    if (dropped === 0)
      throw new StorageError(
        `dropAllTables: could not drop ${tables.map((t) => t.name).join(", ")}`,
      );
  }
}

/** Spins up a Miniflare-backed D1 database (workerd in-process, no Cloudflare account). */
export async function createMiniflareD1(): Promise<{ db: D1Database; dispose(): Promise<void> }> {
  const { Miniflare } = await import("miniflare");
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
  });
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  return { db, dispose: () => mf.dispose() };
}

/** Spins up a Miniflare-backed R2 bucket. */
export async function createMiniflareR2(): Promise<{ bucket: R2Bucket; dispose(): Promise<void> }> {
  const { Miniflare } = await import("miniflare");
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    r2Buckets: ["BUCKET"],
  });
  const bucket = (await mf.getR2Bucket("BUCKET")) as unknown as R2Bucket;
  return { bucket, dispose: () => mf.dispose() };
}

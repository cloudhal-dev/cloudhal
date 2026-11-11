/**
 * RFC-0045 rollout step 2: the parts of the reference store that need SQL but no store — the
 * anchors' text equality over canonical bodies, the rows a body yields, the chunked rebuild and
 * the `entry_refs.shared` NOT NULL mapping. better-sqlite3 only; the shared suite
 * (`testing-references.ts`) runs the behaviour on every backend.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../src/errors.ts";
import { canonicalJson } from "../src/hash.ts";
import { REFS_STATEMENT_BYTES } from "../src/media/refs-rebuild.ts";
import { mapUniqueViolation } from "../src/node-sql.ts";
import { canonicalizeSiteRows } from "../src/references/canonical-rows.ts";
import { entryRefsRebuild } from "../src/references/rebuild.ts";
import { entryRefRows } from "../src/references/rows.ts";
import { collectionsAnchor, definitionsAnchor } from "../src/references/sql.ts";

const FIXTURES = join(import.meta.dirname, "../../core-contracts/fixtures/valid/site");
const L = (label: string) => ({ en: { label } });

async function db() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  return sql;
}

async function holds(site: Site, stored: unknown = site) {
  const sql = await db();
  await sql.run(
    "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, 'site', ?, 0, 'h', ?, 't', 't')",
    [site.id, site.id, site.id, canonicalJson(stored)],
  );
  const check = async (c: { sql: string; params: readonly unknown[] }) =>
    (await sql.get<{ ok: number }>(`SELECT ${c.sql} AS ok`, c.params as never))?.ok;
  return { sql, check };
}

describe("the anchors compare canonical bodies as text", () => {
  const sites = readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as Site] as const);

  it.each(sites)(
    "%s: every collection's definitions and the collections round-trip",
    async (_, site) => {
      const { check } = await holds(site);
      expect(await check(collectionsAnchor(site))).toBe(1);
      for (const key of Object.keys(site.collections ?? {}))
        expect(await check(definitionsAnchor(site, key)), key).toBe(1);
      // a collection without definitions, and an absent `collections`, bind SQL NULL
      expect(await check(definitionsAnchor(site, "nowhere"))).toBe(1);
    },
  );

  it("fractional and large bounds survive the stored form", async () => {
    const fields: FieldDefinition[] = [
      {
        key: "ratio",
        type: "number",
        labels: L("Ratio"),
        localized: false,
        minimum: 0.1,
        maximum: 1e21,
      },
      { key: "tiny", type: "number", labels: L("Tiny"), localized: false, minimum: -2.5e-7 },
    ];
    const site = {
      id: "site_01HZX8K3Q9AB",
      collections: { things: { fields } },
    } as unknown as Site;
    const { check } = await holds(site);
    expect(await check(definitionsAnchor(site, "things"))).toBe(1);
    expect(await check(collectionsAnchor(site))).toBe(1);
  });

  it("an absent collections binds NULL, a changed one fails", async () => {
    const site = { id: "site_01HZX8K3Q9AC" } as Site;
    const { check } = await holds(site);
    expect(await check(collectionsAnchor(site))).toBe(1);
    expect(await check(collectionsAnchor({ ...site, collections: {} }))).toBe(0);
    const other = await holds({ ...site, collections: { a: {} } } as Site);
    expect(await other.check(collectionsAnchor(site))).toBe(0);
  });
});

describe("rows of a body", () => {
  const venue: FieldDefinition = {
    key: "venue",
    type: "reference",
    labels: L("Venue"),
    localized: true,
    multiple: true,
    collections: ["places"],
  };
  const speakers: FieldDefinition = {
    key: "speakers",
    type: "repeater",
    labels: L("Speakers"),
    localized: false,
    fields: [
      { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
      { key: "talk", type: "text", labels: L("Talk") },
    ],
  };

  it("one row per (field, target), keys read through a running rename", () => {
    const renamed = {
      ...venue,
      key: "place",
      migration: { id: "snap_01HZX8K3Q9MG", fromKey: "venue" },
    };
    const rows = entryRefRows([renamed, speakers], {
      venue: ["entry_01HZX8K3QAAA", "entry_01HZX8K3QBBB"],
      speakers: [
        { person: "entry_01HZX8K3QAAA" },
        { person: "entry_01HZX8K3QAAA", talk: "x" },
        "junk",
      ],
    });
    expect(rows).toEqual([
      { t: "entry_01HZX8K3QAAA", f: "venue", k: "venue", shared: 2 },
      { t: "entry_01HZX8K3QBBB", f: "venue", k: "venue", shared: 2 },
      { t: "entry_01HZX8K3QAAA", f: "speakers.person", k: "speakers", shared: 1 },
    ]);
  });

  it("the rebuild's INSERTs stay below 90 KB", () => {
    const site = {
      id: "site_01HZX8K3Q9AD",
      kind: "site",
      body: canonicalJson({
        id: "site_01HZX8K3Q9AD",
        collections: { events: { fields: [venue] } },
      }),
    };
    const entries = Array.from({ length: 3000 }, (_, i) => ({
      id: `entry_${String(i).padStart(12, "0")}`,
      kind: "contentEntry",
      body: canonicalJson({
        collection: "events",
        status: "published",
        fields: { venue: [`entry_T${String(i).padStart(11, "0")}`] },
      }),
    }));
    const statements = entryRefsRebuild(site.id, [site, ...entries]);
    expect(statements[0]?.sql).toMatch(/^DELETE FROM entry_refs WHERE site_id = \?/);
    expect(statements.length).toBeGreaterThan(2);
    const encoder = new TextEncoder();
    for (const s of statements) {
      const bytes = encoder.encode(s.sql + (s.params ?? []).join("")).length;
      expect(bytes).toBeLessThan(REFS_STATEMENT_BYTES);
    }
  });
});

describe("the shared NOT NULL mapping", () => {
  it("maps only entry_refs.shared to a ConflictError", () => {
    const shared = new Error("NOT NULL constraint failed: entry_refs.shared");
    expect(mapUniqueViolation(shared, "contentEntry", "k")).toBeInstanceOf(ConflictError);
    const other = new Error("NOT NULL constraint failed: entry_refs.source_status");
    expect(mapUniqueViolation(other, "contentEntry", "k")).toBe(other);
    const d1 = new Error(
      "D1_ERROR: NOT NULL constraint failed: entry_refs.shared: SQLITE_CONSTRAINT",
    );
    expect(mapUniqueViolation(d1, "contentEntry", "k")).toBeInstanceOf(ConflictError);
  });
});

describe("canonical site rows (§2.4)", () => {
  it("rewrites a verbatim site row once, under its hash, and leaves canonical ones alone", async () => {
    const sql = await db();
    const site = { id: "site_01HZX8K3Q9CN", rev: 3, collections: { b: {}, a: { fields: [] } } };
    const verbatim = JSON.stringify(site);
    await sql.run(
      "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, 'site', ?, 3, 'h', ?, 't', 't')",
      [site.id, site.id, site.id, verbatim],
    );
    expect(await canonicalizeSiteRows(sql)).toEqual({ read: 1, rewritten: 1 });
    const row = await sql.get<{ body: string; hash: string }>("SELECT body, hash FROM nodes");
    expect(row).toEqual({ body: canonicalJson(site), hash: "h" });
    expect(await canonicalizeSiteRows(sql)).toEqual({ read: 1, rewritten: 0 });
  });
});

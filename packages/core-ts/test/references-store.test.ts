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
import { fieldAssetIssues, fieldAssetRefs } from "../src/media/field-refs.ts";
import { REFS_STATEMENT_BYTES } from "../src/media/refs-rebuild.ts";
import { mapUniqueViolation } from "../src/node-sql.ts";
import { entryRefsRebuild } from "../src/references/rebuild.ts";
import { entryRefRows } from "../src/references/rows.ts";
import { collectionsAnchor, definitionsAnchor } from "../src/references/sql.ts";
import { entryRefStatements } from "../src/references/writer.ts";
import { releaseDepsOf, stripReferences } from "../src/release-deps.ts";

const FIXTURES = join(import.meta.dirname, "../../core-contracts/fixtures/valid/site");
const L = (label: string) => ({ en: { label } });

async function db() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  return sql;
}

/** Reverses every object's key order: a body as an older import could have stored it verbatim. */
function verbatim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(verbatim);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([k, v]) => [k, verbatim(v)]),
  );
}

async function holds(site: Site, text: string = canonicalJson(site)) {
  const sql = await db();
  await sql.run(
    "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, 'site', ?, 0, 'h', ?, 't', 't')",
    [site.id, site.id, site.id, text],
  );
  const check = async (c: Promise<{ sql: string; params: readonly unknown[] }>) => {
    const cond = await c;
    return (await sql.get<{ ok: number }>(`SELECT ${cond.sql} AS ok`, cond.params as never))?.ok;
  };
  return { sql, check };
}

describe("the anchors compare the stored text, read when planned", () => {
  const sites = readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as Site] as const);

  it.each(sites)("%s: canonical and verbatim rows both anchor", async (_, site) => {
    for (const text of [canonicalJson(site), JSON.stringify(verbatim(site))]) {
      const { sql, check } = await holds(site, text);
      expect(await check(collectionsAnchor(sql, site))).toBe(1);
      for (const key of Object.keys(site.collections ?? {}))
        expect(await check(definitionsAnchor(sql, site, key)), key).toBe(1);
      // a collection without definitions, and an absent `collections`, compare SQL NULL
      expect(await check(definitionsAnchor(sql, site, "nowhere"))).toBe(1);
    }
  });

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
      rev: 0,
      collections: { things: { fields } },
    } as unknown as Site;
    const { sql, check } = await holds(site);
    expect(await check(definitionsAnchor(sql, site, "things"))).toBe(1);
    expect(await check(collectionsAnchor(sql, site))).toBe(1);
  });

  it("a site that differs from the planned one conflicts; one changed after planning fails", async () => {
    const site = { id: "site_01HZX8K3Q9AC", rev: 0 } as Site;
    const { sql, check } = await holds(site);
    expect(await check(collectionsAnchor(sql, site))).toBe(1);
    await expect(collectionsAnchor(sql, { ...site, collections: {} })).rejects.toBeInstanceOf(
      ConflictError,
    );
    const planned = await collectionsAnchor(sql, site);
    await sql.run("UPDATE nodes SET body = ? WHERE id = ?", [
      canonicalJson({ ...site, collections: { a: {} } }),
      site.id,
    ]);
    expect(await check(Promise.resolve(planned))).toBe(0);
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

describe("the rows INSERT reads shared from the site row at batch time", () => {
  const SITE = "site_01HZX8K3Q9SH";
  const ENTRY = "entry_01HZX8K3Q9EN";
  const ref = (key: string, localized: boolean, extra: object = {}) => ({
    key,
    type: "reference",
    labels: L(key),
    localized,
    collections: ["places"],
    ...extra,
  });
  const planned = { id: SITE, rev: 0, collections: { events: { fields: [ref("venue", false)] } } };
  const entry = {
    id: ENTRY,
    siteId: SITE,
    collection: "events",
    status: "draft",
    fields: { venue: "entry_01HZX8K3QHALL" },
  };

  async function run(storedFields: unknown[]) {
    const sql = await db();
    const site = { ...planned, collections: { events: { fields: storedFields } } };
    for (const [id, kind, hash, body] of [
      [SITE, "site", "s", site],
      [ENTRY, "contentEntry", "eh", entry],
    ] as const)
      await sql.run(
        "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, 't', 't')",
        [id, SITE, kind, id, hash, canonicalJson(body)],
      );
    await sql.batch(entryRefStatements(planned as never, entry as never, "eh"));
    return sql.all<{ shared: number; root_key: string }>("SELECT shared, root_key FROM entry_refs");
  }

  it("matches a running rename's fromKey, and the exact key wins over it", async () => {
    const renamed = ref("place", false, {
      migration: { id: "snap_01HZX8K3Q9MG", fromKey: "venue" },
    });
    expect(await run([renamed])).toEqual([{ shared: 1, root_key: "venue" }]);
    expect(await run([renamed, ref("venue", true)])).toEqual([{ shared: 2, root_key: "venue" }]);
  });

  it("a key retyped or gone by batch time fails the batch (NOT NULL), never inserts", async () => {
    const text = { key: "venue", type: "text", labels: L("venue"), localized: false };
    await expect(run([text])).rejects.toThrow(/NOT NULL constraint failed: entry_refs\.shared/);
    await expect(run([])).rejects.toThrow(/NOT NULL constraint failed: entry_refs\.shared/);
  });
});

describe("release dependencies (§2.7)", () => {
  const site = {
    collections: {
      events: {
        fields: [
          {
            key: "place",
            type: "reference",
            labels: L("Venue"),
            localized: false,
            collections: ["places"],
            migration: { id: "snap_01HZX8K3Q9MG", fromKey: "venue" },
          },
          {
            key: "speakers",
            type: "repeater",
            labels: L("Speakers"),
            localized: false,
            fields: [
              { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
              { key: "photo", type: "image", labels: L("Photo") },
            ],
          },
        ],
      },
    },
  } as unknown as Site;
  const body = {
    id: "entry_01HZX8K3QSELF",
    collection: "events",
    coverImage: { assetId: "asset_01HZX8K3QCOVR" },
    terms: { tag: { ids: ["term_01HZX8K3QTAG1"] } },
    fields: {
      venue: "entry_01HZX8K3QVENU",
      speakers: [{ person: "entry_01HZX8K3QPERS", photo: "asset_01HZX8K3QFACE" }],
    },
  };

  it("drops reference values, top level and in items, and keeps every other dependency", async () => {
    const deps = releaseDepsOf(site, async () => JSON.stringify(body));
    expect(await deps({ id: body.id, kind: "contentEntry", rev: 1, hash: "h" })).toEqual([
      "asset_01HZX8K3QCOVR",
      "asset_01HZX8K3QFACE",
      "term_01HZX8K3QTAG1",
    ]);
    // other kinds are walked as before
    expect(await deps({ id: "page_01HZX8K3QPAGE", kind: "page", rev: 1, hash: "h" })).toContain(
      "entry_01HZX8K3QVENU",
    );
  });

  it("leaves bodies without reference definitions as they are", () => {
    expect(stripReferences({ collections: {} }, body)).toBe(body);
  });
});

describe("asset issues inside repeater items (§2.5)", () => {
  const speakers: FieldDefinition = {
    key: "speakers",
    type: "repeater",
    labels: L("Speakers"),
    localized: false,
    fields: [
      { key: "talk", type: "text", labels: L("Talk") },
      { key: "photo", type: "image", labels: L("Photo") },
    ],
  };
  const CSV = "asset_01HZX8K3QCSV1";
  const lookup = async () => new Map([[CSV, { id: CSV, kind: "file", status: "active" } as never]]);
  const values = { speakers: [{ photo: CSV }, { talk: "x" }, { photo: CSV }] };

  it("one row per asset and field, every use's path kept", () => {
    expect(fieldAssetRefs([speakers], values)).toEqual([
      {
        assetId: CSV,
        field: "fields.speakers.photo",
        path: "fields/speakers/0/photo",
        paths: ["fields/speakers/0/photo", "fields/speakers/2/photo"],
      },
    ]);
  });

  it("reports each use, and skips only the uses under a skip path", async () => {
    const refs = fieldAssetRefs([speakers], values);
    const paths = async (skip: string[]) =>
      (
        await fieldAssetIssues({ defs: [speakers], refs, kept: [], lookup, skip: new Set(skip) })
      ).map((i) => i.path);
    expect(await paths([])).toEqual(["fields/speakers/0/photo", "fields/speakers/2/photo"]);
    expect(await paths(["fields/speakers/0"])).toEqual(["fields/speakers/2/photo"]);
    expect(await paths(["fields/speakers"])).toEqual([]);
  });
});

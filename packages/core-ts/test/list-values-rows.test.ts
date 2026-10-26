/**
 * RFC-0042 §4, #110: the pure parts of `entry_list_values` — per-type encodings, `utf16Key`
 * (SQLite BINARY order equals JavaScript's `<`), text values that are too long or not well
 * formed, the safe-integer / bound-number split, and the list fingerprint (labels excluded,
 * column order ignored, every FieldDefinition property either fingerprinted or excluded).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { EXCLUDED, listFingerprint, NO_LIST } from "../src/list-values/fingerprint.ts";
import { dayNumber, fieldRows, listValueRows, textKey, utf16Key } from "../src/list-values/rows.ts";
import { nodeRowsStatements } from "../src/list-values/statements.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = { en: { label: "x" } };
const def = (d: Partial<FieldDefinition> & { type: FieldDefinition["type"] }) =>
  ({ key: "f", labels: L, localized: false, ...d }) as FieldDefinition;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("list value rows (RFC-0042 §4)", () => {
  it("encodes each type as the evaluator reads it", () => {
    expect(fieldRows("f", def({ type: "number" }), -0)).toEqual([
      { field: "f", has: 1, num: 0, text: null },
    ]);
    expect(Object.is(fieldRows("f", def({ type: "number" }), -0)[0]?.num, 0)).toBe(true);
    expect(fieldRows("f", def({ type: "number" }), undefined)).toEqual([
      { field: "f", has: 0, num: null, text: null },
    ]);
    expect(fieldRows("f", def({ type: "date" }), "2026-11-05")[0]?.num).toBe(20261105);
    expect(dayNumber("0001-01-31")).toBe(10131);
    expect(
      fieldRows("f", def({ type: "datetime" }), {
        at: "2026-11-05T20:00:00.5Z",
        timeZone: "UTC",
      })[0]?.num,
    ).toBe(Date.parse("2026-11-05T20:00:00.5Z"));
    expect(fieldRows("f", def({ type: "boolean" }), true)[0]).toMatchObject({ has: 1, num: 1 });
    expect(fieldRows("f", def({ type: "boolean" }), false)[0]).toMatchObject({ has: 1, num: 0 });
    expect(fieldRows("f", def({ type: "boolean" }), undefined)[0]).toMatchObject({
      has: 0,
      num: 0,
    });
    const options = [
      { value: "a", labels: { en: "A" } },
      { value: "b", labels: { en: "B" } },
    ];
    expect(fieldRows("f", def({ type: "select", options } as never), "a")).toEqual([
      { field: "f", has: 1, num: null, text: "a" },
    ]);
    expect(
      fieldRows("f", def({ type: "select", options, multiple: true } as never), ["b", "a"]),
    ).toEqual([
      { field: "f", has: 1, num: null, text: null },
      { field: "f", has: 2, num: null, text: "b" },
      { field: "f", has: 2, num: null, text: "a" },
    ]);
    expect(fieldRows("f", def({ type: "select", options, multiple: true } as never), [])).toEqual([
      { field: "f", has: 0, num: null, text: null },
    ]);
    expect(fieldRows("f", def({ type: "text" }), "  ")[0]).toMatchObject({ has: 0, text: "  " });
    expect(fieldRows("f", def({ type: "richText" }), "Hi")[0]).toMatchObject({
      has: 1,
      text: null,
    });
    expect(fieldRows("f", undefined, "x")).toEqual([{ field: "f", has: 0, num: null, text: null }]);
  });

  it("stores text only when it compares exactly, never truncated", () => {
    expect(textKey("a".repeat(100))).toBe("a".repeat(100));
    expect(textKey("a".repeat(101))).toBeNull();
    expect(textKey("x\ud800y")).toBeNull();
    expect(textKey("𝒜")).toBe("𝒜");
  });

  it("utf16Key sorts in SQLite exactly as JavaScript's < does", async () => {
    const rnd = mulberry32(110);
    const pool = [0x41, 0x61, 0xe9, 0xd7ff, 0xd835, 0xdc9c, 0xe000, 0xff21, 0xfffd, 0xffff];
    const strings = new Set<string>();
    while (strings.size < 3000) {
      let s = "";
      const n = Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const r = rnd();
        if (r < 0.15) s += String.fromCodePoint(0x1d49c + Math.floor(rnd() * 4));
        else s += String.fromCharCode(pool[Math.floor(rnd() * pool.length)] as number);
      }
      strings.add(s);
    }
    const sql = await BetterSqlite3Driver.open(":memory:");
    await sql.exec("CREATE TABLE t (k TEXT NOT NULL, i INTEGER NOT NULL)");
    const list = [...strings];
    await sql.run(
      "INSERT INTO t (k, i) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)",
      [JSON.stringify(list.map((s, i) => [utf16Key(s), i]))],
    );
    const order = (await sql.all<{ i: number }>("SELECT i FROM t ORDER BY k")).map(
      (r) => list[r.i],
    );
    expect(order).toEqual([...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    await sql.close();
  });

  it("binds numbers that are not safe integers, and carries the rest in JSON", () => {
    const values = {
      nodeId: "ent_a",
      collection: "c",
      locale: "en",
      status: "draft",
      tie: "t",
      rows: [
        { field: "a", has: 1 as const, num: 0.1 + 0.2, text: null },
        { field: "b", has: 1 as const, num: 1_700_000_000_000, text: null },
        { field: "c", has: 1 as const, num: 1e300, text: null },
      ],
    };
    const [, insert] = nodeRowsStatements("site_a", [{ id: "ent_a", hash: "h", values }]);
    expect(insert?.params?.slice(0, 2)).toEqual([0.1 + 0.2, 1e300]);
    expect(String(insert?.params?.[2])).toContain("1700000000000");
    // 81 decimals do not fit one statement's parameters.
    const many = Array.from({ length: 81 }, (_, i) => ({
      id: `ent_${i}`,
      hash: "h",
      values: {
        ...values,
        nodeId: `ent_${i}`,
        rows: [{ field: "a", has: 1 as const, num: i + 0.5, text: null }],
      },
    }));
    const statements = nodeRowsStatements("site_a", many);
    expect(statements).toHaveLength(3);
    for (const s of statements) expect(s.params?.length).toBeLessThanOrEqual(100);
  });

  it("rows exist only for listed fields of a listed collection", () => {
    const site = {
      collections: {
        events: {
          fields: [def({ key: "price", type: "number" }), def({ key: "city", type: "text" })],
          listFields: ["price"],
          sort: "title",
        },
        posts: { fields: [def({ key: "price", type: "number" })] },
      },
    } as unknown as Site;
    const entry = {
      id: "ent_1",
      collection: "events",
      locale: "en",
      status: "published",
      title: "B￿",
      createdAt: "2026-01-01T00:00:00.000Z",
      fields: { price: 3, city: "Izmir" },
    } as never;
    expect(listValueRows(site, entry)).toEqual({
      nodeId: "ent_1",
      collection: "events",
      locale: "en",
      status: "published",
      tie: utf16Key("B￿"),
      rows: [{ field: "price", has: 1, num: 3, text: null }],
    });
    expect(listValueRows(site, { ...(entry as object), collection: "posts" } as never)).toBe(
      undefined,
    );
  });
});

describe("list fingerprint (RFC-0042 §4)", () => {
  const site = (fields: FieldDefinition[], listFields: string[], sort?: string) =>
    ({ collections: { c: { fields, listFields, ...(sort ? { sort } : {}) } } }) as unknown as Site;
  const a = def({ key: "a", type: "number" });
  const b = def({ key: "b", type: "text" });

  it("ignores labels and column order, not definitions or the sort", async () => {
    const base = await listFingerprint(site([a, b], ["a", "b"]), "c");
    expect(await listFingerprint(site([a, b], ["b", "a"]), "c")).toBe(base);
    expect(
      await listFingerprint(site([{ ...a, labels: { tr: { label: "y" } } }, b], ["a", "b"]), "c"),
    ).toBe(base);
    expect(await listFingerprint(site([a, b], ["a", "b"], "title"), "c")).not.toBe(base);
    expect(await listFingerprint(site([a, b], ["a"]), "c")).not.toBe(base);
    expect(
      await listFingerprint(site([{ ...a, maximum: 3 } as never, b], ["a", "b"]), "c"),
    ).not.toBe(base);
    expect(await listFingerprint({ collections: { c: { fields: [a] } } } as never, "c")).toBe(
      NO_LIST,
    );
  });

  it("fingerprints every FieldDefinition property but the excluded ones", async () => {
    const schema = JSON.parse(
      readFileSync(path.resolve(here, "../../core-contracts/schemas/site.schema.json"), "utf8"),
    ) as {
      $defs: { FieldDefinition: { oneOf: { properties: Record<string, { type?: string }> }[] } };
    };
    const variants = schema.$defs.FieldDefinition.oneOf;
    expect(variants.length).toBe(9);
    const sentinel = (name: string, type: string | undefined): unknown => {
      if (name === "migration") return { id: "op_1", fromLocalized: true };
      if (name === "options") return [{ value: "z", labels: { en: "Z" } }];
      if (type === "boolean") return true;
      if (type === "integer" || type === "number") return 7;
      return name === "labels" ? { tr: { label: "y" } } : "other";
    };
    for (const v of variants) {
      const props = v.properties;
      const type = (props.type as unknown as { enum: [FieldDefinition["type"]] }).enum[0];
      const base = def({
        key: "a",
        type,
        ...(type === "select" ? { options: [{ value: "q", labels: { en: "Q" } }] } : {}),
      } as never);
      const before = await listFingerprint(site([base], ["a"]), "c");
      for (const [name, p] of Object.entries(props)) {
        if (name === "key" || name === "type") continue;
        const changed = { ...base, [name]: sentinel(name, p.type) } as FieldDefinition;
        const after = await listFingerprint(site([changed], ["a"]), "c");
        if (EXCLUDED.includes(name)) expect(after, `${type}.${name}`).toBe(before);
        else expect(after, `${type}.${name}`).not.toBe(before);
      }
    }
  });
});

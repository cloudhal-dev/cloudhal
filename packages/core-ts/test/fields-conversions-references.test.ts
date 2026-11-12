/** RFC-0045 §7: the conversion rows for references and repeaters, and `sub` markers. Pure. */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  canConvert,
  conversionEntries,
  convertFieldValue,
  normalizeThroughMarkers,
  resolveFields,
  rewriteFields,
} from "../src/fields/index.ts";

const L = { en: { label: "x" } };
const def = (over: Record<string, unknown>) =>
  ({ key: "v", labels: L, localized: false, ...over }) as unknown as FieldDefinition;
const ref = (multiple = false, maxItems?: number) =>
  def({ type: "reference", collections: ["places"], multiple, ...(maxItems ? { maxItems } : {}) });
const lines = (over: Record<string, unknown> = {}) =>
  def({ type: "repeater", fields: [{ key: "line", type: "text", labels: L, ...over }] });
const people = def({
  type: "repeater",
  fields: [{ key: "person", type: "reference", labels: L, collections: ["places"] }],
});

const HALL = "entry_HALL000001";
const ROOM = "entry_ROOM000001";
const member = (id: string, over: Partial<ContentEntry> = {}) =>
  ({
    id,
    collection: "places",
    locale: "en",
    slug: id.slice(6).toLowerCase(),
    title: id === HALL ? "Main Hall" : "Room",
    status: "published",
    ...over,
  }) as ContentEntry;
const entries = conversionEntries(
  [
    member(HALL),
    member("entry_HALLTR0001", {
      locale: "tr",
      title: "Ana Salon",
      translation: { group: HALL } as never,
    }),
    member(ROOM),
    member("entry_ROOMTWIN01", { title: "Room", slug: "room-twin" }),
    member("entry_GONE000001", { title: "Gone", status: "archived" }),
  ],
  "en",
);
const ctx = { timeZone: "UTC", defaultLocale: "en", entries };

describe("RFC-0045 §7 conversion rows", () => {
  it("lists the new rows", () => {
    for (const [from, to] of [
      ["text", "reference"],
      ["reference", "text"],
      ["reference", "reference"],
      ["text", "repeater"],
      ["repeater", "text"],
      ["reference", "repeater"],
      ["repeater", "reference"],
    ] as const)
      expect(canConvert(from, to)).toBe(true);
    expect(canConvert("number", "reference")).toBe(false);
    expect(canConvert("repeater", "number")).toBe(false);
  });

  it("reference single ↔ multiple: one id ↔ a list of one; an empty list is no value", () => {
    expect(convertFieldValue("reference", ref(true), HALL, ctx)).toEqual({
      ok: true,
      value: [HALL],
    });
    expect(convertFieldValue("reference", ref(false), [HALL], ctx)).toEqual({
      ok: true,
      value: HALL,
    });
    expect(convertFieldValue("reference", ref(false), [], ctx)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(convertFieldValue("reference", ref(false), [HALL, ROOM], ctx)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/2 entries/),
    });
    // the new definition's own rules still apply
    expect(convertFieldValue("reference", ref(true, 1), [HALL, ROOM], ctx).ok).toBe(false);
  });

  it("text → reference: the one group with that slug or default-locale title, case-folded", () => {
    expect(convertFieldValue("text", ref(), "  main HALL ", ctx)).toEqual({
      ok: true,
      value: HALL,
    });
    expect(convertFieldValue("text", ref(), "hall000001", ctx)).toEqual({ ok: true, value: HALL });
    expect(convertFieldValue("text", ref(true), "Main Hall", ctx)).toEqual({
      ok: true,
      value: [HALL],
    });
    expect(convertFieldValue("text", ref(), "", ctx)).toEqual({ ok: true, value: undefined });
    // a translation's title is not the default locale's; archived entries match nothing
    expect(convertFieldValue("text", ref(), "Ana Salon", ctx).ok).toBe(false);
    expect(convertFieldValue("text", ref(), "Gone", ctx).ok).toBe(false);
    expect(convertFieldValue("text", ref(), "Nowhere", ctx)).toMatchObject({ ok: false });
    expect(convertFieldValue("text", ref(), "Room", ctx)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/matches 2 entries/),
    });
    // never the entry's own group; without the maps nothing converts
    expect(convertFieldValue("text", ref(), "Main Hall", { ...ctx, group: HALL }).ok).toBe(false);
    expect(convertFieldValue("text", ref(), "Main Hall", { ...ctx, entries: undefined }).ok).toBe(
      false,
    );
  });

  it("reference → text: the default-locale title, a list comma separated", () => {
    const text = def({ type: "text" });
    expect(convertFieldValue("reference", text, HALL, ctx)).toEqual({
      ok: true,
      value: "Main Hall",
    });
    expect(convertFieldValue("reference", text, [HALL, ROOM], ctx)).toEqual({
      ok: true,
      value: "Main Hall, Room",
    });
    expect(convertFieldValue("reference", text, "entry_NOBODY0001", ctx).ok).toBe(false);
  });

  it("text → repeater: one item per non-empty line into the one text sub-field", () => {
    expect(convertFieldValue("text", lines(), "2 eggs\n\n  flour \r\nsalt", ctx)).toEqual({
      ok: true,
      value: [{ line: "2 eggs" }, { line: "flour" }, { line: "salt" }],
    });
    expect(convertFieldValue("text", lines({ maxLength: 3 }), "salt\nflour", ctx).ok).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `l${i}`).join("\n");
    expect(convertFieldValue("text", lines(), many, ctx).ok).toBe(false);
    const two = def({
      type: "repeater",
      fields: [
        { key: "line", type: "text", labels: L },
        { key: "n", type: "number", labels: L },
      ],
    });
    expect(convertFieldValue("text", two, "a", ctx).ok).toBe(false);
  });

  it("repeater → text: items joined by line breaks; other shapes do not convert", () => {
    const text = def({ type: "text", multiline: true });
    expect(convertFieldValue("repeater", text, [{ line: "a" }, { line: "b" }], ctx)).toEqual({
      ok: true,
      value: "a\nb",
    });
    expect(convertFieldValue("repeater", text, [{ line: "a", n: 2 }], ctx).ok).toBe(false);
    expect(convertFieldValue("repeater", text, [{ n: 2 }], ctx).ok).toBe(false);
  });

  it("reference (multiple) ↔ repeater with one reference sub-field", () => {
    expect(convertFieldValue("reference", people, [HALL, ROOM], ctx)).toEqual({
      ok: true,
      value: [{ person: HALL }, { person: ROOM }],
    });
    expect(convertFieldValue("repeater", ref(true), [{ person: HALL }], ctx)).toEqual({
      ok: true,
      value: [HALL],
    });
    expect(convertFieldValue("reference", lines(), [HALL], ctx).ok).toBe(false);
    expect(convertFieldValue("repeater", ref(true), [{ person: HALL, talk: "x" }], ctx).ok).toBe(
      false,
    );
  });
});

describe("RFC-0045 §7 sub-field markers", () => {
  const speakers = (migration: Record<string, unknown>, extra: Record<string, unknown>[] = []) =>
    def({
      key: "speakers",
      type: "repeater",
      fields: [
        { key: "fullName", type: "text", labels: L },
        { key: "seats", type: "number", labels: L },
        ...extra,
      ],
      migration: { id: "snap_01HZX8K3Q9OP", ...migration },
    });
  const rewrite = (d: FieldDefinition, values: Record<string, unknown>, onInvalid?: "clear") =>
    rewriteFields({ def: d, values, convert: ctx, translation: false, pristine: true, onInvalid });

  it("rename: the sub-key moves in every item; the field keeps its key", () => {
    const d = speakers({ sub: "fullName", fromKey: "name" });
    const r = rewrite(d, { speakers: [{ name: "Ada", seats: 2 }, { seats: 3 }], other: 1 });
    expect(r.values).toEqual({ speakers: [{ fullName: "Ada", seats: 2 }, { seats: 3 }], other: 1 });
    expect(r.change?.kind).toBe("moved");
    // readers see the end state already
    const site = { collections: { events: { fields: [d] } } } as never;
    const resolved = resolveFields(site, {
      id: "entry_EVENT00001",
      collection: "events",
      fields: { speakers: [{ name: "Ada" }] },
    });
    expect(resolved.speakers?.value).toEqual([{ fullName: "Ada" }]);
  });

  it("retype: each item's sub-value converts; unconvertible refuses unless cleared", () => {
    const d = speakers({ sub: "seats", fromType: "text" });
    const ok = rewrite(d, { speakers: [{ fullName: "A", seats: "12" }] });
    expect(ok.values).toEqual({ speakers: [{ fullName: "A", seats: 12 }] });
    const bad = rewrite(d, { speakers: [{ fullName: "A", seats: "lots" }] });
    expect(bad).toMatchObject({ values: undefined, change: { kind: "unconvertible" } });
    // clear drops the sub-value; an item left empty goes, and an emptied list is no value
    const cleared = rewrite(
      d,
      { speakers: [{ fullName: "A", seats: "x" }, { seats: "y" }] },
      "clear",
    );
    expect(cleared.values).toEqual({ speakers: [{ fullName: "A" }] });
    expect(cleared.change?.kind).toBe("cleared");
    expect(rewrite(d, { speakers: [{ seats: "y" }] }, "clear").values).toEqual({});
  });

  it("text → reference inside items reads the maps; a person's write converges", () => {
    const d = speakers({ sub: "host", fromType: "text" }, [
      { key: "host", type: "reference", labels: L, collections: ["places"] },
    ]);
    const values = { speakers: [{ fullName: "A", host: "main hall" }] };
    expect(rewrite(d, values).values).toEqual({ speakers: [{ fullName: "A", host: HALL }] });
    expect(normalizeThroughMarkers([d], values, { convert: ctx, translation: false })).toEqual({
      speakers: [{ fullName: "A", host: HALL }],
    });
  });

  it("remove: the sub-value goes from every item, empty items are dropped, the field stays", () => {
    const d = speakers({ sub: "seats" });
    const r = rewrite(d, { speakers: [{ fullName: "A", seats: 1 }, { seats: 2 }] });
    expect(r.values).toEqual({ speakers: [{ fullName: "A" }] });
    expect(r.change?.kind).toBe("removed");
    expect(rewrite(d, { speakers: [{ seats: 2 }] }).values).toEqual({});
    const site = { collections: { events: { fields: [d] } } } as never;
    const resolved = resolveFields(site, {
      id: "entry_EVENT00001",
      collection: "events",
      fields: { speakers: [{ fullName: "A", seats: 1 }] },
    });
    expect(resolved.speakers?.value).toEqual([{ fullName: "A" }]);
  });
});

describe("RFC-0045 §7 review round (PR #214)", () => {
  it("reference → text: an archived target lends its title; without a default-locale member, a fixed fallback", () => {
    const maps = conversionEntries(
      [
        member("entry_GONE000001", { title: "Gone", status: "archived" }),
        // no English member: the original's title, whatever the order
        member("entry_TRONLY0001", {
          locale: "tr",
          title: "Ana",
          translation: { group: "entry_TRONLY0001" } as never,
        }),
        member("entry_TRONLY0002", {
          locale: "de",
          title: "Haupt",
          translation: { group: "entry_TRONLY0001" } as never,
        }),
        // no original either: the lowest locale
        member("entry_ORPHAN0002", {
          locale: "tr",
          title: "Yetim",
          translation: { group: "entry_ORPHAN0001" } as never,
        }),
        member("entry_ORPHAN0003", {
          locale: "de",
          title: "Waise",
          translation: { group: "entry_ORPHAN0001" } as never,
        }),
      ],
      "en",
    );
    const reversed = conversionEntries(
      [
        ...[
          member("entry_ORPHAN0003", {
            locale: "de",
            title: "Waise",
            translation: { group: "entry_ORPHAN0001" } as never,
          }),
          member("entry_ORPHAN0002", {
            locale: "tr",
            title: "Yetim",
            translation: { group: "entry_ORPHAN0001" } as never,
          }),
        ],
      ],
      "en",
    );
    const text = def({ type: "text" });
    const c = { timeZone: "UTC", defaultLocale: "en", entries: maps };
    expect(convertFieldValue("reference", text, "entry_GONE000001", c)).toEqual({
      ok: true,
      value: "Gone",
    });
    expect(convertFieldValue("reference", text, "entry_TRONLY0001", c)).toEqual({
      ok: true,
      value: "Ana",
    });
    expect(convertFieldValue("reference", text, "entry_ORPHAN0001", c)).toEqual({
      ok: true,
      value: "Waise",
    });
    expect(reversed.titles.get("entry_ORPHAN0001")).toBe("Waise");
    // archived members still match no text
    expect(convertFieldValue("text", ref(), "Gone", c).ok).toBe(false);
  });

  it("a value already in the new type converts to itself; a repeater's repeated ids collapse", () => {
    // a usable target id written under the reference definition stays, never the entry's own group
    expect(convertFieldValue("text", ref(), HALL, ctx)).toEqual({ ok: true, value: HALL });
    expect(convertFieldValue("text", ref(), HALL, { ...ctx, group: HALL }).ok).toBe(false);
    expect(convertFieldValue("text", ref(), "entry_Zz9xQ1AB", ctx).ok).toBe(false);
    // plain text written under the text definition stays
    expect(convertFieldValue("reference", def({ type: "text" }), "Main Hall", ctx)).toEqual({
      ok: true,
      value: "Main Hall",
    });
    expect(
      convertFieldValue(
        "repeater",
        ref(true),
        [{ person: HALL }, { person: ROOM }, { person: HALL }],
        ctx,
      ),
    ).toEqual({ ok: true, value: [HALL, ROOM] });
  });

  it("readers never keep an unconverted string that happens to fit (text ↔ reference)", () => {
    const venue = def({
      key: "venue",
      type: "reference",
      collections: ["places"],
      migration: { id: "snap_01HZX8K3Q9OP", fromType: "text" },
    });
    const site = { collections: { events: { fields: [venue] } } } as never;
    const read = (v: string) =>
      resolveFields(
        site,
        { id: "entry_EVENT00001", collection: "events", fields: { venue: v } },
        undefined,
        {
          entries,
        },
      ).venue;
    expect(read("Main Hall")?.value).toBe(HALL);
    expect(read("entry_Zz9xQ1AB")).toMatchObject({
      value: undefined,
      issue: { code: "field_value_unreadable" },
    });
    const rewrite = rewriteFields({
      def: venue,
      values: { venue: "entry_Zz9xQ1AB" },
      convert: ctx,
      translation: false,
      pristine: false,
    });
    expect(rewrite.change?.kind).toBe("unconvertible");
  });
});

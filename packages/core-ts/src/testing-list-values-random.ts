/**
 * RFC-0042 §4, #110: the random sites, values and queries of the list-value property suite
 * (`testing-list-values-query.ts`). Seeded (`mulberry32`); values aim at the encodings' edges:
 * -0, subnormal and extreme doubles, `0.1 + 0.2`, days around today in the site's zone, instants
 * around `now` (with milliseconds and offsets), empty and whitespace strings, combining marks,
 * astral and private-use characters, a lone surrogate, strings of 100 and 101 units, duplicates
 * (so `eq` and ties hit), and empty multiple selects.
 */
import type {
  CollectionSettings,
  ContentEntry,
  FieldCondition,
  FieldDefinition,
  FieldOption,
  FieldOrder,
  Site,
} from "@cloudhal/core-contracts";
import type { FieldEntryListQuery } from "./entry-query.ts";
import { dayIn } from "./fields/conversions.ts";
import { canOrderBy, FIELD_QUERY_OPS } from "./fields/index.ts";

export type Gen = () => number;

/** The suite's state for one seed. */
export interface World {
  readonly seed: number;
  site: Site;
  slugs: number;
  readonly image: string;
  readonly now: number;
}

/** A seeded uniform generator in [0, 1) (as `packages/schedules/test/oracle.test.ts`). */
export function mulberry32(seed: number): Gen {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(g: Gen, xs: readonly T[]): T => xs[Math.floor(g() * xs.length)] as T;

function shuffle<T>(g: Gen, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(g() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const L = (label: string) => ({ en: { label } });
const OPTIONS: [FieldOption, ...FieldOption[]] = [
  { value: "a", labels: { en: "A" } },
  { value: "b", labels: { en: "B" } },
  { value: "c", labels: { en: "C" } },
  { value: "d", labels: { en: "D" } },
];
const NUMBERS = [
  0,
  -0,
  1,
  -1,
  2.5,
  0.1 + 0.2,
  0.3,
  1e-300,
  5e-324,
  1.7976931348623157e308,
  -1.7976931348623157e308,
  10,
  10,
  10,
  42,
  2 ** 53,
  1e20,
  7,
  7,
];
const TEXTS = [
  "",
  " ",
  "a",
  "A",
  "é",
  "é",
  "😀",
  "𝒜",
  "Ａ",
  "Hall",
  "hall",
  "Hall",
  "",
  "￿",
  "\uD800x",
  "x".repeat(100),
  "x".repeat(101),
];
const URLS = [
  "https://a.example/x",
  "https://a.example/X",
  "/path",
  "#frag",
  "mailto:a@b.example",
  `https://a.example/${"y".repeat(100)}`,
];
const RICH = ["", " ", "**bold**", "Text"];
const ZONES = ["Europe/Istanbul", "UTC", "Asia/Tokyo"];
const DECIMAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const HOUR = 3_600_000;

/** Every type once (two selects), each localized or not at random. */
function pool(g: Gen): FieldDefinition[] {
  const loc = () => g() < 0.5;
  return [
    { key: "n", type: "number", labels: L("N"), localized: loc() },
    { key: "d", type: "date", labels: L("D"), localized: loc() },
    { key: "dt", type: "datetime", labels: L("Dt"), localized: loc() },
    { key: "b", type: "boolean", labels: L("B"), localized: loc() },
    { key: "s", type: "select", labels: L("S"), localized: loc(), options: OPTIONS.slice(0, 3) },
    {
      key: "m",
      type: "select",
      labels: L("M"),
      localized: loc(),
      options: OPTIONS,
      multiple: true,
    },
    { key: "t", type: "text", labels: L("T"), localized: loc() },
    { key: "u", type: "url", labels: L("U"), localized: loc() },
    { key: "r", type: "richText", labels: L("R"), localized: loc() },
    { key: "i", type: "image", labels: L("I"), localized: loc() },
  ] as FieldDefinition[];
}

/** A later settings change: bounds that make stored values unreadable, or lift them again. */
function reshapeDef(g: Gen, def: FieldDefinition): FieldDefinition {
  if (g() < 0.5) return def;
  if (def.type === "number") {
    const { maximum, ...rest } = def;
    return maximum === undefined ? { ...def, maximum: 10 } : rest;
  }
  if (def.type === "text") {
    const { maxLength, ...rest } = def;
    return maxLength === undefined ? { ...def, maxLength: 5 } : rest;
  }
  return def;
}

/** `events` and `talks`: four random list fields and a random sort (new, or reshaped). */
export function randomCollections(
  g: Gen,
  _world: World,
  existing: Readonly<Record<string, CollectionSettings | undefined>>,
): Record<string, CollectionSettings> {
  const out: Record<string, CollectionSettings> = {};
  for (const c of ["events", "talks"]) {
    const prev = existing[c];
    const fields = prev?.fields ? prev.fields.map((d) => reshapeDef(g, d)) : pool(g);
    const keep = prev?.listFields && g() < 0.5;
    const listFields = keep
      ? prev.listFields
      : shuffle(
          g,
          fields.map((f) => f.key),
        ).slice(0, 4);
    const sort = pick(g, ["newest", "oldest", "title", undefined] as const);
    out[c] = { fields, listFields, ...(sort ? { sort } : {}) } as CollectionSettings;
  }
  return out;
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 24 * HOUR).toISOString().slice(0, 10);

const today = (world: World) =>
  dayIn(new Date(world.now).toISOString(), world.site.timeZone ?? "UTC");

function randomValue(g: Gen, world: World, def: FieldDefinition): unknown {
  switch (def.type) {
    case "number":
      return pick(
        g,
        NUMBERS.filter((x) => def.maximum === undefined || x <= def.maximum),
      );
    case "date":
      return g() < 0.15 ? "2026-01-01" : addDays(today(world), Math.floor(g() * 5) - 2);
    case "datetime": {
      const ms = world.now + (Math.floor(g() * 9) - 4) * (HOUR / 2) + (g() < 0.2 ? 1 : 0);
      return { at: new Date(ms).toISOString(), timeZone: pick(g, ZONES) };
    }
    case "boolean":
      return g() < 0.5;
    case "select":
      if (!def.multiple) return pick(g, def.options).value;
      return def.options.filter(() => g() < 0.4).map((o) => o.value);
    case "text":
      return pick(
        g,
        TEXTS.filter((t) => def.maxLength === undefined || t.length <= def.maxLength),
      );
    case "url":
      return pick(g, URLS);
    case "richText":
      return pick(g, RICH);
    default:
      return world.image;
  }
}

/**
 * Random values for a collection's fields, each absent with probability `absent`; a translation
 * holds only localized ones (the others are its original's).
 */
export function randomFields(
  g: Gen,
  world: World,
  collection: string,
  options: { absent?: number; translation?: boolean } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of world.site.collections?.[collection]?.fields ?? []) {
    if (g() < (options.absent ?? 0.25) || (def.type === "image" && !world.image)) continue;
    if (options.translation && !def.localized) continue;
    out[def.key] = randomValue(g, world, def);
  }
  return out;
}

/** Strings a condition on `def` may compare with: stored values (so `eq` hits) and edges. */
function operands(g: Gen, world: World, def: FieldDefinition, seen: unknown[]): string[] {
  const strings = seen.filter((v): v is string => typeof v === "string");
  switch (def.type) {
    case "number":
      return [
        ...seen.filter((v) => typeof v === "number").map(String),
        ...["0", "-0", "1", "-1", "2.5", "0.3", "0.30000000000000004", "7", "10", "42"],
        ...["9007199254740992", "100000000000000000000"],
      ].filter((s) => DECIMAL.test(s));
    case "date":
      return [...strings, "now", addDays(today(world), 1), addDays(today(world), -1)];
    case "datetime": {
      const ats = seen.map((v) => (v as { at?: string }).at).filter((s) => s !== undefined);
      const shifted = ats.map((at) =>
        new Date(Date.parse(at) + 3 * HOUR).toISOString().replace("Z", "+03:00"),
      );
      return [...ats, ...shifted, "now"];
    }
    case "boolean":
      return ["true", "false"];
    case "select":
      return def.options.map((o) => o.value);
    default:
      return [...strings, "a", "Hall", "x".repeat(100), "\uD800x", pick(g, URLS)].filter(
        (s) => s.length >= 1 && s.length <= 100,
      );
  }
}

function condition(g: Gen, world: World, def: FieldDefinition, seen: unknown[]): FieldCondition {
  const op = pick(g, FIELD_QUERY_OPS[def.type]);
  if (op === "set" || op === "unset") return { field: def.key, op };
  const choices = operands(g, world, def, seen);
  if (op === "in") {
    const values = [...new Set(shuffle(g, choices).slice(0, 1 + Math.floor(g() * 3)))];
    return { field: def.key, op, values } as FieldCondition;
  }
  return { field: def.key, op, value: pick(g, choices) } as FieldCondition;
}

const PAGE = [1, 2, 3, 5, 10, 20, 100];

/** A random valid query on one of the collections (`entries`: the site's, for operands). */
export function randomQuery(
  g: Gen,
  world: World,
  entries: readonly ContentEntry[],
): FieldEntryListQuery & { collection: string } {
  const collection = pick(g, ["events", "talks"]);
  const settings = world.site.collections?.[collection];
  const defs = new Map((settings?.fields ?? []).map((d) => [d.key, d]));
  const keys = (settings?.listFields ?? []).filter((k) => defs.has(k));
  const seenOf = (k: string) => entries.map((e) => e.fields?.[k]).filter((v) => v !== undefined);
  const count = pick(g, [0, 1, 1, 1, 2, 2, 3, 4]);
  const where = Array.from({ length: count }, () => {
    const def = defs.get(pick(g, keys)) as FieldDefinition;
    return condition(g, world, def, seenOf(def.key));
  });
  const orderable = keys.filter((k) => canOrderBy((defs.get(k) as FieldDefinition).type));
  const orderBy: FieldOrder | undefined =
    orderable.length > 0 && g() < 0.6
      ? { field: pick(g, orderable), direction: pick(g, ["asc", "desc"] as const) }
      : undefined;
  const status = g() < 0.25 ? (["draft", "review", "published", "archived"] as const) : undefined;
  return {
    collection,
    now: world.now,
    ...(count > 0 || !orderBy || g() < 0.5 ? { where } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(status ? { status: status.filter(() => g() < 0.6) } : {}),
    ...(g() < 0.25 ? { locale: pick(g, ["en", "tr", "de"]) } : {}),
    ...(g() < 0.6 ? { limit: pick(g, PAGE) } : {}),
    ...(g() < 0.4 ? { offset: Math.floor(g() * (entries.length / 2 + 5)) } : {}),
  };
}

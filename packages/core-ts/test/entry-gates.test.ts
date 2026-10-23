/**
 * RFC-0042 §3–§4 on the read side and at the writers: what a derived gate does to an entry
 * (`entryVisibility`), the instants a gate index adds (`derivedGates`, `listFieldInstants`), search
 * rows' `gateUntil`, the auto-publish classification (`advancesDerivedGate`, `expiringEntries`) and
 * the writer guard (`gates: 2` before `expiry`, store and bundle import).
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED, type GateSupport } from "../src/availability.ts";
import { expiringEntries } from "../src/expiring-entries.ts";
import {
  derivedGate,
  derivedGates,
  entryVisibility,
  hasExpiryRules,
  listFieldInstants,
} from "../src/fields/index.ts";
import { advancesDerivedGate, SiteGraphStore, searchRowOf, seedStarterSite } from "../src/index.ts";
import { exportSite, importSite } from "../src/sync.ts";

const L = { en: { label: "x" } };
const FIELDS: FieldDefinition[] = [
  { key: "endsAt", type: "datetime", labels: L, localized: false },
  { key: "day", type: "date", labels: L, localized: false },
  { key: "price", type: "number", labels: L, localized: false },
];
const site = (action: "unlist" | "hide" = "unlist", zone = "Europe/Istanbul") =>
  ({
    timeZone: zone,
    collections: {
      events: {
        fields: FIELDS,
        listFields: ["endsAt", "day"],
        expiry: { field: "endsAt", action },
      },
      offers: { fields: FIELDS, expiry: { field: "day", action: "hide", afterMinutes: 30 } },
    },
  }) as Pick<Site, "timeZone" | "collections">;

const entry = (id: string, collection: string, fields: object, extra: object = {}) =>
  ({
    id,
    collection,
    fields,
    status: "published",
    locale: "en",
    title: id,
    slug: id,
    body: { format: "markdown", value: "" },
    createdAt: "2026-11-01T00:00:00Z",
    ...extra,
  }) as unknown as ContentEntry;

const T = Date.UTC(2026, 10, 5, 12, 0, 0);

describe("derived gates (RFC-0042 §3)", () => {
  it("unlist and hide past the gate; availability still applies; no value, no gate", () => {
    const e = entry("e1", "events", { endsAt: { at: "2026-11-05T12:00:00Z", timeZone: "UTC" } });
    const unlist = derivedGate(site(), e);
    expect(unlist).toEqual({ at: T, action: "unlist" });
    expect(entryVisibility(e, unlist, T - 1)).toBe("shown");
    expect(entryVisibility(e, unlist, T)).toBe("unlisted");
    expect(entryVisibility(e, derivedGate(site("hide"), e), T)).toBe("hidden");
    // its own until is earlier: hidden, whatever the rule says
    const until = { ...e, availability: { until: "2026-11-05T11:00:00Z" } };
    expect(entryVisibility(until, unlist, T - 1)).toBe("hidden");
    expect(entryVisibility({ ...e, status: "draft" }, undefined, T)).toBe("hidden");
    expect(derivedGate(site(), entry("e2", "events", {}))).toBeUndefined();
    expect(derivedGate(site(), entry("e3", "posts", {}))).toBeUndefined();
    expect(hasExpiryRules({ collections: { posts: {} } })).toBe(false);
  });

  it("a date ends at the next day's start in the site's zone, plus the grace", () => {
    const offer = entry("o1", "offers", { day: "2026-11-05" });
    // Istanbul is UTC+3: 6 November 00:00 there is 5 November 21:00 UTC, +30 minutes
    expect(derivedGate(site(), offer)?.at).toBe(Date.UTC(2026, 10, 5, 21, 30));
    expect(derivedGate(site("unlist", "UTC"), offer)?.at).toBe(Date.UTC(2026, 10, 6, 0, 30));
  });

  it("a translation reads its original's non-localized date", () => {
    const original = entry("orig", "events", {
      endsAt: { at: "2026-11-05T12:00:00Z", timeZone: "UTC" },
    });
    const tr = entry("tr1", "events", {}, { locale: "tr", translation: { group: "orig" } });
    const gates = derivedGates(site(), [original, tr]);
    expect(gates.get("tr1")?.at).toBe(T);
    expect(derivedGates({ collections: {} }, [original, tr]).size).toBe(0);
  });

  it("list-field instants: a datetime's at (and +1 ms), a date's day starts in the zone", () => {
    const e = entry("e1", "events", {
      endsAt: { at: "2026-11-05T12:00:00Z", timeZone: "UTC" },
      day: "2026-11-07",
    });
    expect(listFieldInstants(site(), [e]).sort((a, b) => a - b)).toEqual([
      T,
      T + 1,
      Date.UTC(2026, 10, 6, 21),
      Date.UTC(2026, 10, 7, 21),
    ]);
    // `offers` has no list fields: nothing to track
    expect(listFieldInstants(site(), [entry("o", "offers", { day: "2026-11-07" })])).toEqual([]);
  });

  it("search rows: gateUntil is the earlier of until and the derived gate", () => {
    const e = entry("e1", "events", { endsAt: { at: "2026-11-05T12:00:00Z", timeZone: "UTC" } });
    expect(searchRowOf(e, { site: site() })?.gateUntil).toBe("2026-11-05T12:00:00.000Z");
    const earlier = { ...e, availability: { until: "2026-11-05T10:00:00Z" } };
    expect(searchRowOf(earlier, { site: site() })?.gateUntil).toBe("2026-11-05T10:00:00.000Z");
    expect(searchRowOf(e, { site: { collections: {} } })?.gateUntil).toBeUndefined();
    expect(searchRowOf(e)?.gateUntil).toBeUndefined();
  });

  it("advancesDerivedGate: added or earlier only", () => {
    const s = site();
    const at = (iso: string) => entry("e", "events", { endsAt: { at: iso, timeZone: "UTC" } });
    const side = (e: ContentEntry) => ({ site: s, entry: e });
    const none = entry("e", "events", {});
    expect(advancesDerivedGate(side(none), side(at("2026-11-05T12:00:00Z")))).toBe(true);
    expect(
      advancesDerivedGate(side(at("2026-11-06T12:00:00Z")), side(at("2026-11-05T12:00:00Z"))),
    ).toBe(true);
    expect(
      advancesDerivedGate(side(at("2026-11-05T12:00:00Z")), side(at("2026-11-06T12:00:00Z"))),
    ).toBe(false);
    expect(advancesDerivedGate(side(at("2026-11-05T12:00:00Z")), side(none))).toBe(false);
  });
});

async function open(gates?: GateSupport) {
  const store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
    ...(gates ? { gates } : {}),
  });
  await store.init();
  return store;
}

const events = {
  labels: { en: { singular: "Event", plural: "Events" } },
  fields: FIELDS,
  expiry: { field: "endsAt", action: "unlist" as const },
};

describe("the writer guard (RFC-0042 §3.6)", () => {
  it("refuses expiry until the renderer reports gates 2; availability needs only 1", async () => {
    const asked: (number | undefined)[] = [];
    const gatesOne: GateSupport = {
      enforced: (_site, version) => {
        asked.push(version);
        return (version ?? 1) <= 1;
      },
    };
    const store = await open(gatesOne);
    const seeded = await seedStarterSite(store, { name: "Guard", slug: "guard" });
    await expect(
      store.updateSite({ ...seeded, collections: { ...seeded.collections, events } }),
    ).rejects.toMatchObject({ code: "gates_unsupported" });
    expect(asked).toContain(2);
    // other collection settings save; removing an expiry is always allowed
    const plain = await store.updateSite({
      ...seeded,
      collections: { ...seeded.collections, events: { ...events, expiry: undefined } },
    });
    expect(plain.collections?.events?.expiry).toBeUndefined();
    const enforced = await open(GATES_ENFORCED);
    const s2 = await seedStarterSite(enforced, { name: "Ok", slug: "ok" });
    const saved = await enforced.updateSite({ ...s2, collections: { ...s2.collections, events } });
    expect(saved.collections?.events?.expiry).toEqual(events.expiry);
    // an unchanged rule is not asked again: other edits save after the renderer went back to 1
    let version = 2;
    const flipping = await open({ enforced: (_s, v) => (v ?? 1) <= version });
    const s3 = await seedStarterSite(flipping, { name: "Same", slug: "same" });
    const withRule = await flipping.updateSite({
      ...s3,
      collections: { ...s3.collections, events },
    });
    version = 1;
    expect((await flipping.updateSite({ ...withRule, name: "Renamed" })).name).toBe("Renamed");
    await expect(
      flipping.updateSite({
        ...(await flipping.getSite(s3.id)),
        collections: {
          ...s3.collections,
          events: { ...events, expiry: { field: "endsAt", action: "hide" } },
        },
      } as Site),
    ).rejects.toMatchObject({ code: "gates_unsupported" });
  });
});

describe("bundle imports and expiry (RFC-0042 §3.6)", () => {
  it("imports a site with an expiry only where the renderer reports gates 2", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs, gates: GATES_ENFORCED });
    await store.init();
    const seeded = await seedStarterSite(store, { name: "Bundle", slug: "bundle" });
    await store.updateSite({ ...seeded, collections: { ...seeded.collections, events } });
    const bundle = await exportSite({ sql, blobs }, seeded.id);
    const asked: (number | undefined)[] = [];
    await expect(
      importSite({ sql, blobs }, bundle, {
        gates: {
          enforced: (_s, v) => {
            asked.push(v);
            return (v ?? 1) <= 1;
          },
        },
      }),
    ).rejects.toMatchObject({ code: "gates_unsupported" });
    expect(asked).toEqual([2]);
    const result = await importSite({ sql, blobs }, bundle, { gates: GATES_ENFORCED });
    expect(result.nodes.unchanged).toBe(true);
  });
});

describe("expiringEntries (RFC-0042 §3.5)", () => {
  it("finds live entries whose pending version adds or advances a derived gate", async () => {
    const store = await open(GATES_ENFORCED);
    const seeded = await seedStarterSite(store, { name: "Expiring", slug: "expiring" });
    const site = await store.updateSite({
      ...seeded,
      collections: { ...seeded.collections, events },
    });
    const [hello] = await store.listContentEntries(site.id, "posts");
    const author = { kind: "human" as const, id: "user_01HZX8K3Q9CD", name: "Halil" };
    const make = (slug: string, fields: object) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "events",
        slug,
        locale: "en",
        status: "published",
        title: slug,
        body: { format: "markdown", value: "x" },
        fields,
        tags: [],
        ...(hello?.terms ? { terms: hello.terms } : {}),
        author,
      } as never);
    const dated = await make("dated", { endsAt: { at: "2026-12-01T00:00:00Z", timeZone: "UTC" } });
    const undated = await make("undated", {});
    const later = await make("later", { endsAt: { at: "2026-12-01T00:00:00Z", timeZone: "UTC" } });
    const snap = await store.createSnapshot(site.id, { actor: author, reason: "publish" });
    await store.publish((await store.getSite(site.id)) as Site, snap.id);
    expect(await expiringEntries(store, site.id, await store.pendingChanges(site.id))).toEqual(
      new Set(),
    );
    const at = (iso: string) => ({ endsAt: { at: iso, timeZone: "UTC" } });
    await store.updateContentEntry({ ...dated, fields: at("2026-11-20T00:00:00Z") });
    await store.updateContentEntry({ ...undated, fields: at("2026-12-20T00:00:00Z") });
    await store.updateContentEntry({ ...later, fields: at("2027-01-01T00:00:00Z") });
    expect(await expiringEntries(store, site.id, await store.pendingChanges(site.id))).toEqual(
      new Set([dated.id, undated.id]),
    );
  });
});

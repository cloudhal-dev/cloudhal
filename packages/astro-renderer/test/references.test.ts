/**
 * RFC-0045 step 3 (§4): reference cards and repeater items in `entryFields`, gated per view;
 * `groupMembers` and `referencedBy` on both sources, identical on a snapshot of the working copy
 * (edition chains and localized values held by translations included, no field-operation marker
 * active); gate instants; depth, cycles and the per-request budget.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { entryFields, type FieldsSource, type RenderedFields } from "../src/fields.ts";
import { linkLocalizer, localizeLinks } from "../src/locales.ts";
import { placeholderBudget } from "../src/media.ts";
import { conversionMaps } from "../src/reference-conversions.ts";
import { LiveSource, SnapshotSource } from "../src/source.ts";
import { HOUR, type RefsWorld, refsWorld, T } from "./references-fixture.ts";

const system = { kind: "system" as const, id: "sys_test0001" };

/** Card titles per field (and per item for repeaters), the shape a theme reads. */
function shown(fields: RenderedFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(fields)) {
    if (f.empty) continue;
    if (f.references) out[k] = f.references.map((c) => c.title);
    else if (f.items) out[k] = f.items.map(shown);
    else out[k] = f.text;
  }
  return out;
}

async function snapshotOf(w: RefsWorld, site: Site): Promise<SnapshotSource> {
  const snap = await w.store.createSnapshot(site.id, { actor: system, reason: "manual" });
  return (await SnapshotSource.open(w.store, snap.id)).at(T);
}

describe("reference cards (RFC-0045 §4)", () => {
  let w: RefsWorld;
  let snap: SnapshotSource;
  beforeAll(async () => {
    w = await refsWorld();
    snap = await snapshotOf(w, w.site);
  });
  afterEach(() => vi.restoreAllMocks());

  it("resolves cards at depth 1 and leaves nothing of unresolved targets", async () => {
    const { e } = w;
    const fields = await snap.entryFields(e.launch as ContentEntry);
    expect(shown(fields)).toEqual({
      venue: ["Title hall"],
      sponsor: ["Title ada"],
      speakers: [{ person: ["Title alan"], talk: "Keynote" }, { talk: "Hidden" }],
      related: ["Title meetup"],
    });
    expect(fields.venue?.references?.[0]).toEqual({
      groupId: e.hall?.id,
      id: e.hall?.id,
      collection: "places",
      locale: "en",
      slug: "hall",
      title: "Title hall",
      summary: "About hall",
      path: "/places/hall",
      url: "/places/hall",
      fromFallbackLocale: false,
    });
    expect(fields.venue?.text).toBe("Title hall");
    expect(fields.venue?.references?.[0]?.fields).toBeUndefined();
    // the draft speaker: no id, no title, no empty item, in anything a theme could print
    const wire = JSON.stringify(fields);
    for (const leak of [e.grace?.id, "Title grace", "grace"])
      expect(wire.includes(leak as string), leak).toBe(false);
    // archived and draft targets resolve to nothing
    expect((await snap.entryFields(e.night as ContentEntry)).venue?.empty).toBe(true);
    expect(JSON.stringify(await snap.entryFields(e.night as ContentEntry))).not.toContain(
      e.vault?.id,
    );
  });

  it("picks the page's locale, then the default locale only under default-with-notice", async () => {
    const { e } = w;
    const tr = await snap.entryFields(e.launchTr as ContentEntry);
    // venue and speakers are inherited (localized: false), sponsor is the translation's own
    expect(shown(tr)).toEqual({
      venue: ["Title salon"],
      speakers: [{ talk: "Keynote" }, { talk: "Hidden" }],
    });
    expect(tr.venue?.references?.[0]).toMatchObject({
      path: "/places/salon",
      url: "/tr/places/salon",
      locale: "tr",
    });
    const fb = await refsWorld({ fallback: "default-with-notice" });
    const fbSnap = await snapshotOf(fb, fb.site);
    const withFallback = await fbSnap.entryFields(fb.e.launchTr as ContentEntry);
    expect(shown(withFallback)).toEqual({
      venue: ["Title salon"],
      sponsor: ["Title alan"],
      speakers: [{ person: ["Title alan"], talk: "Keynote" }, { talk: "Hidden" }],
      related: ["Title meetup"],
    });
    expect(withFallback.sponsor?.references?.[0]).toMatchObject({
      fromFallbackLocale: true,
      locale: "en",
      path: "/people/alan",
      url: "/people/alan",
    });
  });

  it("opens and closes targets at their gate instants", async () => {
    const { e } = w;
    const base = await SnapshotSource.open(w.store, snap.snapshot.id);
    const at = async (now: number) =>
      shown(await base.at(now).entryFields(e.gig as ContentEntry)).venue;
    expect(await at(T + HOUR - 1)).toBeUndefined();
    expect(await at(T + HOUR)).toEqual(["Title cellar"]);
    expect(await at(T + HOUR + 1)).toEqual(["Title cellar"]);
    // the referrer's page expires at the target's instant (the gate index already holds it)
    expect(await base.at(T).nextGate()).toBe(T + HOUR);
    // previews ignore gates
    expect(shown(await base.ungated().entryFields(e.gig as ContentEntry)).venue).toEqual([
      "Title cellar",
    ]);
    expect(await base.at(T).groupMembers([e.cellar?.id as string])).toEqual(
      new Map([[e.cellar?.id, []]]),
    );
    expect(
      (await base.at(T + HOUR).referencedBy(e.launch?.id as string)).map((x) => x.slug),
    ).toEqual(["gig", "meetup"]);
  });

  it("depth 2 adds the members' own fields, one groupMembers call per level, cycles included", async () => {
    const { e } = w;
    const calls: string[][] = [];
    const counted: FieldsSource = {
      site: () => snap.site(),
      entryById: (id) => snap.entryById(id),
      asset: (id) => snap.asset(id),
      groupMembers: (ids) => {
        calls.push([...ids]);
        return snap.groupMembers(ids);
      },
    };
    const fields = await entryFields(counted, e.launch as ContentEntry, { depth: 2 });
    expect(calls).toHaveLength(2);
    const meetup = fields.related?.references?.[0];
    // launch → meetup → launch: the cycle ends in a card without fields
    expect(shown(meetup?.fields ?? {})).toEqual({
      venue: ["Title stage"],
      related: ["Title launch"],
    });
    expect(meetup?.fields?.related?.references?.[0]?.fields).toBeUndefined();
    const alan = fields.speakers?.items?.[0]?.person?.references?.[0];
    expect(shown(alan?.fields ?? {})).toEqual({ bio: "Machines", mentor: ["Title ada"] });
    // depth 1 is one call
    calls.length = 0;
    await entryFields(counted, e.launch as ContentEntry);
    expect(calls).toHaveLength(1);
  });

  it("spends one request budget across calls, then resolves nothing, with one warning", async () => {
    const { e } = w;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const budget = { ...placeholderBudget(), references: 3 };
    const first = await snap.entryFields(e.launch as ContentEntry, { media: { budget } });
    expect(shown(first)).toEqual({
      venue: ["Title hall"],
      sponsor: ["Title ada"],
      speakers: [{ person: ["Title alan"], talk: "Keynote" }, { talk: "Hidden" }],
    });
    const second = await snap.entryFields(e.meetup as ContentEntry, { media: { budget } });
    expect(shown(second)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(placeholderBudget().references).toBe(200);
  });

  it("resolves nothing through a source without groupMembers (older sources)", async () => {
    const { e } = w;
    const old: FieldsSource = { site: () => snap.site(), entryById: (id) => snap.entryById(id) };
    const fields = await entryFields(old, e.launch as ContentEntry);
    expect(shown(fields)).toEqual({ speakers: [{ talk: "Keynote" }, { talk: "Hidden" }] });
  });

  it("builds no conversion maps without a running conversion, and folds text when one runs", async () => {
    expect(await snap.conversionEntries("events")).toBeUndefined();
    const site = {
      ...(await snap.site()),
      collections: {
        ...w.site.collections,
        talks: {
          fields: [
            {
              key: "room",
              type: "reference",
              labels: { en: { label: "Room" } },
              localized: false,
              collections: ["places"],
              migration: { id: "fop_01HZX8K3Q9CD", fromType: "text" },
            },
          ],
        },
      },
    } as Site;
    const maps = await conversionMaps(site, "talks", () => [
      w.e.hall as ContentEntry,
      w.e.hallTr as ContentEntry,
      w.e.vault as ContentEntry,
      w.e.ada as ContentEntry,
    ]);
    expect(maps?.byText.get("title hall")).toEqual([w.e.hall?.id]);
    expect(maps?.byText.get("salon")).toEqual([w.e.hall?.id]);
    expect(maps?.byText.has("vault")).toBe(false);
    expect(maps?.byText.has("ada")).toBe(false);
    // narrowed to the conversion's collections, titles included
    expect(maps?.titles.get(w.e.hall?.id as string)).toBe("Title hall");
    expect(maps?.titles.has(w.e.ada?.id as string)).toBe(false);
  });
});

describe("live and snapshot sources agree (RFC-0045 §4, test plan)", () => {
  let w: RefsWorld;
  beforeAll(async () => {
    w = await refsWorld({ fallback: "default-with-notice" });
  });

  for (const which of ["site", "edition"] as const)
    it(`gives identical cards and referencedBy on a snapshot of the working copy (${which})`, async () => {
      const site = w[which];
      const snap = await snapshotOf(w, site);
      const live = new LiveSource(w.store, site.id, { includeDrafts: false, now: () => T });
      // no field-operation marker is active: both convert nothing
      const defs = Object.values(site.collections ?? {}).flatMap((c) => c?.fields ?? []);
      expect(defs.filter((d) => d.migration !== undefined)).toEqual([]);
      const entries = (await w.store.listContentEntries(site.id)).filter(
        (x) => x.status === "published",
      );
      for (const entry of entries)
        for (const locale of ["en", "tr", "de"])
          for (const depth of [1, 2] as const) {
            const a = await live.entryFields(entry, { locale, depth });
            const b = await snap.entryFields(entry, { locale, depth });
            expect(b, `${entry.slug} ${locale} depth ${depth}`).toEqual(a);
          }
      const groups = [...new Set(entries.map((x) => x.translation?.group ?? x.id))].concat(
        Object.values(w.e).map((x) => x.id),
      );
      const queries = [
        {},
        { locale: "tr" },
        { collection: "events" },
        { field: "speakers" },
        { field: "venue", limit: 1 },
      ];
      let nonEmpty = 0;
      for (const g of groups)
        for (const q of queries) {
          const a = (await live.referencedBy(g, q)).map((x) => x.id);
          const b = (await snap.referencedBy(g, q)).map((x) => x.id);
          expect(b, `${g} ${JSON.stringify(q)}`).toEqual(a);
          if (a.length > 0) nonEmpty++;
        }
      expect(nonEmpty).toBeGreaterThan(which === "site" ? 8 : 1);
      // members of a group in any order (one per locale): compare by id
      const ids = (m: Map<string, ContentEntry[]>) =>
        [...m].map(([g, list]) => [g, list.map((x) => x.id).sort()]);
      expect(ids(await snap.groupMembers(groups))).toEqual(ids(await live.groupMembers(groups)));
    });

  it("lists referrers by resolved values: inherited ones, own localized ones and edition chains", async () => {
    const { e } = w;
    const snap = await snapshotOf(w, w.site);
    const slugs = async (g: string | undefined, q = {}) =>
      (await snap.referencedBy(g as string, q)).map((x) => x.slug).sort();
    // the Turkish launch inherits venue and speakers; the draft party is not shown
    // senlik holds its own copy of venue and its original is hidden at T: its page shows hall
    expect(await slugs(e.hall?.id)).toEqual(["lansman", "launch", "senlik"]);
    expect(await slugs(e.hall?.id, { locale: "tr" })).toEqual(["lansman", "senlik"]);
    // sponsor is localized: the translation's own value names alan, the original's ada
    // konusma has no sponsor of its own and inherits talk's localized one (shared = 2)
    expect(await slugs(e.ada?.id)).toEqual(["alan", "konusma", "launch", "talk"]);
    expect(await slugs(e.alan?.id)).toEqual(["lansman", "launch"]);
    expect(await slugs(e.alan?.id, { field: "sponsor" })).toEqual(["lansman"]);
    // the edition: its member and the edition chain's translation each hold their own value
    const de = await snapshotOf(w, w.edition);
    expect((await de.referencedBy(e.hall?.id as string)).map((x) => x.slug).sort()).toEqual([
      "baslangic",
      "start",
    ]);
    expect(await de.referencedBy(e.ada?.id as string)).toEqual([]);
  });
});

describe("referencedBy follows what each page shows (RFC-0045 §4)", () => {
  it("lists a translation by its own values while its original is hidden, by the original's after", async () => {
    const w = await refsWorld();
    const { e } = w;
    const snapAt = async (now: number) => {
      const snap = await w.store.createSnapshot(w.site.id, { actor: system, reason: "manual" });
      return (await SnapshotSource.open(w.store, snap.id)).at(now);
    };
    for (const now of [T, T + HOUR]) {
      const snap = await snapAt(now);
      const live = new LiveSource(w.store, w.site.id, { includeDrafts: false, now: () => now });
      const page = shown(await snap.entryFields(e.festTr as ContentEntry, { locale: "tr" }));
      const hidden = now < T + HOUR;
      // the page: its own copy of venue while fest is hidden; fest's venue and sponsor once it
      // opens (stage has no Turkish member and the site has no fallback: no venue card then)
      expect(page.venue).toEqual(hidden ? ["Title salon"] : undefined);
      expect(page.sponsor).toBeUndefined();
      for (const source of [snap, live]) {
        const by = async (g: string | undefined) =>
          (await source.referencedBy(g as string)).map((x) => x.slug);
        const at = `${source.mode} at ${new Date(now).toISOString()}`;
        expect((await by(e.hall?.id)).includes("senlik"), at).toBe(hidden);
        expect((await by(e.stage?.id)).includes("senlik"), at).toBe(!hidden);
        expect((await by(e.stage?.id)).includes("fest"), at).toBe(!hidden);
        expect((await by(e.ada?.id)).includes("senlik"), at).toBe(!hidden);
      }
    }
  });

  it("orders ties by id, so both sources agree on order and on what limit keeps", async () => {
    const w = await refsWorld({ sameInstant: true });
    const snap = await snapshotOf(w, w.site);
    const live = new LiveSource(w.store, w.site.id, { includeDrafts: false, now: () => T });
    for (const g of [w.e.hall?.id, w.e.ada?.id, w.e.alan?.id] as string[]) {
      const all = (await snap.referencedBy(g)).map((x) => x.id);
      expect(all.length).toBeGreaterThan(1);
      // equal dates everywhere: the order is the ids'
      expect(all).toEqual([...all].sort());
      expect((await live.referencedBy(g)).map((x) => x.id)).toEqual(all);
      for (const limit of [1, 2])
        expect((await live.referencedBy(g, { limit })).map((x) => x.id)).toEqual(
          all.slice(0, limit),
        );
    }
  });
});

describe("reference links go through the locale middleware once (RFC-0045 §4)", () => {
  // what EntryFields.astro draws: each card's link by its path, repeater items' cards included
  const html = (fields: RenderedFields): string =>
    Object.values(fields)
      .map((f) =>
        f.items
          ? f.items.map(html).join("")
          : (f.references ?? []).map((c) => `<a href="${c.path}">${c.title}</a>`).join(""),
      )
      .join("");
  const hrefs = (out: string) => [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

  for (const routing of ["prefix-except-default", "prefix-all"] as const)
    it(`links the page's locale and the fallback once (${routing})`, async () => {
      const w = await refsWorld({ fallback: "default-with-notice", routing });
      const snap = await snapshotOf(w, w.site);
      const origin = "https://refs.example";
      const pre = routing === "prefix-all" ? "/en" : "";
      // a Turkish page: its own member (salon) and a fallback card (alan, en)
      const tr = await snap.entryFields(w.e.launchTr as ContentEntry, { locale: "tr" });
      const trLinks = await linkLocalizer(snap, "tr", origin);
      const trOut = trLinks ? localizeLinks(html(tr), trLinks) : html(tr);
      expect(hrefs(trOut)).toEqual([
        "/tr/places/salon",
        `${pre}/people/alan`,
        `${pre}/people/alan`,
        `${pre}/events/meetup`,
      ]);
      // a default-locale page
      const en = await snap.entryFields(w.e.launch as ContentEntry);
      const enLinks = await linkLocalizer(snap, "en", origin);
      const enOut = enLinks ? localizeLinks(html(en), enLinks) : html(en);
      expect(hrefs(enOut)[0]).toBe(`${pre}/places/hall`);
      for (const h of [...hrefs(trOut), ...hrefs(enOut)])
        expect(h, h).not.toMatch(/^\/(en|tr)\/(en|tr)\//);
    });
});

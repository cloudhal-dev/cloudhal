/**
 * RFC-0041 step 2 behavioural suite: typed custom fields in the store. Site writes check
 * definitions and refuse drops that would lose stored values; entry writes check changed values,
 * unknown keys, non-localized copies on translations, `requiredToPublish`, the size cap and image
 * assets (with `asset_refs`); searchable fields reach the search index on publish. Called by
 * `describeSiteGraphStore`, so it runs on every storage backend (sqlite, Miniflare D1, DO SQLite).
 */
import type {
  Actor,
  ContentEntry,
  FieldDefinition,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "./errors.ts";
import { makeJpeg, text } from "./media/fixtures.ts";
import type { SiteGraphStore } from "./store.ts";
import { exportSite, importSite } from "./sync.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  {
    key: "venue",
    type: "text",
    labels: L("Venue"),
    localized: true,
    requiredToPublish: true,
    maxLength: 40,
    searchable: true,
  },
  { key: "notes", type: "text", labels: L("Notes"), localized: true },
  { key: "price", type: "number", labels: L("Price"), localized: false, minimum: 0 },
  {
    key: "startsAt",
    type: "datetime",
    labels: L("Starts"),
    localized: false,
    requiredToPublish: true,
  },
  { key: "poster", type: "image", labels: L("Poster"), localized: false },
  { key: "agenda", type: "richText", labels: L("Agenda"), localized: true },
  {
    key: "format",
    type: "select",
    labels: L("Format"),
    localized: false,
    multiple: true,
    options: [
      { value: "talk", labels: { en: "Talk" } },
      { value: "workshop", labels: { en: "Workshop" } },
      { value: "panel", labels: { en: "Panel" } },
    ],
  },
  {
    key: "level",
    type: "select",
    labels: L("Level"),
    localized: false,
    options: [
      { value: "beginner", labels: { en: "Beginner" } },
      { value: "expert", labels: { en: "Expert" } },
    ],
  },
];

const STARTS = { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" };

interface Refusal {
  code: string;
  issues: { path: string; code: string }[];
}

async function refusal(p: Promise<unknown>): Promise<Refusal> {
  try {
    await p;
  } catch (e) {
    if (!(e instanceof InvariantError)) throw e;
    return { code: e.code, issues: (e.details.issues ?? []) as Refusal["issues"] };
  }
  throw new Error("expected a rejection");
}

export function fieldsSuite(ctx: SuiteContext): void {
  describe("RFC-0041 typed custom fields in the store", () => {
    let n = 0;
    const store = (): SiteGraphStore => ctx.store();

    async function setup(fields: FieldDefinition[] | null = FIELDS): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Fields",
        slug: `fields-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Fields",
        slug: `fields-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: {
          events: {
            labels: { en: { singular: "Event", plural: "Events" } },
            ...(fields ? { fields: fields as [FieldDefinition, ...FieldDefinition[]] } : {}),
          },
        },
      });
    }
    const fresh = async (site: Site) => (await store().getSite(site.id)) as Site;
    const entry = (site: Site, extra: Partial<ContentEntry> = {}) =>
      store().createContentEntry({
        siteId: site.id,
        collection: "events",
        slug: `e-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: "Launch",
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...extra,
      } as never);
    const withFields = async (site: Site, fields: FieldDefinition[] | undefined) => {
      const s = await fresh(site);
      const events = { ...s.collections?.events, fields } as never;
      return store().updateSite({ ...s, collections: { ...s.collections, events } });
    };
    const upload = (site: Site, bytes = makeJpeg({ width: 40, height: 30 }), name = "p.jpg") =>
      store().ingestAsset({
        siteId: site.id,
        bytes,
        filename: name,
        uploadedBy: person,
        source: { kind: "upload" },
      });
    const refsOf = async (nodeId: string) =>
      (
        await ctx
          .sql()
          .all<{ asset_id: string; field: string }>(
            "SELECT asset_id, field FROM asset_refs WHERE node_id = ? ORDER BY field",
            [nodeId],
          )
      ).map((r) => `${r.field}=${r.asset_id}`);

    it("collections without definitions keep fields as any JSON, nulls included", async () => {
      const site = await setup(null);
      const loose = { anything: { nested: [1, null] }, gone: null, "kebab-key": true };
      const e = await entry(site, { fields: loose, status: "published" });
      expect(e.fields).toEqual(loose);
      const again = await store().updateContentEntry({ ...e, fields: { other: 1 } });
      expect(again.fields).toEqual({ other: 1 });
      expect(await refsOf(e.id)).toEqual([]);
    });

    it("site writes check definitions: reserved and duplicate keys, bounds, caps", async () => {
      const site = await setup(null);
      const text = (key: string): FieldDefinition => ({
        key,
        type: "text",
        labels: L(key),
        localized: true,
      });
      const reserved = await refusal(withFields(site, [text("title")]));
      expect(reserved.code).toBe("field_key_reserved");
      expect(reserved.issues[0]?.path).toBe("collections/events/fields/0/key");
      expect((await refusal(withFields(site, [text("a"), text("a")]))).code).toBe(
        "field_key_duplicate",
      );
      const bounds = await refusal(
        withFields(site, [
          { key: "n", type: "number", labels: L("n"), localized: false, minimum: 5, maximum: 1 },
        ]),
      );
      expect(bounds.code).toBe("field_bounds");
      // A dry run runs the same checks and writes nothing.
      const s = await fresh(site);
      const dry = store().updateSite(
        {
          ...s,
          collections: { events: { ...s.collections?.events, fields: [text("title")] } as never },
        },
        { dryRun: true },
      );
      expect((await refusal(dry)).code).toBe("field_key_reserved");
      expect((await fresh(site)).rev).toBe(s.rev);
      // A new site is checked too.
      const project = await store().createProject({
        name: "x",
        slug: "fields-new",
        ownerId: person.id,
        siteIds: [],
      });
      const created = store().createSite({
        projectId: project.id,
        name: "x",
        slug: "fields-new",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { events: { fields: [text("slug")] } as never },
      });
      expect((await refusal(created)).code).toBe("field_key_reserved");
    });

    it("type, localization and multiple changes need an operation, values or not", async () => {
      const site = await setup();
      const swap = (i: number, over: Record<string, unknown>) =>
        withFields(
          site,
          FIELDS.map((d, j) => (j === i ? ({ ...d, ...over } as FieldDefinition) : d)),
        );
      const type = await refusal(swap(1, { type: "richText" }));
      expect(type.code).toBe("field_change_needs_operation");
      expect(type.issues[0]?.path).toBe("collections/events/fields/notes");
      expect((await refusal(swap(1, { localized: false }))).code).toBe(
        "field_change_needs_operation",
      );
      expect((await refusal(swap(6, { multiple: false }))).code).toBe(
        "field_change_needs_operation",
      );
      // Free edits: labels, order, maxLength, searchable, requiredToPublish, new options.
      const edited = await withFields(site, [
        { ...FIELDS[1], labels: L("Remarks") } as FieldDefinition,
        { ...FIELDS[0], maxLength: 10, searchable: false, requiredToPublish: false } as never,
        ...FIELDS.slice(2),
      ]);
      expect(edited.collections?.events?.fields?.[0]?.key).toBe("notes");
    });

    it("dropping a key or an option is refused only while an entry holds it", async () => {
      const site = await setup();
      const without = (key: string) => FIELDS.filter((d) => d.key !== key);
      // Nothing stored yet: both drops are plain edits.
      await withFields(site, without("notes"));
      await withFields(site, FIELDS);
      await entry(site, {
        fields: { notes: "keep me", format: ["talk", "panel"], level: "expert" },
      });
      const dropped = await refusal(withFields(site, without("notes")));
      expect(dropped.code).toBe("field_change_needs_operation");
      expect(dropped.issues[0]?.path).toBe("collections/events/fields/notes");
      const options = (key: string, keep: string[]) =>
        FIELDS.map((d) =>
          d.key === key && d.type === "select"
            ? { ...d, options: d.options.filter((o) => keep.includes(o.value)) }
            : d,
        ) as FieldDefinition[];
      // A multiple select (list) and a single one (string), both read by json_each.
      expect((await refusal(withFields(site, options("format", ["talk", "workshop"])))).code).toBe(
        "field_change_needs_operation",
      );
      expect((await refusal(withFields(site, options("level", ["beginner"])))).code).toBe(
        "field_change_needs_operation",
      );
      // Unused options and keys go freely.
      const kept = await withFields(site, options("format", ["talk", "panel"]));
      expect(kept.collections?.events?.fields?.find((d) => d.key === "format")).toBeDefined();
      await withFields(
        site,
        options("format", ["talk", "panel"]).filter((d) => d.key !== "price"),
      );
    });

    it("entry values: checked, located, unknown keys refused, null never stored", async () => {
      const site = await setup();
      const bad = await refusal(entry(site, { fields: { price: -1, startsAt: { at: "x" } } }));
      expect(bad.code).toBe("invalid_fields");
      expect(bad.issues.map((i) => i.path).sort()).toEqual(
        expect.arrayContaining(["fields/price"]),
      );
      const unknown = await refusal(entry(site, { fields: { colour: "red" } }));
      expect(unknown).toMatchObject({
        code: "unknown_field",
        issues: [{ path: "fields/colour", code: "unknown_field" }],
      });
      expect((await refusal(entry(site, { fields: { notes: null } }))).code).toBe("invalid_fields");
      const ok = await entry(site, {
        fields: { venue: "Hall", price: 12.5, startsAt: STARTS, format: ["talk"] },
      });
      expect(ok.fields).toMatchObject({ venue: "Hall", price: 12.5 });
    });

    it("only changed values are checked; stored unknown keys are kept", async () => {
      const site = await setup(null);
      const old = await entry(site, { fields: { legacy: true, venue: "A very long venue name" } });
      await withFields(site, [{ ...FIELDS[0], maxLength: 10 } as FieldDefinition]);
      // An unrelated edit keeps the too-long venue and the unknown key.
      const edited = await store().updateContentEntry({ ...old, title: "Renamed" });
      expect(edited.fields).toEqual({ legacy: true, venue: "A very long venue name" });
      const longer = await refusal(
        store().updateContentEntry({
          ...edited,
          fields: { ...edited.fields, venue: "Also too long" },
        }),
      );
      expect(longer).toMatchObject({ code: "invalid_fields", issues: [{ path: "fields/venue" }] });
      expect(
        (
          await refusal(
            store().updateContentEntry({ ...edited, fields: { ...edited.fields, x: 1 } }),
          )
        ).code,
      ).toBe("unknown_field");
      // Removing keys is always allowed.
      expect((await store().updateContentEntry({ ...edited, fields: {} })).fields).toEqual({});
    });

    it("requiredToPublish: drafts save freely, review and published need the values", async () => {
      const site = await setup();
      const draft = await entry(site);
      const review = await refusal(store().updateContentEntry({ ...draft, status: "review" }));
      expect(review.code).toBe("required_field");
      expect(review.issues.map((i) => i.path).sort()).toEqual(["fields/startsAt", "fields/venue"]);
      expect((await refusal(entry(site, { status: "published" }))).code).toBe("required_field");
      const blank = await refusal(
        store().updateContentEntry({
          ...draft,
          status: "review",
          fields: { venue: "  ", startsAt: STARTS },
        }),
      );
      expect(blank).toMatchObject({ code: "required_field", issues: [{ path: "fields/venue" }] });
      const ready = await store().updateContentEntry({
        ...draft,
        status: "published",
        fields: { venue: "Hall", startsAt: STARTS },
      });
      expect(ready.status).toBe("published");
    });

    it("translations: non-localized values live on the original only", async () => {
      const site = await setup();
      const original = await entry(site, {
        status: "published",
        fields: { venue: "Hall", startsAt: STARTS, price: 10 },
      });
      const member = (await store().translationGroup(site, original.id)).members.find(
        (m) => m.id === original.id,
      );
      const translation = {
        group: original.id,
        method: "human",
        source: { id: original.id, locale: "en", rev: original.rev, hash: member?.hash as string },
      } as Translation;
      const tr = (fields: Record<string, unknown>, status: ContentEntry["status"] = "draft") =>
        entry(site, { locale: "tr", slug: original.slug, translation, fields, status });
      const copy = await refusal(tr({ price: 11 }));
      expect(copy).toMatchObject({
        code: "field_not_localized",
        issues: [{ path: "fields/price", code: "field_not_localized" }],
      });
      // An equal copy passes; localized values are the translation's own; required values that
      // are not localized (startsAt) and localized ones left empty (venue) come from the original.
      const made = await tr({ price: 10, notes: "Türkçe" }, "published");
      expect(made.fields).toEqual({ price: 10, notes: "Türkçe" });
    });

    it("the 256 KB cap applies to every collection, when fields change", async () => {
      const site = await setup(null);
      const big = { blob: "x".repeat(256 * 1024) };
      expect((await refusal(entry(site, { fields: big }))).code).toBe("too_large");
      const typed = await setup();
      const huge = { notes: "x".repeat(5000) };
      const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, huge.notes]));
      expect((await refusal(entry(typed, { fields: many }))).issues[0]?.code).toBe("too_large");
    });

    it("image values are image assets of the site, recorded in asset_refs", async () => {
      const site = await setup();
      const { asset } = await upload(site);
      const csv = await upload(site, text("a,b\n1,2\n"), "data.csv");
      const missing = await refusal(entry(site, { fields: { poster: "asset_01HZX8K3Q9ZZ" } }));
      expect(missing).toMatchObject({
        code: "invalid_fields",
        issues: [{ path: "fields/poster" }],
      });
      const notImage = await refusal(entry(site, { fields: { poster: csv.asset.id } }));
      expect(notImage.issues[0]?.path).toBe("fields/poster");
      const e = await entry(site, {
        fields: { poster: asset.id, agenda: `See [the data](asset:${csv.asset.id}).` },
      });
      expect(await refsOf(e.id)).toEqual([
        `fields.agenda=${csv.asset.id}`,
        `fields.poster=${asset.id}`,
      ]);
      expect((await refusal(store().deleteAsset(asset))).code).toBe("in_use");
      // An unrelated edit keeps the rows; clearing the value frees the file.
      const edited = await store().updateContentEntry({ ...e, title: "Renamed" });
      expect(await refsOf(e.id)).toHaveLength(2);
      const cleared = await store().updateContentEntry({ ...edited, fields: {} });
      expect(await refsOf(e.id)).toEqual([]);
      await store().deleteAsset((await store().getAsset(asset.id)) ?? asset);
      expect(cleared.fields).toEqual({});
    });

    it("an import rebuilds the field references with the rest", async () => {
      const site = await setup();
      const { asset } = await upload(site);
      const e = await entry(site, { fields: { poster: asset.id } });
      const bundle = await exportSite({ sql: ctx.sql(), blobs: ctx.blobs() }, site.id);
      await ctx.sql().run("DELETE FROM asset_refs WHERE site_id = ?", [site.id]);
      await importSite({ sql: ctx.sql(), blobs: ctx.blobs() }, bundle, { mode: "replace" });
      expect(await refsOf(e.id)).toEqual([`fields.poster=${asset.id}`]);
    });

    it("searchable text fields reach the index on publish; others never do", async () => {
      const site = await setup();
      await entry(site, {
        status: "published",
        title: "Launch",
        fields: { venue: "Moda Sahnesi", notes: "secret backstage code", startsAt: STARTS },
      });
      const publish = async () => {
        const snap = await store().createSnapshot(site.id, { actor: person, reason: "publish" });
        await store().publish(await fresh(site), snap.id);
      };
      const find = async (q: string) =>
        (await store().search(site.id, q, { locale: "en", now: Date.UTC(2027, 0, 1) })).total;
      await publish();
      expect(await find("sahnesi")).toBe(1);
      expect(await find("backstage")).toBe(0);
      // Marking notes searchable rewrites every entry row at the next publish.
      await withFields(
        site,
        FIELDS.map((d) =>
          d.key === "notes" ? ({ ...d, searchable: true } as FieldDefinition) : d,
        ),
      );
      await publish();
      expect(await find("backstage")).toBe(1);
    });
  });
}

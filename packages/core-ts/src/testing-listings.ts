/**
 * RFC-0042 step 2 behavioural suite: collections stage 3 in the store. `updateSite` checks list
 * fields, the expiry field and the structured-data preset, and refuses list-field changes that
 * `contentList` sections still use (`list_field_in_use`, with a guard on the site CAS); page writes
 * check sections' `where`/`orderBy` (`invalid_query`); RFC-0041's field operations rename, refuse
 * or re-check those references. Called by `describeSiteGraphStore`, so it runs on every backend.
 */
import type {
  Actor,
  CollectionSettings,
  FieldDefinition,
  Page,
  Section,
  Site,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "./errors.ts";
import {
  type FieldOperation,
  revertFieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import type { SiteGraphStore } from "./store.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });

export const STAGE3_FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "endsAt", type: "datetime", labels: L("Ends"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
  { key: "venue", type: "text", labels: L("Venue"), localized: true },
  { key: "city", type: "text", labels: L("City"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  {
    key: "eventStatus",
    type: "select",
    labels: L("Status"),
    localized: false,
    options: [
      { value: "scheduled", labels: { en: "Scheduled" } },
      { value: "cancelled", labels: { en: "Cancelled" } },
      { value: "sold-out", labels: { en: "Sold out" } },
    ],
  },
  { key: "notes", type: "richText", labels: L("Notes"), localized: true },
];

export const STAGE3_PRESET: NonNullable<CollectionSettings["structuredData"]> = {
  type: "Event",
  properties: {
    startDate: { kind: "field", field: "startsAt" },
    endDate: { kind: "field", field: "endsAt" },
    "location.name": { kind: "field", field: "venue" },
    "location.address.addressLocality": { kind: "field", field: "city" },
    eventStatus: { kind: "field", field: "eventStatus" },
    "offers.price": { kind: "field", field: "price" },
    "offers.priceCurrency": { kind: "constant", value: "TRY" },
  },
};

const LABELS = { en: { singular: "Event", plural: "Events" } };

/** The full stage 3 settings of the `events` collection. */
export const STAGE3_EVENTS: CollectionSettings = {
  labels: LABELS,
  fields: STAGE3_FIELDS,
  listFields: ["startsAt", "eventStatus", "price", "day"],
  expiry: { field: "endsAt", action: "unlist", afterMinutes: 60 },
  structuredData: STAGE3_PRESET,
};

interface Refusal {
  code: string;
  issues: { path: string; code: string }[];
  details: Record<string, unknown>;
}

async function refusal(p: Promise<unknown>): Promise<Refusal> {
  try {
    await p;
  } catch (e) {
    if (!(e instanceof InvariantError)) throw e;
    const issues = (e.details.issues ?? []) as Refusal["issues"];
    return { code: e.code, issues, details: e.details as Record<string, unknown> };
  }
  throw new Error("expected a rejection");
}

const list = (extra: Partial<Section> = {}): Section =>
  ({
    id: "sec_upcoming0001",
    kind: "contentList",
    collection: "events",
    limit: 10,
    sort: "newest",
    ...extra,
  }) as Section;

const UPCOMING = {
  where: [{ field: "startsAt", op: "gte", value: "now" }],
  orderBy: { field: "startsAt", direction: "asc" },
};

export function listingsSuite(ctx: SuiteContext): void {
  describe("RFC-0042 collections stage 3 in the store", () => {
    let n = 0;
    const store = (): SiteGraphStore => ctx.store();
    const fresh = async (site: Site) => (await store().getSite(site.id)) as Site;

    async function setup(events: CollectionSettings | null = STAGE3_EVENTS): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Listings",
        slug: `listings-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Listings",
        slug: `listings-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        timeZone: "Europe/Istanbul",
        collections: events ? { events } : {},
      });
    }
    const withEvents = async (site: Site, patch: Record<string, unknown>, dryRun = false) => {
      const s = await fresh(site);
      const events = { ...s.collections?.events, ...patch } as CollectionSettings;
      return store().updateSite({ ...s, collections: { ...s.collections, events } }, { dryRun });
    };
    const page = async (site: Site, sections: Section[], path = "/upcoming") =>
      (
        await store().createPage(await fresh(site), {
          siteId: site.id,
          path,
          title: "Upcoming",
          locale: "en",
          status: "draft",
          sections,
        })
      ).page;
    const run = (site: Site, op: FieldOperation) =>
      runFieldOperation(store(), site.id, op, { actor: person });

    it("accepts the stage 3 settings; sites without them keep saving as before", async () => {
      const site = await setup();
      expect((await fresh(site)).collections?.events).toEqual(STAGE3_EVENTS);
      const plain = await setup({ labels: LABELS, fields: STAGE3_FIELDS });
      const renamed = await store().updateSite({ ...(await fresh(plain)), name: "Renamed" });
      expect(renamed.collections?.events).toEqual({
        labels: LABELS,
        fields: STAGE3_FIELDS,
      });
      // A plain contentList section is stored exactly as written.
      const p = await page(plain, [list()]);
      expect(p.sections).toEqual([list()]);
    });

    it("refuses list fields and expiry fields that do not fit, dry run included", async () => {
      const site = await setup();
      const unknown = await refusal(withEvents(site, { listFields: ["startsAt", "nope"] }));
      expect(unknown.code).toBe("unknown_field");
      expect(unknown.issues.map((i) => i.path)).toEqual(["collections/events/listFields/1"]);
      const text = await refusal(withEvents(site, { expiry: { field: "city", action: "hide" } }));
      expect(text.code).toBe("invalid_expiry");
      expect(text.issues[0]?.path).toBe("collections/events/expiry/field");
      const missing = await refusal(
        withEvents(site, { expiry: { field: "gone", action: "unlist" } }, true),
      );
      expect(missing.code).toBe("unknown_field");
      // A date field works as well as a datetime.
      const day = await withEvents(site, { expiry: { field: "day", action: "hide" } });
      expect(day.collections?.events?.expiry).toEqual({ field: "day", action: "hide" });
      // Dropping a field the settings name is refused by the same checks.
      const fields = STAGE3_FIELDS.filter((f) => f.key !== "day");
      expect((await refusal(withEvents(site, { fields }))).code).toBe("unknown_field");
      // A new site is checked too.
      const project = await store().createProject({
        name: "x",
        slug: "listings-new",
        ownerId: person.id,
        siteIds: [],
      });
      const bad = store().createSite({
        projectId: project.id,
        name: "x",
        slug: "listings-new",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { events: { ...STAGE3_EVENTS, listFields: ["nope"] } },
      });
      expect((await refusal(bad)).code).toBe("unknown_field");
    });

    it("refuses structured-data errors; warnings are saved", async () => {
      const site = await setup();
      const { startDate: _s, ...rest } = STAGE3_PRESET.properties;
      const noStart = await refusal(
        withEvents(site, { structuredData: { type: "Event", properties: rest } }),
      );
      expect(noStart.code).toBe("structured_data_invalid");
      expect(noStart.issues.map((i) => `${i.path} ${i.code}`)).toEqual([
        "collections/events/structuredData/properties/startDate required_missing",
      ]);
      const mismatch = await refusal(
        withEvents(site, {
          structuredData: {
            ...STAGE3_PRESET,
            properties: {
              ...STAGE3_PRESET.properties,
              startDate: { kind: "field", field: "city" },
            },
          },
        }),
      );
      expect(mismatch.code).toBe("structured_data_invalid");
      expect(mismatch.issues[0]?.code).toBe("source_mismatch");
      // "sold-out" is outside eventStatus's vocabulary: a warning, saved (setup already did).
      expect((await fresh(site)).collections?.events?.structuredData).toEqual(STAGE3_PRESET);
    });

    it("page writes check contentList where/orderBy against the list fields", async () => {
      const site = await setup();
      const bad = await refusal(
        page(site, [
          list({ id: "sec_first0000001" } as Partial<Section>),
          list({
            where: [
              { field: "city", op: "eq", value: "Izmir" },
              { field: "price", op: "in", values: ["1"] },
              { field: "day", op: "gte", value: "tomorrow" },
            ],
            orderBy: { field: "eventStatus", direction: "asc" },
          } as Partial<Section>),
        ]),
      );
      expect(bad.code).toBe("invalid_query");
      expect(bad.issues.map((i) => i.path)).toEqual([
        "sections/1/where/0/field",
        "sections/1/where/1/op",
        "sections/1/where/2/value",
        "sections/1/orderBy/field",
      ]);
      const ok = await page(site, [list(UPCOMING as Partial<Section>)]);
      expect(ok.sections[0]).toMatchObject(UPCOMING);
      // Updates are checked too; an unchanged query is not re-checked.
      const stored = (await store().getPage(ok.id)) as Page;
      const worse = list({ where: [{ field: "venue", op: "set" }] } as Partial<Section>);
      expect((await refusal(store().updatePage({ ...stored, sections: [worse] }))).code).toBe(
        "invalid_query",
      );
      const retitled = await store().updatePage({ ...stored, title: "Soon" });
      expect(retitled.sections).toEqual(stored.sections);
    });

    it("list_field_in_use: sections keep the list fields and options they use", async () => {
      const site = await setup();
      const p = await page(site, [
        list({
          where: [
            { field: "startsAt", op: "gte", value: "now" },
            { field: "eventStatus", op: "in", values: ["scheduled"] },
          ],
          orderBy: { field: "price", direction: "desc" },
        } as Partial<Section>),
      ]);
      const unlisted = await refusal(withEvents(site, { listFields: ["eventStatus", "price"] }));
      expect(unlisted.code).toBe("list_field_in_use");
      expect(unlisted.details.pages).toEqual([{ id: p.id, path: "/upcoming", locale: "en" }]);
      expect(unlisted.issues[0]?.path).toBe("collections/events/listFields");
      // orderBy counts as a use as well.
      expect(
        (await refusal(withEvents(site, { listFields: ["startsAt", "eventStatus", "day"] }))).code,
      ).toBe("list_field_in_use");
      // An option the sections compare with cannot be dropped; one they do not use can.
      const status = STAGE3_FIELDS[6] as Extract<FieldDefinition, { type: "select" }>;
      const without = (value: string) =>
        STAGE3_FIELDS.map((f) =>
          f.key === "eventStatus"
            ? { ...status, options: status.options.filter((o) => o.value !== value) }
            : f,
        );
      expect((await refusal(withEvents(site, { fields: without("scheduled") }))).code).toBe(
        "list_field_in_use",
      );
      await withEvents(site, { fields: without("sold-out") });
      // A field no section uses can be unlisted.
      const unlistDay = await withEvents(site, {
        listFields: ["startsAt", "eventStatus", "price"],
      });
      expect(unlistDay.collections?.events?.listFields).toEqual([
        "startsAt",
        "eventStatus",
        "price",
      ]);
    });

    it("the site CAS guard catches a section added while the site write was planned", async () => {
      const site = await setup();
      const p = await page(site, [list()]);
      const racing = ctx.racing(async () => {
        const stored = (await store().getPage(p.id)) as Page;
        await store().updatePage({ ...stored, sections: [list(UPCOMING as Partial<Section>)] });
      });
      const s = await fresh(site);
      const events = { ...s.collections?.events, listFields: ["price"] } as CollectionSettings;
      const raced = await refusal(
        racing.updateSite({ ...s, collections: { ...s.collections, events } }),
      );
      expect(raced.code).toBe("list_field_in_use");
      expect((await fresh(site)).collections?.events?.listFields).toEqual(STAGE3_EVENTS.listFields);
    });

    it("rename_field renames settings and sections in phase A, and back on revert", async () => {
      const site = await setup();
      const p = await page(site, [list(UPCOMING as Partial<Section>)]);
      const op: FieldOperation = {
        op: "rename_field",
        collection: "events",
        from: "startsAt",
        to: "beginsAt",
      };
      const done = await run(site, op);
      expect(done.done).toBe(true);
      const events = (await fresh(site)).collections?.events;
      expect(events?.listFields).toEqual(["beginsAt", "eventStatus", "price", "day"]);
      expect(events?.structuredData?.properties.startDate).toEqual({
        kind: "field",
        field: "beginsAt",
      });
      const renamed = (await store().getPage(p.id)) as Page;
      expect(renamed.rev).toBe(p.rev + 1);
      expect(renamed.sections[0]).toMatchObject({
        where: [{ field: "beginsAt", op: "gte", value: "now" }],
        orderBy: { field: "beginsAt", direction: "asc" },
      });
      // The expiry field follows a rename as well.
      const ends = await run(site, {
        op: "rename_field",
        collection: "events",
        from: "endsAt",
        to: "finishesAt",
      });
      expect((await fresh(site)).collections?.events?.expiry?.field).toBe("finishesAt");
      await revertFieldOperation(store(), site.id, ends.operationId, { actor: person });
      expect((await fresh(site)).collections?.events?.expiry?.field).toBe("endsAt");
      const reverted = await revertFieldOperation(store(), site.id, done.operationId, {
        actor: person,
      });
      expect(reverted.done).toBe(true);
      expect((await fresh(site)).collections?.events).toEqual(STAGE3_EVENTS);
      expect(((await store().getPage(p.id)) as Page).sections[0]).toMatchObject(UPCOMING);
    });

    it("remove_field refuses while settings or sections name the field", async () => {
      const site = await setup();
      const remove = (key: string) => run(site, { op: "remove_field", collection: "events", key });
      const listed = await refusal(remove("day"));
      expect(listed.code).toBe("list_field_in_use");
      expect(listed.issues.map((i) => i.path)).toEqual(["collections/events/listFields/3"]);
      const mapped = await refusal(remove("city"));
      expect(mapped.issues.map((i) => i.path)).toEqual([
        "collections/events/structuredData/properties/location.address.addressLocality/field",
      ]);
      expect((await refusal(remove("endsAt"))).issues.map((i) => i.path)).toEqual([
        "collections/events/expiry/field",
        "collections/events/structuredData/properties/endDate/field",
      ]);
      // Sections are named first (a dry run refuses too).
      const bare = await setup({ fields: STAGE3_FIELDS, listFields: ["price"] });
      await page(bare, [
        list({ orderBy: { field: "price", direction: "asc" } } as Partial<Section>),
      ]);
      const used = await refusal(
        runFieldOperation(
          store(),
          bare.id,
          { op: "remove_field", collection: "events", key: "price" },
          { actor: person, dryRun: true },
        ),
      );
      expect(used.code).toBe("list_field_in_use");
      expect(used.details.pages).toMatchObject([{ path: "/upcoming" }]);
      // A field nothing names is removed as before.
      const gone = await run(site, { op: "remove_field", collection: "events", key: "notes" });
      expect(gone.done).toBe(true);
    });

    it("change_field_type refuses when the new type breaks settings or sections", async () => {
      const site = await setup();
      const retype = (key: string, type: FieldDefinition["type"]) =>
        run(site, { op: "change_field_type", collection: "events", key, type });
      expect((await refusal(retype("endsAt", "text"))).code).toBe("invalid_expiry");
      expect((await refusal(retype("startsAt", "text"))).code).toBe("structured_data_invalid");
      await page(site, [
        list({ where: [{ field: "day", op: "gte", value: "now" }] } as Partial<Section>),
      ]);
      const broken = await refusal(retype("day", "text"));
      expect(broken.code).toBe("list_field_in_use");
      expect(broken.issues[0]?.path).toMatch(/^pages\/page_\w+\/sections\/0\/where\/0\/op$/);
      // date → datetime keeps `gte now` valid and the expiry rule readable.
      expect((await retype("day", "datetime")).done).toBe(true);
    });
  });
}

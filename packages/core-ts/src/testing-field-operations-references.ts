/**
 * RFC-0045 rollout step 4 behavioural suite: the four field operations on reference and repeater
 * fields, on every backend (`describeSiteGraphStore`). The types stay refused in production; this
 * suite enables them with `SiteGraphStoreOptions.fieldTypes` on a store of its own.
 *
 * Covered: every new conversion row end to end, with `entry_refs` rows; `sub` (rename, convert,
 * remove in every item, asset rows following); phase B's target guard (a target archived or
 * deleted while it runs); resume; revert with a deleted target (`dropped`); `set_field_localized`
 * phase A's `shared` in both directions with a racing holder write (R16); a racing holder write
 * during a rename (`fromKey`); `field_operation_running` during a text → reference conversion,
 * including a delete planned before phase A commits and batched after it (R12).
 */
import type { Actor, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { ConflictError, InvariantError } from "./errors.ts";
import {
  continueFieldOperation,
  type FieldOperation,
  fieldOperationStatus,
  revertFieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import { nodeHash } from "./hash.ts";
import { PNG_1X1 } from "./media/fixtures.ts";
import { SiteGraphStore } from "./store.ts";
import { racingDriver, type SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const actor = { actor: person };
const L = (label: string) => ({ en: { label } });
const ENABLED = { supported: () => true };

const text = (key: string, over: Record<string, unknown> = {}): FieldDefinition =>
  ({ key, type: "text", labels: L(key), localized: false, ...over }) as FieldDefinition;
const reference = (key: string, over: Record<string, unknown> = {}): FieldDefinition =>
  ({
    key,
    type: "reference",
    labels: L(key),
    localized: false,
    collections: ["places"],
    ...over,
  }) as FieldDefinition;
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [
    { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
    { key: "name", type: "text", labels: L("Name") },
    { key: "seats", type: "text", labels: L("Seats") },
    { key: "photo", type: "image", labels: L("Photo") },
  ],
};

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvariantError) return e.code;
    if (e instanceof ConflictError) return "conflict";
    throw e;
  }
  return "ok";
}

/** After a delete or write refused at batch time, the caller's retry. */
const isAsset = (q: string) =>
  /^DELETE FROM asset_refs WHERE node_id = \? AND field LIKE 'fields/.test(q);

export function fieldOperationsReferencesSuite(ctx: SuiteContext): void {
  describe("RFC-0045 §7 field operations on references and repeaters", () => {
    let n = 0;
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++));
    const make = (sql = ctx.sql()) =>
      new SiteGraphStore({
        sql,
        blobs: ctx.blobs(),
        now,
        gates: GATES_ENFORCED,
        fieldTypes: ENABLED,
      });
    const store = () => make();
    const racing = (hook: () => Promise<void>, when?: (q: string) => boolean) =>
      make(racingDriver(ctx.sql(), hook, when));
    const run = (
      site: Site,
      op: FieldOperation,
      extra: Record<string, unknown> = {},
      on = store(),
    ) => runFieldOperation(on, site.id, op, { ...actor, ...extra });

    async function world(events: FieldDefinition[]): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Ops",
        slug: `refops-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Ops",
        slug: `refops-site-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { events: { fields: events as [FieldDefinition] }, places: {} },
      });
    }
    const entry = (site: Site, collection: string, over: Partial<ContentEntry> = {}) =>
      store().createContentEntry({
        siteId: site.id,
        collection,
        slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: `A ${collection}`,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...over,
      } as never);
    const place = (site: Site, title: string, over: Partial<ContentEntry> = {}) =>
      entry(site, "places", { title, slug: title.toLowerCase().replace(/ /g, "-"), ...over });
    const fresh = async (e: ContentEntry) => (await store().getContentEntry(e.id)) as ContentEntry;
    const def = async (site: Site, key: string) =>
      ((await store().getSite(site.id)) as Site).collections?.events?.fields?.find(
        (d) => d.key === key,
      );
    const rows = async (sourceId: string) =>
      (
        await ctx
          .sql()
          .all<{ t: string; f: string; k: string; s: number }>(
            "SELECT target_id AS t, field AS f, root_key AS k, shared AS s FROM entry_refs WHERE source_id = ? ORDER BY field, target_id",
            [sourceId],
          )
      ).map((r) => ({ ...r, s: Number(r.s) }));
    const sharedOf = async (sourceId: string) => (await rows(sourceId)).map((r) => r.s);

    describe("conversion rows", () => {
      it("text → reference and back: rows appear with phase B, and the revert restores the text", async () => {
        const site = await world([text("venue")]);
        const hall = await place(site, "Main Hall");
        const a = await entry(site, "events", { fields: { venue: "main hall" } });
        const b = await entry(site, "events", { fields: { venue: "Nowhere" } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        };
        const dry = await run(site, op, { dryRun: true });
        expect(dry.report).toMatchObject({ converted: 1, unconvertible: 1 });
        expect(dry.report.refusal?.code).toBe("field_values_unconvertible");
        const done = await run(site, { ...op, onInvalid: "clear" });
        expect(done.done).toBe(true);
        expect((await fresh(a)).fields).toEqual({ venue: hall.id });
        expect((await fresh(b)).fields).toEqual({});
        expect(await rows(a.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
        const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
        expect(back).toMatchObject({ done: true, restored: 2, dropped: [] });
        expect((await fresh(a)).fields).toEqual({ venue: "main hall" });
        expect((await fresh(b)).fields).toEqual({ venue: "Nowhere" });
        expect(await rows(a.id)).toEqual([]);
      });

      it("reference → text: the default-locale title; rows go", async () => {
        const site = await world([reference("venue", { multiple: true })]);
        const hall = await place(site, "Main Hall");
        const room = await place(site, "Room");
        const e = await entry(site, "events", { fields: { venue: [hall.id, room.id] } });
        const done = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "text",
        });
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ venue: "Main Hall, Room" });
        expect(await rows(e.id)).toEqual([]);
      });

      it("reference single ↔ multiple, keeping the rows", async () => {
        const site = await world([reference("venue")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: hall.id } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          multiple: true,
        };
        expect((await run(site, op)).done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ venue: [hall.id] });
        expect(await def(site, "venue")).toMatchObject({ multiple: true, collections: ["places"] });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
        expect((await run(site, { ...op, multiple: false })).done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ venue: hall.id });
        // same shape twice is no type change; narrowing the collections is refused
        expect(await code(run(site, { ...op, multiple: false }))).toBe("invalid_fields");
        expect(await code(run(site, { ...op, collections: ["events"] }))).toBe("invalid_fields");
      });

      it("multiline text ↔ repeater, one item per line", async () => {
        const site = await world([text("steps", { multiline: true })]);
        const e = await entry(site, "events", { fields: { steps: "Mix\n\nBake" } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "steps",
          type: "repeater",
          subFields: [{ key: "line", type: "text", labels: L("Line") }],
          maxItems: 10,
        };
        // a target definition that would not pass checkFieldDefinitions is refused by the dry run
        expect(await code(run(site, { ...op, itemLabel: "nope" }, { dryRun: true }))).toBe(
          "unknown_field",
        );
        const done = await run(site, op);
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ steps: [{ line: "Mix" }, { line: "Bake" }] });
        const back = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "steps",
          type: "text",
        });
        expect(back.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ steps: "Mix\nBake" });
        expect(await def(site, "steps")).toMatchObject({ type: "text", multiline: true });
      });

      it("reference (multiple) ↔ repeater with one reference sub-field; rows follow the path", async () => {
        const site = await world([reference("hosts", { multiple: true })]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { hosts: [hall.id] } });
        const part = await run(
          site,
          {
            op: "change_field_type",
            collection: "events",
            key: "hosts",
            type: "repeater",
            subFields: [
              { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
            ],
          },
          { budget: { entries: 0 } },
        );
        // a list of ids and a list of items are both arrays: still pending until rewritten
        expect((await fieldOperationStatus(store(), site.id, part.operationId)).pending).toBe(1);
        const done = await continueFieldOperation(store(), site.id, part.operationId, actor);
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ hosts: [{ person: hall.id }] });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "hosts.person", k: "hosts", s: 1 }]);
        const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
        expect(back.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ hosts: [hall.id] });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "hosts", k: "hosts", s: 1 }]);
      });
    });

    describe("sub", () => {
      it("renames a sub-field in every item; rows and asset rows follow", async () => {
        const site = await world([SPEAKERS]);
        const hall = await place(site, "Main Hall");
        const { asset } = await store().ingestAsset({
          siteId: site.id,
          bytes: PNG_1X1,
          filename: "p.png",
          uploadedBy: person,
          source: { kind: "upload" },
        });
        const e = await entry(site, "events", {
          fields: { speakers: [{ person: hall.id, photo: asset.id }, { name: "Ada" }] },
        });
        const assets = async () =>
          (
            await ctx
              .sql()
              .all<{ field: string }>("SELECT field FROM asset_refs WHERE node_id = ?", [e.id])
          ).map((r) => r.field);
        const before = await assets();
        expect(before).toHaveLength(1);
        for (const [from, to] of [
          ["person", "host"],
          ["photo", "portrait"],
        ] as const) {
          const done = await run(site, {
            op: "rename_field",
            collection: "events",
            from: "speakers",
            sub: from,
            to,
          });
          expect(done.done).toBe(true);
        }
        expect((await fresh(e)).fields).toEqual({
          speakers: [{ host: hall.id, portrait: asset.id }, { name: "Ada" }],
        });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "speakers.host", k: "speakers", s: 1 }]);
        expect(await assets()).toEqual([before[0]?.replace("photo", "portrait")]);
        // the asset stays in use
        expect(await code(store().deleteAsset(asset))).toBe("in_use");
        // a key the repeater already has, or a sub-field of a non-repeater, is refused
        const dup = {
          op: "rename_field",
          collection: "events",
          from: "speakers",
          sub: "name",
          to: "seats",
        } as const;
        expect(await code(run(site, dup))).toBe("field_key_duplicate");
      });

      it("converts a sub-field in every item, and removes one (an item left empty goes)", async () => {
        const site = await world([SPEAKERS]);
        const hall = await place(site, "Main Hall");
        const a = await entry(site, "events", {
          fields: { speakers: [{ name: "Main Hall", seats: "12" }, { seats: "3" }] },
        });
        const host = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "speakers",
          sub: "name",
          type: "reference",
          collections: ["places"],
        });
        expect(host.done).toBe(true);
        expect((await fresh(a)).fields).toEqual({
          speakers: [{ name: hall.id, seats: "12" }, { seats: "3" }],
        });
        expect(await rows(a.id)).toContainEqual({
          t: hall.id,
          f: "speakers.name",
          k: "speakers",
          s: 1,
        });
        const removed = await run(site, {
          op: "remove_field",
          collection: "events",
          key: "speakers",
          sub: "seats",
        });
        expect(removed.done).toBe(true);
        expect((await fresh(a)).fields).toEqual({ speakers: [{ name: hall.id }] });
        const speakers = await def(site, "speakers");
        expect(speakers?.type === "repeater" && speakers.fields.map((s) => s.key)).toEqual([
          "person",
          "name",
          "photo",
        ]);
        // sub-fields share the repeater's localized
        expect(
          await code(
            run(site, {
              op: "set_field_localized",
              collection: "events",
              key: "speakers",
              sub: "name",
              localized: true,
            }),
          ),
        ).toBe("invalid_fields");
      });
    });

    describe("request checks", () => {
      it("a sub-field reference → text is not held to another sub-field's collections", async () => {
        const site = await world([
          {
            ...SPEAKERS,
            fields: [
              ...(SPEAKERS.type === "repeater" ? SPEAKERS.fields : []),
              { key: "room", type: "reference", labels: L("Room"), collections: ["events"] },
            ],
          } as FieldDefinition,
        ]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { speakers: [{ person: hall.id }] } });
        const done = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "speakers",
          sub: "person",
          type: "text",
        });
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ speakers: [{ person: "Main Hall" }] });
      });

      it("multiple is ignored where it does not apply, as before", async () => {
        const site = await world([text("seats")]);
        const e = await entry(site, "events", { fields: { seats: "12" } });
        const done = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "seats",
          type: "number",
          multiple: false,
        });
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({ seats: 12 });
      });
    });

    describe("phase B's target guard (§2.6)", () => {
      it("a target archived during phase B is never written: reported, then continued with clear", async () => {
        const site = await world([text("venue")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: "Main Hall" } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        };
        let deleted = "";
        const raced = racing(async () => {
          deleted = await code(store().deleteContentEntry(await fresh(hall)));
          await store().updateContentEntry({ ...(await fresh(hall)), status: "archived" });
        }, isAsset);
        const stuck = await run(site, op, {}, raced);
        expect(deleted).toBe("field_operation_running");
        // the guard skipped it; the next pass read the maps again, and nothing matches now
        expect(stuck).toMatchObject({ done: false, skipped: [] });
        expect(stuck.unconvertible).toEqual([{ entryId: e.id, reason: expect.any(String) }]);
        expect((await fresh(e)).fields).toEqual({ venue: "Main Hall" });
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe(
          "field_operation_running",
        );
        const cleared = await continueFieldOperation(store(), site.id, stuck.operationId, {
          ...actor,
          onInvalid: "clear",
        });
        expect(cleared.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({});
        expect(await rows(e.id)).toEqual([]);
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
      });

      it("a second entry with the same title during the run: single and multiple, then cleared", async () => {
        for (const multiple of [false, true]) {
          const site = await world([text("venue")]);
          await place(site, "Main Hall");
          const e = await entry(site, "events", { fields: { venue: "Main Hall" } });
          const op: FieldOperation = {
            op: "change_field_type",
            collection: "events",
            key: "venue",
            type: "reference",
            collections: ["places"],
            multiple,
          };
          const started = await run(site, op, { budget: { entries: 0 } });
          await place(site, "Main Hall", { slug: "main-hall-2" });
          const stuck = await continueFieldOperation(store(), site.id, started.operationId, actor);
          expect(stuck.done).toBe(false);
          expect(stuck.unconvertible.map((u) => u.entryId)).toEqual([e.id]);
          expect(stuck.unconvertible[0]?.reason).toMatch(/matches 2 entries/);
          const done = await continueFieldOperation(store(), site.id, started.operationId, {
            ...actor,
            onInvalid: "clear",
          });
          expect(done.done).toBe(true);
          expect((await fresh(e)).fields).toEqual({});
        }
      });

      it("reference → text with a target deleted mid-run: the id is pending, then cleared", async () => {
        const site = await world([reference("venue")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: hall.id } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "text",
        };
        const started = await run(site, op, { budget: { entries: 0 } });
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
        const stuck = await continueFieldOperation(store(), site.id, started.operationId, actor);
        expect(stuck.done).toBe(false);
        expect(stuck.unconvertible.map((u) => u.entryId)).toEqual([e.id]);
        expect((await fresh(e)).fields).toEqual({ venue: hall.id });
        const done = await continueFieldOperation(store(), site.id, started.operationId, {
          ...actor,
          onInvalid: "clear",
        });
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({});
        expect(await rows(e.id)).toEqual([]);
      });

      it("a person's edit of another field mid-run converts the value through the table", async () => {
        const site = await world([reference("venue"), text("note")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: hall.id } });
        const toText: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "text",
        };
        const a = await run(site, toText, { budget: { entries: 0 } });
        // the stored id is valid text, yet it is not left as it is
        const edited = await store().updateContentEntry({
          ...(await fresh(e)),
          fields: { venue: hall.id, note: "n" },
        });
        expect(edited.fields).toEqual({ venue: "Main Hall", note: "n" });
        expect(await rows(e.id)).toEqual([]);
        expect((await continueFieldOperation(store(), site.id, a.operationId, actor)).done).toBe(
          true,
        );
        // and back: id-shaped text is no reference until the table says so
        const toRef: FieldOperation = {
          ...toText,
          type: "reference",
          collections: ["places"],
        } as FieldOperation;
        const b = await run(site, toRef, { budget: { entries: 0 } });
        const again = await store().updateContentEntry({ ...(await fresh(e)), title: "Edited" });
        expect(again.fields).toEqual({ venue: hall.id, note: "n" });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
        expect((await continueFieldOperation(store(), site.id, b.operationId, actor)).done).toBe(
          true,
        );
      });

      it("a target deleted while ids are carried over stays as stored, rows kept", async () => {
        const site = await world([reference("hosts", { multiple: true })]);
        const hall = await place(site, "Main Hall");
        const gone = await place(site, "Gone");
        const e = await entry(site, "events", { fields: { hosts: [hall.id, gone.id] } });
        const raced = racing(async () => {
          // a draft referrer locks nothing, so this delete goes through
          expect(await code(store().deleteContentEntry(await fresh(gone)))).toBe("ok");
        }, isAsset);
        const done = await run(
          site,
          {
            op: "change_field_type",
            collection: "events",
            key: "hosts",
            type: "repeater",
            subFields: [
              { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
            ],
          },
          {},
          raced,
        );
        expect(done.done).toBe(true);
        expect((await fresh(e)).fields).toEqual({
          hosts: [{ person: hall.id }, { person: gone.id }],
        });
        expect((await rows(e.id)).map((r) => r.t).sort()).toEqual([hall.id, gone.id].sort());
      });

      it("resumes after its budget; a person's write meanwhile converts the same way", async () => {
        const site = await world([text("venue")]);
        const hall = await place(site, "Main Hall");
        const made: ContentEntry[] = [];
        for (let i = 0; i < 3; i++)
          made.push(await entry(site, "events", { fields: { venue: "Main Hall" } }));
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        };
        const part = await run(site, op, { budget: { entries: 1 } });
        expect(part).toMatchObject({ done: false, rewritten: 1 });
        const last = made[2] as ContentEntry;
        expect((await fresh(last)).fields).toEqual({ venue: "Main Hall" });
        const edited = await store().updateContentEntry({
          ...(await fresh(last)),
          title: "Edited",
        });
        expect(edited.fields).toEqual({ venue: hall.id });
        expect(await rows(last.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
        const rest = await continueFieldOperation(store(), site.id, part.operationId, actor);
        expect(rest).toMatchObject({ done: true, resumed: true });
        for (const m of made) expect((await fresh(m)).fields).toEqual({ venue: hall.id });
      });
    });

    describe("revert", () => {
      it("drops a restored reference whose group has no member left, and reports it", async () => {
        const site = await world([reference("venue", { multiple: true })]);
        const hall = await place(site, "Main Hall");
        const room = await place(site, "Room");
        const e = await entry(site, "events", { fields: { venue: [hall.id, room.id] } });
        const done = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "text",
        });
        expect((await fresh(e)).fields).toEqual({ venue: "Main Hall, Room" });
        await store().deleteContentEntry(await fresh(room));
        const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
        expect(back).toMatchObject({ done: true, restored: 1 });
        expect(back.dropped).toEqual([{ entryId: e.id, field: "venue", targetId: room.id }]);
        expect((await fresh(e)).fields).toEqual({ venue: [hall.id] });
        expect(await rows(e.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
      });
    });

    describe("revert, after edits", () => {
      it("text → reference: an entry edited after the operation converts back to its title", async () => {
        const site = await world([text("venue")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: "main hall" } });
        const done = await run(site, {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        });
        await store().updateContentEntry({ ...(await fresh(e)), title: "Edited after" });
        const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
        expect(back).toMatchObject({ done: true, restored: 0, edited: [e.id] });
        expect((await fresh(e)).fields).toEqual({ venue: "Main Hall" });
        expect(await rows(e.id)).toEqual([]);
      });

      it("a sub-field removal's revert restores the sub-field, its values and their rows", async () => {
        const site = await world([SPEAKERS]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", {
          fields: { speakers: [{ person: hall.id, name: "Ada" }, { person: hall.id }] },
        });
        const done = await run(site, {
          op: "remove_field",
          collection: "events",
          key: "speakers",
          sub: "person",
        });
        expect((await fresh(e)).fields).toEqual({ speakers: [{ name: "Ada" }] });
        expect(await rows(e.id)).toEqual([]);
        const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
        expect(back.done).toBe(true);
        const speakers = await def(site, "speakers");
        expect(speakers?.type === "repeater" && speakers.fields.map((f) => f.key)).toContain(
          "person",
        );
        expect((await fresh(e)).fields).toEqual({
          speakers: [{ person: hall.id, name: "Ada" }, { person: hall.id }],
        });
        expect(await rows(e.id)).toEqual([
          { t: hall.id, f: "speakers.person", k: "speakers", s: 1 },
        ]);
      });

      it("a repeater converting away holds its rows until rewritten, then drops them", async () => {
        const site = await world([SPEAKERS]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", {
          status: "published",
          fields: { speakers: [{ person: hall.id }] },
        });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "speakers",
          type: "number",
          onInvalid: "clear",
        };
        const started = await run(site, op, { budget: { entries: 0 } });
        // the stale row still locks while the marker runs
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("entry_referenced");
        expect(
          (await continueFieldOperation(store(), site.id, started.operationId, actor)).done,
        ).toBe(true);
        expect((await fresh(e)).fields).toEqual({});
        expect(await rows(e.id)).toEqual([]);
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
      });

      it("a rename's revert that also restores an older localized updates shared", async () => {
        const site = await world([reference("venue")]);
        const hall = await place(site, "Main Hall");
        const e = await entry(site, "events", { fields: { venue: hall.id } });
        const renamed = await run(site, {
          op: "rename_field",
          collection: "events",
          from: "venue",
          to: "place",
        });
        await run(site, {
          op: "set_field_localized",
          collection: "events",
          key: "place",
          localized: true,
        });
        expect(await sharedOf(e.id)).toEqual([2]);
        const back = await revertFieldOperation(store(), site.id, renamed.operationId, actor);
        expect(back.done).toBe(true);
        expect((await def(site, "venue"))?.localized).toBe(false);
        expect(await sharedOf(e.id)).toEqual([1]);
      });
    });

    describe("marker interplay (watch item 3)", () => {
      it("set_field_localized: phase A sets shared in its batch, both ways; a racing holder write retries (R16)", async () => {
        const site = await world([reference("venue")]);
        const hall = await place(site, "Main Hall");
        const a = await entry(site, "events", { fields: { venue: hall.id } });
        const b = await entry(site, "events", { fields: { venue: hall.id } });
        expect(await sharedOf(a.id)).toEqual([1]);
        for (const localized of [true, false]) {
          const op: FieldOperation = {
            op: "set_field_localized",
            collection: "events",
            key: "venue",
            localized,
          };
          // b's status-only write is planned before phase A and batched after it: the definitions
          // anchor fails it, and its retry reads `shared` from the new definition
          const writer = racing(() => run(site, op).then(() => {}));
          expect(
            await code(writer.updateContentEntry({ ...(await fresh(b)), title: `T ${localized}` })),
          ).toBe("conflict");
          const want = localized ? 2 : 1;
          // a's rows were written before phase A, which corrected them in its own batch
          expect(await sharedOf(a.id)).toEqual([want]);
          await store().updateContentEntry({ ...(await fresh(b)), title: `T ${localized}` });
          expect(await sharedOf(b.id)).toEqual([want]);
          expect((await def(site, "venue"))?.localized).toBe(localized);
        }
      });

      it("rename_field: rows keep the old key until each entry is rewritten, and still lock (fromKey)", async () => {
        const site = await world([reference("venue")]);
        const hall = await place(site, "Main Hall");
        const a = await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        const b = await entry(site, "events", { fields: { venue: hall.id } });
        const op: FieldOperation = {
          op: "rename_field",
          collection: "events",
          from: "venue",
          to: "place",
        };
        let id = "";
        const writer = racing(async () => {
          id = (await run(site, op, { budget: { entries: 0 } })).operationId;
        });
        expect(await code(writer.updateContentEntry({ ...(await fresh(b)), title: "Raced" }))).toBe(
          "conflict",
        );
        // the retry goes through the marker: the new key, and its rows with it
        const retried = await store().updateContentEntry({ ...(await fresh(b)), title: "Raced" });
        expect(retried.fields).toEqual({ place: hall.id });
        expect(await rows(b.id)).toEqual([{ t: hall.id, f: "place", k: "place", s: 1 }]);
        // a is not rewritten yet: its row names the old key, matched through migration.fromKey
        expect(await rows(a.id)).toEqual([{ t: hall.id, f: "venue", k: "venue", s: 1 }]);
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("entry_referenced");
        expect((await continueFieldOperation(store(), site.id, id, actor)).done).toBe(true);
        expect(await rows(a.id)).toEqual([{ t: hall.id, f: "place", k: "place", s: 1 }]);
      });

      it("R12: target deletes, moves and group changes wait while text → reference runs", async () => {
        const site = await world([text("venue")]);
        const hall = await place(site, "Main Hall", { status: "published" });
        const other = await place(site, "Other");
        await entry(site, "events", { status: "published", fields: { venue: "Main Hall" } });
        const op: FieldOperation = {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        };
        let id = "";
        // planned before phase A commits, batched after it: the collections anchor fails it…
        const del = racing(async () => {
          id = (await run(site, op, { budget: { entries: 0 } })).operationId;
        });
        expect(await code(del.deleteContentEntry(hall))).toBe("conflict");
        // …and the retry is refused while the marker is there, as are moves and group changes
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe(
          "field_operation_running",
        );
        expect(
          await code(store().updateContentEntry({ ...(await fresh(hall)), collection: "events" })),
        ).toBe("field_operation_running");
        // a group change: `other` joins the hall's group as a valid Turkish translation
        const source = await fresh(hall);
        const translation = {
          group: hall.id,
          method: "human" as const,
          source: { id: hall.id, locale: "en", rev: source.rev, hash: await nodeHash(source) },
        };
        expect(
          await code(
            store().updateContentEntry({ ...(await fresh(other)), locale: "tr", translation }),
          ),
        ).toBe("field_operation_running");
        expect((await continueFieldOperation(store(), site.id, id, actor)).done).toBe(true);
        // phase C dropped the marker: the published referrer's row now locks the hall
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("entry_referenced");
        expect(await code(store().deleteContentEntry(await fresh(other)))).toBe("ok");
      });
    });
  });
}

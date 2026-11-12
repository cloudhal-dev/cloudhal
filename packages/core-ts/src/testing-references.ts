/**
 * RFC-0045 rollout step 2: the store and integrity of reference fields, on every backend
 * (`describeSiteGraphStore`). The types stay refused in production; this suite enables them with
 * `SiteGraphStoreOptions.fieldTypes` on a store of its own.
 *
 * Covered: `entry_refs` rows and canonical group ids; the target guard (missing, cross-site,
 * wrong-collection, own-group, archived targets); the definitions and collections anchors; the
 * delete, move and group-change rules with the "shown by a published entry" policy; the relink
 * refusal and the written-group guard; `field_operation_running`; rebuilds in imports; and the
 * races R1 to R16 of §2.3 as interleaved batches (`racingDriver`). R8, R9 and R14 are noted where
 * they stand: R8 and R14 are accepted, R9 needs the operations of rollout step 4.
 */
import type { Actor, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { forEdition } from "./cross-site.ts";
import { ConflictError, InvariantError } from "./errors.ts";
import { runFieldOperation } from "./fields-operations/index.ts";
import { loadEntries, rewritePass } from "./fields-operations/rewrite.ts";
import { operationContext } from "./fields-operations/types.ts";
import { canonicalJson, nodeHash } from "./hash.ts";
import { PNG_1X1 } from "./media/fixtures.ts";
import { editionReferences } from "./references/editions.ts";
import { SiteGraphStore } from "./store.ts";
import { exportSite, importSite } from "./sync.ts";
import { racingDriver, type SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const ENABLED = { supported: () => true };

const VENUE: FieldDefinition = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places", "halls"],
};
const SPONSOR: FieldDefinition = {
  key: "sponsor",
  type: "reference",
  labels: L("Sponsor"),
  localized: true,
  collections: ["people"],
};
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [
    { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
    { key: "talk", type: "text", labels: L("Talk") },
    { key: "photo", type: "image", labels: L("Photo") },
  ],
};
const ROOM: FieldDefinition = {
  key: "room",
  type: "reference",
  labels: L("Room"),
  localized: false,
  collections: ["places"],
};

const COLLECTIONS: NonNullable<Site["collections"]> = {
  events: { fields: [VENUE, SPONSOR, SPEAKERS] },
  talks: { fields: [ROOM] },
  places: {},
  halls: {},
  people: {},
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

interface RefRow {
  target_id: string;
  field: string;
  root_key: string;
  shared: number;
  source_status: string;
}

export function referencesSuite(ctx: SuiteContext): void {
  describe("RFC-0045 step 2: entry_refs and reference integrity", () => {
    let n = 0;
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 11, 9, 0, tick++));
    const make = (sql = ctx.sql()) =>
      new SiteGraphStore({
        sql,
        blobs: ctx.blobs(),
        now,
        gates: GATES_ENFORCED,
        fieldTypes: ENABLED,
      });
    const store = () => make();
    /** A store whose first matching write first runs `hook` (the batch that commits first). */
    const racing = (hook: () => Promise<void>, when?: (q: string) => boolean) =>
      make(racingDriver(ctx.sql(), hook, when));
    const storage = () => ({ sql: ctx.sql(), blobs: ctx.blobs() });

    async function world(collections: Site["collections"] | null = COLLECTIONS): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Refs",
        slug: `refs-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Refs",
        slug: `refs-site-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        ...(collections ? { collections } : {}),
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

    const sourceOf = async (e: ContentEntry) => ({
      id: e.id,
      locale: e.locale,
      rev: e.rev,
      hash: await nodeHash(e),
    });
    const translate = async (e: ContentEntry, over: Partial<ContentEntry> = {}) =>
      entry((await store().getSite(e.siteId)) as Site, e.collection, {
        locale: "tr",
        slug: `${e.slug}-tr`,
        translation: { group: e.id, method: "human", source: await sourceOf(e) },
        ...over,
      });

    const rows = (sourceId: string) =>
      ctx
        .sql()
        .all<RefRow & Record<string, unknown>>(
          "SELECT target_id, field, root_key, shared, source_status FROM entry_refs WHERE source_id = ? ORDER BY field, target_id",
          [sourceId],
        );
    const fresh = async (e: ContentEntry) => (await store().getContentEntry(e.id)) as ContentEntry;
    const update = (e: ContentEntry, over: Partial<ContentEntry>) =>
      store().updateContentEntry({ ...e, ...over });
    /** Writes a site body directly: a field operation's phase A, as its own batch would. */
    async function rawSite(siteId: string, change: (s: Site) => Site) {
      const site = (await store().getSite(siteId)) as Site;
      const next = { ...change(site), rev: site.rev + 1 };
      await ctx
        .sql()
        .run("UPDATE nodes SET rev = ?, hash = ?, body = ? WHERE id = ?", [
          next.rev,
          await nodeHash(next),
          canonicalJson(next),
          site.id,
        ]);
    }
    const withFields = (site: Site, collection: string, fields: FieldDefinition[]): Site => ({
      ...site,
      collections: {
        ...site.collections,
        [collection]: { ...site.collections?.[collection], fields } as never,
      },
    });

    describe("writes", () => {
      it("writes one row per stored value, deduplicated after canonical group ids", async () => {
        const site = await world();
        const hall = await entry(site, "places", { status: "published" });
        const hallTr = await translate(hall, { status: "published" });
        const ada = await entry(site, "people");
        const event = await entry(site, "events", {
          status: "published",
          fields: {
            // the Turkish member's id is stored as its group's
            venue: hallTr.id,
            speakers: [
              { person: ada.id, talk: "Opening" },
              { person: ada.id, talk: "Closing" },
            ],
          },
        });
        expect(event.fields?.venue).toBe(hall.id);
        expect(await rows(event.id)).toEqual([
          {
            target_id: ada.id,
            field: "speakers.person",
            root_key: "speakers",
            shared: 1,
            source_status: "published",
          },
          {
            target_id: hall.id,
            field: "venue",
            root_key: "venue",
            shared: 1,
            source_status: "published",
          },
        ]);
        // every write rewrites the rows: the status follows, a removed value goes
        const draft = await update(event, { status: "draft", fields: { venue: hall.id } });
        expect(await rows(draft.id)).toEqual([
          {
            target_id: hall.id,
            field: "venue",
            root_key: "venue",
            shared: 1,
            source_status: "draft",
          },
        ]);
        await store().deleteContentEntry(await fresh(draft));
        expect(await rows(draft.id)).toEqual([]);
      });

      it("refuses missing, cross-site, wrong-collection, own-group and archived new targets", async () => {
        const site = await world();
        const other = await world();
        const foreign = await entry(other, "places");
        const person1 = await entry(site, "people");
        const archived = await entry(site, "places", { status: "archived" });
        const event = await entry(site, "events");
        const set = (fields: Record<string, unknown>) => update(event, { fields });
        expect(await code(set({ venue: "entry_01HZX8K3QMISSING" }))).toBe("unknown_entry");
        // another site's id is refused exactly like one that does not exist
        expect(await code(set({ venue: foreign.id }))).toBe("unknown_entry");
        // an entry outside the field's collections is a value to fix (422), not the move race's 409
        expect(await code(set({ venue: person1.id }))).toBe("unknown_entry");
        expect(await code(set({ venue: archived.id }))).toBe("unknown_entry");
        expect(await code(set({ speakers: [{ person: event.id }] }))).toBe("invalid_fields");
        expect(await rows(event.id)).toEqual([]);
      });

      it("keeps an existing value whose target was archived, and refuses publishing a dangling one", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        await update(hall, { status: "archived" });
        // unchanged values are not re-checked by a draft write; going live checks every own value
        const titled = await update(event, { title: "Renamed" });
        expect(await code(update(titled, { status: "published" }))).toBe("ok");
        const live = await fresh(event);
        await update(live, { status: "draft" });
        await store().deleteContentEntry(await fresh(hall));
        expect(await code(update(await fresh(event), { status: "published" }))).toBe(
          "unknown_entry",
        );
        // the row is kept for the dangling value (the invariant), and blocks once a member returns
        expect((await rows(event.id)).map((r) => r.target_id)).toEqual([hall.id]);
      });
    });

    describe("delete, move and group change", () => {
      it("a published referrer blocks deleting the last usable member; a draft one does not", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const draft = await entry(site, "events", { fields: { venue: hall.id } });
        const live = await entry(site, "events", {
          status: "published",
          fields: { venue: hall.id },
        });
        const e = await code(store().deleteContentEntry(await fresh(hall)));
        expect(e).toBe("entry_referenced");
        try {
          await store().deleteContentEntry(await fresh(hall));
        } catch (err) {
          const details = (err as InvariantError).details as {
            referrers: { id: string }[];
            total: number;
          };
          expect(details.referrers.map((r) => r.id)).toEqual([live.id]);
          expect(details.total).toBe(1);
        }
        // archiving is allowed, and does not release the lock (decision 2)
        await update(await fresh(hall), { status: "archived" });
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("entry_referenced");
        await update(live, { status: "draft" });
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
        expect(await rows(draft.id)).toHaveLength(1);
      });

      it("another usable member in an allowed collection lets the delete go", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const hallTr = await translate(hall);
        await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        // a translation is a member: deleting the original keeps the group in the site
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
        expect(await code(store().deleteContentEntry(await fresh(hallTr)))).toBe(
          "entry_referenced",
        );
      });

      it("a member in a collection the field does not allow does not count", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        await translate(hall, { collection: "people" } as never);
        await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("entry_referenced");
      });

      it("moves: refused out of every allowed collection, allowed into another one", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const talk = await entry(site, "talks", { status: "published", fields: { room: hall.id } });
        expect(await code(update(hall, { collection: "halls" }))).toBe("reference_target_moved");
        await update(talk, { status: "draft" });
        await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        // venue allows halls: the move keeps it satisfied by the node itself
        expect(await code(update(await fresh(hall), { collection: "halls" }))).toBe("ok");
        expect(await code(update(await fresh(hall), { collection: "people" }))).toBe(
          "reference_target_moved",
        );
      });

      it("group changes: leaving a referenced group is refused; a relinked node leaves it", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const other = await entry(site, "places", { locale: "tr" });
        await entry(site, "events", { status: "published", fields: { venue: other.id } });
        // relinking `other` as a translation of `hall` leaves its own group
        const relink = {
          translation: { group: hall.id, method: "human" as const, source: await sourceOf(hall) },
        };
        expect(await code(update(other, relink))).toBe("entry_referenced");
      });

      it("relink with a draft referrer, then publish the referrer (refused), then delete", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const other = await entry(site, "places", { locale: "tr" });
        const event = await entry(site, "events", { fields: { venue: other.id } });
        const relinked = await update(other, {
          translation: { group: hall.id, method: "human", source: await sourceOf(hall) },
        });
        expect(relinked.translation?.group).toBe(hall.id);
        // the old group id has no member any more: by id alone the node is not a member
        expect(await code(update(event, { status: "published" }))).toBe("unknown_entry");
        expect(await code(store().deleteContentEntry(await fresh(relinked)))).toBe("ok");
      });

      it("refuses relinking an original that has translations (translation_group_in_use)", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        await translate(hall);
        const other = await entry(site, "places", { locale: "tr", slug: "other" });
        const relink = {
          translation: { group: other.id, method: "human" as const, source: await sourceOf(other) },
        };
        expect(await code(update(hall, { ...relink, locale: "en" }))).toBe(
          "translation_group_in_use",
        );
      });

      it("a translation becoming its own original is not refused by the written-group guard", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const tr = await translate(hall);
        const own = { translation: { group: tr.id, method: "original" as const } };
        expect(await code(update(tr, own))).toBe("ok");
      });

      it("a delete or move on a site without collections binds SQL NULL in the anchor", async () => {
        const site = await world(null);
        const post = await entry(site, "posts");
        expect(await code(update(post, { collection: "notes" }))).toBe("ok");
        expect(await code(store().deleteContentEntry(await fresh(post)))).toBe("ok");
      });
    });

    describe("imports", () => {
      it("stores canonical bodies, so the anchors compare equal text", async () => {
        const site = await world();
        const bundle = await exportSite(storage(), site.id);
        const copy = structuredClone(bundle);
        const row = copy.nodes.find((r) => r.kind === "site");
        if (!row) throw new Error("no site row");
        // the same document with its keys in another order: same hash, other text
        const parsed = JSON.parse(row.body) as Record<string, unknown>;
        row.body = JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()));
        row.rev += 0;
        const moved = copy.nodes.find((r) => r.kind !== "site");
        if (moved) moved.updated_at = "2026-11-11T00:00:00.000Z";
        await importSite(storage(), copy, { mode: "replace", fieldTypes: ENABLED });
        const stored = await ctx
          .sql()
          .get<{ body: string }>("SELECT body FROM nodes WHERE id = ?", [site.id]);
        expect(stored?.body).toBe(canonicalJson(parsed));
        const hall = await entry(site, "places");
        expect(await code(entry(site, "events", { fields: { venue: hall.id } }))).toBe("ok");
      });

      it("a new snapshot of a site without the capability cannot point at a held site body that defines them", async () => {
        const capable = await world();
        const plain = await world({ notes: {} });
        const only = { supported: (id: string) => id === capable.id };
        const held = await store().createSnapshot(capable.id, { actor: person, reason: "manual" });
        const heldSite = held.nodes.find((r) => r.kind === "site");
        const own = await store().createSnapshot(plain.id, { actor: person, reason: "manual" });
        const bundle = await exportSite(storage(), plain.id);
        const row = bundle.snapshots.find((r) => r.id === own.id);
        if (!row || !heldSite) throw new Error("no snapshot");
        const forged = { ...own, id: "snap_01HZX8K3QFORGE" };
        forged.nodes = own.nodes.map((r) =>
          r.kind === "site" ? { ...r, hash: heldSite.hash } : r,
        );
        bundle.snapshots.push({ ...row, id: forged.id, body: canonicalJson(forged) });
        expect(
          await code(importSite(storage(), bundle, { mode: "replace", fieldTypes: only })),
        ).toBe("fields_unsupported");
        expect(await store().getSnapshot(forged.id)).toBeUndefined();
      });
    });

    describe("assets inside repeater items (§2.5)", () => {
      const upload = async (siteId: string, bytes: Uint8Array, filename: string) =>
        (
          await store().ingestAsset({
            siteId,
            bytes,
            filename,
            uploadedBy: person,
            source: { kind: "upload" },
            fields: { decorative: true },
          })
        ).asset;
      const assetRows = (nodeId: string) =>
        ctx
          .sql()
          .all<{ asset_id: string; field: string }>(
            "SELECT asset_id, field FROM asset_refs WHERE node_id = ? AND field LIKE 'fields.%'",
            [nodeId],
          );

      it("records an item's image, keeps it through a rebuild, and blocks its delete", async () => {
        const site = await world();
        const photo = await upload(site.id, PNG_1X1, "dot.png");
        const event = await entry(site, "events", {
          fields: { speakers: [{ talk: "Opening" }, { talk: "Talk", photo: photo.id }] },
        });
        expect(await assetRows(event.id)).toEqual([
          { asset_id: photo.id, field: "fields.speakers.photo" },
        ]);
        expect(await code(store().deleteAsset(photo))).toBe("in_use");
        const bundle = await exportSite(storage(), site.id);
        await update(await fresh(event), { title: "Moved on" });
        await importSite(storage(), bundle, { mode: "replace", fieldTypes: ENABLED });
        expect(await assetRows(event.id)).toHaveLength(1);
      });

      it("refuses a non-image in an image sub-field at its item path", async () => {
        const site = await world();
        const csv = await upload(site.id, new TextEncoder().encode("a,b\n1,2\n"), "data.csv");
        try {
          await entry(site, "events", { fields: { speakers: [{ talk: "x" }, { photo: csv.id }] } });
          throw new Error("expected a refusal");
        } catch (e) {
          const issues = (e as InvariantError).details.issues as { path: string }[];
          expect(issues.map((i) => i.path)).toEqual(["fields/speakers/1/photo"]);
        }
      });

      it("reports a bad asset at every item that uses it", async () => {
        const site = await world();
        const csv = await upload(site.id, new TextEncoder().encode("a,b\n1,2\n"), "data.csv");
        const speakers = [{ photo: csv.id }, { talk: "x" }, { photo: csv.id }];
        try {
          await entry(site, "events", { fields: { speakers } });
          throw new Error("expected a refusal");
        } catch (e) {
          const issues = (e as InvariantError).details.issues as { path: string }[];
          expect(issues.map((i) => i.path)).toEqual([
            "fields/speakers/0/photo",
            "fields/speakers/2/photo",
          ]);
        }
      });
    });

    describe("field operations (§2.6)", () => {
      const BLURB: FieldDefinition = {
        key: "blurb",
        type: "text",
        labels: L("Blurb"),
        localized: true,
      };

      it("a text field's rename rewrites entries holding references and keeps their rows", async () => {
        const site = await world({ ...COLLECTIONS, events: { fields: [VENUE, BLURB] } });
        const hall = await entry(site, "places");
        const event = await entry(site, "events", {
          status: "published",
          fields: { venue: hall.id, blurb: "Hi" },
        });
        const op = {
          op: "rename_field",
          collection: "events",
          from: "blurb",
          to: "teaser",
        } as const;
        await runFieldOperation(store(), site.id, op, { actor: person });
        expect((await fresh(event)).fields).toEqual({ venue: hall.id, teaser: "Hi" });
        expect(await rows(event.id)).toEqual([
          {
            target_id: hall.id,
            field: "venue",
            root_key: "venue",
            shared: 1,
            source_status: "published",
          },
        ]);
      });

      it("R9: a rewrite changing a reference value skips the entry when its target goes first", async () => {
        // Operations that convert into references come with rollout step 4; the rewrite path they
        // will use is driven directly here, with a decision that changes a reference value.
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const pass = async (on: SiteGraphStore, target: string) => {
          const ctx2 = operationContext(on, {});
          return rewritePass({
            ctx: ctx2,
            site: (await store().getSite(site.id)) as Site,
            rows: await loadEntries(ctx2, site.id, "events"),
            defs: [VENUE, SPONSOR, SPEAKERS],
            decide: (row) =>
              row.entry.id === event.id ? { fields: { venue: target } } : undefined,
            guard: undefined,
            done: 0,
            lists: { collection: "events", keys: ["venue"] },
          });
        };
        const gone = await entry(site, "places");
        const raced = racing(async () => {
          await store().deleteContentEntry(await fresh(gone));
        });
        const r = await pass(raced, gone.id);
        expect(r.rewritten).toBe(0);
        expect(r.skipped.map((x) => x.entryId)).toEqual([event.id]);
        expect((await fresh(event)).fields?.venue).toBe(hall.id);
        expect((await rows(event.id)).map((x) => x.target_id)).toEqual([hall.id]);
        // without the race the rewrite lands, rows and all
        const kept = await entry(site, "places");
        expect((await pass(store(), kept.id)).rewritten).toBe(1);
        expect((await rows(event.id)).map((x) => x.target_id)).toEqual([kept.id]);
      });

      it("operations name reference and repeater fields since step 4 (testing-field-operations)", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const op = {
          op: "rename_field",
          collection: "events",
          from: "venue",
          to: "place",
        } as const;
        expect((await runFieldOperation(store(), site.id, op, { actor: person })).done).toBe(true);
        expect(await rows(event.id)).toEqual([
          {
            target_id: hall.id,
            field: "place",
            root_key: "place",
            shared: 1,
            source_status: "draft",
          },
        ]);
      });
    });

    describe("language editions (§3)", () => {
      it("carries ids the edition can resolve, drops the rest and emptied items, and guards the group there", async () => {
        const site = await world();
        const edition = await store().createSite({
          projectId: site.projectId,
          name: "Edition",
          slug: `refs-edition-${n}`,
          defaultLocale: "de",
          locales: ["de"],
          domains: [],
          pageIds: [],
          theme: { name: "blog" },
          collections: COLLECTIONS,
        });
        const hall = await entry(site, "places", { status: "published" });
        const ada = await entry(site, "people");
        const hallDe = await entry(edition, "places", {
          locale: "de",
          translation: {
            group: hall.id,
            method: "human",
            source: { ...(await sourceOf(hall)), siteId: site.id },
          },
        });
        const event = await entry(site, "events", {
          fields: {
            venue: hall.id,
            speakers: [{ person: ada.id }, { person: ada.id, talk: "Hi" }],
          },
        });
        let dropped: { path: string; groupId?: string }[] = [];
        const copy = await forEdition(store(), event, {
          fromSiteId: site.id,
          toSiteId: edition.id,
          actor: person,
          onDropped: (d) => {
            dropped = d;
          },
        });
        expect(copy.fields).toEqual({ venue: hall.id, speakers: [{ talk: "Hi" }] });
        expect(dropped).toEqual([
          { path: "fields/speakers/0/person", groupId: ada.id, reason: "missing" },
          { path: "fields/speakers/0", reason: "empty" },
          { path: "fields/speakers/1/person", groupId: ada.id, reason: "missing" },
        ]);
        // the edition's event names the source site's group id, resolved by the edition's member
        await entry(edition, "events", {
          locale: "de",
          status: "published",
          fields: { venue: hall.id },
        });
        expect(await code(store().deleteContentEntry(await fresh(hallDe)))).toBe(
          "entry_referenced",
        );
        // and the source site's original is free: the edition's rows pin nothing there
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
      });
      it("a re-save keeps the values the stored edition entry already holds (not fresh)", async () => {
        const OPEN: FieldDefinition = {
          key: "open",
          type: "boolean",
          labels: L("Open"),
          localized: false,
        };
        const source = await world();
        const edition = await store().createSite({
          projectId: source.projectId,
          name: "Edition",
          slug: `refs-edition-resave-${n}`,
          defaultLocale: "de",
          locales: ["de"],
          domains: [],
          pageIds: [],
          theme: { name: "blog" },
          collections: {
            ...COLLECTIONS,
            places: { fields: [OPEN], listFields: ["open"] },
            events: {
              fields: [
                {
                  ...VENUE,
                  collections: ["places"],
                  where: [{ field: "open", op: "eq", value: "true" }],
                } as never,
                SPONSOR,
                SPEAKERS,
              ],
            },
          },
        });
        const hall = await entry(source, "places", { status: "published" });
        const hallDe = await entry(edition, "places", {
          locale: "de",
          fields: { open: true },
          translation: {
            group: hall.id,
            method: "human",
            source: { ...(await sourceOf(hall)), siteId: source.id },
          },
        });
        const event = await entry(source, "events", { fields: { venue: hall.id } });
        const stored = await entry(edition, "events", { locale: "de", fields: { venue: hall.id } });
        // the target closes and is archived after the edition entry chose it
        await update(await fresh(hallDe), { fields: { open: false }, status: "archived" });
        let dropped: unknown[] = [];
        const copy = await forEdition(
          store(),
          { ...event, id: stored.id },
          {
            fromSiteId: source.id,
            toSiteId: edition.id,
            actor: person,
            onDropped: (d) => {
              dropped = d;
            },
          },
        );
        expect(copy.fields).toEqual({ venue: hall.id });
        expect(dropped).toEqual([]);
        // and the edition's write keeps it too: an unchanged value is not re-checked
        expect(
          await code(update(await fresh(stored), { title: "Wieder", fields: copy.fields })),
        ).toBe("ok");
      });

      it("counts every unchanged reference toward the cap first, repeated targets included", async () => {
        const PERSON = {
          key: "person",
          type: "reference",
          labels: L("Person"),
          collections: ["people"],
        };
        const crew = (key: string) =>
          ({
            key,
            type: "repeater",
            labels: L(key),
            localized: false,
            maxItems: 50,
            fields: [PERSON],
          }) as never;
        const site = await world({
          ...COLLECTIONS,
          events: {
            fields: [
              { ...VENUE, multiple: true, maxItems: 5 } as never,
              crew("speakers"),
              crew("crew"),
            ],
          },
        });
        const hall = await entry(site, "places");
        const ada = await entry(site, "people");
        // 100 references to one group in two unchanged repeaters: the cap is full
        const items = Array.from({ length: 50 }, () => ({ person: ada.id }));
        const stored = await entry(site, "events", { fields: { speakers: items, crew: items } });
        const { fields, dropped } = await editionReferences(
          ctx.sql(),
          (await store().getSite(site.id)) as Site,
          {
            entry: {
              collection: "events",
              fields: { venue: [hall.id], speakers: items, crew: items },
            },
            stored,
          },
        );
        // the changed key comes first in the definitions, yet the unchanged ones count first
        expect(fields).toEqual({ speakers: items, crew: items });
        expect(dropped).toEqual([{ path: "fields/venue/0", groupId: hall.id, reason: "cap" }]);
        expect(await code(update(await fresh(stored), { fields: fields ?? {} }))).toBe("ok");
        expect(
          await code(
            update(await fresh(stored), {
              fields: { venue: [hall.id], speakers: items, crew: items },
            }),
          ),
        ).toBe("too_many_references");
      });

      it("an archived same-site original still lends its where field to a translation member", async () => {
        const OPEN: FieldDefinition = {
          key: "open",
          type: "boolean",
          labels: L("Open"),
          localized: false,
        };
        const site = await world({
          ...COLLECTIONS,
          places: { fields: [OPEN], listFields: ["open"] },
          events: {
            fields: [
              {
                ...VENUE,
                collections: ["places"],
                where: [{ field: "open", op: "eq", value: "true" }],
              } as never,
              SPONSOR,
              SPEAKERS,
            ],
          },
        });
        const original = await entry(site, "places", { fields: { open: true } });
        await translate(original, { fields: {} });
        await update(await fresh(original), { status: "archived" });
        const { fields, dropped } = await editionReferences(
          ctx.sql(),
          (await store().getSite(site.id)) as Site,
          {
            entry: { collection: "events", fields: { venue: original.id } },
          },
        );
        expect(dropped).toEqual([]);
        expect(fields).toEqual({ venue: original.id });
      });

      it("keeps only what the edition's field accepts: where, a single target, maxItems, fromKey", async () => {
        const OPEN: FieldDefinition = {
          key: "open",
          type: "boolean",
          labels: L("Open"),
          localized: false,
        };
        const source = await world({
          ...COLLECTIONS,
          events: { fields: [{ ...VENUE, multiple: true } as never, SPONSOR, SPEAKERS] },
        });
        const edition = await store().createSite({
          projectId: source.projectId,
          name: "Edition",
          slug: `refs-edition-rules-${n}`,
          defaultLocale: "de",
          locales: ["de"],
          domains: [],
          pageIds: [],
          theme: { name: "blog" },
          collections: {
            ...COLLECTIONS,
            places: { fields: [OPEN], listFields: ["open"] },
            events: {
              fields: [
                {
                  ...VENUE,
                  collections: ["places"],
                  where: [{ field: "open", op: "eq", value: "true" }],
                } as never,
                SPONSOR,
                { ...SPEAKERS, maxItems: 1 } as never,
              ],
            },
          },
        });
        const member = async (open: boolean) => {
          const original = await entry(source, "places", { status: "published" });
          await entry(edition, "places", {
            locale: "de",
            fields: { open },
            translation: {
              group: original.id,
              method: "human",
              source: { ...(await sourceOf(original)), siteId: source.id },
            },
          });
          return original;
        };
        const closed = await member(false);
        const open1 = await member(true);
        const open2 = await member(true);
        const event = await entry(source, "events", {
          fields: {
            venue: [closed.id, open1.id, open2.id],
            speakers: [{ talk: "One" }, { talk: "Two" }],
          },
        });
        let dropped: { path: string; groupId?: string; reason: string }[] = [];
        const copy = await forEdition(store(), event, {
          fromSiteId: source.id,
          toSiteId: edition.id,
          actor: person,
          onDropped: (d) => {
            dropped = d;
          },
        });
        expect(copy.fields).toEqual({ venue: open1.id, speakers: [{ talk: "One" }] });
        expect(dropped).toEqual([
          { path: "fields/venue/0", groupId: closed.id, reason: "where" },
          { path: "fields/venue/2", groupId: open2.id, reason: "single" },
          { path: "fields/speakers/1", reason: "maxItems" },
        ]);
        // the copy is a write the edition accepts
        expect(await code(entry(edition, "events", { locale: "de", fields: copy.fields }))).toBe(
          "ok",
        );
        // a running rename on the edition: values are read, filtered and kept under the old key
        await rawSite(edition.id, (s) =>
          withFields(s, "events", [
            {
              ...VENUE,
              key: "place",
              collections: ["places"],
              migration: { id: "snap_01HZX8K3Q9MG", fromKey: "venue" },
            } as never,
            SPONSOR,
            SPEAKERS,
          ]),
        );
        const renamed = await forEdition(
          store(),
          { ...event, fields: { venue: ["entry_01HZX8K3QGONE"] } },
          {
            fromSiteId: source.id,
            toSiteId: edition.id,
            actor: person,
          },
        );
        expect(renamed.fields).toEqual({});
      });
    });

    describe("review of PR #205", () => {
      /** Reverses every object's key order: a site row an older import stored verbatim. */
      const verbatim = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(verbatim);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([k, v]) => [k, verbatim(v)]),
        );
      };

      it("a verbatim (non-canonical) site row without reference fields takes writes, deletes and relinks", async () => {
        const BLURB: FieldDefinition = {
          key: "blurb",
          type: "text",
          labels: L("Blurb"),
          localized: false,
        };
        const site = await world({ notes: { fields: [BLURB] }, places: {} });
        const fresh0 = (await store().getSite(site.id)) as Site;
        await ctx
          .sql()
          .run("UPDATE nodes SET body = ? WHERE id = ?", [
            JSON.stringify(verbatim(fresh0)),
            site.id,
          ]);
        const stored = await ctx
          .sql()
          .get<{ body: string }>("SELECT body FROM nodes WHERE id = ?", [site.id]);
        expect(stored?.body).not.toBe(canonicalJson(fresh0));
        const note = await entry(site, "notes", { fields: { blurb: "a" } });
        expect(await code(update(note, { fields: { blurb: "b" } }))).toBe("ok");
        const other = await entry(site, "notes", { locale: "tr", slug: "other" });
        const relink = {
          translation: {
            group: note.id,
            method: "human" as const,
            source: await sourceOf(await fresh(note)),
          },
        };
        expect(await code(update(other, relink))).toBe("ok");
        expect(await code(update(await fresh(note), { collection: "places" }))).not.toBe(
          "conflict",
        );
        expect(await code(store().deleteContentEntry(await fresh(other)))).toBe("ok");
      });

      it("20 blocking pairs bind a fixed number of parameters (delete and group change)", async () => {
        const WHO: FieldDefinition = {
          key: "who",
          type: "reference",
          labels: L("Who"),
          localized: false,
          collections: ["people"],
        };
        const many: NonNullable<Site["collections"]> = { people: {} };
        for (let i = 0; i < 22; i++) many[`c${i}`] = { fields: [WHO] };
        const site = await world(many);
        const ada = await entry(site, "people");
        const adaTr = await translate(ada);
        for (let i = 0; i < 22; i++)
          await entry(site, `c${i}`, { status: "published", fields: { who: ada.id } });
        // the original's translation leaves the group: the original still holds it
        const own = { translation: { group: adaTr.id, method: "original" as const } };
        expect(await code(update(adaTr, own))).toBe("ok");
        // the last member: refused as entry_referenced, never a statement-limit error
        expect(await code(store().deleteContentEntry(await fresh(ada)))).toBe("entry_referenced");
      });

      it("adding a reference sub-field over a key items already hold is field_key_in_use", async () => {
        const ROLES: FieldDefinition = {
          key: "speakers",
          type: "repeater",
          labels: L("Speakers"),
          localized: false,
          fields: [{ key: "talk", type: "text", labels: L("Talk") }],
        };
        const site = await world({ events: { fields: [ROLES] }, people: {} });
        const event = await entry(site, "events", { fields: { speakers: [{ talk: "x" }] } });
        // items as an import could hold them: a key the repeater does not define (yet)
        await ctx
          .sql()
          .run(
            "UPDATE nodes SET body = json_set(body, '$.fields.speakers', json(?)) WHERE id = ?",
            [JSON.stringify([{ talk: "x", person: "entry_01HZX8K3QPERS" }]), event.id],
          );
        const s = (await store().getSite(site.id)) as Site;
        const withPerson = withFields(s, "events", [
          {
            ...ROLES,
            fields: [
              ...(ROLES as { fields: unknown[] }).fields,
              { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
            ],
          } as never,
        ]);
        expect(await code(store().updateSite(withPerson))).toBe("field_key_in_use");
      });
    });

    describe("races (§2.3): the batch that commits second fails, then retries or refuses", () => {
      it("R1: a referrer write and deleting the target's last member", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        // the referrer commits first: the delete's batch-time condition sees its row
        const del = racing(async () => {
          await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        });
        expect(await code(del.deleteContentEntry(hall))).toBe("entry_referenced");
        // the delete commits first: the referrer's target guard sees no member
        const hall2 = await entry(site, "places");
        const event = await entry(site, "events");
        const write = racing(async () => {
          await store().deleteContentEntry(await fresh(hall2));
        });
        expect(
          await code(write.updateContentEntry({ ...event, fields: { venue: hall2.id } })),
        ).toBe("unknown_entry");
        expect(await rows(event.id)).toEqual([]);
      });

      it("R2: a referrer write and moving the target to a disallowed collection", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const talk = await entry(site, "talks");
        const write = racing(async () => {
          await update(await fresh(hall), { collection: "people" });
        });
        expect(await code(write.updateContentEntry({ ...talk, fields: { room: hall.id } }))).toBe(
          "unknown_entry",
        );
        const hall2 = await entry(site, "places");
        const move = racing(async () => {
          await entry(site, "talks", { status: "published", fields: { room: hall2.id } });
        });
        expect(await code(move.updateContentEntry({ ...hall2, collection: "people" }))).toBe(
          "reference_target_moved",
        );
      });

      it("R3: a referrer write and adding a reference field over its key (definitions anchor)", async () => {
        const site = await world({ notes: {}, places: {} });
        const hall = await entry(site, "places");
        const note = await entry(site, "notes");
        // the site write commits first: the entry write planned without definitions conflicts
        const write = racing(async () => {
          const s = (await store().getSite(site.id)) as Site;
          await store().updateSite(withFields(s, "notes", [ROOM]));
        });
        expect(await code(write.updateContentEntry({ ...note, fields: { room: hall.id } }))).toBe(
          "conflict",
        );
        // on retry the definition is known, and the value gets its row
        await update(await fresh(note), { fields: { room: hall.id } });
        expect((await rows(note.id)).map((r) => r.field)).toEqual(["room"]);
        // adding a field over a key entries hold is refused
        const plain = await world({ notes: {}, places: {} });
        await entry(plain, "notes", { fields: { room: "entry_01HZX8K3QTEXT00" } });
        const s = (await store().getSite(plain.id)) as Site;
        expect(await code(store().updateSite(withFields(s, "notes", [ROOM])))).toBe(
          "field_key_in_use",
        );
      });

      it("R3: removing an allowed collection while a value's group has a member there", async () => {
        const site = await world();
        const hall = await entry(site, "halls");
        await entry(site, "events", { fields: { venue: hall.id } });
        const narrowed = withFields(site, "events", [
          { ...VENUE, collections: ["places"] } as never,
          SPONSOR,
          SPEAKERS,
        ]);
        expect(await code(store().updateSite(narrowed))).toBe("field_change_needs_operation");
        expect(
          await code(
            store().updateSite(
              withFields(site, "events", [
                { ...VENUE, multiple: true } as never,
                SPONSOR,
                SPEAKERS,
              ]),
            ),
          ),
        ).toBe("field_change_needs_operation");
      });

      it("R4, R5: a move or delete and a concurrent definitions change (collections anchor)", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        let extra = 0;
        const edit = async () => {
          const s = (await store().getSite(site.id)) as Site;
          extra++;
          await store().updateSite({
            ...s,
            collections: { ...s.collections, [`extra${extra}`]: {} },
          });
        };
        expect(await code(racing(edit).updateContentEntry({ ...hall, collection: "halls" }))).toBe(
          "conflict",
        );
        expect(await code(racing(edit).deleteContentEntry(await fresh(hall)))).toBe("conflict");
        // a publish changes only settings outside `collections`: no conflict
        const publish = async () => {
          const s = (await store().getSite(site.id)) as Site;
          const snap = await store().createSnapshot(s.id, { actor: person, reason: "manual" });
          await store().publish(s, snap.id);
        };
        expect(await code(racing(publish).deleteContentEntry(await fresh(hall)))).toBe("ok");
      });

      it("R6: changing a member's group and a referrer write", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const other = await entry(site, "places", { locale: "tr" });
        const event = await entry(site, "events", { status: "published" });
        const relink = racing(async () => {
          await update(await fresh(event), { fields: { venue: other.id } });
        });
        const translation = {
          group: hall.id,
          method: "human" as const,
          source: await sourceOf(hall),
        };
        expect(await code(relink.updateContentEntry({ ...other, translation }))).toBe(
          "entry_referenced",
        );
        // the other order: the relinked node no longer matches its old group by id
        const other2 = await entry(site, "places", { locale: "tr", slug: "other-2" });
        const hall2 = await entry(site, "places", { slug: "hall-2" });
        const write = racing(async () => {
          await update(await fresh(other2), {
            translation: { group: hall2.id, method: "human", source: await sourceOf(hall2) },
          });
        });
        expect(
          await code(
            write.updateContentEntry({ ...(await fresh(event)), fields: { venue: other2.id } }),
          ),
        ).toBe("unknown_entry");
      });

      it("R7: a referrer becoming published and deleting its target", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const del = racing(async () => {
          await update(await fresh(event), { status: "published" });
        });
        expect(await code(del.deleteContentEntry(hall))).toBe("entry_referenced");
        const hall2 = await entry(site, "places");
        const event2 = await entry(site, "events", { fields: { venue: hall2.id } });
        const publish = racing(async () => {
          await store().deleteContentEntry(await fresh(hall2));
        });
        expect(await code(publish.updateContentEntry({ ...event2, status: "published" }))).toBe(
          "unknown_entry",
        );
      });

      it("R8 (accepted): a translation inheriting a deleted target goes live and shows nothing", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const tr = await translate(event);
        await store().deleteContentEntry(await fresh(hall));
        expect(await code(update(tr, { status: "published" }))).toBe("ok");
      });

      it("the shared rule: who a value blocks through", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const ada = await entry(site, "people");
        // a draft original's localized: false value blocks once a published translation inherits it
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const tr = await translate(event);
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe("ok");
        const hall2 = await entry(site, "places");
        await update(await fresh(event), { fields: { venue: hall2.id } });
        await update(await fresh(tr), { status: "published" });
        expect(await code(store().deleteContentEntry(await fresh(hall2)))).toBe("entry_referenced");
        // a localized: true value: a draft translation's own value never blocks, and a published
        // translation with its own value does not inherit the original's
        const own = await entry(site, "people");
        await update(await fresh(event), { fields: { venue: hall2.id, sponsor: ada.id } });
        const t2 = await fresh(tr);
        await update(t2, { fields: { sponsor: own.id } });
        expect(await code(store().deleteContentEntry(await fresh(ada)))).toBe("ok");
        expect(await code(store().deleteContentEntry(await fresh(own)))).toBe("entry_referenced");
        expect((await rows(tr.id)).map((r) => r.shared)).toEqual([2]);
      });

      it("R10: an unchanged import does not rebuild; a written node set does", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const bundle = await exportSite(storage(), site.id);
        // a referrer write between the unchanged import's plan and its batch keeps its rows
        const racingStorage = {
          sql: racingDriver(
            ctx.sql(),
            async () => {
              await update(await fresh(event), { status: "published" });
            },
            () => true,
          ),
          blobs: ctx.blobs(),
        };
        const result = await importSite(racingStorage, bundle, { fieldTypes: ENABLED });
        expect(result.nodes.unchanged).toBe(true);
        expect((await rows(event.id))[0]?.source_status).toBe("published");
        // the bundle differs now, so `replace` writes the node set and rebuilds from its bodies
        await importSite(storage(), bundle, { mode: "replace", fieldTypes: ENABLED });
        expect(await rows(event.id)).toEqual([
          {
            target_id: hall.id,
            field: "venue",
            root_key: "venue",
            shared: 1,
            source_status: "draft",
          },
        ]);
        // without the capability the bundle is refused (the gate of step 1)
        expect(await code(importSite(storage(), bundle))).toBe("fields_unsupported");
      });

      it("R11: rows are kept for a missing target and block once a member reappears", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const tr = await translate(hall);
        await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        await store().deleteContentEntry(await fresh(hall));
        // the translation is the group's last member here
        expect(await code(store().deleteContentEntry(await fresh(tr)))).toBe("entry_referenced");
      });

      it("R12: deletes wait while a text → reference conversion runs (field_operation_running)", async () => {
        const site = await world({
          ...COLLECTIONS,
          notes: { fields: [{ key: "where", type: "text", labels: L("Where"), localized: false }] },
        });
        const hall = await entry(site, "places");
        const marker = (s: Site) =>
          withFields(s, "notes", [
            {
              ...ROOM,
              key: "where",
              migration: { id: "snap_01HZX8K3Q9MG", fromType: "text" },
            } as never,
          ]);
        // a delete planned before phase A commits fails on the collections anchor…
        const del = racing(() => rawSite(site.id, marker));
        expect(await code(del.deleteContentEntry(hall))).toBe("conflict");
        // …and its retry is refused until the marker is gone
        expect(await code(store().deleteContentEntry(await fresh(hall)))).toBe(
          "field_operation_running",
        );
        expect(await code(update(await fresh(hall), { collection: "halls" }))).toBe(
          "field_operation_running",
        );
      });

      it("R13: a blocking row from a field the plan did not see forces a retry", async () => {
        const site = await world();
        const place = await entry(site, "places");
        await translate(place, { collection: "halls" } as never);
        await entry(site, "events", { status: "published", fields: { venue: place.id } });
        // venue allows halls, so the hall member keeps it; talks.room allows places only
        const del = racing(async () => {
          await entry(site, "talks", { status: "published", fields: { room: place.id } });
        });
        expect(await code(del.deleteContentEntry(place))).toBe("entry_referenced");
      });

      it("R15: creating a translation of X and relinking X", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const other = await entry(site, "places", { locale: "tr", slug: "other" });
        const target = { group: other.id, method: "human" as const, source: await sourceOf(other) };
        // the translation commits first: the relink sees a dependant
        const relink = racing(async () => {
          await translate(await fresh(hall), { locale: "tr", slug: "hall-tr" });
        });
        expect(await code(relink.updateContentEntry({ ...hall, translation: target }))).toBe(
          "translation_group_in_use",
        );
        // the relink commits first: the joining write's written-group guard fails
        const hall2 = await entry(site, "places", { slug: "hall-2" });
        const source = await sourceOf(hall2);
        const join = racing(async () => {
          const other2 = await entry(site, "places", { locale: "tr", slug: "other-2" });
          await update(await fresh(hall2), {
            translation: { group: other2.id, method: "human", source: await sourceOf(other2) },
          });
        });
        const created = join.createContentEntry({
          siteId: site.id,
          collection: "places",
          slug: "hall-2-de",
          locale: "tr",
          status: "draft",
          title: "Salon",
          body: { format: "markdown", value: "Body" },
          fields: {},
          tags: [],
          author: person,
          translation: { group: hall2.id, method: "human", source },
        } as never);
        expect(await code(created)).toBe("invalid_translation");
      });

      it("R16: a title-only write racing a field operation's phase A fails the definitions anchor", async () => {
        // Since the review of PR #205 every write in a site with reference fields carries the
        // definitions anchor, so phase A (rename, set_field_localized) fails the write, which
        // retries under the new definitions. The batch-time `shared` read (by key or fromKey,
        // the exact key first) is tested on its own in references-store.test.ts.
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const marker = { id: "snap_01HZX8K3Q9MG", fromKey: "venue" };
        const phaseA = [
          (s: Site) =>
            withFields(s, "events", [
              { ...VENUE, key: "place", migration: marker } as never,
              SPONSOR,
              SPEAKERS,
            ]),
          (s: Site) =>
            withFields(s, "events", [
              {
                ...VENUE,
                localized: true,
                migration: { id: "snap_01HZX8K3Q9MG", fromLocalized: false },
              } as never,
              SPONSOR,
              SPEAKERS,
            ]),
        ];
        for (const change of phaseA) {
          const write = racing(() => rawSite(site.id, change));
          expect(
            await code(write.updateContentEntry({ ...(await fresh(event)), title: "Raced" })),
          ).toBe("conflict");
          expect(await rows(event.id)).toEqual([
            {
              target_id: hall.id,
              field: "venue",
              root_key: "venue",
              shared: 1,
              source_status: "draft",
            },
          ]);
          await rawSite(site.id, (s) => withFields(s, "events", [VENUE, SPONSOR, SPEAKERS]));
        }
      });

      it("R16: a key with no definition at batch time fails the batch, never drops the row", async () => {
        const site = await world();
        const hall = await entry(site, "places");
        const event = await entry(site, "events", { fields: { venue: hall.id } });
        const dropped = (s: Site) => withFields(s, "events", [SPONSOR, SPEAKERS]);
        const lost = racing(() => rawSite(site.id, dropped));
        expect(await code(lost.updateContentEntry({ ...event, title: "Lost" }))).toBe("conflict");
        expect(await rows(event.id)).toHaveLength(1);
        expect((await fresh(event)).title).toBe(event.title);
      });

      it("#2: a status-only publish racing a narrowing and a move fails the definitions anchor", async () => {
        const site = await world();
        const target = await entry(site, "places");
        const draft = await entry(site, "events", { fields: { venue: target.id } });
        const publish = racing(async () => {
          const s = (await store().getSite(site.id)) as Site;
          await store().updateSite(
            withFields(s, "events", [
              { ...VENUE, collections: ["places"] } as never,
              SPONSOR,
              SPEAKERS,
            ]),
          );
          await update(await fresh(target), { collection: "halls" });
        });
        expect(await code(publish.updateContentEntry({ ...draft, status: "published" }))).toBe(
          "conflict",
        );
        // the retry plans under the narrowed field and refuses the dangling value
        expect(await code(update(await fresh(draft), { status: "published" }))).toBe(
          "unknown_entry",
        );
      });

      it("R3: a narrowing and a referrer write, both orders", async () => {
        const site = await world();
        const hall = await entry(site, "halls");
        const narrowed = (s: Site) =>
          withFields(s, "events", [
            { ...VENUE, collections: ["places"] } as never,
            SPONSOR,
            SPEAKERS,
          ]);
        // the referrer commits first: the narrowing's count guard fails, and it refuses on diagnosis
        const narrowing = racing(async () => {
          await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        });
        expect(await code(narrowing.updateSite(narrowed(site)))).toBe(
          "field_change_needs_operation",
        );
        // the narrowing commits first: the referrer's definitions anchor fails, the retry refuses
        const other = await world();
        const hall2 = await entry(other, "halls");
        const event = await entry(other, "events");
        const write = racing(async () => {
          await store().updateSite(narrowed((await store().getSite(other.id)) as Site));
        });
        expect(
          await code(write.updateContentEntry({ ...event, fields: { venue: hall2.id } })),
        ).toBe("conflict");
        expect(await code(update(await fresh(event), { fields: { venue: hall2.id } }))).toBe(
          "unknown_entry",
        );
      });

      it("R13 for a move: a field the plan did not see forces a retry", async () => {
        const site = await world();
        const place = await entry(site, "places");
        await entry(site, "events", { status: "published", fields: { venue: place.id } });
        // venue allows halls, so the move keeps it; talks.room, published meanwhile, does not
        const move = racing(async () => {
          await entry(site, "talks", { status: "published", fields: { room: place.id } });
        });
        expect(await code(move.updateContentEntry({ ...place, collection: "halls" }))).toBe(
          "reference_target_moved",
        );
      });

      it("R13 for a group change: a field the plan did not see forces a retry", async () => {
        const site = await world();
        const hall = await entry(site, "halls");
        const member = await translate(hall, { collection: "places" } as never);
        await entry(site, "events", { status: "published", fields: { venue: hall.id } });
        // venue keeps the hall original; talks.room (places only) needs the member that leaves
        const leave = racing(async () => {
          await entry(site, "talks", { status: "published", fields: { room: hall.id } });
        });
        const own = { translation: { group: member.id, method: "original" as const } };
        expect(await code(leave.updateContentEntry({ ...member, ...own }))).toBe(
          "entry_referenced",
        );
      });

      it("a foreign archive does not pin another tenant's entries", async () => {
        const site = await world();
        const victim = await world();
        const hall = await entry(victim, "places");
        const event = await entry(site, "events", { status: "published" });
        // a row naming another site's id (as a hand-made archive could leave) pins nothing there
        await ctx
          .sql()
          .run(
            "INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status) VALUES (?, ?, ?, 'events', 'venue', 'venue', 1, 'published')",
            [site.id, hall.id, event.id],
          );
        expect(await code(store().deleteContentEntry(hall))).toBe("ok");
      });
    });
  });
}

/**
 * RFC-0045 §7, #215: a stored value still in the old shape that does not convert under a running
 * top-level conversion from references (reference ↔ repeater) keeps its `entry_refs` rows through
 * a person's unrelated write, at the paths the rebuild gives it (`oldShapePairs`), so the target
 * stays locked whichever touched the node last. A held row, of a reshape or a text ↔ reference
 * conversion, follows its holder's status (`heldStatusStatement`), as the rebuild writes it.
 * Every rebuild here is real (`rebuildingImport`). Runs on every backend
 * (`describeSiteGraphStore`); the types are enabled with `SiteGraphStoreOptions.fieldTypes`.
 */
import type { Actor, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { ConflictError, InvariantError } from "./errors.ts";
import { type FieldOperation, runFieldOperation } from "./fields-operations/index.ts";
import { SiteGraphStore } from "./store.ts";
import { rebuildingImport } from "./testing-reimport.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const ENABLED = { supported: () => true };
const PERSON = { key: "person", type: "reference", labels: L("Person"), collections: ["places"] };

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

export function fieldOperationsOldShapeSuite(ctx: SuiteContext): void {
  describe("RFC-0045 §7 held rows: old-shape values and status (#215)", () => {
    let n = 0;
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 13, 9, 0, tick++));
    const store = () =>
      new SiteGraphStore({
        sql: ctx.sql(),
        blobs: ctx.blobs(),
        now,
        gates: GATES_ENFORCED,
        fieldTypes: ENABLED,
      });

    async function world(field: FieldDefinition): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Shapes",
        slug: `shapes-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Shapes",
        slug: `shapes-site-${n}`,
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { events: { fields: [field] }, places: {} },
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
    const fresh = async (e: ContentEntry) => (await store().getContentEntry(e.id)) as ContentEntry;
    /** The node's rows, `source_status` included (the delete guard reads it). */
    const rows = async (sourceId: string) =>
      (
        await ctx
          .sql()
          .all<{ t: string; f: string; k: string; s: number; st: string }>(
            "SELECT target_id AS t, field AS f, root_key AS k, shared AS s, source_status AS st FROM entry_refs WHERE source_id = ? ORDER BY field, target_id",
            [sourceId],
          )
      ).map((r) => ({ ...r, s: Number(r.s) }));
    /** A stored value as an import could hold it, written past the store's checks. */
    const storeRaw = (e: ContentEntry, value: unknown) =>
      ctx
        .sql()
        .run("UPDATE nodes SET body = json_set(body, '$.fields.hosts', json(?)) WHERE id = ?", [
          JSON.stringify(value),
          e.id,
        ]);
    /** A replace import that really rebuilds the rows (`rebuildingImport`). */
    const reimport = (site: Site) =>
      rebuildingImport(
        { sql: ctx.sql(), blobs: ctx.blobs() },
        { siteId: site.id, fieldTypes: ENABLED, addNode: () => entry(site, "places") },
      );
    /** The operation's marker, with no entry rewritten yet (budget 0). */
    const start = (site: Site, op: FieldOperation) =>
      runFieldOperation(store(), site.id, op, { actor: person, budget: { entries: 0 } });
    const editTitle = async (e: ContentEntry, title: string) =>
      code(store().updateContentEntry({ ...(await fresh(e)), title }));
    const setStatus = async (e: ContentEntry, status: ContentEntry["status"]) =>
      code(store().updateContentEntry({ ...(await fresh(e)), status }));
    const HOSTS = {
      key: "hosts",
      type: "reference",
      labels: L("Hosts"),
      localized: false,
      collections: ["places"],
      multiple: true,
    } as FieldDefinition;
    const TO_REPEATER: FieldOperation = {
      op: "change_field_type",
      collection: "events",
      key: "hosts",
      type: "repeater",
      subFields: [PERSON as never],
    };

    it("reference → repeater: a malformed stored list keeps its rows through a title edit; the target stays locked", async () => {
      const site = await world(HOSTS);
      const p = await entry(site, "places", { title: "P place", slug: "p-place" });
      const e = await entry(site, "events", { status: "published", fields: { hosts: [p.id] } });
      const expected = [{ t: p.id, f: "hosts", k: "hosts", s: 1, st: "published" }];
      expect(await rows(e.id)).toEqual(expected);
      await start(site, TO_REPEATER);
      // an old-shape value the reshape cannot convert (not a list of ids)
      await storeRaw(e, [p.id, 5]);

      // a write touches the node last
      expect(await editTitle(e, "Edited")).toBe("ok");
      expect((await fresh(e)).fields).toEqual({ hosts: [p.id, 5] });
      expect(await rows(e.id)).toEqual(expected);
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("entry_referenced");

      // the rebuild touches it last: the same rows
      await reimport(site);
      expect(await rows(e.id)).toEqual(expected);
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("entry_referenced");

      // and a write again after the rebuild
      expect(await editTitle(e, "Edited again")).toBe("ok");
      expect(await rows(e.id)).toEqual(expected);
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("entry_referenced");
    });

    it("repeater → reference: a stored item of another shape keeps its sub-field rows through a title edit", async () => {
      const site = await world({
        key: "hosts",
        type: "repeater",
        labels: L("Hosts"),
        localized: false,
        fields: [PERSON],
      } as FieldDefinition);
      const p = await entry(site, "places", { title: "P place", slug: "p-place" });
      const q = await entry(site, "places", { title: "Q place", slug: "q-place" });
      const e = await entry(site, "events", {
        status: "published",
        fields: { hosts: [{ person: p.id }, { person: q.id }] },
      });
      await start(site, {
        op: "change_field_type",
        collection: "events",
        key: "hosts",
        type: "reference",
        collections: ["places"],
      });
      // an item holding two values: the repeater does not convert
      await storeRaw(e, [{ person: p.id }, { person: q.id, note: "x" }]);
      const expected = [
        { t: p.id, f: "hosts.person", k: "hosts", s: 1, st: "published" },
        { t: q.id, f: "hosts.person", k: "hosts", s: 1, st: "published" },
      ].sort((a, b) => (a.t < b.t ? -1 : 1));

      // a conversion into references holds every target delete meanwhile (R12), so the rows,
      // which lock the targets once it ends, are what a write must not drop
      expect(await editTitle(e, "Edited")).toBe("ok");
      expect(await rows(e.id)).toEqual(expected);
      expect(await code(store().deleteContentEntry(await fresh(q)))).toBe(
        "field_operation_running",
      );

      await reimport(site);
      expect(await rows(e.id)).toEqual(expected);
      expect(await editTitle(e, "Edited again")).toBe("ok");
      expect(await rows(e.id)).toEqual(expected);
    });

    it("a held row follows its holder's status: publish locks the target, unpublish frees it", async () => {
      const site = await world(HOSTS);
      const p = await entry(site, "places", { title: "P place", slug: "p-place" });
      const e = await entry(site, "events", { fields: { hosts: [p.id] } });
      await start(site, TO_REPEATER);
      await storeRaw(e, [p.id, 5]);
      const held = (st: string) => [{ t: p.id, f: "hosts", k: "hosts", s: 1, st }];

      expect(await setStatus(e, "published")).toBe("ok");
      expect(await rows(e.id)).toEqual(held("published"));
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("entry_referenced");
      // the rebuild writes exactly these rows
      await reimport(site);
      expect(await rows(e.id)).toEqual(held("published"));

      expect(await setStatus(e, "draft")).toBe("ok");
      expect(await rows(e.id)).toEqual(held("draft"));
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("ok");
    });

    it("a held reference → text value's row follows its holder's status too", async () => {
      const site = await world({
        key: "venue",
        type: "reference",
        labels: L("Venue"),
        localized: false,
        collections: ["places"],
      } as FieldDefinition);
      const p = await entry(site, "places", { title: "P place", slug: "p-place" });
      const e = await entry(site, "events", { fields: { venue: p.id } });
      await start(site, {
        op: "change_field_type",
        collection: "events",
        key: "venue",
        type: "text",
      });
      // the target goes while the holder is a draft: its value no longer converts to a title
      expect(await code(store().deleteContentEntry(await fresh(p)))).toBe("ok");
      const held = (st: string) => [{ t: p.id, f: "venue", k: "venue", s: 1, st }];

      expect(await setStatus(e, "published")).toBe("ok");
      expect((await fresh(e)).fields).toEqual({ venue: p.id });
      expect(await rows(e.id)).toEqual(held("published"));
      await reimport(site);
      expect(await rows(e.id)).toEqual(held("published"));
      expect(await setStatus(e, "draft")).toBe("ok");
      expect(await rows(e.id)).toEqual(held("draft"));
    });
  });
}

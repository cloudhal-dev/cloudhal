/**
 * RFC-0045 §7, #215: a stored value still in the old shape that does not convert under a running
 * top-level conversion from references (reference ↔ repeater) keeps its `entry_refs` rows through
 * a person's unrelated write, at the paths the rebuild gives it (`oldShapePairs`), so the target
 * stays locked whichever touched the node last. Runs on every backend (`describeSiteGraphStore`);
 * the types are enabled with `SiteGraphStoreOptions.fieldTypes` on a store of its own.
 */
import type { Actor, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { ConflictError, InvariantError } from "./errors.ts";
import { type FieldOperation, runFieldOperation } from "./fields-operations/index.ts";
import { SiteGraphStore } from "./store.ts";
import { exportSite, importSite } from "./sync.ts";
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
  describe("RFC-0045 §7 old-shape values under reference ↔ repeater (#215)", () => {
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

    async function world(hosts: FieldDefinition): Promise<Site> {
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
        collections: { events: { fields: [hosts] }, places: {} },
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
    const rows = async (sourceId: string) =>
      (
        await ctx
          .sql()
          .all<{ t: string; f: string; k: string; s: number }>(
            "SELECT target_id AS t, field AS f, root_key AS k, shared AS s FROM entry_refs WHERE source_id = ? ORDER BY field, target_id",
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
    const reimport = async (site: Site) => {
      const storage = { sql: ctx.sql(), blobs: ctx.blobs() };
      await importSite(storage, await exportSite(storage, site.id), {
        mode: "replace",
        fieldTypes: ENABLED,
      });
    };
    /** The operation's marker, with no entry rewritten yet (budget 0). */
    const start = (site: Site, op: FieldOperation) =>
      runFieldOperation(store(), site.id, op, { actor: person, budget: { entries: 0 } });
    const editTitle = async (e: ContentEntry, title: string) =>
      code(store().updateContentEntry({ ...(await fresh(e)), title }));

    it("reference → repeater: a malformed stored list keeps its rows through a title edit; the target stays locked", async () => {
      const site = await world({
        key: "hosts",
        type: "reference",
        labels: L("Hosts"),
        localized: false,
        collections: ["places"],
        multiple: true,
      } as FieldDefinition);
      const p = await entry(site, "places", { title: "P place", slug: "p-place" });
      const e = await entry(site, "events", { status: "published", fields: { hosts: [p.id] } });
      const expected = [{ t: p.id, f: "hosts", k: "hosts", s: 1 }];
      expect(await rows(e.id)).toEqual(expected);
      await start(site, {
        op: "change_field_type",
        collection: "events",
        key: "hosts",
        type: "repeater",
        subFields: [PERSON as never],
      });
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
        { t: p.id, f: "hosts.person", k: "hosts", s: 1 },
        { t: q.id, f: "hosts.person", k: "hosts", s: 1 },
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
  });
}

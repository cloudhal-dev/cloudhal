/**
 * RFC-0045 §1, rollout step 7, beside the bundle-gate cases of `testing-gates.ts`: a bundle that
 * defines reference or repeater fields is refused by import, push, pull and restore without the
 * capability (`CopySiteOptions.fieldTypes` absent, saying no, or saying yes for another site) and
 * accepted with it, its index rebuilt in the node batch. And the step-1 watch note: node bodies
 * are content-addressed and shared by every site, so a capable site's held site body must not be
 * re-pointed by another site's new snapshot to bring the types into a site without the capability.
 */
import type { Actor, ContentEntry, FieldDefinition, NodeRef, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { InvariantError } from "./errors.ts";
import { canonicalJson } from "./hash.ts";
import type { FieldTypeSupport } from "./references/definitions.ts";
import { SiteGraphStore } from "./store.ts";
import { type CopySiteOptions, exportSite, importSite, restoreBundle } from "./sync.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const VENUE = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
} as FieldDefinition;
const SPEAKERS = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [
    { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
    { key: "name", type: "text", labels: L("Name") },
  ],
} as FieldDefinition;

const YES: FieldTypeSupport = { supported: () => true };
const NO: FieldTypeSupport = { supported: () => false };
const only = (siteId: string): FieldTypeSupport => ({ supported: (id) => id === siteId });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvariantError) return e.code;
    throw e;
  }
  return "ok";
}

export function fieldTypeGateCases(storage: () => { sql: SqlDriver; blobs: BlobStore }): void {
  describe("RFC-0045 step 7: reference and repeater bundles follow the capability", () => {
    let n = 0;
    const open = () => new SiteGraphStore({ ...storage(), gates: GATES_ENFORCED, fieldTypes: YES });

    async function site(collections: Site["collections"]): Promise<Site> {
      n++;
      const store = open();
      const project = await store.createProject({
        name: "Bundles",
        slug: `ref-bundles-${n}`,
        ownerId: human.id,
        siteIds: [],
      });
      return store.createSite({
        projectId: project.id,
        name: "Bundles",
        slug: `ref-bundles-site-${n}`,
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        ...(collections ? { collections } : {}),
      });
    }
    const entry = (s: Site, collection: string, over: Partial<ContentEntry> = {}) =>
      open().createContentEntry({
        siteId: s.id,
        collection,
        slug: `${collection}-${n}-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "published",
        title: `A ${collection}`,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: human,
        ...over,
      } as never);
    const rows = async (sourceId: string) =>
      storage().sql.all<{ t: string; f: string }>(
        "SELECT target_id AS t, field AS f FROM entry_refs WHERE source_id = ? ORDER BY field",
        [sourceId],
      );
    /** An edit after the export, so a replace import writes the node set (and rebuilds). */
    const edit = async (e: ContentEntry) => {
      const now = (await open().getContentEntry(e.id)) as ContentEntry;
      await open().updateContentEntry({ ...now, title: `${now.title}!` });
      await storage().sql.run("DELETE FROM entry_refs WHERE source_id = ?", [e.id]);
    };

    it("import, push, pull and restore refuse them without the capability and accept them with it", async () => {
      const s = await site({ events: { fields: [VENUE, SPEAKERS] }, places: {} });
      const place = await entry(s, "places");
      const event = await entry(s, "events", {
        fields: { venue: place.id, speakers: [{ person: place.id, name: "Ada" }] },
      });
      const expected = [
        { t: place.id, f: "speakers.person" },
        { t: place.id, f: "venue" },
      ];
      const snap = await open().createSnapshot(s.id, { actor: human, reason: "manual" });
      const bundle = await exportSite(storage(), s.id);
      const paths: [string, CopySiteOptions][] = [
        ["import", { mode: "replace" }],
        ["pull", { mode: "replace", published: "source" }],
        ["push", { mode: "replace", published: "target" }],
      ];
      for (const [what, options] of paths) {
        await edit(event);
        for (const fieldTypes of [undefined, NO, only("site_01HZX8K3Q9OTHER0000000A")])
          expect(
            await code(importSite(storage(), bundle, { ...options, fieldTypes })),
            `${what} without`,
          ).toBe("fields_unsupported");
        expect(await rows(event.id), `${what}: nothing written`).toEqual([]);
        const result = await importSite(storage(), bundle, { ...options, fieldTypes: only(s.id) });
        expect(result.nodes.unchanged, what).toBe(false);
        expect(await rows(event.id), `${what}: rebuilt`).toEqual(expected);
      }
      // restore (`cloudhal import --revert`): the snapshot's bundle, replace mode
      await edit(event);
      const restored = await restoreBundle(storage(), snap);
      for (const fieldTypes of [undefined, NO])
        expect(
          await code(importSite(storage(), restored, { mode: "replace", fieldTypes })),
          "restore without",
        ).toBe("fields_unsupported");
      const result = await importSite(storage(), restored, {
        mode: "replace",
        fieldTypes: only(s.id),
      });
      expect(result.nodes.unchanged).toBe(false);
      expect(await rows(event.id)).toEqual(expected);
    });

    it("a site without the capability cannot point a new snapshot at a capable site's held site body", async () => {
      const capable = await site({ events: { fields: [VENUE] }, places: {} });
      const held = await open().createSnapshot(capable.id, { actor: human, reason: "manual" });
      const heldRef = held.nodes.find((r) => r.kind === "site") as NodeRef;
      expect(await storage().blobs.head(`nodes/${heldRef.hash}.json`)).not.toBeNull();

      const plain = await site({ places: {} });
      const snap = await open().createSnapshot(plain.id, { actor: human, reason: "manual" });
      const bundle = await exportSite(storage(), plain.id);
      // the snapshot is new to the target, and names the capable site's body, which the bundle
      // does not carry (the target holds it)
      await storage().sql.run("DELETE FROM snapshots WHERE id = ?", [snap.id]);
      const repointed = structuredClone(bundle);
      const row = repointed.snapshots.find((r) => r.id === snap.id);
      if (!row) throw new Error("no snapshot row");
      const body = JSON.parse(row.body) as { nodes: NodeRef[] };
      const ref = body.nodes.find((r) => r.kind === "site") as NodeRef;
      ref.hash = heldRef.hash;
      row.body = canonicalJson(body);
      delete repointed.blobs[heldRef.hash];

      for (const fieldTypes of [undefined, only(capable.id)])
        for (const mode of ["bootstrap", "replace"] as const)
          expect(
            await code(importSite(storage(), repointed, { mode, fieldTypes })),
            `${mode}, ${fieldTypes ? "capable site only" : "no capability"}`,
          ).toBe("fields_unsupported");
      // the snapshot with its own clean site body passes the gate
      expect(
        await code(
          importSite(storage(), bundle, { mode: "replace", fieldTypes: only(capable.id) }),
        ),
      ).not.toBe("fields_unsupported");
    });
  });
}

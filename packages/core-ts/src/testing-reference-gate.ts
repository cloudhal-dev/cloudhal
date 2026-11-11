/**
 * RFC-0045 rollout step 1: the gate. Until rollout step 7 no write path stores a `reference` or
 * `repeater` definition (`fields_unsupported`): site creates and updates (Studio, MCP and the API
 * all write through them), field operations, and every bundle `importSite` takes (import, pull,
 * push, `cloudhal import --replace` and `--revert`, snapshot restores and edition copies all go
 * through its `checkBundle`). Called by `describeSiteGraphStore`, so it runs on every backend.
 */
import type { Actor, FieldDefinition, NodeRef, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "./errors.ts";
import { runFieldOperation } from "./fields-operations/index.ts";
import { canonicalJson, nodeHash } from "./hash.ts";
import type { SiteGraphStore } from "./store.ts";
import { exportSite, importSite, type SiteBundle } from "./sync.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });

const TEXT: FieldDefinition = { key: "room", type: "text", labels: L("Room"), localized: true };
const VENUE: FieldDefinition = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
};
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [{ key: "name", type: "text", labels: L("Name") }],
};

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvariantError) return e.code;
    throw e;
  }
  throw new Error("expected a rejection");
}

const events = (fields: FieldDefinition[]): NonNullable<Site["collections"]> => ({
  events: { fields: fields as [FieldDefinition, ...FieldDefinition[]] },
  places: {},
});

/** `bundle` with its site node's `collections` replaced (body and hash kept consistent). */
async function withCollections(bundle: SiteBundle, collections: Site["collections"]) {
  const copy = structuredClone(bundle);
  const row = copy.nodes.find((n) => n.kind === "site");
  if (!row) throw new Error("no site row");
  const body = { ...(JSON.parse(row.body) as Site), collections };
  row.body = canonicalJson(body);
  row.hash = await nodeHash(body);
  return copy;
}

/**
 * `bundle` with a clean working copy, whose snapshot `snapshotId` names a site body of the same id
 * and rev with `collections` replaced: what a hand-made archive or a newer store could send.
 */
async function withSnapshotSite(
  bundle: SiteBundle,
  snapshotId: string,
  collections: Site["collections"],
) {
  const copy = structuredClone(bundle);
  const row = copy.snapshots.find((s) => s.id === snapshotId);
  if (!row) throw new Error("no snapshot row");
  const snapshot = JSON.parse(row.body) as { nodes: NodeRef[] };
  const ref = snapshot.nodes.find((r) => r.kind === "site");
  const text = ref ? copy.blobs[ref.hash] : undefined;
  if (!ref || text === undefined) throw new Error("no site blob");
  const body = { ...(JSON.parse(text) as Site), collections };
  const hash = await nodeHash(body);
  copy.blobs[hash] = canonicalJson(body);
  ref.hash = hash;
  row.body = canonicalJson(snapshot);
  return copy;
}

export function referenceGateSuite(ctx: SuiteContext): void {
  describe("RFC-0045 step 1: reference and repeater types are refused on every write path", () => {
    let n = 0;
    const store = (): SiteGraphStore => ctx.store();
    const storage = () => ({ sql: ctx.sql(), blobs: ctx.blobs() });

    async function setup(collections: Site["collections"] = events([TEXT])): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Gate",
        slug: `ref-gate-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Gate",
        slug: `ref-gate-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        ...(collections ? { collections } : {}),
      });
    }

    it("refuses them when a site is created or updated", async () => {
      expect(await code(setup(events([VENUE])))).toBe("fields_unsupported");
      const site = await setup();
      for (const def of [VENUE, SPEAKERS])
        expect(await code(store().updateSite({ ...site, collections: events([TEXT, def]) }))).toBe(
          "fields_unsupported",
        );
      // a dry run refuses too, and nothing was written
      expect(
        await code(
          store().updateSite({ ...site, collections: events([TEXT, VENUE]) }, { dryRun: true }),
        ),
      ).toBe("fields_unsupported");
      expect((await store().getSite(site.id))?.collections).toEqual(site.collections);
    });

    it("refuses a field operation that turns a field into one (step 4 adds them)", async () => {
      const site = await setup();
      for (const type of ["reference", "repeater"] as const)
        expect(
          await code(
            runFieldOperation(
              store(),
              site.id,
              { op: "change_field_type", collection: "events", key: "room", type },
              { actor: person },
            ),
          ),
        ).toBe("field_operation_unsupported");
      expect((await store().getSite(site.id))?.collections).toEqual(site.collections);
    });

    it("refuses bundles that define them: bootstrap and replace imports alike", async () => {
      const site = await setup();
      const bundle = await exportSite(storage(), site.id);
      for (const def of [VENUE, SPEAKERS]) {
        const tainted = await withCollections(bundle, events([TEXT, def]));
        expect(await code(importSite(storage(), tainted))).toBe("fields_unsupported");
        expect(await code(importSite(storage(), tainted, { mode: "replace" }))).toBe(
          "fields_unsupported",
        );
      }
      // a marker converting from one is a stage-4 artefact too
      const marker = await withCollections(
        bundle,
        events([{ ...TEXT, migration: { id: "snap_01HZX8K3Q9MG", fromType: "repeater" } }]),
      );
      expect(await code(importSite(storage(), marker, { mode: "replace" }))).toBe(
        "fields_unsupported",
      );
      expect((await store().getSite(site.id))?.collections).toEqual(site.collections);
      // the untouched bundle still imports
      expect((await importSite(storage(), bundle)).nodes.unchanged).toBe(true);
    });

    it("refuses bundles whose snapshots' site bodies define them, the working copy clean", async () => {
      const site = await setup();
      const snap = await store().createSnapshot(site.id, { actor: person, reason: "manual" });
      const bundle = await exportSite(storage(), site.id);
      for (const collections of [
        events([TEXT, VENUE]),
        events([TEXT, SPEAKERS]),
        events([{ ...TEXT, migration: { id: snap.id, fromType: "reference" } }]),
        events([{ ...TEXT, migration: { id: snap.id, sub: "name" } }]),
      ]) {
        const tainted = await withSnapshotSite(bundle, snap.id, collections);
        for (const mode of ["bootstrap", "replace"] as const)
          expect(await code(importSite(storage(), tainted, { mode })), mode).toBe(
            "fields_unsupported",
          );
      }
      // an invalid site body is refused as before, by its schema, never by the gate's walk
      for (const broken of [{ events: { fields: {} } }, { events: { fields: [null] } }]) {
        const bad = await withSnapshotSite(bundle, snap.id, broken as never);
        await expect(importSite(storage(), bad, { mode: "replace" })).rejects.toThrow(
          /is not a valid site/,
        );
      }
      // a body the target already holds is its own: a forged text under its hash is not read
      const forged = structuredClone(bundle);
      const ref = (
        JSON.parse(forged.snapshots.find((r) => r.id === snap.id)?.body ?? "{}") as {
          nodes: NodeRef[];
        }
      ).nodes.find((r) => r.kind === "site");
      if (!ref) throw new Error("no site ref");
      const text = forged.blobs[ref.hash] ?? "{}";
      forged.blobs[ref.hash] = canonicalJson({
        ...(JSON.parse(text) as Site),
        collections: events([TEXT, VENUE]),
      });
      expect((await importSite(storage(), forged)).nodes.unchanged).toBe(true);
      // the same rewrite with clean definitions passes the gate (and fails later, elsewhere)
      const clean = await withSnapshotSite(bundle, snap.id, events([TEXT]));
      const later = await importSite(storage(), clean, { mode: "replace" }).then(
        () => "",
        (e: unknown) => (e instanceof InvariantError ? e.code : "other"),
      );
      expect(later).not.toBe("fields_unsupported");
    });
  });
}

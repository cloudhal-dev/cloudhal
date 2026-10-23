/**
 * RFC-0041 step 3 behavioural suite: field operations (`rename_field`, `change_field_type`,
 * `set_field_localized`, `remove_field`) — dry run, snapshots, phases, resume, concurrent edits,
 * revert, the draft-only guarantee — and §5's staleness rule (a non-localized value change leaves
 * translations fresh). Called by `describeSiteGraphStore`, so it runs on every storage backend.
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
import { resolveFields } from "./fields/index.ts";
import {
  continueFieldOperation,
  type FieldOperation,
  fieldOperationStatus,
  revertFieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import { makeJpeg } from "./media/fixtures.ts";
import type { SiteGraphStore } from "./store.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const actor = { actor: person };

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "speaker", type: "text", labels: L("Speaker"), localized: true },
  { key: "seats", type: "text", labels: L("Seats"), localized: false },
  { key: "notes", type: "text", labels: L("Notes"), localized: true },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  { key: "poster", type: "image", labels: L("Poster"), localized: false },
];

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvariantError) return e.code;
    throw e;
  }
  throw new Error("expected a rejection");
}

export function fieldOperationsSuite(ctx: SuiteContext): void {
  describe("RFC-0041 §6 field operations", () => {
    let n = 0;
    const store = (): SiteGraphStore => ctx.store();
    const fresh = async (site: Site) => (await store().getSite(site.id)) as Site;
    const get = async (id: string) => (await store().getContentEntry(id)) as ContentEntry;
    const run = (site: Site, op: FieldOperation, extra: Record<string, unknown> = {}) =>
      runFieldOperation(store(), site.id, op, { ...actor, ...extra });

    async function setup(): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Ops",
        slug: `ops-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Ops",
        slug: `ops-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        timeZone: "Europe/Istanbul",
        collections: { events: { fields: FIELDS } },
      });
    }
    const entry = (
      site: Site,
      fields: Record<string, unknown>,
      extra: Partial<ContentEntry> = {},
    ) =>
      store().createContentEntry({
        siteId: site.id,
        collection: "events",
        slug: `e-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: "Launch",
        body: { format: "markdown", value: "Body" },
        fields,
        tags: [],
        author: person,
        ...extra,
      } as never);
    async function translate(site: Site, original: ContentEntry, fields: Record<string, unknown>) {
      const member = (await store().translationGroup(site, original.id)).members.find(
        (m) => m.id === original.id,
      );
      const translation = {
        group: original.id,
        method: "human",
        source: { id: original.id, locale: "en", rev: original.rev, hash: member?.hash as string },
      } as Translation;
      return entry(site, fields, { locale: "tr", slug: original.slug, translation });
    }
    const stale = async (site: Site, group: string, id: string) =>
      (await store().translationGroup(site, group)).members.find((m) => m.id === id)?.stale;
    const keys = async (site: Site) =>
      ((await fresh(site)).collections?.events?.fields ?? []).map((d) => d.key);

    /** An original (made the group's original by its first translation) and its Turkish version. */
    async function world() {
      const site = await setup();
      const e1 = await entry(site, { speaker: "Ada", seats: "120", notes: "n1", price: 10 });
      const e2 = await entry(site, { speaker: "Grace", seats: "lots" });
      const tr = await translate(site, e1, { speaker: "Ada TR", notes: "tr notes" });
      return { site, e1: await get(e1.id), e2, tr };
    }

    it("rename_field: dry run, snapshots, translations fresh, draft only, revert", async () => {
      const { site, e1, tr } = await world();
      const published = await store().createSnapshot(site.id, { actor: person, reason: "publish" });
      await store().publish(await fresh(site), published.id);
      const snapshots = (await store().listSnapshots(site.id)).length;
      const op: FieldOperation = {
        op: "rename_field",
        collection: "events",
        from: "speaker",
        to: "presenter",
      };
      const dry = await run(site, op, { dryRun: true });
      expect(dry).toMatchObject({ dryRun: true, done: false, operationId: "" });
      expect(dry.report).toMatchObject({ entries: 3, touched: 3, moved: 3, unconvertible: 0 });
      expect(dry.report.locales).toMatchObject({ en: { moved: 2 }, tr: { moved: 1 } });
      expect(dry.report.samples).toHaveLength(3);
      expect((await store().listSnapshots(site.id)).length).toBe(snapshots);
      expect(await keys(site)).toContain("speaker");

      const done = await run(site, op);
      expect(done).toMatchObject({ done: true, rewritten: 3, skipped: [] });
      const before = await store().getSnapshot(done.operationId);
      expect(before?.label).toBe("before rename_field events.speaker");
      expect((await store().getSnapshot(done.afterSnapshotId as string))?.label).toBe(
        "rename_field events.speaker",
      );
      expect((await get(e1.id)).fields).toEqual({
        presenter: "Ada",
        seats: "120",
        notes: "n1",
        price: 10,
      });
      expect(await keys(site)).toEqual(["presenter", "seats", "notes", "price", "poster"]);
      expect((await fresh(site)).collections?.events?.fields?.some((d) => d.migration)).toBe(false);
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      // Nothing goes live: the published snapshot keeps the old definitions and values.
      expect((await fresh(site)).publishedSnapshotId).toBe(published.id);
      const live = published.nodes.find((r) => r.id === e1.id);
      expect((await store().readSnapshotNode<ContentEntry>(live as never)).fields).toMatchObject({
        speaker: "Ada",
      });
      expect((await fieldOperationStatus(store(), site.id, done.operationId)).state).toBe("done");

      const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
      expect(back).toMatchObject({ done: true, restored: 3, edited: [] });
      expect((await get(e1.id)).fields).toMatchObject({ speaker: "Ada" });
      expect((await get(tr.id)).fields).toEqual({ speaker: "Ada TR", notes: "tr notes" });
      expect(await keys(site)).toEqual(["speaker", "seats", "notes", "price", "poster"]);
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      expect((await fieldOperationStatus(store(), site.id, done.operationId)).state).toBe(
        "reverted",
      );
      expect(await code(revertFieldOperation(store(), site.id, done.operationId, actor))).toBe(
        "field_operation_incomplete",
      );
    });

    it("change_field_type: unconvertible values refuse it unless onInvalid is clear", async () => {
      const { site, e1, e2 } = await world();
      const op: FieldOperation = {
        op: "change_field_type",
        collection: "events",
        key: "seats",
        type: "number",
      };
      const dry = await run(site, op, { dryRun: true });
      expect(dry.report).toMatchObject({ converted: 1, unconvertible: 1 });
      expect(dry.report.refusal?.code).toBe("field_values_unconvertible");
      expect(dry.report.samples[0]).toMatchObject({ kind: "unconvertible", before: "lots" });
      const snapshots = (await store().listSnapshots(site.id)).length;
      expect(await code(run(site, op))).toBe("field_values_unconvertible");
      expect((await store().listSnapshots(site.id)).length).toBe(snapshots);
      expect((await fresh(site)).collections?.events?.fields?.[1]?.type).toBe("text");

      const done = await run(site, { ...op, onInvalid: "clear" });
      expect(done.done).toBe(true);
      expect(done.report).toMatchObject({ converted: 1, cleared: 1, unconvertible: 0 });
      expect((await get(e1.id)).fields?.seats).toBe(120);
      expect((await get(e2.id)).fields).toEqual({ speaker: "Grace" });
      expect((await fresh(site)).collections?.events?.fields?.[1]?.type).toBe("number");

      await revertFieldOperation(store(), site.id, done.operationId, actor);
      expect((await get(e1.id)).fields?.seats).toBe("120");
      expect((await get(e2.id)).fields?.seats).toBe("lots");
      expect((await fresh(site)).collections?.events?.fields?.[1]).toMatchObject({
        key: "seats",
        type: "text",
      });
    });

    it("set_field_localized: off drops translations' copies and keeps them fresh", async () => {
      const { site, e1, tr } = await world();
      const off: FieldOperation = {
        op: "set_field_localized",
        collection: "events",
        key: "notes",
        localized: false,
      };
      const dry = await run(site, off, { dryRun: true });
      expect(dry.report).toMatchObject({ touched: 1, cleared: 1, unchanged: 1 });
      expect(dry.report.locales).toEqual({ tr: expect.objectContaining({ cleared: 1 }) });
      const done = await run(site, off);
      expect(done.done).toBe(true);
      expect((await get(tr.id)).fields).toEqual({ speaker: "Ada TR" });
      expect((await get(e1.id)).fields?.notes).toBe("n1");
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      // The translation reads the original's value now.
      const resolved = resolveFields(await fresh(site), await get(tr.id), await get(e1.id));
      expect(resolved.notes).toMatchObject({ value: "n1", fromOriginal: true });

      await revertFieldOperation(store(), site.id, done.operationId, actor);
      expect((await get(tr.id)).fields?.notes).toBe("tr notes");
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      // false → true rewrites nothing: translations fall back to the original's value.
      const on = await run(site, { ...off, key: "seats", localized: true });
      expect(on).toMatchObject({ done: true, rewritten: 0 });
      expect((await fresh(site)).collections?.events?.fields?.[1]?.localized).toBe(true);
    });

    it("remove_field: values and their asset references go; revert brings them back", async () => {
      const site = await setup();
      const { asset } = await store().ingestAsset({
        siteId: site.id,
        bytes: makeJpeg({ width: 40, height: 30 }),
        filename: "p.jpg",
        uploadedBy: person,
        source: { kind: "upload" },
      });
      const e = await entry(site, { poster: asset.id, speaker: "Ada" });
      const refs = async () =>
        (
          await ctx
            .sql()
            .all<{ field: string }>("SELECT field FROM asset_refs WHERE node_id = ?", [e.id])
        ).map((r) => r.field);
      expect(await refs()).toEqual(["fields.poster"]);
      const done = await run(site, { op: "remove_field", collection: "events", key: "poster" });
      expect(done.report).toMatchObject({ removed: 1, touched: 1 });
      expect(await keys(site)).not.toContain("poster");
      expect((await get(e.id)).fields).toEqual({ speaker: "Ada" });
      expect(await refs()).toEqual([]);
      const back = await revertFieldOperation(store(), site.id, done.operationId, actor);
      expect(back.restored).toBe(1);
      expect(await keys(site)).toEqual(["speaker", "seats", "notes", "price", "poster"]);
      expect((await get(e.id)).fields?.poster).toBe(asset.id);
      expect(await refs()).toEqual(["fields.poster"]);
    });

    it("resumes after its budget or an interruption; readers go through the marker", async () => {
      const site = await setup();
      const made: ContentEntry[] = [];
      for (let i = 0; i < 5; i++) made.push(await entry(site, { speaker: `S${i}` }));
      const op: FieldOperation = {
        op: "rename_field",
        collection: "events",
        from: "speaker",
        to: "presenter",
      };
      const part = await run(site, op, { budget: { entries: 2 } });
      expect(part).toMatchObject({ done: false, rewritten: 2 });
      const mid = await fresh(site);
      const marked = mid.collections?.events?.fields?.find((d) => d.key === "presenter");
      expect(marked?.migration).toEqual({ id: part.operationId, fromKey: "speaker" });
      const last = made[4] as ContentEntry;
      expect((await get(last.id)).fields).toEqual({ speaker: "S4" });
      expect(resolveFields(mid, await get(last.id)).presenter?.value).toBe("S4");
      expect(await fieldOperationStatus(store(), site.id, part.operationId)).toMatchObject({
        state: "running",
        pending: 3,
      });
      // One operation per collection; plain edits cannot drop the marker.
      expect(
        await code(run(site, { op: "remove_field", collection: "events", key: "notes" })),
      ).toBe("operation_in_progress");
      const plain = {
        ...mid,
        collections: {
          events: {
            fields: FIELDS.map((d) => (d.key === "speaker" ? { ...d, key: "presenter" } : d)),
          },
        },
      } as unknown as Site;
      expect(await code(store().updateSite(plain))).toBe("field_change_needs_operation");
      // A person's write during the run goes through the marker.
      const edited = await store().updateContentEntry({ ...(await get(last.id)), title: "Edited" });
      expect(edited.fields).toEqual({ presenter: "S4" });

      const rest = await continueFieldOperation(store(), site.id, part.operationId, actor);
      expect(rest).toMatchObject({ done: true, resumed: true });
      for (const e of made)
        expect(Object.keys((await get(e.id)).fields ?? {})).toEqual(["presenter"]);

      // A power cut in phase B leaves the marker; continuing finishes the work.
      const again: FieldOperation = {
        op: "rename_field",
        collection: "events",
        from: "presenter",
        to: "host",
      };
      const failing = ctx.racing(
        async () => {
          throw new Error("power cut");
        },
        (q) => /^DELETE FROM asset_refs WHERE node_id = \? AND field LIKE 'fields/.test(q),
      );
      await expect(runFieldOperation(failing, site.id, again, actor)).rejects.toThrow(/power cut/);
      const cut = (await fresh(site)).collections?.events?.fields?.find((d) => d.key === "host");
      expect(cut?.migration?.fromKey).toBe("presenter");
      const resumed = await continueFieldOperation(
        store(),
        site.id,
        cut?.migration?.id as string,
        actor,
      );
      expect(resumed.done).toBe(true);
      expect((await get(last.id)).fields).toEqual({ host: "S4" });
    });

    it("a concurrent edit skips that entry; the next pass converges", async () => {
      const { site, e1 } = await world();
      const racing = ctx.racing(
        async () => {
          await store().updateContentEntry({ ...(await get(e1.id)), title: "Raced" });
        },
        (q) => /^DELETE FROM asset_refs WHERE node_id = \? AND field LIKE 'fields/.test(q),
      );
      const done = await runFieldOperation(
        racing,
        site.id,
        { op: "rename_field", collection: "events", from: "speaker", to: "presenter" },
        actor,
      );
      expect(done.done).toBe(true);
      const after = await get(e1.id);
      expect(after.title).toBe("Raced");
      expect(after.fields).toMatchObject({ presenter: "Ada" });
      expect(after.fields).not.toHaveProperty("speaker");
    });

    it("a change to non-localized values leaves translations fresh; localized ones do not", async () => {
      const { site, e1, tr } = await world();
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      const priced = await store().updateContentEntry({
        ...e1,
        fields: { ...e1.fields, price: 12 },
      });
      expect(await stale(site, e1.id, tr.id)).toBe(false);
      const t = await get(tr.id);
      expect(t.translation?.source?.rev).toBe(priced.rev);
      // A localized value (or anything else) still marks the translation stale.
      await store().updateContentEntry({
        ...priced,
        fields: { ...priced.fields, price: 13, notes: "changed" },
      });
      expect(await stale(site, e1.id, tr.id)).toBe(true);
    });
  });
}

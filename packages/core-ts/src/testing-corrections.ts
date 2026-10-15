/**
 * RFC-0019 §2 corrections in the store: the store's time and ids, append-only once live, a
 * person's note edit, and which pending entries add a correction (the `auto`-mode check). Part of
 * the shared suite, so it runs on SQLite and Miniflare D1.
 */
import type { Actor, ContentEntry, Correction, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { latestCorrection } from "./corrections.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const T0 = Date.UTC(2026, 9, 16, 9, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;

export function correctionsSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`RFC-0019 corrections in the store: ${label}`, () => {
    let sql: SqlDriver;
    let now = T0;
    let store: SiteGraphStore;
    let site: Site;
    let story: ContentEntry;

    beforeEach(async () => {
      const opened = await factory.create();
      sql = opened.sql;
      await dropAllTables(sql);
      now = T0;
      store = new SiteGraphStore({ sql, blobs: opened.blobs, now: () => new Date(now) });
      await store.init();
      site = await seedStarterSite(store, { name: "Corrections", slug: "corrections" });
      story = (await store.listContentEntries(site.id, "posts"))[0] as ContentEntry;
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const publishSite = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    };
    const fresh = async () => (await store.getContentEntry(story.id)) as ContentEntry;
    /** What a careless or hostile caller might send: its own id, a backdated time, a snapshot. */
    const forged = (note: string): Correction => ({
      id: "crx_forged0001",
      kind: "correction",
      at: "2020-01-01T00:00:00.000Z",
      note,
      snapshotId: "snap_forged0001",
    });

    it("stamps new corrections with the store's id and time, whatever the caller sent", async () => {
      now = T0 + HOUR;
      const one = await store.addCorrection(story, { kind: "correction", note: "Wrong year." });
      expect(one.corrections).toEqual([
        {
          id: expect.stringMatching(/^crx_/),
          kind: "correction",
          at: iso(T0 + HOUR),
          note: "Wrong year.",
        },
      ]);
      now = T0 + 2 * HOUR;
      const two = await store.updateContentEntry({
        ...one,
        corrections: [...(one.corrections ?? []), forged("A clarification.")],
      });
      const added = two.corrections?.[1];
      expect(added?.id).not.toBe("crx_forged0001");
      expect(added).toEqual({
        id: expect.stringMatching(/^crx_/),
        kind: "correction",
        at: iso(T0 + 2 * HOUR),
        note: "A clarification.",
      });
      // an existing item keeps its time even if the caller rewrites it
      const backdated = await store.updateContentEntry({
        ...two,
        corrections: (two.corrections ?? []).map((c) => ({ ...c, at: "2020-01-01T00:00:00.000Z" })),
      });
      expect(backdated.corrections?.map((c) => c.at)).toEqual([iso(T0 + HOUR), iso(T0 + 2 * HOUR)]);
      expect(latestCorrection(backdated)?.note).toBe("A clarification.");
    });

    it("lets a draft correction change or go, and locks it once live", async () => {
      const drafted = await store.addCorrection(story, { kind: "correction", note: "Typo." });
      const reworded = await store.updateContentEntry({
        ...drafted,
        corrections: [
          { ...(drafted.corrections?.[0] as Correction), kind: "update", note: "Updated figures." },
        ],
      });
      expect(reworded.corrections?.[0]).toMatchObject({ kind: "update", note: "Updated figures." });
      const dropped = await store.updateContentEntry({ ...reworded, corrections: [] });
      expect(dropped.corrections).toBeUndefined();

      const live = await store.addCorrection(dropped, { kind: "correction", note: "Wrong name." });
      await publishSite();
      const item = live.corrections?.[0] as Correction;
      await expect(store.updateContentEntry({ ...live, corrections: [] })).rejects.toMatchObject({
        name: "InvariantError",
        code: "correction_locked",
      });
      const { corrections: _gone, ...without } = live;
      await expect(store.updateContentEntry(without as ContentEntry)).rejects.toMatchObject({
        code: "correction_locked",
      });
      await expect(
        store.updateContentEntry({ ...live, corrections: [{ ...item, kind: "clarification" }] }),
      ).rejects.toMatchObject({ code: "correction_locked" });
      await expect(
        store.updateContentEntry({
          ...live,
          corrections: [{ ...item, note: "Quietly reworded." }],
        }),
      ).rejects.toMatchObject({ code: "correction_locked" });
      expect((await fresh()).corrections).toEqual([item]);

      // a person with site:publish may fix the note; the time stays
      now = T0 + 5 * HOUR;
      const fixed = await store.updateContentEntry(
        { ...live, corrections: [{ ...item, note: "Wrong name: it is Ayşe." }] },
        { correctionEdit: true },
      );
      expect(fixed.corrections).toEqual([{ ...item, note: "Wrong name: it is Ayşe." }]);
      // unrelated edits keep live corrections without restating them
      const retitled = await store.updateContentEntry({ ...fixed, title: "Retitled" });
      expect(retitled.corrections).toEqual(fixed.corrections);
    });

    it("names the pending entries that add a correction to their live version", async () => {
      await publishSite();
      expect(await store.correctingEntries(site.id, await store.pendingChanges(site.id))).toEqual(
        new Set(),
      );
      const edited = await store.updateContentEntry({ ...story, title: "Edited, no correction" });
      expect(await store.correctingEntries(site.id, await store.pendingChanges(site.id))).toEqual(
        new Set(),
      );
      await store.addCorrection(edited, { kind: "correction", note: "Wrong date." });
      expect(await store.correctingEntries(site.id, await store.pendingChanges(site.id))).toEqual(
        new Set([story.id]),
      );
      await publishSite();
      const live = await fresh();
      await store.updateContentEntry({ ...live, title: "Edited again" });
      expect(await store.correctingEntries(site.id, await store.pendingChanges(site.id))).toEqual(
        new Set(),
      );
    });
  });
}

/**
 * RFC-0004 behavioural suite (assets and media). Called by `describeSiteGraphStore`, so it runs on
 * every storage backend (better-sqlite3 and Miniflare D1). Test names cite the invariants of
 * RFC-0004 §3 they prove.
 */
import type {
  Actor,
  Asset,
  ContentEntry,
  Page,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { mediaBlobKey } from "./assets.ts";
import { ConflictError, InvariantError } from "./errors.ts";
import { sha256Hex } from "./hash.ts";
import { makeJpeg, makePng, PNG_1X1, text } from "./media/fixtures.ts";
import { seedStarterSite } from "./seed.ts";
import type { SiteGraphStore } from "./store.ts";
import { exportSite, importSite } from "./sync.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const robot: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection");
}

async function code(p: Promise<unknown>): Promise<string> {
  const e = await rejects(p);
  return e instanceof InvariantError ? e.code : e.name;
}

const bytesHex = async (b: Uint8Array) => {
  const d = await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
};

export function assetsSuite(ctx: SuiteContext): void {
  describe("RFC-0004 assets and media", () => {
    interface World {
      site: Site;
      entry: ContentEntry;
      about: Page;
    }

    async function setup(): Promise<World> {
      const store = ctx.store();
      const seeded = await seedStarterSite(store, { name: "Media", slug: "media" });
      const site = (await store.getSite(seeded.id)) as Site;
      const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
      const about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
      return { site, entry, about };
    }

    const photo = (o: Parameters<typeof makeJpeg>[0] = {}) =>
      makeJpeg({ width: 3000, height: 2000, orientation: 6, gps: true, ...o });

    async function upload(
      store: SiteGraphStore,
      siteId: string,
      bytes?: Uint8Array,
      extra: Partial<Parameters<SiteGraphStore["ingestAsset"]>[0]> = {},
    ) {
      return store.ingestAsset({
        siteId,
        bytes: bytes ?? photo(),
        filename: bytes ? "image" : "Bosphorus at dawn.jpg",
        uploadedBy: robot,
        source: { kind: "upload" },
        fields: { alt: { en: "Ferries crossing the Bosphorus at dawn" } },
        ...extra,
      });
    }

    it("invariants 1–3: content-addressed blob, stripped and hashed; one asset per content per site", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset, existing } = await upload(store, w.site.id);
      expect(existing).toBe(false);
      expect(asset).toMatchObject({
        kind: "image",
        mediaType: "image/jpeg",
        slug: "bosphorus-at-dawn",
        storage: { kind: "blob" },
        status: "active",
        image: { width: 3000, height: 2000 },
        uploadedBy: robot,
        source: { kind: "upload", filename: "Bosphorus at dawn.jpg" },
        alt: { en: "Ferries crossing the Bosphorus at dawn" },
      });
      expect(asset.id).toMatch(/^asset_/);
      const stored = await ctx.blobs().get(mediaBlobKey(w.site.id, asset.sha256));
      expect(stored).not.toBeNull();
      expect(await bytesHex(stored as Uint8Array)).toBe(asset.sha256);
      expect(asset.bytes).toBe((stored as Uint8Array).byteLength);
      expect(asset.originalSha256).toBe(await bytesHex(photo()));
      expect(await store.blobState(w.site.id, asset.sha256)).toMatchObject({
        state: "stored",
        bytes: asset.bytes,
        mediaType: "image/jpeg",
        originalSha256: asset.originalSha256,
      });
      // Same bytes again (an agent retry, a duplicate drop): the existing asset, no second node.
      const again = await upload(store, w.site.id, photo(), {
        fields: { alt: { en: "different" } },
      });
      expect(again.existing).toBe(true);
      expect(again.asset).toEqual(asset);
      expect((await store.listAssets(w.site.id)).assets).toHaveLength(1);
      // Another site keeps its own copy: no cross-tenant dedupe (answer 5).
      const other = await seedStarterSite(store, { name: "Other", slug: "other" });
      const theirs = await upload(store, other.id);
      expect(theirs.existing).toBe(false);
      expect(theirs.asset.sha256).toBe(asset.sha256);
      expect(theirs.asset.id).not.toBe(asset.id);
      expect(await ctx.blobs().head(mediaBlobKey(other.id, asset.sha256))).not.toBeNull();
    });

    it("invariant 3: a blob asset node needs its ledger row stored, with the measured size and type", async () => {
      const w = await setup();
      const store = ctx.store();
      const sha = await sha256Hex("never uploaded");
      const draft = {
        siteId: w.site.id,
        kind: "image" as const,
        mediaType: "image/png",
        bytes: 10,
        sha256: sha,
        slug: "x",
        storage: { kind: "blob" as const },
        image: { width: 1, height: 1 },
        status: "active" as const,
        uploadedBy: robot,
        source: { kind: "upload" as const },
      };
      expect(await code(store.createAsset(draft))).toBe("retry");
      await store.leaseBlob(w.site.id, sha, "2099-01-01T00:00:00.000Z", {
        bytes: 10,
        mediaType: "image/png",
      });
      expect(await code(store.createAsset(draft))).toBe("retry"); // leased, not stored
      await store.markBlobStored(w.site.id, { sha256: sha, bytes: 10, mediaType: "image/png" });
      expect(await code(store.createAsset({ ...draft, bytes: 11 }))).toBe("retry");
      const { asset } = await store.createAsset(draft);
      expect(asset.bytes).toBe(10);
    });

    it("invariant 4: kind follows the media type; other ⇒ external; link ⇔ external", async () => {
      const w = await setup();
      const store = ctx.store();
      const base = {
        siteId: w.site.id,
        bytes: 7_300_000_000,
        sha256: await sha256Hex("zenodo"),
        slug: "hourly-ferry-counts",
        status: "active" as const,
        uploadedBy: person,
        source: { kind: "link" as const },
        storage: {
          kind: "external" as const,
          url: "https://zenodo.org/records/1/files/data.csv",
          checksum: "declared" as const,
        },
      };
      expect(await code(store.createAsset({ ...base, kind: "image", mediaType: "text/csv" }))).toBe(
        "invalid_asset",
      );
      expect(
        await code(
          store.createAsset({
            ...base,
            kind: "data",
            mediaType: "text/csv",
            source: { kind: "upload" },
          }),
        ),
      ).toBe("invalid_asset");
      const { asset } = await store.createAsset({ ...base, kind: "data", mediaType: "text/csv" });
      expect(asset.storage.kind).toBe("external");
      const tar = await store.createAsset({
        ...base,
        sha256: await sha256Hex("tar"),
        kind: "other",
        mediaType: "application/x-tar",
        slug: "weights",
      });
      expect(tar.asset.kind).toBe("other");
      expect(
        await code(
          store.createAsset({
            ...base,
            sha256: await sha256Hex("blob-other"),
            kind: "other",
            mediaType: "application/x-tar",
            storage: { kind: "blob" },
            source: { kind: "upload" },
          }),
        ),
      ).toBe("invalid_asset");
    });

    it("invariants 5 and 13: only editable fields change; canonical form drops empty text and false", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const edited = await store.updateAsset({
        ...asset,
        slug: "bosphorus",
        title: { en: "Bosphorus at dawn", tr: "" },
        caption: { en: " " },
        credit: "Photo: Ayşe Yılmaz",
        license: { kind: "spdx", id: "CC-BY-4.0" },
        decorative: false,
      });
      expect(edited.rev).toBe(1);
      expect(edited.title).toEqual({ en: "Bosphorus at dawn" });
      expect(edited.caption).toBeUndefined();
      expect(edited.decorative).toBeUndefined();
      expect(edited.slug).toBe("bosphorus");
      for (const change of [
        { sha256: "f".repeat(64) },
        { bytes: 1 },
        { mediaType: "image/png" },
        { uploadedBy: person },
        { source: { kind: "import" as const, from: "x" } },
        { status: "retired" as const },
      ])
        expect(
          await code(store.updateAsset({ ...edited, ...change } as Asset)),
          JSON.stringify(change),
        ).toBe("immutable_field");
      // Width and height are measured, not editable; placeholders are.
      const lqip = "data:image/webp;base64,UklGRg==";
      const placeheld = await store.updateAsset({
        ...edited,
        image: { width: 1, height: 1, lqip },
      });
      expect(placeheld.image).toEqual({ width: 3000, height: 2000, lqip });
      expect(await rejects(store.updateAsset(edited))).toBeInstanceOf(ConflictError);
    });

    it("invariants 7 and 8: references resolve within the site; ImageRefs are canonical; asset_refs mirrors them", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const csv = await store.ingestAsset({
        siteId: w.site.id,
        bytes: text("hour,ferries\n06,12\n"),
        filename: "hourly.csv",
        uploadedBy: robot,
        source: { kind: "upload" },
      });
      // `{assetId, alt}` without src: the store writes the media path and the intrinsic size.
      const entry = await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: asset.id, alt: "" } as never,
        body: {
          format: "markdown",
          value: `![Ferries](asset:${asset.id})\n\n[Hourly data](asset:${csv.asset.id})\n\n\`asset:${csv.asset.id}\``,
        },
      });
      expect(entry.coverImage).toEqual({
        assetId: asset.id,
        alt: "",
        src: `/media/${asset.sha256.slice(0, 16)}/bosphorus-at-dawn.jpg`,
        width: 3000,
        height: 2000,
      });
      const usage = await store.assetUsage(w.site.id);
      expect(usage.get(asset.id)).toEqual({
        total: 1,
        byKind: { contentEntry: 1 },
        refs: [
          { nodeId: entry.id, nodeKind: "contentEntry", field: "body" },
          { nodeId: entry.id, nodeKind: "contentEntry", field: "coverImage" },
        ],
      });
      expect(usage.get(csv.asset.id)?.refs).toEqual([
        { nodeId: entry.id, nodeKind: "contentEntry", field: "body" },
      ]);
      // A page section and a term image are tracked too.
      const page = await store.updatePage({
        ...w.about,
        sections: [
          ...w.about.sections,
          {
            id: "sec_about0image",
            kind: "image",
            image: { assetId: asset.id, alt: "Ferries" } as never,
          },
        ],
      });
      expect((page.sections.at(-1) as { image: { src: string } }).image.src).toMatch(/^\/media\//);
      const [term] = await store.listTerms(w.site.id, { taxonomy: "category" });
      await store.updateTerm({ ...(term as Term), image: { assetId: asset.id, alt: "" } as never });
      const refs = (await store.assetUsage(w.site.id, [asset.id])).get(asset.id);
      expect(refs?.byKind).toEqual({ contentEntry: 1, page: 1, term: 1 });
      expect(refs?.refs.map((r) => r.field)).toContain("sections.sec_about0image.image");
      // Removing a reference rewrites the index.
      const plain = await store.updateContentEntry({
        ...entry,
        body: { format: "markdown", value: "No media any more." },
      });
      expect((await store.assetUsage(w.site.id, [csv.asset.id])).get(csv.asset.id)).toBeUndefined();
      // Deleting a node drops its references.
      await store.deleteContentEntry(plain);
      expect((await store.assetUsage(w.site.id, [asset.id])).get(asset.id)?.byKind).toEqual({
        page: 1,
        term: 1,
      });
      // Unknown ids and other sites' assets do not resolve.
      const other = await seedStarterSite(store, { name: "Other", slug: "other" });
      const foreign = await upload(store, other.id, makePng());
      const [otherAbout] = await store.listPages(w.site.id);
      for (const id of ["asset_doesnotexist01", foreign.asset.id]) {
        const e = await rejects(
          store.updatePage({
            ...(otherAbout as Page),
            sections: [
              { id: "sec_x0000001", kind: "image", image: { assetId: id, alt: "" } as never },
            ],
          }),
        );
        expect((e as InvariantError).code).toBe("unknown_asset");
        expect((e as InvariantError).details).toEqual({ ids: [id] });
      }
    });

    it("invariant 6: a retired asset cannot be newly referenced; existing uses survive edits", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const entry = await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: asset.id, alt: "" } as never,
      });
      const retired = await store.retireAsset(asset);
      expect(retired.status).toBe("retired");
      // The entry keeps it and can still be edited.
      const edited = await store.updateContentEntry({ ...entry, title: "Edited, cover kept" });
      expect(edited.coverImage?.assetId).toBe(asset.id);
      // A new use is refused.
      const e = await rejects(
        store.updatePage({
          ...w.about,
          seo: { ogImage: { assetId: asset.id, alt: "" } as never },
        }),
      );
      expect((e as InvariantError).code).toBe("retired_asset");
      const restored = await store.restoreAsset(retired);
      expect(restored.status).toBe("active");
      await store.updatePage({
        ...w.about,
        seo: { ogImage: { assetId: asset.id, alt: "" } as never },
      });
    });

    it("invariant 7 under concurrency: a retire between check and write fails the guard", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const racing = ctx.racing(async () => {
        await store.retireAsset((await store.getAsset(asset.id)) as Asset);
      });
      const e = await rejects(
        racing.updatePage({
          ...w.about,
          seo: { ogImage: { assetId: asset.id, alt: "" } as never },
        }),
      );
      expect((e as InvariantError).code).toBe("retired_asset");
      expect((await store.getPage(w.about.id))?.rev).toBe(w.about.rev);
    });

    it("invariant 9: delete is refused while in use (listing the uses) and never deletes bytes", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const entry = await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: asset.id, alt: "" } as never,
      });
      const e = await rejects(store.deleteAsset(asset));
      expect((e as InvariantError).code).toBe("in_use");
      expect((e as InvariantError).details).toEqual({
        uses: [{ nodeId: entry.id, nodeKind: "contentEntry", field: "coverImage" }],
      });
      const { coverImage: _c, ...bare } = entry;
      await store.updateContentEntry(bare as ContentEntry);
      await store.deleteAsset(asset);
      expect(await store.getAsset(asset.id)).toBeUndefined();
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, asset.sha256))).not.toBeNull();
    });

    it("invariant 9 under concurrency: delete vs. an entry write that adds a reference", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      // The delete commits first: the entry's guard fails and names the missing asset.
      let racing = ctx.racing(async () => {
        await store.deleteAsset(asset);
      });
      const lost = await rejects(
        racing.updateContentEntry({
          ...w.entry,
          coverImage: { assetId: asset.id, alt: "" } as never,
        }),
      );
      expect((lost as InvariantError).code).toBe("unknown_asset");
      expect((await store.getContentEntry(w.entry.id))?.coverImage).toBeUndefined();
      // The entry commits first: the delete finds the reference.
      const again = await upload(store, w.site.id);
      racing = ctx.racing(async () => {
        await store.updateContentEntry({
          ...((await store.getContentEntry(w.entry.id)) as ContentEntry),
          coverImage: { assetId: again.asset.id, alt: "" } as never,
        });
      });
      expect(await code(racing.deleteAsset(again.asset))).toBe("in_use");
      expect(await store.getAsset(again.asset.id)).toBeDefined();
    });

    it("snapshots record their blobs; invariant 10: GC never takes bytes a node, snapshot or lease holds", async () => {
      const w = await setup();
      const store = ctx.store();
      const kept = await upload(store, w.site.id);
      const snap = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      const rows = await ctx
        .sql()
        .all<{ sha256: string }>("SELECT sha256 FROM snapshot_blobs WHERE snapshot_id = ?", [
          snap.id,
        ]);
      expect(rows.map((r) => r.sha256)).toEqual([kept.asset.sha256]);
      // An abandoned asset (never snapshotted) and a leased upload.
      const orphan = await upload(store, w.site.id, makePng({ width: 9, height: 9 }));
      await store.deleteAsset(orphan.asset);
      await store.deleteAsset(kept.asset); // the snapshot still needs these bytes
      const leasedSha = await sha256Hex("leased");
      await store.leaseBlob(w.site.id, leasedSha, "2099-01-01T00:00:00.000Z", {
        bytes: 1,
        mediaType: "image/png",
      });
      // Within the grace period nothing goes.
      expect((await store.collectMediaGarbage(w.site.id)).collected).toEqual([]);
      const dry = await store.collectMediaGarbage(w.site.id, { graceHours: 0, dryRun: true });
      expect(dry).toEqual({ collected: [orphan.asset.sha256], dryRun: true });
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, orphan.asset.sha256))).not.toBeNull();
      const gc = await store.collectMediaGarbage(w.site.id, { graceHours: 0 });
      expect(gc.collected).toEqual([orphan.asset.sha256]);
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, orphan.asset.sha256))).toBeNull();
      expect(await store.blobState(w.site.id, orphan.asset.sha256)).toBeUndefined();
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, kept.asset.sha256))).not.toBeNull();
      expect((await store.blobState(w.site.id, leasedSha))?.state).toBe("uploading");
      // The snapshot's copy still reads.
      expect(await store.readMediaBlob(w.site.id, kept.asset.sha256)).toBeDefined();
    });

    it("invariant 10 under concurrency: GC racing an upload of the same bytes (the lease)", async () => {
      const w = await setup();
      const store = ctx.store();
      const first = await upload(store, w.site.id, makePng({ width: 5, height: 5 }));
      await store.deleteAsset(first.asset);
      const key = mediaBlobKey(w.site.id, first.asset.sha256);
      // An upload leases the content while GC is about to mark it: GC's conditional step misses.
      const racingGc = ctx.racing(
        async () => {
          await upload(store, w.site.id, makePng({ width: 5, height: 5 }));
        },
        (q) => q.includes("SET state = 'deleting'"),
      );
      expect((await racingGc.collectMediaGarbage(w.site.id, { graceHours: 0 })).collected).toEqual(
        [],
      );
      expect(await ctx.blobs().head(key)).not.toBeNull();
      const back = await store.getAssetBySha256(w.site.id, first.asset.sha256);
      expect(back?.status).toBe("active");
      // GC that already marked the content `deleting` makes an upload answer `retry`.
      await store.deleteAsset(back as Asset);
      await ctx
        .sql()
        .run("UPDATE media_blobs SET state = 'deleting' WHERE site_id = ? AND sha256 = ?", [
          w.site.id,
          first.asset.sha256,
        ]);
      expect(await code(upload(store, w.site.id, makePng({ width: 5, height: 5 })))).toBe("retry");
      // The next GC run finishes the job; then the upload stores the bytes again.
      expect((await store.collectMediaGarbage(w.site.id, { graceHours: 0 })).collected).toEqual([
        first.asset.sha256,
      ]);
      expect(await ctx.blobs().head(key)).toBeNull();
      const re = await upload(store, w.site.id, makePng({ width: 5, height: 5 }));
      expect(re.existing).toBe(false);
      expect(await ctx.blobs().head(key)).not.toBeNull();
    });

    it("invariant 11: takedown removes the bytes from every snapshot, survives rollback and blocks re-upload", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: asset.id, alt: "" } as never,
      });
      const s1 = await store.createSnapshot(w.site.id, { actor: person, reason: "publish" });
      const live = await store.publish((await store.getSite(w.site.id)) as Site, s1.id);
      const result = await store.purgeBlob(w.site.id, asset.sha256, person, {
        text: "copyright notice #42",
        legal: true,
      });
      expect(result.asset?.status).toBe("retired");
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, asset.sha256))).toBeNull();
      expect(await store.blobState(w.site.id, asset.sha256)).toMatchObject({
        state: "purged",
        purge: { reason: "copyright notice #42", legal: true, by: `human:${person.id}` },
      });
      expect(await code(upload(store, w.site.id))).toBe("purged");
      // A rollback to the snapshot that had it does not bring the bytes back.
      const s2 = await store.createSnapshot(w.site.id, { actor: person, reason: "publish" });
      const live2 = await store.publish(live, s2.id);
      await store.rollback(live2, s1.id, person);
      expect((await store.blobState(w.site.id, asset.sha256))?.state).toBe("purged");
      expect(await store.readMediaBlob(w.site.id, asset.sha256)).toBeUndefined();
      // GC leaves purged rows alone; lifting allows the content back.
      await store.collectMediaGarbage(w.site.id, { graceHours: 0 });
      expect((await store.blobState(w.site.id, asset.sha256))?.state).toBe("purged");
      expect(await store.liftPurge(w.site.id, asset.sha256, person)).toBe(true);
      const back = await upload(store, w.site.id);
      expect(back.existing).toBe(true);
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, asset.sha256))).not.toBeNull();
    });

    it("invariant 12: /media/<16 hex>/ is reserved for pages, redirects and archives", async () => {
      const w = await setup();
      const store = ctx.store();
      const reserved = "/media/0123456789abcdef/x";
      expect(await code(store.updatePage({ ...w.about, path: reserved }))).toBe("reserved_path");
      expect(
        await code(
          store.createRedirect({
            siteId: w.site.id,
            from: reserved,
            to: "/",
            status: 301,
            match: "exact",
            reason: "manual",
          }),
        ),
      ).toBe("reserved_path");
      const [category] = await store.listTaxonomies(w.site.id);
      expect(
        await code(
          store.updateTaxonomy({
            ...(category as Taxonomy),
            archive: { ...(category as Taxonomy).archive, basePath: "/media/0123456789abcdef" },
          }),
        ),
      ).toBe("reserved_path");
      // /media itself and other paths under it stay usable.
      const moved = await store.updatePage({ ...w.about, path: "/media/press-kit" });
      expect(moved.path).toBe("/media/press-kit");
    });

    it("lists with filters and cursors; usage counts; unused and missing alt", async () => {
      const w = await setup();
      const store = ctx.store();
      const a = await upload(store, w.site.id);
      const b = await upload(store, w.site.id, makePng({ width: 10, height: 10 }), {
        filename: "diagram.png",
        fields: {},
        uploadedBy: person,
      });
      const c = await store.ingestAsset({
        siteId: w.site.id,
        bytes: text('{"a":1}'),
        filename: "stats.json",
        uploadedBy: robot,
        source: { kind: "upload" },
      });
      await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: a.asset.id, alt: "" } as never,
      });
      const ids = (q: Parameters<SiteGraphStore["listAssets"]>[1]) =>
        store.listAssets(w.site.id, q).then((p) => p.assets.map((x) => x.id));
      expect(await ids({ kind: ["image"] })).toEqual([b.asset.id, a.asset.id]);
      expect(await ids({ kind: ["data"] })).toEqual([c.asset.id]);
      expect(await ids({ unused: true })).toEqual([c.asset.id, b.asset.id]);
      expect(await ids({ missingAlt: true })).toEqual([b.asset.id]);
      expect(await ids({ uploadedBy: "human" })).toEqual([b.asset.id]);
      expect(await ids({ query: "bosphorus" })).toEqual([a.asset.id]);
      expect(await ids({ query: "100%_" })).toEqual([]);
      const page1 = await store.listAssets(w.site.id, { limit: 2 });
      expect(page1.assets).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();
      const page2 = await store.listAssets(w.site.id, {
        limit: 2,
        cursor: page1.nextCursor as string,
      });
      expect(page2.assets.map((x) => x.id)).toEqual([a.asset.id]);
      expect(page2.nextCursor).toBeUndefined();
      expect(await code(store.listAssets(w.site.id, { cursor: "bad" }))).toBe("invalid_asset");
    });

    it("auto mode: only a new raster image used only by articles in the same publish rides along", async () => {
      const w = await setup();
      const store = ctx.store();
      const s0 = await store.createSnapshot(w.site.id, { actor: person, reason: "publish" });
      await store.publish((await store.getSite(w.site.id)) as Site, s0.id);
      const photoAsset = (await upload(store, w.site.id)).asset;
      const unused = (await upload(store, w.site.id, makePng({ width: 7, height: 7 }))).asset;
      const pdf = (
        await store.ingestAsset({
          siteId: w.site.id,
          bytes: text("%PDF-1.7\n"),
          filename: "paper.pdf",
          uploadedBy: robot,
          source: { kind: "upload" },
        })
      ).asset;
      await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: photoAsset.id, alt: "" } as never,
        body: { format: "markdown", value: `[Paper](asset:${pdf.id})` },
      });
      let riding = await store.ridingAssets(w.site.id, await store.pendingChanges(w.site.id));
      expect([...riding]).toEqual([photoAsset.id]);
      expect(riding.has(unused.id)).toBe(false);
      expect(riding.has(pdf.id)).toBe(false);
      // Used by a page as well: it waits for a person.
      await store.updatePage({
        ...w.about,
        seo: { ogImage: { assetId: photoAsset.id, alt: "" } as never },
      });
      riding = await store.ridingAssets(w.site.id, await store.pendingChanges(w.site.id));
      expect(riding.size).toBe(0);
    });

    it("streams large non-image files with a declared sha256 and sniffs what was stored", async () => {
      const w = await setup();
      const store = ctx.store();
      const csv = text("station,count\nkadikoy,12\n");
      const sha256 = await bytesHex(csv);
      const stream = () => new Response(csv).body as ReadableStream<Uint8Array>;
      const r = await store.ingestAssetStream({
        siteId: w.site.id,
        stream: stream(),
        size: csv.byteLength,
        sha256,
        declaredType: "text/csv",
        filename: "counts.csv",
        uploadedBy: person,
        source: { kind: "upload" },
      });
      expect(r.asset).toMatchObject({
        kind: "data",
        mediaType: "text/csv",
        sha256,
        slug: "counts",
      });
      const wrong = await rejects(
        store.ingestAssetStream({
          siteId: w.site.id,
          stream: stream(),
          size: csv.byteLength,
          sha256: "0".repeat(64),
          declaredType: "text/csv",
          uploadedBy: person,
          source: { kind: "upload" },
        }),
      );
      expect(wrong.name).toBe("BlobIntegrityError");
      expect(await ctx.blobs().head(mediaBlobKey(w.site.id, "0".repeat(64)))).toBeNull();
      const pdfLabelled = text("not a pdf at all");
      expect(
        await code(
          store.ingestAssetStream({
            siteId: w.site.id,
            stream: new Response(pdfLabelled).body as ReadableStream<Uint8Array>,
            size: pdfLabelled.byteLength,
            sha256: await bytesHex(pdfLabelled),
            declaredType: "application/pdf",
            uploadedBy: person,
            source: { kind: "upload" },
          }),
        ),
      ).toBe("type_mismatch");
      expect(
        await ctx.blobs().head(mediaBlobKey(w.site.id, await bytesHex(pdfLabelled))),
      ).toBeNull();
      expect(
        await code(
          store.ingestAssetStream({
            siteId: w.site.id,
            stream: new Response(PNG_1X1).body as ReadableStream<Uint8Array>,
            size: PNG_1X1.byteLength,
            sha256: await bytesHex(PNG_1X1),
            declaredType: "image/png",
            uploadedBy: person,
            source: { kind: "upload" },
          }),
        ),
      ).toBe("unsupported_type");
    });

    it("the per-site quota is enforced", async () => {
      const w = await setup();
      const store = ctx.store();
      await upload(store, w.site.id);
      const used = (await store.listAssets(w.site.id)).assets[0]?.bytes ?? 0;
      const { SiteGraphStore } = await import("./store.ts");
      const small = new SiteGraphStore({
        sql: ctx.sql(),
        blobs: ctx.blobs(),
        media: { quotaBytes: used + 10 },
      });
      expect(await code(upload(small, w.site.id, makePng({ width: 30, height: 30 })))).toBe(
        "quota_exceeded",
      );
    });

    it("sync carries asset nodes, the bytes, snapshot blobs, references and takedowns", async () => {
      const w = await setup();
      const store = ctx.store();
      const { asset } = await upload(store, w.site.id);
      const gone = await upload(store, w.site.id, makePng({ width: 3, height: 3 }));
      await store.updateContentEntry({
        ...w.entry,
        coverImage: { assetId: asset.id, alt: "" } as never,
      });
      await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      await store.purgeBlob(w.site.id, gone.asset.sha256, person, {
        text: "personal data",
        legal: false,
      });
      const bundle = await exportSite({ sql: ctx.sql(), blobs: ctx.blobs() }, w.site.id);
      expect(bundle.media?.map((m) => m.sha256)).toEqual([asset.sha256]);
      expect(bundle.purged?.map((p) => p.sha256)).toEqual([gone.asset.sha256]);
      // Into the same storage under replace: the derived tables are rebuilt from the bundle.
      await ctx.sql().run("DELETE FROM asset_refs WHERE site_id = ?", [w.site.id]);
      await importSite({ sql: ctx.sql(), blobs: ctx.blobs() }, bundle, { mode: "replace" });
      expect((await store.assetUsage(w.site.id, [asset.id])).get(asset.id)?.total).toBe(1);
      expect((await store.blobState(w.site.id, gone.asset.sha256))?.state).toBe("purged");
      // A target without the bytes refuses the bundle.
      await ctx.blobs().delete(mediaBlobKey(w.site.id, asset.sha256));
      expect(
        await code(importSite({ sql: ctx.sql(), blobs: ctx.blobs() }, bundle, { mode: "replace" })),
      ).toBe("missing_media");
    });
  });
}

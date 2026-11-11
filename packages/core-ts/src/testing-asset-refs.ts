/**
 * RFC-0045 §2.5 (rollout step 0) behavioural suite: `asset_refs` is scoped by site. The delete
 * guard and the unused filter read only the asset's own site; a rebuild records only same-site
 * assets, in `INSERT`s below 90 KB; an import planned `unchanged` does not rebuild, so it cannot
 * replace a concurrent edit's row (#196). Called by `describeSiteGraphStore`, so it runs on every
 * storage backend (better-sqlite3 and Miniflare D1).
 */
import type { Actor, Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "./errors.ts";
import { PNG_1X1 } from "./media/fixtures.ts";
import { REFS_STATEMENT_BYTES, refsRebuild } from "./media/refs-rebuild.ts";
import { seedStarterSite } from "./seed.ts";
import { exportSite } from "./sync.ts";
import { prepareImport } from "./sync-plan.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const robot: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

export function assetRefsSuite(ctx: SuiteContext): void {
  describe("RFC-0045 §2.5 asset_refs by site", () => {
    const store = () => ctx.store();
    const storage = () => ({ sql: ctx.sql(), blobs: ctx.blobs() });

    async function site(slug: string): Promise<{ site: Site; entry: ContentEntry }> {
      const seeded = await seedStarterSite(store(), { name: slug, slug });
      const entry = (await store().listContentEntries(seeded.id))[0] as ContentEntry;
      return { site: (await store().getSite(seeded.id)) as Site, entry };
    }
    const upload = async (siteId: string, filename = "dot.png"): Promise<Asset> =>
      (
        await store().ingestAsset({
          siteId,
          bytes: PNG_1X1,
          filename,
          uploadedBy: robot,
          source: { kind: "upload" },
          fields: { decorative: true },
        })
      ).asset;
    const cover = (asset: Asset) =>
      ({ assetId: asset.id, alt: "" }) as NonNullable<ContentEntry["coverImage"]>;
    const rowsOf = (siteId: string) =>
      ctx
        .sql()
        .all<{ asset_id: string; node_id: string }>(
          "SELECT asset_id, node_id FROM asset_refs WHERE site_id = ? ORDER BY asset_id, node_id",
          [siteId],
        );
    const unused = async (siteId: string) =>
      (await store().listAssets(siteId, { unused: true })).assets.map((a) => a.id);

    it("#196: an unchanged import racing an asset-adding edit keeps the edit's row", async () => {
      const { site: s, entry } = await site("race");
      const asset = await upload(s.id);
      const bundle = await exportSite(storage(), s.id);
      // Planned before the edit, applied after it: `importSite`'s step 3 with a write in between.
      const { plan, writes } = await prepareImport(storage(), bundle, {});
      expect(plan.unchanged).toBe(true);
      expect(writes.batch.some((st) => st.sql.includes("asset_refs"))).toBe(false);
      await store().updateContentEntry({ ...entry, coverImage: cover(asset) });
      if (writes.batch.length > 0) await ctx.sql().batch(writes.batch);
      expect(await rowsOf(s.id)).toEqual([{ asset_id: asset.id, node_id: entry.id }]);
      expect(await unused(s.id)).not.toContain(asset.id);
      const refused = await store()
        .deleteAsset(asset)
        .then(
          () => undefined,
          (e: unknown) => e,
        );
      expect(refused).toBeInstanceOf(InvariantError);
      expect((refused as InvariantError).code).toBe("in_use");
    });

    it("an archive in one site naming another site's asset neither blocks its delete nor hides it", async () => {
      const x = await site("xsite");
      const y = await site("ysite");
      const own = await upload(x.site.id, "own.png");
      const theirs = await upload(y.site.id, "theirs.png");
      // Site X's node rows as a foreign archive would carry them: its entry names Y's asset, its
      // site node (the logo) its own.
      type Row = { id: string; kind: string; body: string };
      const rows = await ctx
        .sql()
        .all<Row>("SELECT id, kind, body FROM nodes WHERE site_id = ?", [x.site.id]);
      const edit = (kind: string, patch: Record<string, unknown>) => {
        const row = rows.find((r) => r.kind === kind) as Row;
        row.body = JSON.stringify({ ...JSON.parse(row.body), ...patch });
      };
      edit("contentEntry", { coverImage: cover(theirs) });
      edit("site", { brand: { ...x.site.brand, logo: cover(own) } });
      await ctx.sql().batch(refsRebuild(x.site.id, rows));
      expect(await rowsOf(x.site.id)).toEqual([{ asset_id: own.id, node_id: x.site.id }]);
      // A row an older rebuild wrote unscoped: Y's asset under X stays unused and deletable in Y.
      await ctx
        .sql()
        .run(
          "INSERT INTO asset_refs (site_id, asset_id, node_id, node_kind, field) VALUES (?, ?, ?, 'contentEntry', 'coverImage')",
          [x.site.id, theirs.id, x.entry.id],
        );
      expect(await unused(y.site.id)).toContain(theirs.id);
      expect(await unused(x.site.id)).not.toContain(own.id);
      await store().deleteAsset(theirs);
      expect(await store().getAsset(theirs.id)).toBeUndefined();
    });

    it("a rebuild mid-rename reads entries not rewritten yet through the marker's fromKey", async () => {
      const { site: s, entry } = await site("rename");
      const asset = await upload(s.id);
      type Row = { id: string; kind: string; body: string };
      const rows = await ctx
        .sql()
        .all<Row>("SELECT id, kind, body FROM nodes WHERE site_id = ?", [s.id]);
      // Phase A of `rename_field posts.poster → cover` ran; phase B has not reached the entry.
      const cover = {
        key: "cover",
        type: "image",
        labels: { en: { label: "Cover" } },
        localized: false,
        migration: { id: "snap_01HZX8K3Q9CD", fromKey: "poster" },
      };
      const siteRow = rows.find((r) => r.kind === "site") as Row;
      const body = JSON.parse(siteRow.body) as Site;
      const posts = { ...body.collections?.[entry.collection], fields: [cover] };
      siteRow.body = JSON.stringify({
        ...body,
        collections: { ...body.collections, [entry.collection]: posts },
      });
      const entryRow = rows.find((r) => r.id === entry.id) as Row;
      entryRow.body = JSON.stringify({
        ...JSON.parse(entryRow.body),
        fields: { poster: asset.id },
      });
      await ctx.sql().batch(refsRebuild(s.id, rows));
      expect(await rowsOf(s.id)).toEqual([{ asset_id: asset.id, node_id: entry.id }]);
    });

    it("a large rebuild stays under the statement size limit, in few statements", async () => {
      const { site: s } = await site("large");
      const asset = await upload(s.id);
      const rows = Array.from({ length: 5000 }, (_, i) => ({
        id: `entry_large${String(i).padStart(6, "0")}`,
        kind: "contentEntry",
        body: JSON.stringify({
          collection: "posts",
          body: { format: "html", value: "" },
          coverImage: cover(asset),
        }),
      }));
      const statements = refsRebuild(s.id, rows);
      const bytes = (st: (typeof statements)[number]) =>
        new TextEncoder().encode(st.sql + (st.params ?? []).join("")).length;
      expect(statements.length).toBeGreaterThan(2);
      expect(statements.length).toBeLessThan(12);
      for (const st of statements) expect(bytes(st)).toBeLessThan(REFS_STATEMENT_BYTES);
      await ctx.sql().batch(statements);
      const [count] = await ctx
        .sql()
        .all<{ n: number }>("SELECT count(*) AS n FROM asset_refs WHERE site_id = ?", [s.id]);
      expect(count?.n).toBe(5000);
    });
  });
}

import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { mediaBlobKey } from "../src/assets.ts";
import { InvariantError } from "../src/errors.ts";
import { hostsOf, listHosts } from "../src/hosts.ts";
import { seedStarterSite } from "../src/seed.ts";
import { deleteSiteData, SITE_TABLES } from "../src/site-delete.ts";
import { SiteGraphStore } from "../src/store.ts";
import { exportSite, importSite } from "../src/sync.ts";

async function installation() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  return { sql, blobs, store };
}

describe("site hosts (RFC-0034 §4)", () => {
  it("derives plain and per-locale hostnames, lower case, each once", () => {
    expect(
      hostsOf({
        id: "site_aaaaaaaa",
        domains: [
          { hostname: "Example.com", primary: true },
          { hostname: "tr.example.com", primary: false },
        ],
        localization: { domains: { tr: "tr.example.com" } },
      } as never),
    ).toEqual([
      { host: "example.com", siteId: "site_aaaaaaaa", primary: true },
      { host: "tr.example.com", siteId: "site_aaaaaaaa", locale: "tr", primary: false },
    ]);
  });

  it("keeps site_hosts in step with the site and refuses a hostname another site holds", async () => {
    const { sql, store } = await installation();
    const en = await seedStarterSite(store, { name: "English", slug: "en-site" });
    const project = en.projectId;
    const tr = await seedStarterSite(store, {
      name: "Türkçe",
      slug: "tr-site",
      projectId: project,
    });
    expect((await store.getProject(project))?.siteIds).toEqual([en.id, tr.id]);

    const enNow = (await store.getSite(en.id)) as typeof en;
    await store.updateSite({ ...enNow, domains: [{ hostname: "en.example.com", primary: true }] });
    expect(await listHosts(sql)).toEqual([
      { host: "en.example.com", siteId: en.id, primary: true },
    ]);

    const trNow = (await store.getSite(tr.id)) as typeof tr;
    const taken = await store
      .updateSite({ ...trNow, domains: [{ hostname: "en.example.com", primary: true }] })
      .catch((e) => e);
    expect(taken).toBeInstanceOf(InvariantError);
    expect((taken as InvariantError).code).toBe("host_taken");

    await store.updateSite({ ...trNow, domains: [{ hostname: "tr.example.com", primary: true }] });
    // Freed hostnames can move: the English site drops its host, the Turkish site takes it.
    await store.updateSite({ ...((await store.getSite(en.id)) as typeof en), domains: [] });
    const trLater = (await store.getSite(tr.id)) as typeof tr;
    await store.updateSite({
      ...trLater,
      domains: [...trLater.domains, { hostname: "en.example.com", primary: false }],
    });
    expect(
      (await listHosts(sql)).map((h) => `${h.host}→${h.siteId === tr.id ? "tr" : "en"}`),
    ).toEqual(["en.example.com→tr", "tr.example.com→tr"]);
  });

  it("writes an imported site's hostnames and refuses one already taken", async () => {
    const src = await installation();
    const dst = await installation();
    const site = await seedStarterSite(src.store, { name: "Moved", slug: "moved" });
    await src.store.updateSite({
      ...((await src.store.getSite(site.id)) as typeof site),
      domains: [{ hostname: "moved.example.com", primary: true }],
    });
    await importSite(dst, await exportSite(src, site.id));
    expect((await listHosts(dst.sql)).map((h) => h.host)).toEqual(["moved.example.com"]);

    const other = await installation();
    const local = await seedStarterSite(other.store, { name: "Local", slug: "local" });
    await other.store.updateSite({
      ...((await other.store.getSite(local.id)) as typeof local),
      domains: [{ hostname: "moved.example.com", primary: true }],
    });
    const refused = await importSite(other, await exportSite(src, site.id)).catch((e) => e);
    expect((refused as InvariantError).code).toBe("host_taken");
  });
});

describe("deleteSiteData (RFC-0034 §2)", () => {
  it("lists every table with a site_id column", async () => {
    const { sql } = await installation();
    const tables = await sql.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const keyed: string[] = [];
    for (const { name } of tables) {
      const cols = await sql.all<{ name: string }>(`SELECT name FROM pragma_table_info('${name}')`);
      if (cols.some((c) => c.name === "site_id")) keyed.push(name);
    }
    expect([...SITE_TABLES].sort()).toEqual(keyed.sort());
  });

  it("removes one site's rows and media and leaves its neighbour untouched", async () => {
    const { sql, blobs, store } = await installation();
    const keep = await seedStarterSite(store, { name: "Keep", slug: "keep" });
    const gone = await seedStarterSite(store, {
      name: "Gone",
      slug: "gone",
      projectId: keep.projectId,
    });
    await store.updateSite({
      ...((await store.getSite(gone.id)) as typeof gone),
      domains: [{ hostname: "gone.example.com", primary: true }],
    });
    const snap = await store.createSnapshot(gone.id, {
      actor: { kind: "human", id: "user_multi00001" },
      reason: "publish",
    });
    await store.publish((await store.getSite(gone.id)) as typeof gone, snap.id);
    const sha = "a".repeat(64);
    await blobs.put(mediaBlobKey(gone.id, sha), new Uint8Array([1]));
    await blobs.put(mediaBlobKey(keep.id, sha), new Uint8Array([2]));

    const r = await deleteSiteData({ sql, blobs }, gone.id);
    expect(r.rows).toBeGreaterThan(0);
    expect(r.objects).toBeGreaterThanOrEqual(1);
    expect(await store.getSite(gone.id)).toBeUndefined();
    for (const table of SITE_TABLES)
      expect(
        (
          await sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE site_id = ?`, [
            gone.id,
          ])
        )?.n,
        table,
      ).toBe(0);
    expect(await blobs.head(mediaBlobKey(gone.id, sha))).toBeFalsy();
    expect(await blobs.head(mediaBlobKey(keep.id, sha))).toBeTruthy();
    expect((await store.listPages(keep.id)).length).toBe(2);
    expect((await store.getProject(keep.projectId))?.siteIds).toEqual([keep.id]);

    // Running it again finishes quietly (an interrupted delete is resumable).
    expect(await deleteSiteData({ sql, blobs }, gone.id)).toEqual({ rows: 0, objects: 0 });
  });

  it("deletes the project with its last site", async () => {
    const { sql, blobs, store } = await installation();
    const only = await seedStarterSite(store, { name: "Only", slug: "only" });
    await deleteSiteData({ sql, blobs }, only.id);
    expect(await store.getProject(only.projectId)).toBeUndefined();
  });
});

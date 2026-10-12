/**
 * RFC-0008 §4.1: `Site.timeZone` is checked against the writing runtime's zones on every write —
 * creating and updating a site, and importing a bundle — with `invalid_time_zone`. A zone the site
 * already stores is accepted unchanged (time-zone data can drop a name between runtimes).
 */
import type { Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { checkTimeZone } from "../src/availability.ts";
import { InvariantError } from "../src/errors.ts";
import { SiteGraphStore, seedStarterSite } from "../src/index.ts";
import { exportSite, importSite } from "../src/sync.ts";

const code = (p: Promise<unknown> | (() => unknown)) =>
  (typeof p === "function" ? Promise.resolve().then(p) : p).then(
    () => "ok",
    (e: unknown) => (e instanceof InvariantError ? e.code : String(e)),
  );

async function setup() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  const site = await seedStarterSite(store, { name: "Zoned", slug: "zoned" });
  return { sql, blobs, store, site };
}

describe("Site.timeZone on write (§4.1)", () => {
  it("checkTimeZone: known zones, UTC and aliases pass; unknown names fail unless unchanged", () => {
    for (const zone of [undefined, "UTC", "Europe/Istanbul", "Etc/GMT+3", "Europe/Kiev"])
      expect(() => checkTimeZone(zone)).not.toThrow();
    expect(() => checkTimeZone("Europe/Atlantis")).toThrow(/unknown time zone "Europe\/Atlantis"/);
    expect(() => checkTimeZone("Europe/Atlantis", "Europe/Atlantis")).not.toThrow();
    expect(() => checkTimeZone("Europe/Atlantis", "Europe/Istanbul")).toThrow(InvariantError);
  });

  it("createSite and updateSite refuse a zone the runtime does not know", async () => {
    const { store, site } = await setup();
    const { id: _i, rev: _r, createdAt: _c, updatedAt: _u, ...template } = site;
    expect(
      await code(
        store.createSite({
          ...template,
          name: "Atlantis",
          slug: "atlantis",
          pageIds: [],
          timeZone: "Europe/Atlantis",
        }),
      ),
    ).toBe("invalid_time_zone");
    expect(await store.listSites()).toHaveLength(1);
    expect(await code(store.updateSite({ ...site, timeZone: "Europe/Atlantis" }))).toBe(
      "invalid_time_zone",
    );
    const zoned = await store.updateSite({ ...site, timeZone: "Europe/Istanbul" });
    expect(zoned.timeZone).toBe("Europe/Istanbul");
    // nothing was written by the refused update
    expect((await store.getSite(site.id))?.rev).toBe(zoned.rev);
  });

  it("a zone already stored stays editable; importing refuses an unknown zone", async () => {
    const { sql, blobs, store, site } = await setup();
    // a site saved by a runtime whose time-zone data knew this name
    const body = JSON.parse(
      (await sql.get<{ body: string }>("SELECT body FROM nodes WHERE id = ?", [site.id]))
        ?.body as string,
    ) as Site;
    await sql.run("UPDATE nodes SET body = ? WHERE id = ?", [
      JSON.stringify({ ...body, timeZone: "Europe/Atlantis" }),
      site.id,
    ]);
    const stored = (await store.getSite(site.id)) as Site;
    const renamed = await store.updateSite({ ...stored, name: "Still Zoned" });
    expect(renamed).toMatchObject({ name: "Still Zoned", timeZone: "Europe/Atlantis" });

    // a bundle carrying the unknown zone: refused by a target that does not store it already
    const bundle = await exportSite({ sql, blobs }, site.id);
    const target = await BetterSqlite3Driver.open(":memory:");
    const fresh = new SiteGraphStore({ sql: target, blobs: new MemoryBlobStore() });
    await fresh.init();
    expect(await code(importSite({ sql: target, blobs: new MemoryBlobStore() }, bundle))).toBe(
      "invalid_time_zone",
    );
    // …and accepted where the site already has it (a re-import of the same site)
    expect(await code(importSite({ sql, blobs }, bundle, { mode: "replace" }))).toBe("ok");
  });
});

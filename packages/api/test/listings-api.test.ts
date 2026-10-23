import { GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, createTableReset } from "@cloudhal/storage/testing";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { describeListingsApi } from "../src/testing-listings.ts";

describeListingsApi("better-sqlite3", {
  async create() {
    const store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      // RFC-0042 §3.6: `expiry` needs a renderer with derived gates (one process on Node).
      gates: GATES_ENFORCED,
    });
    await store.init();
    return store;
  },
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const reset = createTableReset();
describeListingsApi("Cloudflare D1 (Miniflare)", {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore(), gates: GATES_ENFORCED });
    await reset(sql, () => store.init());
    return store;
  },
  async dispose() {
    await d1?.dispose();
  },
});

describe("API: collection expiry and the site Worker's gates (RFC-0042 §3.6)", () => {
  it("answers 409 gates_unsupported until the renderer reports gates 2", async () => {
    const store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      // an RFC-0008 site Worker: availability yes, derived gates no
      gates: { enforced: (_siteId, version) => (version ?? 1) <= 1 },
    });
    await store.init();
    const site = await seedStarterSite(store, { name: "Old Worker", slug: "old-worker" });
    const app = createApi({
      store,
      resolveActor: async () => ({ kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" }),
    });
    const put = (settings: unknown) =>
      app.request(`/api/sites/${site.id}/collections/events`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings, rev: site.rev }),
      });
    const fields = [
      { key: "endsAt", type: "datetime", labels: { en: { label: "Ends" } }, localized: false },
    ];
    const refused = await put({ fields, expiry: { field: "endsAt", action: "unlist" } });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error?: string }).error).toBe("gates_unsupported");
    expect((await put({ fields })).status).toBe(200);
  });
});

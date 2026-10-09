import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll } from "vitest";
import { SqlAnalytics } from "../src/sql/index.ts";
import { describeAnalyticsConformance } from "../src/testing.ts";

// One Miniflare instance for the whole file; every suite starts from empty tables.
let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
async function driver(): Promise<D1Driver> {
  d1 ??= await createMiniflareD1();
  return new D1Driver(d1.db);
}
afterAll(async () => {
  await d1?.dispose();
});

describeAnalyticsConformance("SqlAnalytics on Cloudflare D1 (Miniflare)", {
  async create() {
    const sql = await driver();
    await dropAllTables(sql);
    await migrate(sql, migrations);
    const store = new SqlAnalytics(sql);
    return { reader: store, load: (events) => store.insertMany(events) };
  },
});

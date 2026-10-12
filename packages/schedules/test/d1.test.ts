import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll } from "vitest";
import { describeSchedulerConformance, describeScheduleStoreConformance } from "../src/testing.ts";

// One Miniflare instance for the whole file; every test starts from empty tables. The peer driver
// is a second D1Driver over the same binding (another isolate's view of one database).
let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const factory = {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    await dropAllTables(sql);
    await migrate(sql, migrations);
    return sql;
  },
  peer() {
    if (!d1) throw new Error("create() first");
    return new D1Driver(d1.db);
  },
};
afterAll(async () => {
  await d1?.dispose();
});

describeScheduleStoreConformance("SqlScheduleStore on Cloudflare D1 (Miniflare)", factory);
describeSchedulerConformance("SqlScheduleStore on Cloudflare D1 (Miniflare)", factory);

import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll } from "vitest";
import { describeCommentPipelineSuite, describeCommentStoreConformance } from "../src/testing.ts";

// One Miniflare instance for the whole file; every test starts from empty tables.
let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const factory = {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    await dropAllTables(sql);
    await migrate(sql, migrations);
    return sql;
  },
};
afterAll(async () => {
  await d1?.dispose();
});

describeCommentStoreConformance("SqlCommentStore on Cloudflare D1 (Miniflare)", factory);
describeCommentPipelineSuite("SqlCommentStore on Cloudflare D1 (Miniflare)", factory);

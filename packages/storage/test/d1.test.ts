import { D1Driver } from "../src/sql/d1.ts";
import { createMiniflareD1, describeSqlDriverConformance } from "../src/testing.ts";

let handle: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;

describeSqlDriverConformance("Cloudflare D1 (Miniflare)", {
  async create() {
    handle ??= await createMiniflareD1();
    return new D1Driver(handle.db);
  },
  async dispose() {
    await handle?.dispose();
  },
});

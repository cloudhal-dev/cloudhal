import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { SqlAnalytics } from "../src/sql/index.ts";
import { describeAnalyticsConformance } from "../src/testing.ts";

describeAnalyticsConformance("SqlAnalytics on better-sqlite3", {
  async create() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SqlAnalytics(sql);
    return {
      reader: store,
      load: (events) => store.insertMany(events),
      close: () => sql.close(),
    };
  },
});

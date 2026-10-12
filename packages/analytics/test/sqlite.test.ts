import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { SqlAnalytics } from "../src/sql/index.ts";
import {
  describeAnalyticsConformance,
  describeAnalyticsStateSuite,
  describeBotTrafficConformance,
  describeRollupSuite,
} from "../src/testing.ts";

const sqlite = {
  async create() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SqlAnalytics(sql);
    return {
      reader: store,
      load: (events: Parameters<SqlAnalytics["insertMany"]>[0]) => store.insertMany(events),
      close: () => sql.close(),
    };
  },
};
describeAnalyticsConformance("SqlAnalytics on better-sqlite3", sqlite);
describeBotTrafficConformance("SqlAnalytics on better-sqlite3", sqlite);

describeAnalyticsStateSuite("better-sqlite3", {
  create: () => BetterSqlite3Driver.open(":memory:"),
});

describeRollupSuite("better-sqlite3", {
  create: () => BetterSqlite3Driver.open(":memory:"),
});

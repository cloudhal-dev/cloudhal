import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describeSchedulerConformance, describeScheduleStoreConformance } from "../src/testing.ts";

const sqlite = {
  async create() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    return sql;
  },
};

describeScheduleStoreConformance("SqlScheduleStore on better-sqlite3", sqlite);
describeSchedulerConformance("SqlScheduleStore on better-sqlite3", sqlite);

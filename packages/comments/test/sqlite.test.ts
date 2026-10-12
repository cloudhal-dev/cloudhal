import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describeCommentPipelineSuite, describeCommentStoreConformance } from "../src/testing.ts";

const sqlite = {
  async create() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    return sql;
  },
};

describeCommentStoreConformance("SqlCommentStore on better-sqlite3", sqlite);
describeCommentPipelineSuite("SqlCommentStore on better-sqlite3", sqlite);

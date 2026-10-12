import { BetterSqlite3Driver } from "../src/sql/better-sqlite3.ts";
import { describeSqlDriverConformance } from "../src/testing.ts";

describeSqlDriverConformance("better-sqlite3 (:memory:)", {
  create: () => BetterSqlite3Driver.open(":memory:"),
});

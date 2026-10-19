import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { MAX_PRELOAD, parseSiteIds, SiteHostMap } from "../src/site-hosts.ts";

async function db(rows: [string, string, string | null][]) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  for (const [host, site, locale] of rows)
    await sql.run("INSERT INTO site_hosts (host, site_id, locale) VALUES (?, ?, ?)", [
      host,
      site,
      locale,
    ]);
  return sql;
}

describe("SiteHostMap (RFC-0034 §4)", () => {
  it("parses the allow-list", () => {
    expect(parseSiteIds(" site_a, site_b site_a ")).toEqual(["site_a", "site_b"]);
    expect(parseSiteIds(undefined)).toEqual([]);
  });

  it("maps hostnames to allowed sites only, with per-locale domains", async () => {
    const sql = await db([
      ["en.example.com", "site_a", null],
      ["tr.example.com", "site_a", "tr"],
      ["other.example.com", "site_c", null],
    ]);
    const map = new SiteHostMap({ sql: () => sql, siteIds: ["site_a", "site_b"] });
    expect(await map.lookup("EN.example.com.")).toEqual({ siteId: "site_a" });
    expect(await map.lookup("tr.example.com")).toEqual({ siteId: "site_a", locale: "tr" });
    // another installation's site, or nobody's: unknown, never a fallback
    expect(await map.lookup("other.example.com")).toBeUndefined();
    expect(await map.lookup("nope.example.com")).toBeUndefined();
    expect(await map.hostsOf("site_a")).toEqual(["en.example.com", "tr.example.com"]);
  });

  it("reloads after its TTL or a reset", async () => {
    const sql = await db([["a.example.com", "site_a", null]]);
    let now = 0;
    const map = new SiteHostMap({ sql: () => sql, siteIds: ["site_a"], now: () => now });
    expect(await map.lookup("b.example.com")).toBeUndefined();
    await sql.run("INSERT INTO site_hosts (host, site_id) VALUES ('b.example.com', 'site_a')");
    expect(await map.lookup("b.example.com")).toBeUndefined();
    now = 61_000;
    expect(await map.lookup("b.example.com")).toEqual({ siteId: "site_a" });
    await sql.run("DELETE FROM site_hosts WHERE host = 'b.example.com'");
    map.reset();
    expect(await map.lookup("b.example.com")).toBeUndefined();
  });

  it("looks hostnames up one by one beyond the preload limit", async () => {
    const rows: [string, string, null][] = Array.from({ length: MAX_PRELOAD + 1 }, (_, i) => [
      `h${i}.example.com`,
      "site_a",
      null,
    ]);
    const sql = await db(rows);
    const map = new SiteHostMap({ sql: () => sql, siteIds: ["site_a"] });
    expect(await map.lookup(`h${MAX_PRELOAD}.example.com`)).toEqual({ siteId: "site_a" });
    expect(await map.lookup("missing.example.com")).toBeUndefined();
  });
});

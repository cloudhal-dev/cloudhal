/**
 * RFC-0008's route sweep (§7.2, invariant S9) extended to derived gates (RFC-0042 §3, "Leaks"): the
 * stage 3 fixture published once, swept at every derived instant −1 ms, exactly and +1 ms through
 * every route the blog starter serves. An entry past a `hide` expiry must not appear in any public
 * output (id, path, title); an entry past an `unlist` expiry keeps its own page but must not
 * appear on any other route, list, feed (the collections' own feeds included) or the sitemap.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts";
import { derivedGate } from "@cloudhal/core-ts/fields";
import { beforeAll, describe, expect, it } from "vitest";
import { staticPaths } from "../src/routing.ts";
import { SnapshotSource } from "../src/source.ts";
import { type Stage3, stage3 } from "./stage3-fixture.ts";
import { ORIGIN, sweep } from "./sweep.ts";

interface Watched {
  readonly name: string;
  readonly entry: ContentEntry;
  readonly path: string;
  readonly leaks: readonly string[];
  readonly at: number;
  readonly action: "unlist" | "hide";
}

describe("route sweep: derived gates (RFC-0042 §3)", () => {
  let fx: Stage3;
  let published: SnapshotSource;
  let candidates: string[];
  let watched: Watched[];

  beforeAll(async () => {
    fx = await stage3();
    published = await SnapshotSource.open(fx.store, fx.snapshotId);
    const everything = await staticPaths(published.ungated());
    const watch = (name: string, entry: ContentEntry): Watched => {
      const gate = derivedGate(fx.site, entry);
      if (!gate) throw new Error(`fixture: ${name} has no derived gate`);
      const path = entryPath(fx.site, entry);
      const marker = /ZQXU\d/.exec(entry.title)?.[0];
      return {
        name,
        entry,
        path,
        leaks: [entry.id, path, ...(marker ? [marker] : [])],
        at: gate.at,
        action: gate.action,
      };
    };
    watched = [
      watch("unlisted past event", fx.past),
      watch("event ending at t+4h", fx.soon),
      watch("offer hidden since yesterday", fx.oldOffer),
      watch("offer hidden at 21:00 UTC", fx.todayOffer),
    ];
    candidates = [...everything.pages, ...everything.feeds, ...watched.map((w) => w.path), "/nope"];
  });

  it("leaks no hidden entry anywhere and no unlisted entry outside its own page", async () => {
    const clocks = [...new Set(watched.map((w) => w.at))].flatMap((g) => [g - 1, g, g + 1]);
    expect(clocks.length).toBeGreaterThanOrEqual(9);
    for (const now of clocks) {
      const label = `${new Date(now).toISOString()}`;
      const source = published.at(now);
      const swept = await sweep(source, candidates, [], fx.store);
      // RFC-0042 §5: the collections' own feeds are swept too
      for (const feed of ["/events/rss.xml", "/offers/rss.xml"])
        expect(swept.routes.get(feed), `${label}: ${feed}`).toBe("collection-feed");
      for (const w of watched) {
        const past = !(now < w.at);
        const route = swept.routes.get(w.path);
        if (!past) {
          expect(route, `${label}: ${w.name}`).toBe("entry");
          expect(swept.text, `${label}: ${w.name} in the sitemap`).toContain(`${ORIGIN}${w.path}`);
          continue;
        }
        if (w.action === "hide") {
          expect(route, `${label}: ${w.name} route`).toBe("not-found");
          for (const leak of w.leaks)
            expect(swept.text.includes(leak), `${label}: ${w.name} leaks "${leak}"`).toBe(false);
          expect(await source.entryById(w.entry.id), `${label}: ${w.name} by id`).toBeUndefined();
          continue;
        }
        expect(route, `${label}: ${w.name} route`).toBe("entry");
        // every public output but its own page: other routes, menus, the feed, sitemap, robots.txt
        const own = swept.byPath.get(w.path) ?? "";
        const elsewhere = own ? swept.text.split(own).join("\n") : swept.text;
        for (const leak of w.leaks)
          expect(elsewhere.includes(leak), `${label}: ${w.name} listed: "${leak}"`).toBe(false);
        expect(swept.text.includes(`<loc>${ORIGIN}${w.path}</loc>`), `${label}: sitemap`).toBe(
          false,
        );
      }
    }
  });
});

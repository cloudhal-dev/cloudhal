import { describe, expect, it } from "vitest";
import { purgeSiteCache } from "../src/purge.ts";

const change = { siteId: "site_english01", from: "snap_a", to: "snap_b" } as never;

describe("purgeSiteCache names the site (RFC-0034 §4)", () => {
  it("sends the site with tag batches and with an everything purge", async () => {
    const bodies: unknown[] = [];
    const fetch = async (_url: string, init: RequestInit) => {
      bodies.push(init.body ? JSON.parse(String(init.body)) : null);
      return new Response("{}");
    };
    const store = (plan: unknown) => ({ planCachePurge: async () => plan as never });
    await purgeSiteCache({
      fetch,
      token: "t",
      change,
      siteId: "site_english01",
      store: store({ mode: "tags", tags: ["cloudhal-node-1"], why: ["edited"] }),
    });
    await purgeSiteCache({
      fetch,
      token: "t",
      change,
      siteId: "site_english01",
      store: store({ mode: "everything", reason: "first publish" }),
    });
    expect(bodies).toEqual([
      { tags: ["cloudhal-node-1"], siteId: "site_english01" },
      { siteId: "site_english01" },
    ]);
  });
});

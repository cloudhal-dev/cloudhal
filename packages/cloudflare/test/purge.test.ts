/**
 * purgeSiteCache: batches a publish's tags to the site Worker within Cloudflare's 100-tags-per-purge
 * limit, purges everything when the plan says so or a tag purge fails, and sends nothing when the
 * site renders the same. The end-to-end check (real tags, real site Worker) is in
 * packages/cli/test/cloudflare.test.ts.
 */
import type { CachePurgePlan } from "@cloudhal/core-ts";
import { describe, expect, it } from "vitest";
import { PURGE_TAGS_PER_REQUEST, purgeSiteCache } from "../src/purge.ts";

function harness(plan: CachePurgePlan, status = (_n: number) => 200) {
  const calls: { body?: { tags: string[] }; auth: string | null }[] = [];
  const asked: { maxTags?: number }[] = [];
  const run = () =>
    purgeSiteCache({
      fetch: async (_url, init) => {
        calls.push({
          ...(init.body ? { body: JSON.parse(init.body as string) } : {}),
          auth: new Headers(init.headers).get("authorization"),
        });
        return new Response("{}", { status: status(calls.length) });
      },
      token: "purge-token",
      store: {
        planCachePurge: async (_change, options) => {
          asked.push(options ?? {});
          return plan;
        },
      },
      change: { from: "snap_a", to: "snap_b" },
    });
  return { calls, asked, run };
}

const tags = (n: number) => Array.from({ length: n }, (_, i) => `cloudhal-node-entry_${i}`);

describe("purgeSiteCache", () => {
  it("sends the plan's tags in batches of 100, authenticated", async () => {
    const h = harness({ mode: "tags", tags: tags(230), why: ["entry …"] });
    const result = await h.run();
    expect(result).toMatchObject({ mode: "tags", requests: 3 });
    expect(h.calls.map((c) => c.body?.tags.length)).toEqual([100, 100, 30]);
    expect(h.calls.every((c) => c.auth === "Bearer purge-token")).toBe(true);
    expect(h.calls.flatMap((c) => c.body?.tags)).toEqual(tags(230));
    // the planner is told where a tag purge stops paying off
    expect(h.asked[0]?.maxTags).toBe(PURGE_TAGS_PER_REQUEST * 3);
  });

  it("purges everything when the plan cannot be limited", async () => {
    const h = harness({ mode: "everything", reason: "no previously published snapshot" });
    expect(await h.run()).toMatchObject({ mode: "everything", requests: 1 });
    expect(h.calls).toEqual([{ auth: "Bearer purge-token" }]);
  });

  it("falls back to everything when a tag purge fails, and sends nothing for no change", async () => {
    const failing = harness({ mode: "tags", tags: tags(150), why: [] }, (n) =>
      n === 2 ? 502 : 200,
    );
    const result = await failing.run();
    expect(result).toMatchObject({ mode: "everything", reason: "tag purge failed with 502" });
    expect(failing.calls.map((c) => (c.body ? c.body.tags.length : "all"))).toEqual([
      100,
      50,
      "all",
    ]);

    const same = harness({ mode: "tags", tags: [], why: [] });
    expect(await same.run()).toMatchObject({ mode: "none", requests: 0 });
    expect(same.calls).toEqual([]);
  });
});

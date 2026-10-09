import { describe, expect, it } from "vitest";
import { MemoryAnalytics } from "../src/index.ts";
import { describeAnalyticsConformance, FIXTURE_EVENTS, FIXTURE_SITE } from "../src/testing.ts";

describeAnalyticsConformance("MemoryAnalytics (reference)", {
  async create() {
    const store = new MemoryAnalytics();
    return {
      reader: store,
      async load(events) {
        for (const e of events) store.write(e);
      },
    };
  },
});

describe("MemoryAnalytics", () => {
  it("is a live store that is never estimated", async () => {
    const store = new MemoryAnalytics();
    for (const e of FIXTURE_EVENTS) store.write(e);
    const r = await store.query({
      kind: "summary",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-09" },
    });
    expect(r).toMatchObject({ source: "live", estimated: false });
    expect(store.kind).toBe("memory");
  });
});

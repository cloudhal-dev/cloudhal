import { describe, expect, it } from "vitest";
import { MemoryAnalytics } from "../src/index.ts";
import {
  describeAnalyticsConformance,
  describeBotTrafficConformance,
  FIXTURE_EVENTS,
  FIXTURE_SITE,
} from "../src/testing.ts";

const memory = {
  async create() {
    const store = new MemoryAnalytics();
    return {
      reader: store,
      async load(events: readonly import("@cloudhal/core-contracts").AnalyticsEvent[]) {
        for (const e of events) store.write(e);
      },
    };
  },
};
describeAnalyticsConformance("MemoryAnalytics (reference)", memory);
describeBotTrafficConformance("MemoryAnalytics (reference)", memory);

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

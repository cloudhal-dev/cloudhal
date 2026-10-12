/**
 * The WAE compiler and reader against the conformance suite: events go through the WAE layout
 * (`toDataPoint`) into a SQLite-backed fake of the Analytics SQL API, and every compiled query
 * must give the same answer as SQLite, D1 and the in-memory reference (invariant A10).
 */
import { describe, expect, it } from "vitest";
import { describeAnalyticsConformance, FIXTURE_EVENTS, FIXTURE_SITE } from "../src/testing.ts";
import { WaeReader, WaeWriter } from "../src/wae/index.ts";
import { FakeWae } from "./helpers/fake-wae.ts";

describeAnalyticsConformance("WaeReader over the WAE layout (fake Analytics SQL API)", {
  async create() {
    const wae = new FakeWae("newsroom_events");
    return {
      reader: new WaeReader(wae, { dataset: "newsroom_events", cacheTtlMs: 0 }),
      async load(events) {
        wae.load(events);
      },
    };
  },
});

describe("WaeWriter → WaeReader", () => {
  it("records through the binding and reads the same totals back", async () => {
    const wae = new FakeWae("newsroom_events");
    const writer = new WaeWriter(wae.binding);
    for (const e of FIXTURE_EVENTS) {
      wae.clock = () => new Date(e.timestamp);
      writer.write(e);
    }
    const reader = new WaeReader(wae, { dataset: "newsroom_events", cacheTtlMs: 0 });
    const r = await reader.query({
      kind: "summary",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-09" },
    });
    expect(r).toEqual({
      data: { pageviews: 10, visits: 7, visitors: 5, renders: 4, signals: 1 },
      source: "live",
      estimated: true,
    });
  });

  it("never fails the caller when the binding throws", () => {
    const errors: string[] = [];
    const writer = new WaeWriter(
      {
        writeDataPoint() {
          throw new Error("quota");
        },
      },
      { onError: (m) => errors.push(m) },
    );
    expect(() => writer.write(FIXTURE_EVENTS[0] as never)).not.toThrow();
    expect(errors).toHaveLength(1);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { FIXTURE_EVENTS } from "../src/testing.ts";
import { ABSENT, BLOB, DOUBLE, fromDataPoint, toDataPoint } from "../src/wae/index.ts";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../core-contracts/fixtures/valid/analytics-event",
);
const contractFixtures: AnalyticsEvent[] = readdirSync(fixtures)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(fixtures, f), "utf8")) as AnalyticsEvent);

describe("WAE layout (RFC-0006 §4)", () => {
  it("round-trips every contract fixture and conformance event", () => {
    for (const e of [...contractFixtures, ...FIXTURE_EVENTS]) {
      const point = toDataPoint(e);
      const back = fromDataPoint(point, e.timestamp);
      expect(back).toEqual(e);
    }
  });

  it("puts each field in its fixed slot", () => {
    const pageview = contractFixtures.find(
      (e) => e.kind === "pageview" && e.visitor !== undefined,
    ) as Extract<AnalyticsEvent, { kind: "pageview" }>;
    const p = toDataPoint(pageview);
    expect(p.indexes).toEqual([pageview.siteId]);
    expect(p.blobs).toHaveLength(20);
    expect(p.blobs[BLOB.kind - 1]).toBe("pageview");
    expect(p.blobs[BLOB.schemaVersion - 1]).toBe("1");
    expect(p.blobs[2]).toBe(pageview.path);
    expect(p.blobs[3]).toBe(pageview.nodeId);
    expect(p.blobs[6]).toBe(pageview.channel);
    expect(p.blobs[7]).toBe(pageview.utmSource);
    expect(p.blobs[14]).toBe(pageview.visitor);
    expect(p.blobs[15]).toBe(pageview.navType);
    expect(p.doubles).toEqual([1]);

    const vitals = contractFixtures.find((e) => e.kind === "vitals") as Extract<
      AnalyticsEvent,
      { kind: "vitals" }
    >;
    const v = toDataPoint(vitals);
    expect(v.doubles[DOUBLE.lcp - 1]).toBe(vitals.lcp);
    expect(v.doubles[DOUBLE.cls - 1]).toBe(42); // 0.042 × 1000
    expect(v.doubles[DOUBLE.sampleOneIn - 1]).toBe(5);

    const flood = contractFixtures.find(
      (e) => e.kind === "render" && e.sampleOneIn !== undefined,
    ) as Extract<AnalyticsEvent, { kind: "render" }>;
    const r = toDataPoint(flood);
    expect(r.doubles[DOUBLE.status - 1]).toBe(404);
    expect(r.doubles[DOUBLE.renderMs - 1]).toBe(ABSENT);
    expect(r.doubles[DOUBLE.sampleOneIn - 1]).toBe(20);
  });

  it("stays far below WAE's limits", () => {
    for (const e of [...contractFixtures, ...FIXTURE_EVENTS]) {
      const p = toDataPoint(e);
      expect(p.blobs.length).toBeLessThanOrEqual(20);
      expect(p.doubles.length).toBeLessThanOrEqual(20);
      expect(new TextEncoder().encode(String(p.indexes[0])).byteLength).toBeLessThanOrEqual(96);
      const bytes = p.blobs.reduce((n, b) => n + new TextEncoder().encode(b).byteLength, 0);
      expect(bytes).toBeLessThan(1024);
    }
  });
});

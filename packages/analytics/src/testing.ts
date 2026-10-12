/**
 * Shared suites (RFC-0006 §7.2), run from vitest files against every backend like the storage and
 * core-ts suites:
 *
 * - `describeAnalyticsConformance` — every query of the model over `FIXTURE_EVENTS` must return the
 *   hand-computed answer, identical to the in-memory reference (invariant A10). Runs on SqlAnalytics
 *   (SQLite and Miniflare D1) and on the WAE compiler through a fake Analytics SQL API.
 * - `describeAnalyticsStateSuite`, `describeRollupSuite` (`./testing-rollups.ts`) — settings CAS,
 *   salts, the query budget, and `runRollups` (idempotence, partial failure, `(other)` rows,
 *   retention) with `RollupReader` agreeing with the raw store (SQLite and D1).
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsQueryError } from "./errors.ts";
import {
  CONFORMANCE_CASES,
  FIXTURE_EVENTS,
  FIXTURE_OTHER_SITE,
  INVALID_QUERIES,
} from "./fixtures.ts";
import { answerQuery } from "./memory.ts";
import { type AnalyticsQuery, type AnalyticsReader, assertAnalyticsQuery } from "./model.ts";

export * from "./fixtures.ts";
export * from "./testing-rollups.ts";

export interface ConformanceFactory {
  /** A fresh, empty store. */
  create(): Promise<{
    reader: AnalyticsReader;
    load(events: readonly AnalyticsEvent[]): Promise<void>;
    close?(): Promise<void>;
  }>;
  dispose?(): Promise<void>;
}

export function describeAnalyticsConformance(label: string, factory: ConformanceFactory): void {
  // D1 through Miniflare is slow on a loaded machine; these suites do many round trips
  describe(`analytics conformance: ${label}`, { timeout: 120_000 }, () => {
    let reader: AnalyticsReader;
    let close: (() => Promise<void>) | undefined;

    // queries are read-only: one store per suite
    beforeAll(async () => {
      const s = await factory.create();
      reader = s.reader;
      close = s.close;
      await s.load(FIXTURE_EVENTS);
    });

    afterAll(async () => {
      await close?.();
      await factory.dispose?.();
    });

    it("fixture events are valid stored events", () => {
      for (const e of FIXTURE_EVENTS) expect(isValid("analytics-event", e)).toBe(true);
    });

    for (const kase of CONFORMANCE_CASES) {
      it(`${kase.name} matches the reference answer`, async () => {
        const result = await reader.query(kase.query);
        expect(result.data).toEqual(kase.expected);
        const reference = answerQuery(FIXTURE_EVENTS, kase.query, assertAnalyticsQuery(kase.query));
        expect(result.data).toEqual(reference);
      });
    }

    for (const bad of INVALID_QUERIES) {
      it(`refuses ${bad.name}`, async () => {
        await expect(reader.query(bad.query as AnalyticsQuery)).rejects.toBeInstanceOf(
          AnalyticsQueryError,
        );
      });
    }

    it("never reads another site", async () => {
      const r = await reader.query({
        kind: "summary",
        siteId: FIXTURE_OTHER_SITE,
        range: { from: "2026-10-07", to: "2026-10-09" },
      });
      expect(r.data).toEqual({ pageviews: 1, visits: 1, visitors: null, renders: 0, signals: 0 });
    });
  });
}

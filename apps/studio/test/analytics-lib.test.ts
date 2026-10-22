import { describe, expect, it } from "vitest";
import {
  analyticsSituation,
  editorHref,
  formatVital,
  goodShare,
  parseAnalyticsFilter,
  rangeFromSearch,
  rangeQuery,
  searchForRange,
  validateAnalyticsSearch,
  vitalRating,
} from "../src/lib/analytics.ts";
import type { AnalyticsFeature, AnalyticsStatus } from "../src/lib/api.ts";

const FEATURE: AnalyticsFeature = {
  enabled: true,
  store: "sql",
  reader: "sql",
  liveDays: 92,
  budget: null,
  rollups: "scheduled",
  defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
};

const status = (over: Partial<AnalyticsStatus> = {}): AnalyticsStatus => ({
  siteId: "site_1",
  feature: FEATURE,
  settings: {
    siteId: "site_1",
    enabled: true,
    uniqueVisitors: false,
    vitalsOneIn: 5,
    rollupRetentionDays: null,
    planHint: null,
    rev: 0,
    stored: false,
  },
  lastRollup: null,
  budget: null,
  quota: null,
  ...over,
});

describe("analytics URL", () => {
  it("keeps a preset, a valid custom range, compare=0 and one known filter", () => {
    expect(validateAnalyticsSearch({ range: "7d" })).toEqual({ range: "7d" });
    expect(validateAnalyticsSearch({ range: "1y" })).toEqual({});
    expect(validateAnalyticsSearch({ from: "2026-09-01", to: "2026-10-01", range: "7d" })).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
    // Backwards and too long are refused; the preset wins then.
    expect(validateAnalyticsSearch({ from: "2026-10-01", to: "2026-09-01" })).toEqual({});
    expect(validateAnalyticsSearch({ from: "2020-01-01", to: "2026-01-01" })).toEqual({});
    expect(validateAnalyticsSearch({ compare: "0" })).toEqual({ compare: "0" });
    expect(validateAnalyticsSearch({ compare: "1" })).toEqual({});
    expect(validateAnalyticsSearch({ filter: "channel:search" })).toEqual({
      filter: "channel:search",
    });
    expect(validateAnalyticsSearch({ filter: "channel:<script>" })).toEqual({});
  });

  it("parses the four filter kinds and nothing else", () => {
    expect(parseAnalyticsFilter("node:entry_ABCDEF12")).toEqual({
      kind: "node",
      value: "entry_ABCDEF12",
    });
    expect(parseAnalyticsFilter("country:DE")).toEqual({ kind: "country", value: "DE" });
    expect(parseAnalyticsFilter("device:mobile")).toEqual({ kind: "device", value: "mobile" });
    expect(parseAnalyticsFilter("country:de")).toBeUndefined();
    expect(parseAnalyticsFilter("path:/x")).toBeUndefined();
    expect(parseAnalyticsFilter(42)).toBeUndefined();
  });

  it("round-trips ranges and sends presets by name", () => {
    expect(rangeFromSearch({})).toEqual({ preset: "30d" });
    expect(searchForRange({ preset: "30d" })).toEqual({});
    expect(searchForRange({ preset: "today" })).toEqual({ range: "today" });
    expect(searchForRange({ from: "2026-09-01", to: "2026-09-08" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-08",
    });
    expect(rangeQuery({ preset: "7d" }, { kind: "device", value: "mobile" })).toEqual({
      range: "7d",
      filter: "device:mobile",
    });
    expect(rangeQuery({ from: "2026-09-01", to: "2026-09-08" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-08",
    });
  });
});

describe("analyticsSituation", () => {
  it("reads the deployment and the site", () => {
    expect(analyticsSituation(undefined, undefined).deploymentOff).toBe(true);
    expect(analyticsSituation({ ...FEATURE, store: "none" }, undefined).deploymentOff).toBe(true);
    expect(analyticsSituation({ ...FEATURE, enabled: false }, undefined).deploymentOff).toBe(true);
    const cant = analyticsSituation(
      undefined,
      status({ feature: { ...FEATURE, store: "wae", reader: "none" } }),
    );
    expect(cant).toMatchObject({ deploymentOff: false, cantRead: true });
    const off = analyticsSituation(
      FEATURE,
      status({ settings: { ...status().settings, enabled: false } }),
    );
    expect(off.siteOff).toBe(true);
    const spent = analyticsSituation(
      FEATURE,
      status({ budget: { day: "2026-10-12", used: 8000, limit: 8000, spent: true } }),
    );
    expect(spent.budgetSpent).toBe(true);
  });
});

describe("Core Web Vitals", () => {
  it("rates p75 at the web.dev thresholds", () => {
    expect(vitalRating("lcp", 2500)).toBe("good");
    expect(vitalRating("lcp", 2501)).toBe("needsImprovement");
    expect(vitalRating("lcp", 4001)).toBe("poor");
    expect(vitalRating("inp", 200)).toBe("good");
    expect(vitalRating("inp", 500)).toBe("needsImprovement");
    expect(vitalRating("cls", 0.26)).toBe("poor");
    expect(vitalRating("cls", null)).toBeUndefined();
  });

  it("formats each metric in its unit and computes the good share", () => {
    expect(formatVital("lcp", 2140, "en")).toBe("2.1 sec");
    expect(formatVital("inp", 180, "en")).toBe("180 ms");
    expect(formatVital("cls", 0.054, "en")).toBe("0.05");
    expect(
      goodShare({
        metric: "lcp",
        p75: 1,
        samples: 10,
        good: 6,
        needsImprovement: 3,
        poor: 1,
      }),
    ).toBeCloseTo(0.6);
    expect(
      goodShare({
        metric: "lcp",
        p75: 1,
        samples: 0,
        good: null,
        needsImprovement: null,
        poor: null,
      }),
    ).toBeNull();
  });
});

describe("editorHref", () => {
  it("links nodes that exist to their editor", () => {
    const node = { exists: true, title: "A", path: "/a", status: "published" };
    expect(editorHref("s", { ...node, nodeId: "entry_1", kind: "entry" })).toBe(
      "/sites/s/collections/posts/entry_1",
    );
    expect(editorHref("s", { ...node, nodeId: "page_1", kind: "page" })).toBe(
      "/sites/s/pages/page_1",
    );
    expect(editorHref("s", { ...node, nodeId: "term_1", kind: "archive" })).toBe(
      "/sites/s/taxonomy/term_1",
    );
    expect(
      editorHref("s", { ...node, nodeId: "entry_1", kind: "entry", exists: false }),
    ).toBeUndefined();
  });
});

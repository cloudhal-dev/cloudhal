/**
 * Golden SQL (RFC-0006 §7.3, invariant A6): the exact statements the WAE compiler sends for every
 * conformance query live in `test/golden/*.sql`. A change to the dialect shows up as a diff there.
 * Regenerate with `pnpm vitest run test/wae-golden.test.ts -u` and review the diff.
 */
import { describe, expect, it } from "vitest";
import { AnalyticsQueryError } from "../src/errors.ts";
import { CONFORMANCE_CASES, FIXTURE_SITE, INVALID_QUERIES } from "../src/testing.ts";
import { compileWae } from "../src/wae/index.ts";

const dataset = "newsroom_events";

describe("WAE compiler: golden SQL", () => {
  for (const kase of CONFORMANCE_CASES) {
    it(kase.name, async () => {
      const c = compileWae(kase.query, { dataset });
      let text = `${c.query};\n`;
      if (c.visitors) text += `\n-- visitors (only when hashed > 0)\n${c.visitors};\n`;
      if (c.renders)
        text += `\n-- renders (HTML 200s for people: the estimated cache-hit ratio)\n${c.renders};\n`;
      await expect(text).toMatchFileSnapshot(`golden/${kase.name}.sql`);
    });
  }

  it("bounds every statement by site, kind and time, and never weights by sampleInterval", () => {
    for (const kase of CONFORMANCE_CASES) {
      const c = compileWae(kase.query, { dataset });
      for (const sql of [c.query, c.visitors, c.renders].filter((s): s is string => !!s)) {
        expect(sql).toContain(`index1 = '`);
        expect(sql).toMatch(/blob1 = '(pageview|vitals|render)'/);
        expect(sql).toMatch(/timestamp >= '[^']+' AND timestamp < '[^']+'/);
        expect(sql).not.toMatch(/sampleInterval/i);
        expect(sql).not.toMatch(/(?<!APPROX_)\b(MIN|MAX)\(/);
        expect(sql).toContain(`FROM events.analyticsEngine."${dataset}"`);
      }
    }
  });

  it("refuses unsafe datasets and invalid queries before building SQL", () => {
    const q = {
      kind: "summary",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-08" },
    } as const;
    expect(() => compileWae(q, { dataset: 'x"; DROP' })).toThrow(AnalyticsQueryError);
    expect(() => compileWae(q, { dataset: "Newsroom" })).toThrow(AnalyticsQueryError);
    for (const bad of INVALID_QUERIES)
      expect(() => compileWae(bad.query as never, { dataset }), bad.name).toThrow(
        AnalyticsQueryError,
      );
  });

  it("inlines instants re-formatted from parsed dates", () => {
    const c = compileWae(
      {
        kind: "summary",
        siteId: FIXTURE_SITE,
        range: { from: "2026-10-07T03:00:00+03:00", to: "2026-10-08T00:00:00.250Z" },
      },
      { dataset },
    );
    expect(c.query).toContain(
      "timestamp >= '2026-10-07T00:00:00Z' AND timestamp < '2026-10-08T00:00:00.250Z'",
    );
  });
});

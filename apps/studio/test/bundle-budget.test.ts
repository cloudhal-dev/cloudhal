import { describe, expect, it } from "vitest";
import { type BudgetChunk, checkBundleBudget } from "../bundle-budget.ts";

const chunk = (fileName: string, opts: Partial<BudgetChunk> = {}): [string, BudgetChunk] => [
  fileName,
  { type: "chunk", fileName, imports: [], code: "x", moduleIds: [], ...opts },
];

describe("checkBundleBudget", () => {
  const budget = { entryBytes: 100, initialGzipBytes: 1_000 };

  it("measures the entry and its static imports only", () => {
    const bundle = Object.fromEntries([
      chunk("index.js", { isEntry: true, imports: ["ui.js"], code: "a".repeat(50) }),
      chunk("ui.js", { imports: ["react.js"], code: "b".repeat(30) }),
      chunk("react.js", { code: "c".repeat(20) }),
      chunk("AnalyticsPage.js", {
        moduleIds: ["/repo/node_modules/.pnpm/echarts@6/node_modules/echarts/core.js"],
      }),
    ]);
    const report = checkBundleBudget(bundle, budget);
    expect(report.entry).toBe("index.js");
    expect(report.initial.map((c) => c.fileName)).toEqual(["index.js", "ui.js", "react.js"]);
    expect(report.initialBytes).toBe(100);
    expect(report.problems).toEqual([]);
  });

  it("reports analytics-only modules in the initial load", () => {
    const bundle = Object.fromEntries([
      chunk("index.js", {
        isEntry: true,
        imports: ["shared.js"],
        moduleIds: ["/repo/apps/studio/src/lib/analytics.ts"],
      }),
      chunk("shared.js", {
        moduleIds: [
          "/repo/packages/ui/src/blocks/StatTile.tsx",
          "/repo/packages/ui/src/blocks/analytics-range.ts",
          "/repo/node_modules/.pnpm/@cloudflare+kumo@2/node_modules/@cloudflare/kumo/dist/chunks/chart-abc.js",
        ],
      }),
    ]);
    const { problems } = checkBundleBudget(bundle, budget);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("lib/analytics.ts");
    expect(problems.join("\n")).toContain("StatTile.tsx");
    expect(problems.join("\n")).toContain("chunks/chart-abc.js");
    // The range checks the router validates the Analytics URL with are allowed.
    expect(problems.join("\n")).not.toContain("analytics-range");
  });

  it("reports lazy message namespaces and the date picker in the initial load", () => {
    const bundle = Object.fromEntries([
      chunk("index.js", {
        isEntry: true,
        moduleIds: [
          "/repo/apps/studio/src/i18n/en.ts",
          "/repo/apps/studio/src/i18n/namespaces.ts",
          "/repo/apps/studio/src/i18n/lazy/analytics.en.ts",
          "/repo/node_modules/@cloudflare/kumo/dist/chunks/date-picker-abc.js",
        ],
      }),
    ]);
    const { problems } = checkBundleBudget(bundle, budget);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("i18n/lazy/analytics.en.ts");
    expect(problems.join("\n")).toContain("chunks/date-picker-abc.js");
  });

  it("reports an entry or initial load over budget", () => {
    const bundle = Object.fromEntries([
      chunk("index.js", { isEntry: true, code: Math.random().toString(36).repeat(200) }),
    ]);
    const { problems } = checkBundleBudget(bundle, { entryBytes: 100, initialGzipBytes: 10 });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/entry chunk index\.js is \d+ B \(budget 100 B\)/);
    expect(problems[1]).toMatch(/initial load is \d+ B gzip \(budget 10 B\)/);
  });
});

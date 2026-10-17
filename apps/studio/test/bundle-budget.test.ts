import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type BudgetChunk, checkBundleBudget } from "../bundle-budget.ts";
import { keepWeights, STUDIO_ICON_WEIGHTS } from "../phosphor-weights.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

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

  it("reports comment blocks in the initial load, but not the generic bulk action bar", () => {
    const bundle = Object.fromEntries([
      chunk("index.js", {
        isEntry: true,
        moduleIds: [
          "/repo/packages/ui/src/blocks/CommentRow.tsx",
          "/repo/packages/ui/src/blocks/CommenterSummary.tsx",
          "/repo/packages/ui/src/blocks/ArticleCommentsSummary.tsx",
          "/repo/packages/ui/src/blocks/comment-model.ts",
          "/repo/packages/ui/src/blocks/BulkActionBar.tsx",
        ],
      }),
    ]);
    const { problems } = checkBundleBudget(bundle, budget);
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).not.toContain("BulkActionBar");
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

describe("Phosphor weights (phosphor-weights.ts)", () => {
  const def = (weights: string[]) =>
    [
      'import * as a from "react";',
      "const e = /* @__PURE__ */ new Map([",
      weights
        .map(
          (w) => `  [\n    "${w}",\n    /* @__PURE__ */ a.createElement("path", { d: "M0" })\n  ]`,
        )
        .join(",\n"),
      "]);",
      "export {",
      "  e as default",
      "};",
    ].join("\n");

  it("keeps only the weights Studio draws", () => {
    const out = keepWeights(def(["bold", "duotone", "fill", "light", "regular", "thin"]));
    expect([...out.matchAll(/^ {4}"([a-z]+)",$/gm)].map((m) => m[1])).toEqual([
      "bold",
      "fill",
      "regular",
    ]);
    expect(out).toContain("]);\nexport {");
    expect(out).not.toMatch(/\],\n\]\);/);
  });

  it("leaves anything it does not recognise untouched", () => {
    const odd = 'export const x = new Map([["bold", 1]]);';
    expect(keepWeights(odd)).toBe(odd);
  });

  it("Studio and its blocks never ask for a weight it drops", () => {
    const roots = [path.resolve(here, "../src"), path.resolve(here, "../../../packages/ui/src")];
    const offenders: string[] = [];
    const visit = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) visit(p);
        else if (
          /\.tsx?$/.test(e.name) &&
          /weight[=:]\s*\{?["'](thin|light|duotone)["']/.test(readFileSync(p, "utf8"))
        )
          offenders.push(path.relative(here, p));
      }
    };
    for (const r of roots) visit(r);
    expect(offenders, `use ${STUDIO_ICON_WEIGHTS.join(", ")}`).toEqual([]);
  });
});

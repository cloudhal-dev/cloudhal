/** RFC-0022 §3: `Chart` drawn as SVG on the server, with a legend and its numbers as a table. */
import { createHash } from "node:crypto";
import type { SurfaceSection } from "@cloudhal/core-contracts";
import { checkSurface, createCatalog } from "@cloudhal/core-ts/surfaces";
import { describe, expect, it } from "vitest";
import { CHART_SCRIPT, chartInner } from "../src/chart.ts";
import { renderSurface } from "../src/surfaces.ts";

const months = [
  { month: "Jan", readers: 1200, subscribers: 300 },
  { month: "Feb", readers: 1850, subscribers: 410 },
  { month: "Mar", readers: 2400, subscribers: 520 },
];
const labels = { data: "Show the data" };
const spec = (extra: Record<string, unknown> = {}) => ({
  kind: "bar",
  title: "Readers",
  data: months,
  x: "month",
  series: [
    { field: "readers", label: "Readers" },
    { field: "subscribers", label: "Subscribers" },
  ],
  ...extra,
});

describe("Chart", () => {
  it("draws grouped bars on nice ticks, with a legend and a data table", () => {
    const html = chartInner(spec(), "en", labels);
    expect(html.match(/<rect /g)).toHaveLength(6);
    expect(html).toContain('role="img" aria-label="Readers"');
    // ticks 0, 1,000 … 3,000 (2,400 rounds up to a nice step)
    expect(html).toContain(">3,000</text>");
    expect(html).toContain("<title>Feb, Readers: 1,850</title>");
    expect(html).toContain('<ul class="ch-chart__legend">');
    expect(html).toContain(
      '<summary>Show the data</summary><table><thead><tr><th scope="col">month</th>',
    );
    expect(html).toContain('<tr><th scope="row">Mar</th><td>2,400</td><td>520</td></tr>');
    // stacked bars sum per category
    expect(chartInner(spec({ stacked: true }), "en", labels).match(/<rect /g)).toHaveLength(6);
  });

  it("draws lines, areas and donuts, and formats in the page locale with a unit", () => {
    const line = chartInner(spec({ kind: "line", unit: "€" }), "tr", labels);
    expect(line.match(/<polyline /g)).toHaveLength(2);
    expect(line).toContain("Feb, Readers: 1.850 €");
    expect(chartInner(spec({ kind: "area" }), "en", labels).match(/<polygon /g)).toHaveLength(2);
    const donut = chartInner(
      spec({ kind: "donut", series: [{ field: "readers", label: "Readers" }] }),
      "en",
      labels,
    );
    expect(donut.match(/<path /g)).toHaveLength(3);
    expect(donut).toContain('class="ch-chart__total">5,450</text>');
    expect(donut).toContain(">Jan</li>");
  });

  it("escapes every text, and shows an empty chart as a dash with its table", () => {
    const html = chartInner(
      spec({
        title: '"><script>alert(1)</script>',
        data: [{ month: "<img onerror=x>", readers: 1 }],
        series: [{ field: "readers", label: "<b>R</b>" }],
      }),
      "en",
      labels,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img onerror=x&gt;");
    expect(chartInner(spec({ data: [] }), "en", labels)).toMatch(
      /^<p class="ch-chart__empty">–<\/p><details/,
    );
  });

  it("renders in a surface without the runtime, and marks live and empty charts", () => {
    const surface = (components: object[], data: Record<string, unknown>): SurfaceSection => ({
      id: "sec_chart00001",
      kind: "surface",
      catalog: "blog@1",
      components: components as SurfaceSection["components"],
      data,
    });
    const chart = {
      id: "root",
      component: "Chart",
      props: {
        kind: "line",
        title: "Readers",
        data: { path: "/months" },
        x: "month",
        series: [{ field: "readers" }],
        caption: "Source: the newsroom",
      },
    };
    const still = surface([chart], { months });
    expect(checkSurface(still, createCatalog()).issues).toEqual([]);
    const html = renderSurface(still);
    expect(html).toContain(
      '<figure class="ch-chart"><figcaption class="ch-chart__title">Readers</figcaption>',
    );
    expect(html).toContain('<p class="ch-chart__caption">Source: the newsroom</p>');
    expect(html).not.toContain("<script");
    // with an input it is live: the runtime redraws it from its bindings
    const live = surface(
      [
        { id: "root", component: "Stack", children: ["n", "c"] },
        {
          id: "n",
          component: "Slider",
          props: { label: "n", min: 0, max: 3, value: { path: "/n" } },
        },
        { ...chart, id: "c" },
      ],
      { months, n: 1 },
    );
    expect(renderSurface(live)).toContain('data-ch-chart="{&quot;kind&quot;:&quot;line&quot;');
    expect(renderSurface(surface([chart], { months: [] }))).toContain("data-ch-chart-empty");
    // its data must be a binding
    expect(
      checkSurface(
        surface([{ ...chart, props: { ...chart.props, data: [] } }], {}),
        createCatalog(),
      ).issues.map((i) => i.message),
    ).toContain('bind it to a list in the surface\'s data: {"path":"/rows"}');
  });

  it("ships the same drawer to the browser, versioned", async () => {
    expect(CHART_SCRIPT.code).not.toContain("__name");
    const mod = (await import(
      `data:text/javascript;base64,${Buffer.from(CHART_SCRIPT.code).toString("base64")}`
    )) as { chartInner: typeof chartInner };
    for (const kind of ["bar", "line", "area", "donut"])
      expect(mod.chartInner(spec({ kind }), "en", labels)).toBe(
        chartInner(spec({ kind }), "en", labels),
      );
    expect(CHART_SCRIPT.path).toBe("/_cloudhal/chart.1.js");
    expect(createHash("sha256").update(CHART_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "7ca8199a97e8",
    );
  });
});

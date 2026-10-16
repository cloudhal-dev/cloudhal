/** RFC-0022 §4: `Table` — a real table from the surface's data, cards on small screens. */
import type { SurfaceSection } from "@cloudhal/core-contracts";
import { checkSurface, createCatalog } from "@cloudhal/core-ts/surfaces";
import { describe, expect, it } from "vitest";
import { renderSurface } from "../src/surfaces.ts";

const plans = [
  { name: "Basic", price: 9, share: 0.25, since: "2026-01-15T00:00:00Z", note: "<b>new</b>" },
  { name: "Pro", price: 19.5, share: 0.6, since: "2026-03-01T00:00:00Z" },
];
const table = (props: Record<string, unknown>): SurfaceSection => ({
  id: "sec_table00001",
  kind: "surface",
  catalog: "blog@1",
  components: [{ id: "root", component: "Table", props }] as SurfaceSection["components"],
  data: { plans },
});
const base = {
  caption: "Plans compared",
  rows: { path: "/plans" },
  columns: [
    { field: "name", label: "Plan" },
    { field: "price", label: "Price", align: "end", format: "currency", currency: "USD" },
    { field: "share", label: "Share", align: "end", format: "percent" },
    { field: "since", label: "Since", format: "date" },
    { field: "note", label: "Note" },
  ],
  highlight: { field: "name", equals: "Pro" },
  striped: true,
};

describe("Table", () => {
  it("renders caption, headers and formatted cells, with labels for the phone layout", () => {
    expect(checkSurface(table(base), createCatalog()).issues).toEqual([]);
    const html = renderSurface(table(base), { media: { locale: "en" } as never });
    expect(html).toContain(
      '<table class="ch-table" data-striped="yes"><caption>Plans compared</caption><thead><tr><th scope="col">Plan</th><th scope="col" data-align="end">Price</th>',
    );
    expect(html).toContain('<td data-label="Price" data-align="end">$19.50</td>');
    expect(html).toContain('<td data-label="Share" data-align="end">60%</td>');
    expect(html).toContain('<td data-label="Since">Jan 15, 2026</td>');
    expect(html).toContain('<tr data-highlight="yes"><td data-label="Plan">Pro</td>');
    // text is escaped; a missing cell is empty
    expect(html).toContain("&lt;b&gt;new&lt;/b&gt;");
    expect(html).toContain('<td data-label="Note"></td></tr>');
    expect(html).not.toContain("<script");
  });

  it("formats in the page locale", () => {
    const html = renderSurface(table(base), { media: { locale: "tr" } as never });
    expect(html).toMatch(/<td data-label="Price" data-align="end">\$19,50<\/td>/);
    expect(html).toContain('<td data-label="Share" data-align="end">%60</td>');
  });

  it("requires rows bound to the surface's data, and at most 8 columns", () => {
    const messages = (props: Record<string, unknown>) =>
      checkSurface(table(props), createCatalog()).issues.map((i) => `${i.path} ${i.message}`);
    expect(messages({ ...base, rows: [] })).toContain(
      '/components/0/props/rows bind it to a list in the surface\'s data: {"path":"/rows"}',
    );
    expect(
      messages({
        ...base,
        columns: Array.from({ length: 9 }, (_, i) => ({ field: `f${i}`, label: `F${i}` })),
      }),
    ).toContain("/components/0/props/columns at most 8 items");
  });
});

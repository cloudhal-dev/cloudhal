import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsTimeseries, CountryMap, ReadersSummary } from "../src/charts.ts";
import {
  AnalyticsQuotaBanner,
  AnalyticsRangePicker,
  BreakdownMeters,
  BreakdownTable,
  compareValues,
  createAnalyticsFormatter,
  foldBreakdown,
  isValidCustomRange,
  mixHex,
  previousAnalyticsRange,
  resolveAnalyticsRange,
  StatTile,
  StatTileGroup,
  shouldWarnFreePlan,
  useChartPalette,
} from "../src/index.ts";
import {
  AnalyticsCountryMapFixture,
  breakdownLabels,
  rangeLabels,
  timeseriesLabels,
} from "./analytics-fixtures.ts";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-mode");
});

const NOW = new Date("2026-10-09T15:30:00Z");

describe("analytics formatting", () => {
  it("compares with the previous period: up, down, within ±2 % flat, nothing to compare", () => {
    expect(compareValues(112, 100)).toEqual({ ratio: 0.12, tone: "up" });
    expect(compareValues(90, 100)?.tone).toBe("down");
    expect(compareValues(101.5, 100)?.tone).toBe("flat");
    expect(compareValues(5, 0)).toBeUndefined();
    expect(compareValues(5, null)).toBeUndefined();
  });

  it("formats numbers, shares and deltas per locale", () => {
    const en = createAnalyticsFormatter("en");
    const tr = createAnalyticsFormatter("tr");
    expect(en.number(12400)).toBe("12,400");
    expect(tr.number(12400)).toBe("12.400");
    expect(en.percent(0.124)).toBe("12%");
    expect(en.percent(0.084)).toBe("8.4%");
    expect(tr.percent(0.124)).toBe("%12");
    expect(en.delta(0.124)).toBe("+12%");
    expect(en.delta(-0.5)).toBe("-50%");
    expect(en.share(1, 0)).toBe("0%");
    expect(en.compact(12400)).toBe("12.4K");
  });

  it("formats UTC buckets and day ranges (to is exclusive)", () => {
    const en = createAnalyticsFormatter("en");
    const at = Date.parse("2026-10-09T14:00:00Z");
    expect(en.tick(at, "hour")).toBe("2:00 PM");
    expect(createAnalyticsFormatter("tr").tick(at, "hour")).toBe("14:00");
    expect(en.tick(at, "day")).toBe("Oct 9");
    expect(en.dayRange("2026-09-10", "2026-10-10")).toMatch(/^Sep 10\s–\sOct 9, 2026$/);
    expect(en.dayRange("2026-10-09", "2026-10-10")).toBe("Oct 9, 2026");
  });

  it("names countries in the locale, with words for unknown and Tor", () => {
    const names = { unknown: "Unknown", tor: "Tor" };
    expect(createAnalyticsFormatter("en").country("DE", names)).toBe("Germany");
    expect(createAnalyticsFormatter("tr").country("DE", names)).toBe("Almanya");
    expect(createAnalyticsFormatter("en").country("XX", names)).toBe("Unknown");
    expect(createAnalyticsFormatter("en").country("T1", names)).toBe("Tor");
  });

  it("resolves presets to UTC days and picks the bucket size", () => {
    expect(resolveAnalyticsRange({ preset: "today" }, NOW)).toEqual({
      from: "2026-10-09",
      to: "2026-10-10",
      days: 1,
      granularity: "hour",
    });
    expect(resolveAnalyticsRange({ preset: "7d" }, NOW)).toMatchObject({
      from: "2026-10-03",
      days: 7,
      granularity: "day",
    });
    expect(resolveAnalyticsRange({ preset: "30d" }, NOW).from).toBe("2026-09-10");
    expect(resolveAnalyticsRange({ preset: "12m" }, NOW)).toMatchObject({
      from: "2025-10-10",
      days: 365,
    });
    expect(resolveAnalyticsRange({ from: "2026-10-01", to: "2026-10-03" }).granularity).toBe(
      "hour",
    );
    expect(previousAnalyticsRange({ from: "2026-10-03", to: "2026-10-10" })).toEqual({
      from: "2026-09-26",
      to: "2026-10-03",
    });
  });

  it("accepts custom ranges up to two years, in order", () => {
    expect(isValidCustomRange("2026-01-01", "2026-02-01")).toBe(true);
    expect(isValidCustomRange("2026-02-01", "2026-01-01")).toBe(false);
    expect(isValidCustomRange("2023-01-01", "2026-01-01")).toBe(false);
    expect(isValidCustomRange("2026-1-1", "2026-02-01")).toBe(false);
  });
});

describe("StatTile", () => {
  it("shows the figure in the locale with a delta badge against the previous period", () => {
    render(
      <StatTileGroup label="Traffic">
        <StatTile
          label="Page views"
          value={12400}
          previous={11070}
          locale="tr"
          describeDelta={(d) => `${d} vs previous 30 days`}
        />
        <StatTile label="Visits" value={8900} previous={8800} locale="en" />
        <StatTile label="Unique visitors" value={null} locale="en" emptyLabel="No data" />
      </StatTileGroup>,
    );
    const list = document.querySelector('dl[aria-label="Traffic"]') as HTMLElement;
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute("data-stat-count", "3");
    expect(screen.getByText("12.400")).toBeInTheDocument();
    // +12 % up is good news: success; the words are there for screen readers.
    const up = screen.getByText("+%12").closest("[data-delta]") as HTMLElement;
    expect(up).toHaveAttribute("data-delta", "up");
    expect(up).toHaveAttribute("data-variant", "success");
    expect(within(up).getByText("+%12 vs previous 30 days")).toHaveClass("sr-only");
    // +1.1 % reads as no change.
    expect(screen.getByText("0%").closest("[data-delta]")).toHaveAttribute("data-delta", "flat");
    // Unknown value: a dash, and words for screen readers.
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No data")).toHaveClass("sr-only");
  });

  it("flips the tone when lower is better, and shows skeletons while loading", () => {
    const { rerender } = render(
      <StatTileGroup>
        <StatTile label="Errors" value={80} previous={100} locale="en" higherIsBetter={false} />
      </StatTileGroup>,
    );
    const badge = screen.getByText("-20%").closest("[data-delta]") as HTMLElement;
    expect(badge).toHaveAttribute("data-delta", "down");
    rerender(
      <StatTileGroup>
        <StatTile label="Errors" value={80} locale="en" loading />
      </StatTileGroup>,
    );
    expect(screen.queryByText("80")).toBeNull();
    expect(document.querySelector('dd[aria-busy="true"]')).toBeInTheDocument();
  });

  it("explains itself behind a labelled info button and draws an optional sparkline", () => {
    render(
      <StatTileGroup>
        <StatTile
          label="Unique visitors"
          value={300}
          locale="en"
          hint="Daily unique visitors, summed"
          hintLabel="About unique visitors"
          sparkline={[1, 4, 2, 6]}
        />
      </StatTileGroup>,
    );
    expect(screen.getByRole("button", { name: "About unique visitors" })).toBeInTheDocument();
    const line = document.querySelector("[data-sparkline]") as SVGElement;
    expect(line).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BreakdownTable", () => {
  const rows = [
    {
      id: "e1",
      label: "Ferries at dawn",
      detail: "/posts/ferries",
      href: "/sites/s/articles/e1",
      value: 600,
      secondary: 400,
    },
    { id: "e2", label: "About", detail: "/about", href: "/sites/s/pages/e2", value: 300 },
    { id: "e3", label: "Old post", value: 100, muted: true },
  ];

  it("ranks rows with linked titles, figures and a share meter, folding the rest into Other", () => {
    render(
      <BreakdownTable rows={rows} total={1200} limit={2} locale="en" labels={breakdownLabels} />,
    );
    expect(screen.getByRole("table")).toHaveTextContent("Top content");
    expect(screen.getByRole("link", { name: "Ferries at dawn" })).toHaveAttribute(
      "href",
      "/sites/s/articles/e1",
    );
    expect(screen.getByText("/posts/ferries")).toBeInTheDocument();
    const meters = screen.getAllByRole("meter");
    expect(meters[0]).toHaveAccessibleName("Ferries at dawn");
    expect(screen.getByText("50%")).toBeInTheDocument();
    // Row 3 is past the limit and 200 views are unaccounted for: one Other row of 300.
    const other = document.querySelector('[data-other="true"]') as HTMLElement;
    expect(other).toHaveTextContent("Other");
    expect(other).toHaveTextContent("300");
    // The remainder's visits are unknown (the gap carries none): a dash, never a guess.
    expect(other).toHaveTextContent("—");
    expect(within(other).queryByRole("link")).toBeNull();
  });

  it("never links rows without an href (referrer hosts) and shows empty and loading states", () => {
    const { rerender } = render(
      <BreakdownTable
        rows={[{ id: "news.example.com", label: "news.example.com", value: 5 }]}
        locale="en"
        labels={breakdownLabels}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    rerender(
      <BreakdownTable
        rows={[]}
        locale="en"
        labels={breakdownLabels}
        empty={<p>No visits yet</p>}
      />,
    );
    expect(screen.getByText("No visits yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    rerender(<BreakdownTable rows={[]} locale="en" labels={breakdownLabels} loading />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
  });

  it("folds server-marked other rows and keeps totals consistent", () => {
    const folded = foldBreakdown(
      [
        { id: "a", label: "A", value: 5 },
        { id: "o", label: "(other)", value: 3, other: true },
      ],
      { otherLabel: "Other", total: 10 },
    );
    expect(folded.total).toBe(10);
    expect(folded.rows.map((r) => [r.id, r.value])).toEqual([
      ["a", 5],
      ["(other)", 5],
    ]);
  });
});

describe("BreakdownMeters", () => {
  it("lists small breakdowns as labelled meters with share and count", () => {
    render(
      <BreakdownMeters
        label="Devices"
        locale="en"
        otherLabel="Other"
        rows={[
          { id: "mobile", label: "Mobile", value: 7700 },
          { id: "desktop", label: "Desktop", value: 4700 },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Mobile" })).toBeInTheDocument();
    expect(screen.getByText("62% · 7,700")).toBeInTheDocument();
  });

  it("can list only the top rows while shares stay of the whole", () => {
    render(
      <BreakdownMeters
        locale="en"
        otherLabel="Other"
        limit={1}
        showOther={false}
        rows={[
          { id: "search", label: "Search", value: 3 },
          { id: "direct", label: "Direct", value: 1 },
        ]}
        total={4}
      />,
    );
    expect(screen.getAllByRole("meter")).toHaveLength(1);
    expect(screen.getByText("75% · 3")).toBeInTheDocument();
  });
});

describe("AnalyticsRangePicker", () => {
  it("switches presets and the compare toggle", () => {
    const onChange = vi.fn();
    const onCompare = vi.fn();
    render(
      <AnalyticsRangePicker
        value={{ preset: "30d" }}
        onChange={onChange}
        labels={rangeLabels}
        locale="en"
        compare={false}
        onCompareChange={onCompare}
      />,
    );
    expect(screen.getByRole("group", { name: "Date range" })).toHaveAttribute("data-range", "30d");
    expect(screen.getByRole("tab", { name: "30 days" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "7 days" }));
    expect(onChange).toHaveBeenCalledWith({ preset: "7d" });
    fireEvent.click(screen.getByRole("switch", { name: "Compare with the previous period" }));
    expect(onCompare).toHaveBeenCalledWith(true);
  });

  it("names a custom range on its button and applies picked days as UTC dates", async () => {
    const onChange = vi.fn();
    render(
      <AnalyticsRangePicker
        value={{ from: "2026-09-01", to: "2026-10-01" }}
        onChange={onChange}
        labels={rangeLabels}
        locale="en"
      />,
    );
    const trigger = screen.getByRole("button", { name: /^Sep 1\s–\s30, 2026$/ });
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    await act(async () => fireEvent.click(trigger));
    expect(await screen.findByText("Custom range")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("Choose the first and the last day.")).toBeInTheDocument();
    const days = screen
      .getAllByRole("button")
      .filter((b) => /\d{4}$/.test(b.getAttribute("aria-label") ?? ""));
    fireEvent.click(days[10] as HTMLElement);
    fireEvent.click(days[13] as HTMLElement);
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0]?.[0] as { from: string; to: string };
    expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000).toBe(4);
  });
});

describe("AnalyticsQuotaBanner", () => {
  it("warns past 60,000 requests unless the plan is paid, with the estimate as a meter", () => {
    expect(shouldWarnFreePlan(61_000, "unknown")).toBe(true);
    expect(shouldWarnFreePlan(61_000, "paid")).toBe(false);
    expect(shouldWarnFreePlan(40_000, "free")).toBe(false);
    render(
      <AnalyticsQuotaBanner
        requests={62_400}
        locale="en"
        labels={{
          title: "Analytics may reach the Workers Free limit",
          description: "Yesterday used most of the daily requests.",
          meter: "Requests yesterday",
          meterValue: (used, limit) => `${used} of ${limit} a day`,
        }}
        actions={<button type="button">Analytics settings</button>}
      />,
    );
    expect(screen.getByText("Analytics may reach the Workers Free limit")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Requests yesterday" })).toBeInTheDocument();
    expect(screen.getByText("62,400 of 100,000 a day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analytics settings" })).toBeInTheDocument();
  });
});

describe("useChartPalette", () => {
  it("returns hex series colours and follows data-mode", async () => {
    const { result } = renderHook(() => useChartPalette());
    expect(result.current.isDarkMode).toBe(false);
    expect(result.current.series).toHaveLength(4);
    for (const c of [...result.current.series, ...result.current.ramp, result.current.noData])
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    await act(async () => {
      document.documentElement.setAttribute("data-mode", "dark");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isDarkMode).toBe(true);
  });

  it("mixes colours in sRGB", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.3)).toBe("#102030");
  });
});

describe("AnalyticsTimeseries", () => {
  const day = (d: number) => Date.parse(`2026-10-0${d}T00:00:00Z`);
  const series = [
    {
      id: "pageviews",
      name: "Page views",
      points: [
        [day(7), 120],
        [day(8), 140],
        [day(9), 30],
      ] as [number, number][],
    },
    {
      id: "visits",
      name: "Visits",
      points: [
        [day(7), 80],
        [day(8), 90],
        [day(9), 20],
      ] as [number, number][],
    },
  ];

  it("shows each series' total in the legend and offers the data as a table", () => {
    render(
      <AnalyticsTimeseries
        series={series}
        granularity="day"
        locale="en"
        labels={timeseriesLabels}
        now={day(9) + 3_600_000}
      />,
    );
    expect(screen.getByText("290")).toBeInTheDocument();
    expect(screen.getByText("190")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show as table" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show as chart" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Time (UTC)")).toBeInTheDocument();
    expect(within(table).getByText("Wed, Oct 7, 2026")).toBeInTheDocument();
    expect(within(table).getByText("140")).toBeInTheDocument();
  });

  it("keeps the legend's place while loading", () => {
    render(
      <AnalyticsTimeseries
        series={series}
        granularity="day"
        locale="en"
        labels={timeseriesLabels}
        loading
      />,
    );
    expect(screen.getByRole("button", { name: "Show as table" })).toBeDisabled();
    expect(screen.queryByText("290")).toBeNull();
  });
});

describe("CountryMap", () => {
  const labels = {
    map: "Page views by country",
    item: "Country",
    value: "Page views",
    share: "Share",
    other: "Other countries",
    unknown: "Unknown",
    tor: "Tor",
  };
  const rows = [
    { country: "DE", value: 500 },
    { country: "US", value: 300 },
    { country: "XX", value: 100 },
    { country: "T1", value: 50 },
    { country: "FR", value: 50 },
  ];

  it("lists countries by name under the map, with Unknown, Tor and the rest folded", () => {
    render(
      <CountryMap rows={rows} geoJson={undefined} locale="en" labels={labels} tableLimit={4} />,
    );
    expect(screen.getByRole("img", { name: "Page views by country" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    const named = [...document.querySelectorAll("[data-breakdown-row]")].map(
      (row) => row.querySelector("td")?.textContent,
    );
    expect(named).toEqual(["Germany", "United States", "Unknown", "Tor", "Other countries"]);
  });

  it("draws the map once the shapes are there, and shows the empty state without rows", () => {
    const { rerender } = render(
      <CountryMap rows={rows} geoJson={AnalyticsCountryMapFixture} locale="tr" labels={labels} />,
    );
    expect(document.querySelector("[data-map-placeholder]")).toBeNull();
    expect(document.querySelector('[data-breakdown-row="DE"] td')).toHaveTextContent("Almanya");
    expect(screen.getByRole("img", { name: "Page views by country" })).not.toHaveAttribute(
      "aria-busy",
    );
    rerender(
      <CountryMap
        rows={[]}
        geoJson={AnalyticsCountryMapFixture}
        locale="en"
        labels={labels}
        empty={<p>No visits yet</p>}
      />,
    );
    expect(screen.getByText("No visits yet")).toBeInTheDocument();
  });
});

describe("ReadersSummary", () => {
  const labels = {
    pageviews: "Page views",
    visits: "Visits",
    figures: "Readers, last 30 days",
    chart: timeseriesLabels,
    channels: "Where readers came from",
    other: "Other",
    open: "Open in analytics",
  };

  it("sums up an article's readers and links to the filtered analytics", () => {
    render(
      <ReadersSummary
        locale="en"
        labels={labels}
        pageviews={{ value: 1204, previous: 1000 }}
        visits={{ value: 800 }}
        series={[[Date.parse("2026-10-08T00:00:00Z"), 40]]}
        channels={[
          { id: "search", label: "Search", value: 50 },
          { id: "social", label: "Social", value: 30 },
          { id: "direct", label: "Direct", value: 15 },
          { id: "email", label: "Email", value: 5 },
        ]}
        redirects="Old addresses still bring readers: 42 this month"
        href="/sites/s/analytics?filter=node:e1"
      />,
    );
    expect(document.querySelector('dl[aria-label="Readers, last 30 days"]')).toBeInTheDocument();
    expect(screen.getByText("1,204")).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    expect(screen.getByText("50% · 50")).toBeInTheDocument();
    expect(screen.getByText(/Old addresses still bring readers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in analytics" })).toHaveAttribute(
      "href",
      "/sites/s/analytics?filter=node:e1",
    );
  });

  it("gives way to the card's own state", () => {
    render(
      <ReadersSummary
        locale="en"
        labels={labels}
        pageviews={{ value: 0 }}
        visits={{ value: 0 }}
        series={[]}
        channels={[]}
        href="/x"
        empty={<p>Stats start when this article is published</p>}
      />,
    );
    expect(screen.getByText("Stats start when this article is published")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

/**
 * The dashboard-pattern blocks (#228): ListToolbar's fixed slots, StatusIndicator,
 * UsageMeterRow, PageLayout's docs pill and its resource mode, with the keyboard and focus order
 * across the resource tabs (DESIGN.md §2a, §2aj).
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  ListToolbar,
  PageLayout,
  StatusIndicator,
  UsageMeterRow,
  usageState,
} from "../src/index.ts";

afterEach(cleanup);

/** The elements Tab visits, in order (tabindex ≥ 0, not disabled, document order). */
function tabOrder(root: HTMLElement): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    "a[href], button, input, select, textarea, [tabindex]",
  );
  return [...candidates].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest('[aria-hidden="true"]'),
  );
}
const nameOf = (el: HTMLElement) =>
  el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName;

describe("ListToolbar", () => {
  it("keeps its slots in one order: search, filters, actions, sort, refresh last", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <ListToolbar
        search=""
        onSearch={() => {}}
        placeholder="Search Workers"
        sort={<Button>Sort</Button>}
        refresh={{ onRefresh, label: "Refresh" }}
        actions={<Button>Clear filters</Button>}
        filters={<Button>Status</Button>}
      />,
    );
    const order = tabOrder(container).map(nameOf);
    expect(order.slice(-4)).toEqual(["Status", "Clear filters", "Sort", "Refresh"]);
    expect(order.indexOf("Search Workers")).toBeLessThan(order.indexOf("Status"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("is a named search field that reports what is typed", () => {
    const onSearch = vi.fn();
    render(<ListToolbar search="" onSearch={onSearch} placeholder="Search Workers" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search Workers" }), {
      target: { value: "api" },
    });
    expect(onSearch).toHaveBeenCalledWith("api");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });
});

describe("StatusIndicator", () => {
  it("says the state in words; the coloured mark is decorative", () => {
    const { container } = render(<StatusIndicator label="Running" tone="info" active />);
    const root = container.querySelector("[data-status-tone]") as HTMLElement;
    expect(root).toHaveAttribute("data-status-tone", "info");
    expect(root).toHaveAttribute("data-active");
    expect(screen.getByText("Running")).toBeVisible();
    expect(root.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("draws a dot or a thin bar", () => {
    const { container, rerender } = render(<StatusIndicator label="Ready" tone="success" />);
    expect(container.querySelector(".rounded-full")).not.toBeNull();
    rerender(<StatusIndicator label="Failed" tone="danger" shape="bar" />);
    expect(container.querySelector(".rounded-full")).toBeNull();
    expect(container.querySelector("[data-active]")).toBeNull();
  });
});

describe("UsageMeterRow", () => {
  it("warns at 80 % and is danger at the limit", () => {
    expect(usageState(79, 100)).toBe("normal");
    expect(usageState(80, 100)).toBe("warning");
    expect(usageState(100, 100)).toBe("danger");
    expect(usageState(150, 100)).toBe("danger");
    expect(usageState(5, 10, 0.5)).toBe("warning");
    expect(usageState(0, 0)).toBe("normal");
    expect(usageState(1, 0)).toBe("danger");
  });

  it("is a named meter that reads the value and the state, with an info toggletip", async () => {
    const { container } = render(
      <UsageMeterRow
        label="Requests today"
        used={85_000}
        limit={100_000}
        valueText="85,000 / 100,000"
        info={{ text: "Resets at 00:00 UTC.", label: "About requests today" }}
        warningLabel="Near the limit"
        dangerLabel="Limit reached"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Requests today" });
    expect(meter).toHaveAttribute("aria-valuetext", "85,000 / 100,000, Near the limit");
    expect(container.querySelector("[data-usage-state]")).toHaveAttribute(
      "data-usage-state",
      "warning",
    );
    expect(screen.getByText("Near the limit")).toBeInTheDocument();
    // The explanation is part of the button's name: the tooltip popup describes nothing.
    const info = screen.getByRole("button", {
      name: "About requests today. Resets at 00:00 UTC.",
    });
    await act(async () => {
      fireEvent.click(info);
    });
    expect(await screen.findByText("Resets at 00:00 UTC.")).toBeInTheDocument();
  });

  it("keeps Kumo's own label row first in the meter (the row it hides for sighted users)", () => {
    render(
      <UsageMeterRow
        label="Storage"
        used={2}
        limit={10}
        valueText="2 GB / 10 GB"
        warningLabel="Near the limit"
        dangerLabel="Limit reached"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Storage" });
    expect(meter.firstElementChild?.textContent).toContain("Storage");
    expect(meter).toHaveAttribute("aria-valuetext", "2 GB / 10 GB");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UsageMeterRow with a fractional limit", () => {
  it("fills to the real limit: 0.5 of 0.5 is a full, danger bar", () => {
    const { container } = render(
      <UsageMeterRow
        label="Storage"
        used={0.5}
        limit={0.5}
        valueText="0.5 GB / 0.5 GB"
        warningLabel="Near the limit"
        dangerLabel="Limit reached"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Storage" });
    expect(meter).toHaveAttribute("aria-valuemax", "0.5");
    expect(meter).toHaveAttribute("aria-valuenow", "0.5");
    expect(container.querySelector("[data-usage-state]")).toHaveAttribute(
      "data-usage-state",
      "danger",
    );
    expect(meter).toHaveAttribute("aria-valuetext", "0.5 GB / 0.5 GB, Limit reached");
  });
});

describe("PageLayout", () => {
  it("shows the docs pill after the title only with a link and its word", () => {
    const { rerender } = render(
      <PageLayout title="Workers" docsHref="/docs/workers" docsLabel="View docs" />,
    );
    expect(screen.getByRole("link", { name: "View docs" })).toHaveAttribute(
      "href",
      "/docs/workers",
    );
    rerender(<PageLayout title="Workers" docsHref="/docs/workers" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "metrics", label: "Metrics" },
  { value: "deployments", label: "Deployments" },
  { value: "settings", label: "Settings" },
];

function ResourcePage({ onTab }: { onTab?: (v: string) => void }) {
  const [tab, setTab] = useState("overview");
  return (
    <PageLayout
      crumbs={<a href="/workers">Workers</a>}
      title="api-gateway"
      actions={
        <>
          <Button>Edit code</Button>
          <Button variant="primary">Deploy</Button>
        </>
      }
      resource={{
        tabs: TABS,
        tab,
        onTabChange: (v) => {
          setTab(v);
          onTab?.(v);
        },
        switcher: <Button size="sm">Production</Button>,
      }}
    >
      <p>Tab body: {tab}</p>
    </PageLayout>
  );
}

describe("PageLayout resource mode", () => {
  it("has no large title, keeps a hidden h1, and puts the tabs under the top bar", () => {
    const { container } = render(<ResourcePage />);
    const h1 = screen.getByRole("heading", { level: 1, name: "api-gateway" });
    expect(h1).toHaveClass("sr-only");
    expect(container.querySelector(".text-3xl")).toBeNull();
    const header = container.querySelector("[data-resource-header]") as HTMLElement;
    expect(
      within(header)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Overview", "Metrics", "Deployments", "Settings"]);
    expect(within(header).getByRole("button", { name: "Deploy" })).toBeInTheDocument();
  });

  it("focus order: crumbs, switcher, the tab bar (one stop), the actions (primary last), content", () => {
    const { container } = render(<ResourcePage />);
    const order = tabOrder(container).map(nameOf);
    expect(order).toEqual(["Workers", "Production", "Overview", "Edit code", "Deploy"]);
  });

  const keyOn = (el: Element, k: string, up = false) =>
    act(async () => {
      fireEvent.keyDown(el, { key: k, code: k === " " ? "Space" : k });
      if (up) fireEvent.keyUp(el, { key: k, code: k === " " ? "Space" : k });
    });

  it("arrow keys move focus without opening; the keyboard opens a tab; one tab stop", async () => {
    const onTab = vi.fn();
    const { container } = render(<ResourcePage onTab={onTab} />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    await act(async () => overview.focus());
    await keyOn(overview, "ArrowRight");
    const metrics = screen.getByRole("tab", { name: "Metrics" });
    expect(document.activeElement).toBe(metrics);
    // Focus alone opens nothing (Kumo's default manual activation).
    expect(onTab).not.toHaveBeenCalled();
    // The keyboard opens it. A tab is a native button: browsers turn Enter into a click, which
    // happy-dom does not simulate, so the test presses Space (keydown + keyup), which it does.
    await keyOn(metrics, " ", true);
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onTab).toHaveBeenLastCalledWith("metrics");
    expect(metrics).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Tab body: metrics")).toBeInTheDocument();
    // Still one tab stop for the bar, now on the selected tab.
    const stops = tabOrder(container).filter((el) => el.getAttribute("role") === "tab");
    expect(stops.map(nameOf)).toEqual(["Metrics"]);
    await keyOn(metrics, "End");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Settings" }));
    await keyOn(document.activeElement as Element, "Home");
    expect(document.activeElement).toBe(overview);
  });

  it("a click opens a tab", async () => {
    const onTab = vi.fn();
    render(<ResourcePage onTab={onTab} />);
    const settings = screen.getByRole("tab", { name: "Settings" });
    await act(async () => {
      fireEvent.click(settings);
    });
    expect(onTab).toHaveBeenCalledWith("settings");
    expect(settings).toHaveAttribute("aria-selected", "true");
  });

  it("draws one rule under the tabs, wide and narrow, and never wraps the row", () => {
    const { container } = render(<ResourcePage />);
    const header = container.querySelector("[data-resource-header]") as HTMLElement;
    const tabsLine = container.querySelector("[data-resource-tabs]") as HTMLElement;
    const classes = (el: Element) => el.className.split(" ");
    // Kumo's own list border is off: the indicator sits on our rule only.
    const list = within(header).getByRole("tablist");
    expect(classes(list)).toContain("border-b-0");
    expect(classes(list)).not.toContain("border-b");
    // Narrow: the tab line carries the rule; the header has none of its own.
    expect(classes(tabsLine)).toEqual(expect.arrayContaining(["border-b", "border-kumo-hairline"]));
    expect(classes(header)).not.toContain("border-b");
    // Wide: the rule moves to the header row, under tabs and actions alike.
    expect(classes(tabsLine)).toContain("@3xl/page:border-b-0");
    expect(classes(header)).toEqual(
      expect.arrayContaining(["@3xl/page:flex-row", "@3xl/page:border-b"]),
    );
    // No wrapping row in either layout (wrapped, the rule left the tabs).
    expect(classes(header)).not.toContain("flex-wrap");
    expect(header.children[1]).toBe(tabsLine);
  });
});

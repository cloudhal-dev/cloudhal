import type { Snapshot } from "@cloudhal/core-contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ActorBadge,
  DecisionBadge,
  ImagePreview,
  OutcomeBadge,
  PreviewPanel,
  SearchResultPreview,
  SnapshotTimeline,
  type SnapshotTimelineLabels,
  StatusBadge,
} from "../src/index.ts";

const labels: SnapshotTimelineLabels = {
  empty: "No snapshots yet",
  live: "Live",
  publish: "Publish",
  rollBack: "Roll back",
  columns: { snapshot: "Snapshot", actor: "By", changes: "Changes", when: "When" },
  reasons: {
    manual: "Manual",
    agentMutation: "Agent",
    publish: "Publish",
    rollback: "Rollback",
    scheduled: "Scheduled",
    import: "Import",
  },
};

const snap = (id: string, createdAt: string): Snapshot => ({
  schemaVersion: 1,
  id,
  siteId: "site_test000001",
  siteRev: 1,
  reason: "manual",
  actor: { kind: "human", id: "user_test000001", name: "Halil" },
  nodes: [],
  summary: { added: 1, changed: 0, removed: 0 },
  createdAt,
});

describe("StatusBadge", () => {
  it("renders the lifecycle label", () => {
    render(<StatusBadge status="review" />);
    expect(screen.getByText("In review").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "review",
    );
  });
});

describe("SnapshotTimeline", () => {
  it("offers Publish for newer snapshots and Roll back for older ones", () => {
    const onPublish = vi.fn();
    const onRollback = vi.fn();
    const newest = snap("snap_newest00001", "2026-10-08T10:00:00Z");
    const live = snap("snap_live0000001", "2026-10-08T09:00:00Z");
    const old = snap("snap_old00000001", "2026-10-08T08:00:00Z");
    render(
      <SnapshotTimeline
        snapshots={[newest, live, old]}
        publishedSnapshotId={live.id}
        onPublish={onPublish}
        onRollback={onRollback}
        labels={labels}
      />,
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Publish"));
    expect(onPublish).toHaveBeenCalledWith(newest);
    fireEvent.click(screen.getByText("Roll back"));
    expect(onRollback).toHaveBeenCalledWith(old);
  });

  it("shows an empty state with its call to action", () => {
    render(
      <SnapshotTimeline
        snapshots={[]}
        labels={labels}
        emptyContents={<button type="button">Create snapshot</button>}
      />,
    );
    expect(screen.getByText("No snapshots yet")).toBeInTheDocument();
    expect(screen.getByText("Create snapshot")).toBeInTheDocument();
  });

  it("renders the time through renderTime and marks the live row", () => {
    const live = snap("snap_live0000001", "2026-10-08T09:00:00Z");
    const { container } = render(
      <SnapshotTimeline
        snapshots={[live]}
        publishedSnapshotId={live.id}
        onPublish={vi.fn()}
        labels={labels}
        renderTime={(iso) => <time dateTime={iso}>an hour ago</time>}
      />,
    );
    const view = within(container);
    expect(view.getByText("an hour ago")).toHaveAttribute("datetime", live.createdAt);
    expect(view.getByText("Halil")).toBeInTheDocument();
    const row = view.getByText("Live").closest("[data-snapshot-id]");
    expect(row).toHaveAttribute("data-live", "true");
    expect(view.queryByText("Publish")).not.toBeInTheDocument();
  });

  it("offers Compare only when there is something to compare with", () => {
    const onCompare = vi.fn();
    const first = snap("snap_first000001", "2026-10-08T08:00:00Z");
    const second = { ...snap("snap_second00001", "2026-10-08T09:00:00Z"), parentId: first.id };
    render(
      <SnapshotTimeline
        snapshots={[second, first]}
        onCompare={onCompare}
        labels={{ ...labels, compare: "Compare" }}
      />,
    );
    const buttons = screen.getAllByText("Compare");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onCompare).toHaveBeenCalledWith(second);
  });
});

describe("audit badges", () => {
  it("carry machine-readable values and localised labels", () => {
    render(
      <>
        <DecisionBadge decision="deny" label="Reddedildi" />
        <OutcomeBadge outcome="pending" />
        <ActorBadge kind="agent" />
      </>,
    );
    expect(screen.getByText("Reddedildi").closest("[data-decision]")).toHaveAttribute(
      "data-decision",
      "deny",
    );
    expect(screen.getByText("Pending").closest("[data-outcome]")).toHaveAttribute(
      "data-outcome",
      "pending",
    );
    expect(screen.getByText("Agent").closest("[data-actor-kind]")).toHaveAttribute(
      "data-actor-kind",
      "agent",
    );
  });
});

describe("PreviewPanel", () => {
  const previewLabels = {
    title: "Preview",
    frameTitle: "Preview of /about",
    device: "Device",
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
    reload: "Reload preview",
    openInNewTab: "Open in new tab",
    loading: "Loading preview",
  };

  it("renders a fully sandboxed frame that reloads per version", () => {
    const { rerender } = render(
      <PreviewPanel src="/api/sites/s/pages/p/preview" version={3} labels={previewLabels} />,
    );
    const frame = screen.getByTitle("Preview of /about");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame.getAttribute("src")).toBe("/api/sites/s/pages/p/preview?v=3.0");
    expect(screen.getByRole("status", { name: "Loading preview" })).toBeInTheDocument();
    fireEvent.load(frame);
    expect(screen.queryByRole("status", { name: "Loading preview" })).toBeNull();

    rerender(
      <PreviewPanel src="/api/sites/s/pages/p/preview" version={4} labels={previewLabels} />,
    );
    expect(screen.getByTitle("Preview of /about").getAttribute("src")).toContain("v=4.0");
    expect(screen.getByRole("link", { name: "Open in new tab" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("renders tablet/mobile at their real width", () => {
    const { container } = render(
      <PreviewPanel src="/preview" labels={previewLabels} defaultDevice="mobile" />,
    );
    expect(container.querySelector("[data-device]")).toHaveAttribute("data-device", "mobile");
    expect((container.querySelector("iframe") as HTMLIFrameElement).style.width).toBe("390px");
  });
});

describe("ImagePreview", () => {
  const imageLabels = { empty: "No image", loading: "Loading image", error: "Broken image" };
  it("walks through empty, loading, loaded and broken, reporting each state", () => {
    const onStatusChange = vi.fn();
    const onLoad = vi.fn();
    const { container, rerender } = render(
      <ImagePreview
        src={undefined}
        alt="A cat"
        labels={imageLabels}
        onStatusChange={onStatusChange}
      />,
    );
    const frame = () => container.querySelector("[data-image-status]") as HTMLElement;
    expect(frame()).toHaveAttribute("data-image-status", "empty");
    expect(screen.getByText("No image")).toBeInTheDocument();
    rerender(
      <ImagePreview
        src="https://cdn.example/a.jpg"
        alt="A cat"
        labels={imageLabels}
        onLoad={onLoad}
        onStatusChange={onStatusChange}
      />,
    );
    expect(frame()).toHaveAttribute("data-image-status", "loading");
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("alt", "A cat");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    Object.defineProperty(img, "naturalWidth", { value: 1200 });
    Object.defineProperty(img, "naturalHeight", { value: 630 });
    fireEvent.load(img);
    expect(frame()).toHaveAttribute("data-image-status", "loaded");
    expect(onLoad).toHaveBeenCalledWith({ width: 1200, height: 630 });
    rerender(
      <ImagePreview
        src="https://cdn.example/gone.jpg"
        alt="A cat"
        labels={imageLabels}
        errorHint="Check the address."
        onStatusChange={onStatusChange}
      />,
    );
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(frame()).toHaveAttribute("data-image-status", "error");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Broken image")).toBeInTheDocument();
    expect(screen.getByText("Check the address.")).toBeInTheDocument();
    expect(onStatusChange.mock.calls.map(([s]) => s)).toEqual([
      "empty",
      "loading",
      "loaded",
      "loading",
      "error",
    ]);
  });
});

describe("SearchResultPreview", () => {
  it("renders the result as plain text, the placeholder muted", () => {
    render(
      <SearchResultPreview
        siteName="Demo"
        breadcrumb="example.com › about"
        title="<b>About</b>"
        description="Nothing set"
        placeholder
      />,
    );
    const result = screen.getByTestId("search-result-preview");
    expect(result).toHaveTextContent("example.com › about");
    expect(result.querySelector("b")).toBeNull();
    expect(screen.getByText("Nothing set")).toHaveClass("italic");
  });
});

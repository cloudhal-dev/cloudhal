import type { Snapshot } from "@cloudhal/core-contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SnapshotTimeline, type SnapshotTimelineLabels, StatusBadge } from "../src/index.ts";

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

  it("shows an empty state", () => {
    render(<SnapshotTimeline snapshots={[]} labels={labels} />);
    expect(screen.getByText("No snapshots yet")).toBeInTheDocument();
  });
});

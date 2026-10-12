import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePreview, MediaDropZone, MediaGrid, MediaKindFrame, MediaTile } from "../src/index.ts";

const labels = {
  title: "Drop files here",
  description: "Up to 20 files",
  choose: "Choose files",
  release: "Release to upload",
};

afterEach(() => cleanup());

const dataTransfer = (files: File[]) => ({ types: ["Files"], files, dropEffect: "none" });

describe("MediaDropZone", () => {
  it("hands dropped and chosen files on, and says when to release", () => {
    const onFiles = vi.fn();
    render(<MediaDropZone onFiles={onFiles} labels={labels} data-testid="zone" />);
    const zone = screen.getByTestId("zone");
    expect(screen.getByRole("group", { name: "Drop files here" })).toBe(zone);
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([file]) });
    expect(zone).toHaveAttribute("data-dragging", "true");
    expect(screen.getByText("Release to upload")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: dataTransfer([file]) });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(zone).not.toHaveAttribute("data-dragging");
    // The file button opens the system chooser; a choice is handed on the same way.
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement;
    const other = new File(["y"], "b.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [other], configurable: true });
    fireEvent.change(input);
    expect(onFiles).toHaveBeenLastCalledWith([other]);
  });

  it("takes nothing when the person may not upload, and keeps one file when single", () => {
    const onFiles = vi.fn();
    const { rerender } = render(
      <MediaDropZone onFiles={onFiles} labels={labels} disabledReason="No" data-testid="zone" />,
    );
    const a = new File(["x"], "a.png");
    fireEvent.drop(screen.getByTestId("zone"), { dataTransfer: dataTransfer([a]) });
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    rerender(
      <MediaDropZone onFiles={onFiles} labels={labels} multiple={false} data-testid="zone" />,
    );
    fireEvent.drop(screen.getByTestId("zone"), {
      dataTransfer: dataTransfer([a, new File(["y"], "b.png")]),
    });
    expect(onFiles).toHaveBeenCalledWith([a]);
  });

  it("as an overlay, wraps its content and shows the release hint only while dragging", () => {
    const onFiles = vi.fn();
    render(
      <MediaDropZone variant="overlay" onFiles={onFiles} labels={labels} data-testid="zone">
        <span>Library</span>
      </MediaDropZone>,
    );
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.queryByText("Release to upload")).toBeNull();
    fireEvent.dragEnter(screen.getByTestId("zone"), { dataTransfer: dataTransfer([]) });
    expect(screen.getByText("Release to upload")).toBeInTheDocument();
  });
});

describe("MediaTile", () => {
  const preview = <MediaKindFrame icon={<span />} label="PDF" />;
  it("is a toggle in the picker, pressed when selected", () => {
    const onSelect = vi.fn();
    render(
      <MediaGrid label="Images">
        <MediaTile preview={preview} title="Report" meta="PDF · 1 MB" onSelect={onSelect} />
        <MediaTile preview={preview} title="Chart" selected onSelect={() => {}} />
      </MediaGrid>,
    );
    expect(screen.getByRole("list", { name: "Images" })).toBeInTheDocument();
    const [report, chart] = screen.getAllByRole("button");
    expect(report).toHaveAttribute("aria-pressed", "false");
    expect(chart).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(report as HTMLElement);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByText("PDF · 1 MB")).toBeInTheDocument();
  });

  it("is a link in the library", () => {
    render(
      <MediaGrid label="Files">
        <MediaTile preview={preview} title="Report" href="/sites/s/media/asset_1" />
      </MediaGrid>,
    );
    expect(screen.getByRole("link", { name: /Report/ })).toHaveAttribute(
      "href",
      "/sites/s/media/asset_1",
    );
  });
});

describe("ImagePreview tile", () => {
  it("fills a 4:3 frame with icons only and can show the whole image", () => {
    render(
      <ImagePreview
        size="tile"
        fit="contain"
        src="https://cdn.example.com/a.png"
        alt="A"
        labels={{ empty: "None", loading: "Loading", error: "Broken" }}
      />,
    );
    const frame = document.querySelector("[data-image-status]") as HTMLElement;
    expect(frame.className).toContain("aspect-[4/3]");
    expect(document.querySelector("img")?.className).toContain("object-contain");
    // The label is for screen readers only in a tile.
    expect(screen.getByText("Loading")).toHaveClass("sr-only");
  });
});

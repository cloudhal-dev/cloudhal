/** RFC-0045 §5: the repeater block — items as fieldsets, add, moves, remove with undo, focus, errors. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldValues } from "../src/blocks/entry-fields-model.ts";
import { RepeaterField, type RepeaterItemErrors } from "../src/blocks/RepeaterField.tsx";
import { repeaterLabels } from "./field-labels.ts";

const SUBS = [{ key: "name" }, { key: "role" }];

function Harness({
  initial,
  max = 5,
  onChange = () => {},
  onRemoved,
  itemErrors,
}: {
  initial: FieldValues[];
  max?: number;
  onChange?: (items: FieldValues[]) => void;
  onRemoved?: (r: { index: number; legend: string; undo: () => boolean }) => void;
  itemErrors?: ReadonlyMap<number, RepeaterItemErrors>;
}) {
  const [items, setItems] = useState<FieldValues[]>(initial);
  return (
    <RepeaterField
      label="Speakers"
      items={items}
      onChange={(next) => {
        setItems(next);
        onChange(next);
      }}
      subFields={SUBS}
      max={max}
      legend={(i, item) => `Speaker ${i + 1}${item.name ? `: ${String(item.name)}` : ""}`}
      itemErrors={itemErrors}
      onRemoved={onRemoved}
      labels={repeaterLabels}
      renderControl={({ sub, index, value, onChange: set, error }) => (
        <label>
          {`${sub.key} ${index + 1}`}
          <input
            aria-label={`${sub.key} ${index + 1}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => set(e.target.value)}
          />
          {error && <span>{error}</span>}
        </label>
      )}
    />
  );
}

const items = () =>
  screen.getAllByRole("group").filter((g) => g.hasAttribute("data-repeater-item"));
const legends = () => items().map((g) => g.querySelector("legend")?.textContent);

async function menuItem(index: number, name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for item ${index}` }));
  return screen.findByRole("menuitem", { name });
}

afterEach(cleanup);

describe("RepeaterField", () => {
  it("shows each item as a fieldset named by its legend, and the count", () => {
    render(<Harness initial={[{ name: "Ada" }, { name: "Grace" }]} max={2} />);
    expect(screen.getByRole("group", { name: "Speaker 1: Ada" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Speaker 2: Grace" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move item 1 up" })).toBeDisabled();
  });

  it("adds an item and moves focus to its first control", async () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ name: "Ada" }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(onChange).toHaveBeenLastCalledWith([{ name: "Ada" }, {}]);
    await waitFor(() => expect(screen.getByLabelText("name 2")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("name 2"), { target: { value: "Grace" } });
    expect(onChange).toHaveBeenLastCalledWith([{ name: "Ada" }, { name: "Grace" }]);
  });

  it("moves items with buttons, announces it, and keeps focus on the moved item", async () => {
    render(<Harness initial={[{ name: "Ada" }, { name: "Grace" }, { name: "Linus" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Move item 3 up" }));
    expect(legends()).toEqual(["Speaker 1: Ada", "Speaker 2: Linus", "Speaker 3: Grace"]);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Item 3 moved to position 2"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move item 2 up" })).toHaveFocus(),
    );
    // At the top the up button is disabled: focus falls back to the item's other move button.
    fireEvent.click(screen.getByRole("button", { name: "Move item 2 up" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move item 1 down" })).toHaveFocus(),
    );
    expect(legends()[0]).toBe("Speaker 1: Linus");
  });

  it("removes an item, focuses the next one, and puts it back on undo", async () => {
    const onRemoved = vi.fn();
    render(
      <Harness
        initial={[{ name: "Ada" }, { name: "Grace" }, { name: "Linus" }]}
        onRemoved={onRemoved}
      />,
    );
    fireEvent.click(await menuItem(2, "Remove"));
    expect(legends()).toEqual(["Speaker 1: Ada", "Speaker 2: Linus"]);
    await waitFor(() =>
      expect(
        within(items()[1] as HTMLElement).getByRole("button", { expanded: true }),
      ).toHaveFocus(),
    );
    expect(onRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, legend: "Speaker 2: Grace" }),
    );
    act(() => {
      expect(onRemoved.mock.lastCall?.[0].undo()).toBe(true);
    });
    expect(legends()).toEqual(["Speaker 1: Ada", "Speaker 2: Grace", "Speaker 3: Linus"]);
    await waitFor(() =>
      expect(
        within(items()[1] as HTMLElement).getByRole("button", { expanded: true }),
      ).toHaveFocus(),
    );
  });

  it("after removing the last item, focus goes to Add item", async () => {
    render(<Harness initial={[{ name: "Ada" }]} />);
    fireEvent.click(await menuItem(1, "Remove"));
    expect(screen.getByText("No items yet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus());
  });

  it("duplicates an item after itself", async () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ name: "Ada", role: "Host" }]} onChange={onChange} />);
    fireEvent.click(await menuItem(1, "Duplicate"));
    expect(onChange).toHaveBeenLastCalledWith([
      { name: "Ada", role: "Host" },
      { name: "Ada", role: "Host" },
    ]);
  });

  it("opens items with problems, shows them on their control, and lists collapsed ones", async () => {
    const many = [1, 2, 3, 4].map((n) => ({ name: `P${n}` }));
    const { rerender } = render(<Harness initial={many} />);
    // More than three items start folded.
    expect(screen.queryByLabelText("name 3")).toBeNull();
    const errors = new Map([[2, { subs: new Map([["role", "Needed to publish"]]) }]]);
    rerender(<Harness initial={many} itemErrors={errors} />);
    await waitFor(() => expect(screen.getByLabelText("role 3")).toBeInTheDocument());
    expect(within(items()[2] as HTMLElement).getByText("Needed to publish")).toBeInTheDocument();
    // Folding it again lists it above the items, with a way back to it.
    fireEvent.click(within(items()[2] as HTMLElement).getByRole("button", { expanded: true }));
    const listed = await screen.findByText("1 items need attention");
    const back = within(listed.parentElement as HTMLElement).getByRole("button", {
      name: "Speaker 3: P3",
    });
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByLabelText("name 3")).toHaveFocus());
  });
  it("undo writes over the latest items and handler, and refuses a full list", async () => {
    const onRemoved = vi.fn();
    const onChange = vi.fn();
    render(
      <Harness
        initial={[{ name: "Ada" }, { name: "Grace" }]}
        max={2}
        onRemoved={onRemoved}
        onChange={onChange}
      />,
    );
    fireEvent.click(await menuItem(1, "Remove"));
    // An edit after the removal is kept by the undo.
    fireEvent.change(screen.getByLabelText("role 1"), { target: { value: "Admiral" } });
    act(() => {
      expect(onRemoved.mock.lastCall?.[0].undo()).toBe(true);
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { name: "Ada" },
      { name: "Grace", role: "Admiral" },
    ]);
    // Full again: a second undo of the same removal, or another one, does nothing.
    fireEvent.click(await menuItem(2, "Remove"));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    act(() => {
      expect(onRemoved.mock.lastCall?.[0].undo()).toBe(false);
    });
    expect(items()).toHaveLength(2);
  });

  it("an undo after the list is gone does nothing", async () => {
    const onRemoved = vi.fn();
    const { unmount } = render(<Harness initial={[{ name: "Ada" }]} onRemoved={onRemoved} />);
    fireEvent.click(await menuItem(1, "Remove"));
    unmount();
    expect(onRemoved.mock.lastCall?.[0].undo()).toBe(false);
  });

  it("problems follow their item when an earlier one is removed", async () => {
    const errors = new Map([[1, { subs: new Map([["role", "Needed to publish"]]) }]]);
    render(<Harness initial={[{ name: "Ada" }, { name: "Grace" }]} itemErrors={errors} />);
    const grace = () => screen.getByRole("group", { name: /Grace/ });
    expect(within(grace()).getByText("Needed to publish")).toBeInTheDocument();
    fireEvent.click(await menuItem(1, "Remove"));
    expect(within(grace()).getByText("Needed to publish")).toBeInTheDocument();
    expect(grace()).toHaveAttribute("aria-invalid", "true");
  });

  it("announces the same message twice", async () => {
    render(<Harness initial={[{ name: "Ada" }, { name: "Grace" }, { name: "Linus" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Move item 2 down" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Item 2 moved to position 3"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move item 2 down" }));
    // The region empties first, so the repeat is a change screen readers announce.
    expect(screen.getByRole("status")).toHaveTextContent("");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Item 2 moved to position 3"),
    );
  });
});

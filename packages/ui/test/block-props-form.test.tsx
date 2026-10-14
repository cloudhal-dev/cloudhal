/** RFC-0015 §8: a block's form is generated from its props schema. */
import { BUILT_IN_BLOCK_TYPES, sectionSchema, validateProps } from "@cloudhal/core-ts/blocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockPropsForm } from "../src/blocks/BlockPropsForm.tsx";

const labels = {
  addItem: "Add item",
  removeItem: "Remove item",
  moveUp: "Move up",
  moveDown: "Move down",
  item: "Item {n}",
};
const type = (name: string) => {
  const t = BUILT_IN_BLOCK_TYPES.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};

function Harness({
  name,
  initial,
  onChange,
}: {
  name: string;
  initial: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const schema = sectionSchema(type(name));
  const [value, setValue] = useState(initial);
  return (
    <BlockPropsForm
      schema={schema}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      issues={validateProps(schema, value)}
      locale="en"
      labels={labels}
    />
  );
}

afterEach(cleanup);

describe("BlockPropsForm", () => {
  it("builds fields from the schema and drops emptied optional props", () => {
    const onChange = vi.fn();
    render(
      <Harness name="callout" initial={{ tone: "info", title: "Note" }} onChange={onChange} />,
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ tone: "info" });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Back up **first**." } });
    expect(onChange).toHaveBeenLastCalledWith({ tone: "info", content: "Back up **first**." });
  });

  it("shows the interpreter's problems on their fields", () => {
    render(
      <Harness name="button" initial={{ label: "Go", href: "javascript:x" }} onChange={vi.fn()} />,
    );
    expect(screen.getByText("a safe link")).toBeInTheDocument();
  });

  it("edits lists: add, move and remove items", () => {
    const onChange = vi.fn();
    render(
      <Harness
        name="faq"
        initial={{
          items: [
            { question: "One?", answer: "1" },
            { question: "Two?", answer: "2" },
          ],
        }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith({
      items: [
        { question: "Two?", answer: "2" },
        { question: "One?", answer: "1" },
      ],
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove item" })[1] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith({ items: [{ question: "Two?", answer: "2" }] });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(onChange).toHaveBeenLastCalledWith({ items: [{ question: "Two?", answer: "2" }, {}] });
  });
});

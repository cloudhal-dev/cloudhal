/**
 * Component sections (RFC-0015 §8, DESIGN.md §2aa): a known type gets the form generated from its
 * schema, in the UI language; an unknown type is kept and shown read-only.
 */
import type { ComponentSection } from "@cloudhal/core-contracts";
import { BUILT_IN_BLOCK_TYPES } from "@cloudhal/core-ts/blocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentSectionForm, newBlockSection } from "../src/components/BlockSection.tsx";
import { wrap } from "./roles-fixtures.tsx";

afterEach(cleanup);

const callout = BUILT_IN_BLOCK_TYPES.find((t) => t.name === "callout");
if (!callout) throw new Error("callout");

describe("component sections", () => {
  it("starts from the type's example and edits it through the generated form", () => {
    const section = newBlockSection("sec_block000001", callout);
    expect(section).toMatchObject({ kind: "component", type: "callout" });
    expect(typeof section.props.content).toBe("string");
    const onChange = vi.fn();
    render(
      wrap(
        <ComponentSectionForm
          section={section}
          onChange={onChange}
          types={BUILT_IN_BLOCK_TYPES}
          readOnly={false}
        />,
        "tr",
      ),
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Uyarı"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ tone: "warning" }) }),
    );
  });

  it("keeps an unknown type's props and shows them read-only", () => {
    const section: ComponentSection = {
      id: "sec_block000002",
      kind: "component",
      type: "pricing-table",
      props: { plans: [{ name: "Pro" }] },
    };
    render(
      wrap(
        <ComponentSectionForm
          section={section}
          onChange={vi.fn()}
          types={BUILT_IN_BLOCK_TYPES}
          readOnly={false}
        />,
      ),
    );
    expect(document.querySelector('[data-unknown-block="pricing-table"]')).not.toBeNull();
    const json = screen.getByRole("textbox", { name: "Unknown block · pricing-table" });
    expect(json).toHaveAttribute("readonly");
    expect((json as HTMLTextAreaElement).value).toContain('"name": "Pro"');
  });
});

import { ArrowRight, CaretLeft } from "@phosphor-icons/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DirectionalIcon, DirectionProvider, directional } from "../src/index.ts";

const transform = (container: HTMLElement) => container.querySelector("svg")?.getAttribute("transform");

describe("DirectionalIcon (ADR-0033 C1)", () => {
  it("mirrors in right-to-left languages only", () => {
    const ltr = render(<DirectionalIcon icon={ArrowRight} size={12} />);
    expect(transform(ltr.container)).toBeNull();
    const rtl = render(
      <DirectionProvider direction="rtl">
        <DirectionalIcon icon={ArrowRight} size={12} />
      </DirectionProvider>,
    );
    expect(transform(rtl.container)).toBe("scale(-1, 1)");
    expect(rtl.container.querySelector("svg")?.getAttribute("width")).toBe("12");
  });

  it("directional() gives the same mirroring component for each icon", () => {
    expect(directional(CaretLeft)).toBe(directional(CaretLeft));
    expect(directional(CaretLeft)).not.toBe(directional(ArrowRight));
    const Back = directional(CaretLeft);
    const { container } = render(
      <DirectionProvider direction="rtl">
        <Back size={16} />
      </DirectionProvider>,
    );
    expect(transform(container)).toBe("scale(-1, 1)");
  });
});

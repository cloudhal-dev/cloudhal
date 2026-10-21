import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImagePreview } from "../src/blocks/SeoPreview.tsx";

const labels = { empty: "No image", loading: "Loading image", error: "Broken" };

describe("ImagePreview placeholder (the image's colour and preview while it loads)", () => {
  it("paints the colour and preview instead of a spinner while loading", () => {
    const { container } = render(
      <ImagePreview
        size="tile"
        src="/a.jpg"
        alt=""
        labels={labels}
        placeholder={{ color: "#336699", lqip: "data:image/webp;base64,AAAA" }}
      />,
    );
    const frame = container.querySelector("[data-image-status]") as HTMLElement;
    expect(frame.dataset.imageStatus).toBe("loading");
    expect(frame.style.backgroundColor).toBe("#336699");
    expect(frame.style.backgroundImage).toContain("data:image/webp;base64,AAAA");
    expect(container.querySelector("[role=status]")?.textContent).toBe("Loading image");
  });

  it("keeps the spinner when there is no placeholder", () => {
    const { container } = render(<ImagePreview size="tile" src="/a.jpg" alt="" labels={labels} />);
    const frame = container.querySelector("[data-image-status]") as HTMLElement;
    expect(frame.getAttribute("style")).toBeNull();
  });
});

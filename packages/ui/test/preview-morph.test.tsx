import { describe, expect, it } from "vitest";
import { morphPreview } from "../src/blocks/PreviewPanel.tsx";

const page = (sections: string, title = "Home") =>
  `<!doctype html><html><head><title>${title}</title></head><body><header><a href="/">Site</a></header><main>${sections}</main></body></html>`;

describe("morphPreview (RFC-0020 §6)", () => {
  it("keeps unchanged sections as the same nodes and replaces the rest", () => {
    const doc = new DOMParser().parseFromString(
      page('<section data-section-id="a">A</section><section data-section-id="b">B</section>'),
      "text/html",
    );
    const a = doc.querySelector('[data-section-id="a"]');
    morphPreview(
      doc,
      page(
        '<section data-section-id="a">A</section><section data-section-id="b">B2</section><section data-section-id="c">C</section>',
        "Renamed",
      ),
    );
    expect(doc.querySelector('[data-section-id="a"]')).toBe(a);
    expect(doc.querySelector("main")?.textContent).toBe("AB2C");
    expect(doc.title).toBe("Renamed");
  });

  it("drops sections that are gone and follows the new order", () => {
    const doc = new DOMParser().parseFromString(
      page('<section data-section-id="a">A</section><section data-section-id="b">B</section>'),
      "text/html",
    );
    morphPreview(doc, page('<section data-section-id="b">B</section>'));
    expect(doc.querySelector("main")?.innerHTML).toBe('<section data-section-id="b">B</section>');
  });
});

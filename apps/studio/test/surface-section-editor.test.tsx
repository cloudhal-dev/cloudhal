/**
 * A generated section in the page editor: an outline people can read, texts they can change, and
 * Build chat aimed at a part of it — the data only behind "Show JSON".
 */
import type { SurfaceSection } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurfaceSectionEditor } from "../src/components/SurfaceSectionEditor.tsx";
import { wrap } from "./roles-fixtures.tsx";

afterEach(cleanup);

const section = {
  id: "sec_tools00001",
  kind: "surface",
  catalog: "blog@1",
  data: { kg: "" },
  components: [
    { id: "root", component: "Card", children: ["title", "kg", "bmi"] },
    { id: "title", component: "Heading", props: { text: "Body mass index", level: 2 } },
    {
      id: "kg",
      component: "NumberField",
      props: { label: "Weight", value: { path: "/kg" }, unit: "kg" },
    },
    {
      id: "bmi",
      component: "Stat",
      props: {
        label: "BMI",
        value: { call: "calculate", args: { expression: "kg / 3", vars: { kg: { path: "/kg" } } } },
      },
    },
    { id: "lost", component: "Text", props: { text: "Left out" } },
  ],
} as unknown as SurfaceSection;

const href = (componentId?: string) =>
  `/sites/s/pages/p/build?section=sec_tools00001${componentId ? `&component=${componentId}` : ""}`;

describe("SurfaceSectionEditor", () => {
  it("shows an outline with readable names, what each part shows, and parts not on the page", () => {
    render(
      wrap(
        <SurfaceSectionEditor
          section={section}
          onChange={() => {}}
          readOnly={false}
          buildHref={href}
        />,
      ),
    );
    const tree = screen.getByRole("list", { name: "Components of this section" });
    expect(within(tree).getByText("Card")).toBeInTheDocument();
    expect(within(tree).getByText("Heading")).toBeInTheDocument();
    expect(within(tree).getByText("Number field")).toBeInTheDocument();
    expect(within(tree).getByText("Weight · shows /kg")).toBeInTheDocument();
    expect(within(tree).getByText("BMI · computed (calculate)")).toBeInTheDocument();
    expect(within(tree).getByText("Not on the page")).toBeInTheDocument();
    // the data is not on screen until asked for
    expect(screen.queryByLabelText("Generated UI as data")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show JSON" })).toBeInTheDocument();
  });

  it("changes a text in place, and aims Build chat at the section or a part", () => {
    const onChange = vi.fn();
    render(
      wrap(
        <SurfaceSectionEditor
          section={section}
          onChange={onChange}
          readOnly={false}
          buildHref={href}
        />,
      ),
    );
    // fields open on demand
    expect(screen.queryByDisplayValue("Body mass index")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit the texts of Heading" }));
    fireEvent.change(screen.getByDisplayValue("Body mass index"), {
      target: { value: "Your BMI" },
    });
    const next = onChange.mock.calls[0]?.[0] as SurfaceSection;
    expect(next.components.find((c) => c.id === "title")?.props).toEqual({
      text: "Your BMI",
      level: 2,
    });
    expect(screen.getByRole("link", { name: "Change with AI" })).toHaveAttribute(
      "href",
      "/sites/s/pages/p/build?section=sec_tools00001",
    );
    expect(screen.getByRole("link", { name: "Change Heading with AI" })).toHaveAttribute(
      "href",
      "/sites/s/pages/p/build?section=sec_tools00001&component=title",
    );
  });

  it("shows texts without fields when the person may not edit, and speaks Turkish", () => {
    render(
      wrap(
        <SurfaceSectionEditor section={section} onChange={() => {}} readOnly buildHref={href} />,
        "tr",
      ),
    );
    expect(screen.queryByRole("button", { name: /metinlerini düzenle/ })).not.toBeInTheDocument();
    expect(screen.getByText("Body mass index")).toBeInTheDocument();
    expect(screen.getByText("Weight · /kg gösterir")).toBeInTheDocument();
    expect(screen.getByText("Sayı alanı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yapay zekâ ile değiştir" })).toBeInTheDocument();
  });
});

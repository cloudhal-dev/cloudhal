/**
 * Site settings › Appearance (RFC-0017 §1): the theme's design settings as its generated form,
 * contrast checked as typed, saved with the site's rev; a theme without settings says so, and
 * people below Administrator see the values read-only.
 */
import type { PropsSchema } from "@cloudhal/core-ts/blocks";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceSettingsSection } from "../src/components/AppearanceSettings.tsx";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SCHEMA: PropsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: { type: "string", format: "color", default: "#18181b", title: { en: "Brand color" } },
    surface: { type: "string", format: "color", default: "#ffffff", title: { en: "Background" } },
    font: {
      type: "string",
      enum: ["system", "serif"],
      default: "system",
      "x-widget": "radio",
      "x-labels": { system: { en: "System" }, serif: { en: "Serif" } },
      title: { en: "Typeface" },
    },
  },
  "x-contrast": [["brand", "surface", 3]],
};
const PATH = "/api/sites/site_1/theme-settings";

function server(
  role: "owner" | "editor",
  schema: PropsSchema | null = SCHEMA,
  extra: Route[] = [],
) {
  const [me] = asRole(role);
  return serve(
    ...extra,
    me as Route,
    on("GET", PATH, { status: 200, body: { theme: "blog", schema, values: {}, rev: 3 } }),
    on("PUT", PATH, { status: 200, body: { values: { brand: "#1d4ed8" }, rev: 4 } }),
  );
}

describe("Appearance settings", () => {
  it("shows the theme's form, refuses unreadable colors and saves with the site's rev", async () => {
    const fetch = server("owner");
    vi.stubGlobal("fetch", fetch);
    render(wrap(<AppearanceSettingsSection siteId="site_1" />));
    const brand = await screen.findByRole("textbox", { name: "Brand color" });
    expect(screen.getByText("Serif")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save changes" });
    fireEvent.change(brand, { target: { value: "#fafafa" } });
    expect(
      await screen.findByText(/contrast with surface is 1\.0:1; needs 3:1/),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(brand, { target: { value: "#1d4ed8" } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({ rev: 3, values: { brand: "#1d4ed8" } }),
    );
  });

  it("shows the color roles live, light and dark once a seed is set, with the contrast repairs", async () => {
    const tokens: PropsSchema = {
      ...SCHEMA,
      properties: {
        seed: { type: "string", format: "color", title: { en: "Seed color" } },
        ...SCHEMA.properties,
      },
    };
    vi.stubGlobal("fetch", server("owner", tokens));
    render(wrap(<AppearanceSettingsSection siteId="site_1" />));
    const preview = await screen.findByRole("region", { name: "Color roles" });
    expect(within(preview).getByRole("group", { name: "Light" })).toBeInTheDocument();
    expect(within(preview).queryByRole("group", { name: "Dark" })).not.toBeInTheDocument();
    expect(within(preview).getByText("Text on brand")).toBeInTheDocument();
    expect(screen.getByText(/Pick a seed color to get a full palette/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Seed color" }), {
      target: { value: "#facc15" },
    });
    expect(await within(preview).findByRole("group", { name: "Dark" })).toBeInTheDocument();
    expect(within(preview).getByText("Adjusted for contrast")).toBeInTheDocument();
    expect(
      within(preview).getByText(/^Light: Brand darkened \d+ step\(s\) to read on Page \(3:1\)$/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pick a seed color/)).not.toBeInTheDocument();
  });

  it("says when the theme has no settings", async () => {
    vi.stubGlobal("fetch", server("owner", null));
    render(wrap(<AppearanceSettingsSection siteId="site_1" />));
    expect(
      await screen.findByText("The blog theme has no design settings to change."),
    ).toBeInTheDocument();
  });

  it("is read-only below Administrator", async () => {
    vi.stubGlobal("fetch", server("editor"));
    render(wrap(<AppearanceSettingsSection siteId="site_1" />));
    const brand = await screen.findByRole("textbox", { name: "Brand color" });
    expect(brand).toBeDisabled();
  });
});

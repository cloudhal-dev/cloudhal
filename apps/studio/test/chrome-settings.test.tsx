/**
 * Site settings › Header and footer (RFC-0025 §5): the header, footer and brand as forms generated
 * from the server's schemas, one segment at a time, saved together with the site's rev.
 */
import { chromeSchemas } from "@cloudhal/core-ts/chrome";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeSettingsSection } from "../src/components/ChromeSettings.tsx";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATH = "/api/sites/site_1/chrome";

function server(role: "owner" | "editor") {
  const [me] = asRole(role);
  return serve(
    me as Route,
    on("GET", PATH, {
      status: 200,
      body: {
        header: { behavior: "sticky" },
        footer: {},
        announcement: {},
        consent: {},
        brand: {},
        schemas: chromeSchemas,
        menus: ["primary", "footer"],
        rev: 7,
      },
    }),
    on("PUT", PATH, { status: 200, body: { rev: 8 } }),
  );
}

describe("Header and footer settings", () => {
  it("edits the header and footer and saves every part with the site's rev", async () => {
    const fetch = server("owner");
    vi.stubGlobal("fetch", fetch);
    render(wrap(<ChromeSettingsSection siteId="site_1" defaultLocale="en" />));
    expect(
      await screen.findByText("Menus you can name: primary, footer.", { exact: false }),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Footer" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Tagline" }), {
      target: { value: "Made with care." },
    });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({
        rev: 7,
        header: { behavior: "sticky" },
        footer: { tagline: "Made with care." },
        announcement: {},
        consent: {},
        brand: {},
      }),
    );
  });

  it("edits the announcement and consent bars on their own segment", async () => {
    vi.stubGlobal("fetch", server("owner"));
    render(wrap(<ChromeSettingsSection siteId="site_1" defaultLocale="en" />));
    fireEvent.click(await screen.findByRole("tab", { name: "Bars" }));
    expect(screen.getByRole("heading", { name: "Announcement" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Privacy bar" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Text" })).toBeInTheDocument();
  });

  it("offers the logo from the media library on the brand segment", async () => {
    vi.stubGlobal("fetch", server("owner"));
    render(wrap(<ChromeSettingsSection siteId="site_1" defaultLocale="en" />));
    fireEvent.click(await screen.findByRole("tab", { name: "Brand" }));
    expect(screen.getAllByText("No image: the site's name shows as text.")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Choose image" })).toHaveLength(2);
  });
});

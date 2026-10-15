/**
 * Site settings › Design rules (RFC-0021 §5): the site's DESIGN.md next to the theme's rules,
 * a headings template for an empty start, warnings, and saving with the site's rev.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignRulesSettingsSection } from "../src/components/DesignRulesSettings.tsx";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATH = "/api/sites/site_1/design";

function server(role: "owner" | "editor", site: string | null = null) {
  const [me] = asRole(role);
  return serve(
    me as Route,
    on("GET", PATH, {
      status: 200,
      body: { theme: "## Brand\nAn editorial theme.", site, warnings: [], rev: 7 },
    }),
    on("PUT", PATH, {
      status: 200,
      body: { site: "## Brand\nWarm.", warnings: ["Not in this site's catalog: Hero"], rev: 8 },
    }),
  );
}

describe("Design rules settings", () => {
  it("starts from the headings, saves with the site's rev and shows the warnings", async () => {
    const fetch = server("owner");
    vi.stubGlobal("fetch", fetch);
    render(wrap(<DesignRulesSettingsSection siteId="site_1" theme="blog" />));
    const area = await screen.findByLabelText("This site's rules");
    expect(screen.getByText("The blog theme's rules")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start from the headings" }));
    expect((area as HTMLTextAreaElement).value).toMatch(/^## Brand\n\n## Colors/);
    fireEvent.change(area, { target: { value: "## Brand\nWarm." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({ rev: 7, markdown: "## Brand\nWarm." }),
    );
    expect(await screen.findByText("Not in this site's catalog: Hero")).toBeInTheDocument();
  });

  it("is read-only below Administrator", async () => {
    vi.stubGlobal("fetch", server("editor", "## Brand\nWarm."));
    render(wrap(<DesignRulesSettingsSection siteId="site_1" theme="blog" />));
    expect(await screen.findByLabelText("This site's rules")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Start from the headings" })).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SitesPage } from "../src/routes/SitesPage.tsx";
import { asRole, bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useSearch: () => ({}),
  useParams: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
});

const site = (id: string, name: string, projectId: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  projectId,
  pageIds: [],
  defaultLocale: "en",
  locales: ["en"],
});
const SITES = [
  site("site_english01", "English", "proj_a"),
  site("site_docs00001", "Docs", "proj_b"),
];
const PROJECTS = [
  { id: "proj_a", name: "Newsroom", slug: "newsroom", sites: [{ id: "site_english01" }] },
  { id: "proj_b", name: "Docs", slug: "docs", sites: [{ id: "site_docs00001" }] },
];

describe("Sites: new site and projects (RFC-0034 §3, §7)", { timeout: 60_000 }, () => {
  it("names each site's project and creates a site in a chosen project", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites", { status: 200, body: SITES }),
      on("GET", "/api/projects", { status: 200, body: { items: PROJECTS } }),
      on("POST", "/api/sites", {
        status: 201,
        body: { site: site("site_turkish01", "Türkçe Baskı", "proj_a") },
      }),
    );
    render(wrap(<SitesPage />));
    expect(
      await screen.findByRole("link", { name: "Newsroom" }, { timeout: 15_000 }),
    ).toHaveAttribute("href", "/projects/proj_a");
    fireEvent.click(screen.getByRole("button", { name: "New site" }));
    const dialog = await screen.findByTestId("new-site");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Turkish Edition" },
    });
    expect(within(dialog).getByLabelText("Short name")).toHaveValue("turkish-edition");
    fireEvent.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", "/api/sites")).toEqual({
        name: "Turkish Edition",
        slug: "turkish-edition",
        locale: "en",
      }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/sites/$siteId",
        params: { siteId: "site_turkish01" },
      }),
    );
  });

  it("starts a language edition of a site in that site's project", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites", { status: 200, body: SITES }),
      on("GET", "/api/projects", { status: 200, body: { items: PROJECTS } }),
      on("POST", "/api/sites", {
        status: 201,
        body: {
          site: site("site_deutsch01", "Deutsch", "proj_a"),
          edition: { pages: 2, menus: 1, skipped: [] },
        },
      }),
    );
    render(wrap(<SitesPage />));
    fireEvent.click(await screen.findByRole("button", { name: "New site" }, { timeout: 15_000 }));
    const dialog = await screen.findByTestId("new-site");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Deutsch" } });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Start from" }));
    const option = await screen.findByRole("option", {
      name: "A copy of English (language edition)",
    });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    // an edition joins its source's project: no project to pick
    await waitFor(() =>
      expect(within(dialog).queryByRole("combobox", { name: "Project" })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", "/api/sites")).toEqual({
        name: "Deutsch",
        slug: "deutsch",
        locale: "en",
        from: "site_english01",
      }),
    );
  });

  it("disables New site for an Editor", async () => {
    serve(
      ...asRole("editor"),
      on("GET", "/api/sites", { status: 200, body: SITES }),
      on("GET", "/api/projects", { status: 200, body: { items: PROJECTS } }),
    );
    render(wrap(<SitesPage />));
    await screen.findByRole("button", { name: "New site" }, { timeout: 15_000 });
    // Kumo turns a disabled button's title into its tooltip
    await waitFor(() => expect(screen.getByRole("button", { name: "New site" })).toBeDisabled());
  });
});

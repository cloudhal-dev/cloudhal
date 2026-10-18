import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../src/lib/api.ts";
import { MembersPage } from "../src/routes/MembersPage.tsx";
import { asRole, bodyOf, NAMES, on, serve, USER_IDS, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SITES = [
  { id: "site_english01", name: "English" },
  { id: "site_turkish01", name: "Türkçe" },
];
const member = (role: Member["role"], sites?: Member["sites"]): Member => ({
  userId: USER_IDS[role],
  actorId: `user_${role}`,
  name: NAMES[role],
  role,
  joinedAt: "2026-10-01T10:00:00Z",
  email: `${role}@example.com`,
  ...(sites ? { sites } : {}),
});
const rowOf = (userId: string) =>
  document.querySelector(`[data-member-id="${userId}"]`) as HTMLElement;

describe("Team page: per-site roles (RFC-0034 A2)", { timeout: 60_000 }, () => {
  it("shows a limited member's site count and saves their sites", async () => {
    const author = member("author", { site_turkish01: "author" });
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites", { status: 200, body: SITES }),
      on("GET", "/api/members", { status: 200, body: { items: [member("owner"), author] } }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
      on("PUT", `/api/members/${USER_IDS.author}/sites`, {
        status: 200,
        body: {
          member: { ...author, sites: { site_turkish01: "author", site_english01: "author" } },
        },
      }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.author)).toBeTruthy(), { timeout: 15_000 });
    expect(rowOf(USER_IDS.author).querySelector("[data-site-limited]")).toHaveTextContent("1 site");

    fireEvent.click(within(rowOf(USER_IDS.author)).getByRole("button", { name: /Actions for/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sites" }));
    const field = await screen.findByTestId("site-access");
    expect(within(field).getByRole("radio", { name: "Only some sites" })).toBeChecked();
    // A labelled Kumo checkbox: people click its label.
    fireEvent.click(within(field).getByText("English"));
    await waitFor(() =>
      expect(within(field).getByRole("checkbox", { name: "English" })).toBeChecked(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save sites" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", `/api/members/${USER_IDS.author}/sites`)).toEqual({
        sites: { site_turkish01: "author", site_english01: "author" },
      }),
    );
  });

  it("offers no Sites action on a single-site installation", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/sites", { status: 200, body: SITES.slice(0, 1) }),
      on("GET", "/api/members", {
        status: 200,
        body: { items: [member("owner"), member("author")] },
      }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.author)).toBeTruthy(), { timeout: 15_000 });
    fireEvent.click(within(rowOf(USER_IDS.author)).getByRole("button", { name: /Actions for/ }));
    await screen.findByRole("menuitem", { name: "Change role…" });
    expect(screen.queryByRole("menuitem", { name: "Sites" })).toBeNull();
  });
});

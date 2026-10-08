import type { Snapshot } from "@cloudhal/core-contracts";
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/index.tsx";
import { SnapshotsPage } from "../src/routes/SnapshotsPage.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <Toasty>{children}</Toasty>
      </QueryClientProvider>
    </I18nProvider>
  );
}

const snap = (id: string, label: string, parentId?: string): Snapshot => ({
  schemaVersion: 1,
  id,
  siteId: "site_1",
  ...(parentId ? { parentId } : {}),
  siteRev: 1,
  reason: "manual",
  label,
  actor: { kind: "human", id: "user_1", name: "Halil" },
  nodes: [],
  summary: { added: 0, changed: 1, removed: 0 },
  createdAt: "2026-10-08T09:00:00Z",
});

const SITE = {
  schemaVersion: 1,
  id: "site_1",
  rev: 1,
  name: "Demo",
  slug: "demo",
  defaultLocale: "en",
  locales: ["en"],
  pageIds: [],
  publishedSnapshotId: "snap_live",
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
};

function serve(snapshots: Snapshot[]) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const body =
      url === "/api/sites/site_1"
        ? SITE
        : url === "/api/sites/site_1/snapshots" && init?.method === "POST"
          ? { snapshot: snap("snap_new", "Evening"), site: SITE }
          : url === "/api/sites/site_1/snapshots"
            ? snapshots
            : undefined;
    return new Response(JSON.stringify(body ?? { error: "not_found", message: url }), {
      status: body ? 200 : 404,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const posts = (fn: ReturnType<typeof serve>) =>
  fn.mock.calls.filter(([, init]) => init?.method === "POST");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SnapshotsPage", () => {
  it("lists snapshots with the live one marked and Publish / Roll back by position", async () => {
    serve([snap("snap_new1", "Draft"), snap("snap_live", "Launch"), snap("snap_old", "Before")]);
    render(wrap(<SnapshotsPage />));
    const table = await screen.findByTestId("snapshot-timeline");
    const live = within(table).getByText("Launch").closest("[data-snapshot-id]") as HTMLElement;
    expect(live).toHaveAttribute("data-live", "true");
    const newer = within(table).getByText("Draft").closest("tr") as HTMLElement;
    expect(within(newer).getByRole("button", { name: "Publish" })).toBeInTheDocument();
    const older = within(table).getByText("Before").closest("tr") as HTMLElement;
    expect(within(older).getByRole("button", { name: "Roll back" })).toBeInTheDocument();
  });

  it("shows the empty state with a create action", async () => {
    serve([]);
    render(wrap(<SnapshotsPage />));
    expect(await screen.findByText("No snapshots yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create snapshot" }).length).toBeGreaterThan(1);
  });

  it("creates a labelled snapshot without publishing", async () => {
    const fetch = serve([snap("snap_live", "Launch")]);
    render(wrap(<SnapshotsPage />));
    await screen.findByTestId("snapshot-timeline");
    fireEvent.click(screen.getByTestId("create-snapshot"));
    fireEvent.change(await screen.findByLabelText("Label"), { target: { value: " Evening " } });
    fireEvent.click(screen.getByTestId("create-snapshot-submit"));
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetch)[0]?.[1]?.body))).toEqual({
      label: "Evening",
      publish: false,
    });
  });

  it("routes snapshot-and-publish through the approval dialog", async () => {
    const fetch = serve([snap("snap_live", "Launch")]);
    render(wrap(<SnapshotsPage />));
    await screen.findByTestId("snapshot-timeline");
    fireEvent.click(screen.getByTestId("create-snapshot"));
    fireEvent.click(await screen.findByRole("radio", { name: /Publish it to the live site/ }));
    fireEvent.click(screen.getByTestId("create-snapshot-submit"));
    // Nothing is sent until the person confirms the publish.
    const dialog = await screen.findByText("Publish to the live site?");
    expect(posts(fetch)).toHaveLength(0);
    const confirm = within(dialog.closest("[role=dialog]") as HTMLElement).getByRole("button", {
      name: "Publish",
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetch)[0]?.[1]?.body))).toEqual({ publish: true });
  });
});

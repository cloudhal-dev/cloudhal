import { bodyDiff } from "@cloudhal/core-ts/body-blocks";
import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BodyProposals } from "../src/components/BodyProposals.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import { serve } from "./taxonomy-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const proposal = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  siteId: "site_1",
  nodeId: "entry_1",
  baseRev: 3,
  ops: [{ op: "delete", block: "blk_xxxxxxxx" }],
  actor: { kind: "agent", id: "agent_1", name: "Writer" },
  note: "A stronger opening.",
  status: "open",
  createdAt: "2026-10-14T09:00:00Z",
  ...extra,
});

function mount(dirty: boolean, onDecided = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Toasty>
            <BodyProposals siteId="site_1" nodeId="entry_1" dirty={dirty} onDecided={onDecided} />
          </Toasty>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
  return onDecided;
}

const routes = {
  "/api/sites/site_1/proposals?nodeId=entry_1": {
    items: [
      {
        proposal: proposal("prop_1"),
        diff: bodyDiff("First.\n\nSecond.\n", "First, stronger.\n\nSecond.\n"),
      },
      { proposal: proposal("prop_2", { note: undefined }), problem: "block blk_x changed" },
    ],
  },
};

it("shows each open suggestion as its change, and accepts one", async () => {
  const calls = serve(routes);
  const onDecided = mount(false);
  expect(await screen.findByText("Suggestions")).toBeInTheDocument();
  expect(screen.getByText("2 open")).toBeInTheDocument();
  expect(screen.getByText("A stronger opening.")).toBeInTheDocument();
  expect(screen.getAllByText("Writer suggests")).toHaveLength(2);
  // The out-of-date one can only be rejected.
  const stale = document.querySelector('[data-proposal="prop_2"]') as HTMLElement;
  expect(stale.textContent).toContain("Out of date");
  const [first, second] = screen.getAllByRole("button", { name: "Accept" });
  expect(first).toBeEnabled();
  expect(second).toBeDisabled();
  fireEvent.click(first as HTMLElement);
  await waitFor(() => expect(onDecided).toHaveBeenCalled());
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/prop_1/accept"))).toBe(true);
});

it("waits for unsaved changes before accepting, and rejects", async () => {
  const calls = serve(routes);
  mount(true);
  await screen.findByText("Suggestions");
  for (const b of screen.getAllByRole("button", { name: "Accept" })) expect(b).toBeDisabled();
  expect(screen.getAllByText("Save or discard your changes first.")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0] as HTMLElement);
  await waitFor(() =>
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/prop_1/reject"))).toBe(true),
  );
});

it("accepts some of a suggestion's operations, with the diff following the choice", async () => {
  const calls = serve(
    {
      "/api/sites/site_1/proposals?nodeId=entry_1": {
        items: [
          {
            proposal: proposal("prop_3", {
              ops: [
                { op: "replaceText", block: "blk_aaaaaaaa", find: "First", replace: "Opening" },
                { op: "delete", block: "blk_bbbbbbbb" },
              ],
            }),
            steps: [
              { op: "replaceText", before: "First", after: "Opening" },
              { op: "delete", before: "Second." },
            ],
            diff: bodyDiff("First.\n\nSecond.\n", "Opening.\n"),
          },
        ],
      },
    },
    (call) =>
      call.url.endsWith("/prop_3/preview")
        ? { body: { diff: bodyDiff("First.\n\nSecond.\n", "Opening.\n\nSecond.\n") } }
        : undefined,
  );
  const onDecided = mount(false);
  const remove = await screen.findByRole("checkbox", { name: "Remove “Second.”" });
  expect(screen.getByRole("checkbox", { name: "Change “First” to “Opening”" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  fireEvent.click(screen.getByText("Remove “Second.”"));
  await waitFor(() => expect(remove).not.toBeChecked());
  const some = await screen.findByRole("button", { name: "Accept 1 of 2" });
  await waitFor(() => expect(some).toBeEnabled());
  const preview = calls.find((c) => c.url.endsWith("/prop_3/preview"));
  expect(preview?.body).toEqual({ ops: [0] });
  fireEvent.click(some);
  await waitFor(() => expect(onDecided).toHaveBeenCalled());
  const accept = calls.find((c) => c.url.endsWith("/prop_3/accept"));
  expect(accept?.body).toEqual({ ops: [0] });
});

it("shows nothing without suggestions", async () => {
  serve({ "/api/sites/site_1/proposals?nodeId=entry_1": { items: [] } });
  mount(false);
  await waitFor(() => expect(document.querySelector("[data-proposals]")).toBeNull());
});

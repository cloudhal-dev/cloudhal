import { bodyDiff } from "@cloudhal/core-ts/body-blocks";
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingApprovalsBanner } from "../src/components/PendingApprovalsBanner.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import type { Approval } from "../src/lib/api.ts";
import { ApprovalsPage } from "../src/routes/ApprovalsPage.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => navigate,
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

const agent = { kind: "agent" as const, id: "agent_news01", name: "Newsroom editor" };
const base = {
  siteId: "site_1",
  actor: agent,
  status: "pending" as const,
  createdAt: "2026-10-08T10:00:00Z",
  expiresAt: "2099-10-09T10:00:00Z",
};
const PUBLISH: Approval = {
  ...base,
  id: "appr_pub",
  tool: "publish",
  input: { siteId: "site_1", label: "<b>Sprint 7</b>" },
  prompt: 'Publish "<img src=x onerror=alert(1)>" to production?',
};
const UPDATE: Approval = {
  ...base,
  id: "appr_upd",
  tool: "update_page",
  input: { siteId: "site_1", pageId: "page_1" },
  prompt: "Update page About?",
};
const DENIED: Approval = {
  ...base,
  id: "appr_old",
  tool: "rollback",
  status: "denied",
  prompt: "Roll back?",
  decidedAt: "2026-10-08T10:05:00Z",
  decidedBy: "user_owner01",
};

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;

function serve(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init) ?? { status: 404, body: { error: "not_found", message: url } };
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Fixed list + configurable decision answer; site/snapshots for the publish approximation. */
function approvalsServer(decision: { status: number; body: unknown }) {
  return serve((url, init) => {
    if (url.startsWith("/api/sites/site_1/approvals?status=pending"))
      return { status: 200, body: { items: [PUBLISH, UPDATE] } };
    if (url === "/api/sites/site_1/approvals")
      return { status: 200, body: { items: [PUBLISH, UPDATE, DENIED] } };
    if (init?.method === "POST" && url.startsWith("/api/sites/site_1/approvals/")) return decision;
    if (url === "/api/me")
      return { status: 200, body: { actor: { kind: "human", id: "user_owner01" } } };
    if (url === "/api/sites/site_1")
      return { status: 200, body: { id: "site_1", publishedSnapshotId: "snap_live" } };
    if (url === "/api/sites/site_1/snapshots")
      return {
        status: 200,
        body: [
          { id: "snap_live", createdAt: "2026-10-01T00:00:00Z" },
          { id: "snap_new", createdAt: "2026-10-07T00:00:00Z" },
        ],
      };
    if (url === "/api/sites/site_1/snapshots/snap_live/diff/snap_new")
      return {
        status: 200,
        body: { added: [{}], changed: [{}, {}], removed: [] },
      };
    return undefined;
  });
}

const findRow = (container: HTMLElement, id: string) =>
  waitFor(() => {
    const row = container.querySelector(`[data-approval-id="${id}"]`);
    if (!row) throw new Error(`no row ${id}`);
    return row as HTMLElement;
  });

const posts = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
    .map((c) => c[0]);

beforeEach(() => navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApprovalsPage", () => {
  it("lists pending requests with the prompt as plain text, and decided ones in history", async () => {
    approvalsServer({ status: 200, body: {} });
    const { container } = render(wrap(<ApprovalsPage />));
    const pending = await screen.findByTestId("pending-approvals");
    await within(pending).findByText(PUBLISH.prompt);
    // Agent-controlled text is never parsed as markup.
    expect(container.querySelector("img")).toBeNull();
    expect(within(pending).getByText("Publish site")).toBeInTheDocument();
    expect(within(pending).getAllByText("Newsroom editor").length).toBeGreaterThan(0);
    const history = container.querySelector('[data-approval-id="appr_old"]') as HTMLElement;
    expect(history.querySelector("[data-status]")).toHaveAttribute("data-status", "denied");
    expect(within(history).getByText("by you")).toBeInTheDocument();
  });

  it("shows what an edit_body request changes, block by block", async () => {
    const EDIT: Approval = {
      ...base,
      id: "appr_body",
      tool: "edit_body",
      input: { siteId: "site_1", entryId: "entry_1", rev: 3, ops: [] },
      prompt: 'Edit the body of article "Launch"?',
      changes: {
        kind: "body",
        nodeId: "entry_1",
        title: "Launch",
        diff: bodyDiff("We launch soon.\n\nMore later.\n", "We launch today.\n\nMore later.\n"),
      },
    };
    serve((url) => {
      if (url.startsWith("/api/sites/site_1/approvals"))
        return { status: 200, body: { items: [EDIT] } };
      if (url === "/api/me")
        return { status: 200, body: { actor: { kind: "human", id: "user_owner01" } } };
      return undefined;
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_body");
    const changes = await waitFor(() => {
      const el = row.querySelector('[data-approval-changes="entry_1"]');
      if (!el) throw new Error("no changes");
      return el as HTMLElement;
    });
    expect(changes).toHaveTextContent("What approving changes in “Launch”");
    expect(changes.querySelector("ins")).toHaveTextContent("today.");
    expect(changes.querySelector("del")).toHaveTextContent("soon.");
  });

  it("approves a non-destructive request straight away", async () => {
    const fetch = approvalsServer({ status: 200, body: { ...UPDATE, status: "approved" } });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_upd");
    fireEvent.click(within(row).getByRole("button", { name: /approve/i }));
    await waitFor(() =>
      expect(posts(fetch)).toEqual(["/api/sites/site_1/approvals/appr_upd/approve"]),
    );
    expect(await screen.findByText("Request approved")).toBeInTheDocument();
  });

  it("denies without a confirmation", async () => {
    const fetch = approvalsServer({ status: 200, body: { ...PUBLISH, status: "denied" } });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_pub");
    fireEvent.click(within(row).getByRole("button", { name: /deny/i }));
    await waitFor(() =>
      expect(posts(fetch)).toEqual(["/api/sites/site_1/approvals/appr_pub/deny"]),
    );
  });

  it("confirms a publish: single use, approximate changes, then approves", async () => {
    const fetch = approvalsServer({ status: 200, body: { ...PUBLISH, status: "approved" } });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_pub");
    fireEvent.click(within(row).getByRole("button", { name: /approve/i }));
    const dialog = await screen.findByTestId("approve-dialog");
    expect(within(dialog).getByText(/Single use/)).toBeInTheDocument();
    expect(within(dialog).getByText(/approval is void/)).toBeInTheDocument();
    expect(await within(dialog).findByText("2 changed")).toBeInTheDocument();
    expect(within(dialog).getByText(/Approximate changes/)).toBeInTheDocument();
    expect(posts(fetch)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(posts(fetch)).toEqual(["/api/sites/site_1/approvals/appr_pub/approve"]),
    );
  });

  it("explains a request that is no longer pending (409) and refreshes the list", async () => {
    const fetch = approvalsServer({
      status: 409,
      body: { error: "conflict", message: "this request is expired; it can no longer be decided" },
    });
    const { container } = render(wrap(<ApprovalsPage />));
    const row = await findRow(container, "appr_upd");
    const listCalls = () =>
      fetch.mock.calls.filter((c) => c[0] === "/api/sites/site_1/approvals").length;
    const before = listCalls();
    fireEvent.click(within(row).getByRole("button", { name: /approve/i }));
    expect(await screen.findByText("This request is no longer pending")).toBeInTheDocument();
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it("explains a server without approvals instead of an error", async () => {
    serve(() => undefined);
    render(wrap(<ApprovalsPage />));
    expect(await screen.findByText("This server doesn't keep approvals")).toBeInTheDocument();
  });
});

describe("pending approval badges", () => {
  it("shows the count in a banner on the overview", async () => {
    approvalsServer({ status: 200, body: {} });
    render(wrap(<PendingApprovalsBanner siteId="site_1" />));
    const banner = await screen.findByTestId("pending-approvals-banner");
    expect(banner).toHaveTextContent("2 agent requests are waiting for your approval");
    fireEvent.click(within(banner).getByRole("button", { name: /review requests/i }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/sites/$siteId/approvals",
      params: { siteId: "site_1" },
    });
  });

  it("stays silent when nothing is pending or approvals are off", async () => {
    serve(() => undefined);
    const { container } = render(wrap(<PendingApprovalsBanner siteId="site_1" />));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector("[data-testid=pending-approvals-banner]")).toBeNull();
  });
});

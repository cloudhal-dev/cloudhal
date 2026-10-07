import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityDetailDialog } from "../src/components/ActivityDetailDialog.tsx";
import { Decision, ToolCell } from "../src/components/Audit.tsx";
import { CodeProvider } from "../src/components/CodeProvider.tsx";
import { CreateAgentKeyDialog } from "../src/components/CreateAgentKeyDialog.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";

function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>
        <CodeProvider>{children}</CodeProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("audit cells", () => {
  it("localises decisions and tool names, keeping the raw MCP name visible", () => {
    render(
      wrap(
        <>
          <Decision decision="approval-required" />
          <ToolCell tool="rollback" />
        </>,
        "tr",
      ),
    );
    expect(screen.getByText("Onay bekliyor").closest("[data-decision]")).toHaveAttribute(
      "data-decision",
      "approval-required",
    );
    expect(screen.getByText("Siteyi geri al")).toBeInTheDocument();
    expect(screen.getByText("rollback")).toBeInTheDocument();
  });
});

describe("CreateAgentKeyDialog", () => {
  it("validates, sends the chosen scopes and reveals the key exactly once", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "key_1",
          name: body.name,
          start: "abc123",
          scopes: body.scopes,
          createdAt: "2026-10-08T10:00:00Z",
          expiresAt: null,
          enabled: true,
          key: "abc123_secret_value",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const onOpenChange = vi.fn();
    render(wrap(<CreateAgentKeyDialog open onOpenChange={onOpenChange} endpoint="http://x/mcp" />));

    fireEvent.click(await screen.findByRole("button", { name: "Create key" }));
    expect(await screen.findByText("Give the key a name")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI bot" } });
    fireEvent.click(screen.getByText("Publish a snapshot to the live site"));
    expect(await screen.findByText("This key can ask to change the live site")).toBeInTheDocument();
    // Toggling a checkbox must never submit on its own.
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: "CI bot",
      scopes: ["site:read", "content:read", "site:publish"],
    });

    const reveal = await screen.findByTestId("key-reveal");
    expect(reveal).toHaveTextContent("You won't see this key again");
    expect(reveal.innerHTML).toContain("abc123_secret_value");
    fireEvent.click(screen.getByRole("button", { name: "I've stored the key" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ActivityDetailDialog", () => {
  it("explains a denial and shows the tool input", async () => {
    render(
      wrap(
        <ActivityDetailDialog
          siteId="site_1"
          onOpenChange={() => {}}
          row={{
            id: 8,
            at: "2026-10-08T10:00:00Z",
            actor: { kind: "agent", id: "agent_reader01", name: "Reader" },
            tool: "delete_page",
            decision: "deny",
            reason: "missing scope content:write",
            outcome: "error",
            snapshotId: "snap_1",
            input: { siteId: "site_1", pageId: "page_1" },
          }}
        />,
      ),
    );
    const detail = await screen.findByTestId("activity-detail");
    expect(detail).toHaveTextContent("missing scope content:write");
    expect(detail).toHaveTextContent('"pageId": "page_1"');
    expect(screen.getByRole("link", { name: /View changes/ })).toHaveAttribute(
      "href",
      "/sites/site_1/snapshots?diff=snap_1",
    );
  });
});

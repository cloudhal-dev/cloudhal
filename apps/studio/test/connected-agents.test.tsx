/**
 * RFC-0044 §4, §11 (Phase 3b): "Connected agents" on `/agents` and the "Connect by URL" setup.
 * A connection is named as the consent screen named it (a document client by its host first, a
 * self-registered one as not verified, a look-alike warned about), what it can do reads in words,
 * Disconnect revokes it, the admin view lists every member's; the setup tab shows the deployment's
 * `/mcp` URL and says where a client needs dynamic registration, or a public URL (Claude.ai and
 * ChatGPT connect from their servers). On phones a row's columns stack under the agent; jsdom
 * applies no CSS, so both copies render here and each check reads its own column (`data-cell`).
 */
import { TooltipProvider } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedAgents } from "../src/components/ConnectedAgents.tsx";
import { ConnectMcpCard } from "../src/components/ConnectMcpCard.tsx";
import type { AgentGrantSummary } from "../src/lib/api.ts";
import { isPublicMcpUrl, oauthClientStatus } from "../src/lib/oauth-clients.ts";
import { asRole, INSTANCE, on, serve, testQueryClient, wrap } from "./roles-fixtures.tsx";

const oauthAt = (resource: string) => ({
  status: 200,
  body: {
    ...INSTANCE,
    features: {
      ...INSTANCE.features,
      mcpOauth: true,
      mcpOauthClients: { resource, cimd: true, dcr: false },
    },
  },
});
const OAUTH = oauthAt("https://studio.example.com/mcp");
/** One column of a row (`GrantRow` renders a phone-only copy under the agent too). */
const cell = (row: HTMLElement, name: string) =>
  row.querySelector(`[data-cell="${name}"]`) as HTMLElement;

const GRANT: AgentGrantSummary = {
  id: "g1",
  agentId: "agent_g1",
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  clientName: "Claude Code",
  client: { kind: "document", host: "claude.ai" },
  scopes: ["site:read", "content:read", "content:write"],
  effectiveScopes: ["site:read", "content:read", "content:write:own"],
  mode: "edits",
  effectiveMode: "edits",
  createdAt: "2026-11-01T10:00:00.000Z",
  lastUsedAt: null,
};
const FAKE: AgentGrantSummary = {
  ...GRANT,
  id: "g2",
  agentId: "agent_g2",
  clientId: "dcr_client_1",
  clientName: "Claude",
  client: { kind: "self-registered", lookalike: "Claude" },
  effectiveScopes: ["site:read", "site:publish"],
  owner: { userId: "u-editor", name: "Eda Editor", role: "editor" },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = (node: React.ReactNode) => render(wrap(<TooltipProvider>{node}</TooltipProvider>));

describe("Connected agents", () => {
  it("names each connection as the consent screen did and disconnects with the revoke", async () => {
    const fetch = serve(
      on("GET", "/api/instance", OAUTH),
      ...asRole("author"),
      on("GET", "/api/agent-grants", { status: 200, body: [GRANT] }),
      on("DELETE", "/api/agent-grants/g1", { status: 204 }),
    );
    show(<ConnectedAgents />);
    const row = (await screen.findByText("Identified by claude.ai")).closest("tr") as HTMLElement;
    expect(row).toHaveAttribute("data-client-kind", "document");
    expect(within(row).getByText("Claude Code")).toBeInTheDocument();
    // What it can do, in words: one pill per group (its scopes in the tooltip), then its mode.
    const access = cell(row, "access");
    expect(within(access).getByText("Read")).toBeInTheDocument();
    expect(within(access).getByText("Write")).toBeInTheDocument();
    expect(within(access).queryByText("Publish and roll back")).toBeNull();
    expect(within(access).getByText("Edits")).toBeInTheDocument();
    expect(within(cell(row, "lastUsed")).getByText("Never")).toBeInTheDocument();
    // The phone copy stacks the same under the agent: access, then last use.
    const narrow = row.querySelector("[data-narrow]") as HTMLElement;
    expect(within(narrow).getByText("Write")).toBeInTheDocument();
    expect(within(narrow).getByText("Last used")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Disconnect Claude Code" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Claude Code" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([u, i]) =>
            String(u).endsWith("/api/agent-grants/g1") &&
            (i as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
  });

  it("lists every member's connections for an Administrator, a self-registered one as unverified", async () => {
    serve(
      on("GET", "/api/instance", OAUTH),
      ...asRole("administrator"),
      on("GET", "/api/agent-grants?all=1", { status: 200, body: [FAKE] }),
    );
    show(<ConnectedAgents all />);
    const row = (await screen.findByText("Self-registered, not verified")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("Claude")).toBeInTheDocument();
    expect(within(row).getByText("Looks like Claude, not verified as it")).toBeInTheDocument();
    expect(within(cell(row, "owner")).getByText("Eda Editor")).toBeInTheDocument();
    expect(within(cell(row, "access")).getByText("Publish and roll back")).toBeInTheDocument();
    // On phones the member stacks under the agent too.
    const narrow = row.querySelector("[data-narrow]") as HTMLElement;
    expect(within(narrow).getByText("Eda Editor")).toBeInTheDocument();
    expect(screen.getByText("Everyone's connected agents")).toBeInTheDocument();
  });

  it("stays out of the way where the server runs no OAuth and nothing is connected", async () => {
    serve(
      on("GET", "/api/instance", { status: 200, body: INSTANCE }),
      ...asRole("owner"),
      on("GET", "/api/agent-grants", { status: 200, body: [] }),
    );
    const qc = testQueryClient();
    const { container } = render(
      wrap(
        <TooltipProvider>
          <ConnectedAgents />
        </TooltipProvider>,
        "en",
        qc,
      ),
    );
    // Both answers in (OAuth off, nothing connected) before checking the card is absent.
    await waitFor(() => {
      expect(qc.getQueryState(["instance"])?.status).toBe("success");
      expect(qc.getQueryState(["agent-grants", "mine"])?.status).toBe("success");
    });
    expect(container.querySelector("#connected-agents")).toBeNull();
    expect(screen.queryByText("Connected agents")).toBeNull();
  });
});

describe("Connect by URL", () => {
  it("shows the /mcp URL and each client's steps, and says when a client needs DCR", async () => {
    serve(on("GET", "/api/instance", OAUTH), ...asRole("owner"));
    show(<ConnectMcpCard endpoint="https://studio.example.com/mcp" />);
    const setup = await screen.findByTestId("mcp-oauth-setup");
    expect(within(setup).getByText("https://studio.example.com/mcp")).toBeInTheDocument();
    expect(within(setup).getByText(/add a custom connector with this URL/)).toBeInTheDocument();
    // Cursor only registers itself; this server has DCR off.
    fireEvent.click(within(setup).getByRole("combobox"));
    const cursor = await screen.findByRole("option", { name: "Cursor" });
    fireEvent.pointerDown(cursor, { pointerType: "mouse" });
    fireEvent.click(cursor);
    expect(
      await within(setup).findByText(/registers itself \(dynamic client registration\)/),
    ).toBeInTheDocument();
    // The key tab stays.
    fireEvent.click(screen.getByRole("tab", { name: "With an agent key" }));
    expect(await screen.findByTestId("mcp-client-setup")).toBeInTheDocument();
  });

  it("starts on Claude Code and warns about hosted clients where /mcp is local", async () => {
    serve(on("GET", "/api/instance", oauthAt("http://localhost:8787/mcp")), ...asRole("owner"));
    show(<ConnectMcpCard endpoint="http://localhost:8787/mcp" />);
    const setup = await screen.findByTestId("mcp-oauth-setup");
    expect(setup).toHaveAttribute("data-client", "claudeCode");
    expect(setup).toHaveAttribute("data-status", "ok");
    // Claude.ai connects from its own servers: it cannot reach localhost.
    fireEvent.click(within(setup).getByRole("combobox"));
    const claudeAi = await screen.findByRole("option", { name: "Claude.ai, Desktop and mobile" });
    fireEvent.pointerDown(claudeAi, { pointerType: "mouse" });
    fireEvent.click(claudeAi);
    expect(
      await within(setup).findByText(/connect from their own servers, which cannot reach/),
    ).toBeInTheDocument();
    expect(within(setup).getByText(/--base-url/)).toBeInTheDocument();
    expect(setup).toHaveAttribute("data-status", "needsPublicUrl");
  });

  it("tells hosted clients from local ones by the /mcp URL", () => {
    const both = { cimd: true, dcr: true };
    for (const url of [
      "http://localhost:8787/mcp",
      "https://localhost/mcp",
      "https://studio.localhost/mcp",
      "https://127.0.0.1/mcp",
      "https://192.168.1.20/mcp",
      "https://10.0.0.5/mcp",
      "https://172.20.0.2/mcp",
      "https://[::1]/mcp",
      "https://[fd00::1]/mcp",
      "https://nas.local/mcp",
      "https://intranet/mcp",
      "http://studio.example.com/mcp",
      "not a url",
    ]) {
      expect(isPublicMcpUrl(url), url).toBe(false);
      expect(oauthClientStatus("claudeAi", { resource: url, ...both }), url).toBe("needsPublicUrl");
      expect(oauthClientStatus("codex", { resource: url, ...both }), url).toBe("needsPublicUrl");
      expect(oauthClientStatus("claudeCode", { resource: url, ...both }), url).toBe("ok");
    }
    for (const url of [
      "https://studio.example.com/mcp",
      "https://172.32.0.1/mcp",
      "https://[2001:db8::1]/mcp",
    ]) {
      expect(isPublicMcpUrl(url), url).toBe(true);
      expect(oauthClientStatus("claudeAi", { resource: url, ...both }), url).toBe("ok");
    }
  });

  it("shows only the key setup where OAuth is off", async () => {
    serve(...asRole("owner"));
    show(<ConnectMcpCard endpoint="https://studio.example.com/mcp" />);
    expect(await screen.findByTestId("mcp-client-setup")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Connect by URL" })).toBeNull();
  });
});

/**
 * RFC-0044 §4, §11 (Phase 3b): "Connected agents" on `/agents` and the "Connect by URL" setup.
 * A connection is named as the consent screen named it (a document client by its host first, a
 * self-registered one as not verified, a look-alike warned about), what it can do reads in words,
 * Disconnect revokes it, the admin view lists every member's; the setup tab shows the deployment's
 * `/mcp` URL and says where a client needs dynamic registration.
 */
import { TooltipProvider } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedAgents } from "../src/components/ConnectedAgents.tsx";
import { ConnectMcpCard } from "../src/components/ConnectMcpCard.tsx";
import type { AgentGrantSummary } from "../src/lib/api.ts";
import { asRole, INSTANCE, on, serve, wrap } from "./roles-fixtures.tsx";

const OAUTH = {
  status: 200,
  body: {
    ...INSTANCE,
    features: {
      ...INSTANCE.features,
      mcpOauth: true,
      mcpOauthClients: { resource: "https://studio.example.com/mcp", cimd: true, dcr: false },
    },
  },
};

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
    // What it can do, in words: one pill per group (its scopes in the tooltip).
    expect(within(row).getByText("Read")).toBeInTheDocument();
    expect(within(row).getByText("Write")).toBeInTheDocument();
    expect(within(row).queryByText("Publish and roll back")).toBeNull();
    expect(within(row).getByText("Never")).toBeInTheDocument();
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
    expect(within(row).getByText("Eda Editor")).toBeInTheDocument();
    expect(within(row).getByText("Publish and roll back")).toBeInTheDocument();
    expect(screen.getByText("Everyone's connected agents")).toBeInTheDocument();
  });

  it("stays out of the way where the server runs no OAuth and nothing is connected", async () => {
    serve(...asRole("owner"), on("GET", "/api/agent-grants", { status: 200, body: [] }));
    const { container } = show(<ConnectedAgents />);
    await waitFor(() => expect(container.querySelector("#connected-agents")).toBeNull());
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

  it("shows only the key setup where OAuth is off", async () => {
    serve(...asRole("owner"));
    show(<ConnectMcpCard endpoint="https://studio.example.com/mcp" />);
    expect(await screen.findByTestId("mcp-client-setup")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Connect by URL" })).toBeNull();
  });
});

/**
 * RFC-0044 §4: the consent screen. The requested scopes as the member's role turns them (one it
 * does not give is shown disabled and left out), the mode picker capped by role, and Approve /
 * Deny posting the signed request as it came.
 */
import { TooltipProvider } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentInfo } from "../src/lib/api.ts";
import { OAuthConsentPage } from "../src/routes/OAuthConsentPage.tsx";
import { asRole, bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

const SIGNED = "client_id=c1&scope=site%3Aread+content%3Awrite+site%3Apublish&sig=abc";
const INFO: ConsentInfo = {
  client: { id: "c1", name: "Claude Code", kind: "document", host: "claude.ai" },
  redirect: { host: "127.0.0.1:33418", loopback: true },
  loopbackOnly: true,
  scopes: [
    { requested: "site:read", granted: "site:read" },
    { requested: "content:write", granted: "content:draft:own" },
    { requested: "site:publish", granted: null },
  ],
  offlineAccess: true,
  modes: ["plan", "manual", "edits"],
  defaultMode: "edits",
};

describe("OAuth consent screen", () => {
  let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
  beforeEach(() => {
    window.history.replaceState(null, "", `/oauth/consent?${SIGNED}`);
    assign = vi.fn<(url: string | URL) => void>();
    vi.spyOn(window.location, "assign").mockImplementation(assign);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderPage = () =>
    render(
      wrap(
        <TooltipProvider>
          <OAuthConsentPage />
        </TooltipProvider>,
      ),
    );

  it("shows the client, narrows by role and approves with the kept scopes", async () => {
    const fetch = serve(
      ...asRole("contributor"),
      on("GET", "/api/agent-grants/consent", { status: 200, body: INFO }),
      on("POST", "/api/agent-grants/consent", {
        status: 200,
        body: { redirect: "http://127.0.0.1:33418/callback?code=x" },
      }),
    );
    renderPage();
    // The document's host is in the title and leads the identity, whatever the name says.
    expect(await screen.findByText("claude.ai: connect Claude Code")).toBeTruthy();
    expect(screen.getByText("Identified by claude.ai")).toBeTruthy();
    expect(screen.getByText(/Every address this agent can send you back to/)).toBeTruthy();
    // The signed request goes to the server untouched.
    const asked = fetch.mock.calls.find(([u]) => String(u).includes("/api/agent-grants/consent"));
    expect(String(asked?.[0])).toContain(`request=${encodeURIComponent(SIGNED)}`);
    const publish = screen.getByRole("checkbox", { name: /not in your role/ });
    expect(publish.getAttribute("aria-disabled") ?? publish.hasAttribute("disabled")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /content:draft:own/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("http://127.0.0.1:33418/callback?code=x"),
    );
    expect(bodyOf(fetch, "POST", "/api/agent-grants/consent")).toEqual({
      request: SIGNED,
      accept: true,
      scopes: ["site:read", "content:write"],
      mode: "edits",
    });
  });

  it("labels a self-registered client as not verified and warns about a well-known name", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/agent-grants/consent", {
        status: 200,
        body: {
          ...INFO,
          client: { id: "dcr1", name: "Claude", kind: "self-registered", lookalike: "Claude" },
          redirect: { host: "claude-ai.callback.example", loopback: false },
          loopbackOnly: false,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("Connect Claude")).toBeTruthy();
    expect(screen.getByText("Self-registered, not verified")).toBeTruthy();
    expect(screen.queryByText("Registered with this Studio")).toBeNull();
    expect(screen.getByText(/The name looks like Claude, but anyone can register/)).toBeTruthy();
    expect(screen.getByText("Sends you back to claude-ai.callback.example")).toBeTruthy();
  });

  it("shows a private-use redirect as an app on this computer, never as a web host", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/agent-grants/consent", {
        status: 200,
        body: {
          ...INFO,
          client: { id: "dcr2", name: "Cursor", kind: "self-registered" },
          redirect: { host: "", loopback: true, app: "cursor" },
          loopbackOnly: false,
        },
      }),
    );
    renderPage();
    expect(
      await screen.findByText("Sends you back to an app on this computer (cursor:)"),
    ).toBeTruthy();
    // Cursor registers itself under its own name: no look-alike warning for it.
    expect(screen.queryByText(/The name looks like/)).toBeNull();
  });

  it("asks for explicit consent before an Auto connection", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/agent-grants/consent", {
        status: 200,
        body: { ...INFO, modes: ["plan", "manual", "edits", "auto"] },
      }),
      on("POST", "/api/agent-grants/consent", {
        status: 200,
        body: { redirect: "http://127.0.0.1:33418/callback?code=x" },
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /Auto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByTestId("auto-confirm")).toBeTruthy();
    expect(bodyOf(fetch, "POST", "/api/agent-grants/consent")).toBeUndefined();
    fireEvent.click(
      within(screen.getByTestId("auto-confirm")).getByText(/can publish without my approval/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(bodyOf(fetch, "POST", "/api/agent-grants/consent")).toMatchObject({ mode: "auto" });
  });

  it("starts a step-up from what the connection may do today and marks what is new", async () => {
    const fetch = serve(
      ...asRole("editor"),
      on("GET", "/api/agent-grants/consent", {
        status: 200,
        body: {
          ...INFO,
          scopes: [
            { requested: "site:read", granted: "site:read" },
            { requested: "content:read", granted: "content:read" },
          ],
          existing: { scopes: ["site:read"], mode: "edits" },
        },
      }),
      on("POST", "/api/agent-grants/consent", {
        status: 200,
        body: { redirect: "http://127.0.0.1:33418/callback?code=x" },
      }),
    );
    renderPage();
    const added = await screen.findByRole("checkbox", { name: /\(new\)/ });
    expect(added.getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByRole("checkbox", { name: /\(new\)/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(bodyOf(fetch, "POST", "/api/agent-grants/consent")).toMatchObject({
      scopes: ["site:read"],
    });
  });

  it("denies without scopes", async () => {
    const fetch = serve(
      ...asRole("editor"),
      on("GET", "/api/agent-grants/consent", { status: 200, body: INFO }),
      on("POST", "/api/agent-grants/consent", {
        status: 200,
        body: { redirect: "http://127.0.0.1:33418/callback?error=access_denied" },
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Deny" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(bodyOf(fetch, "POST", "/api/agent-grants/consent")).toMatchObject({
      accept: false,
      scopes: [],
    });
  });

  it("explains an expired or changed request", async () => {
    serve(
      ...asRole("editor"),
      on("GET", "/api/agent-grants/consent", {
        status: 400,
        body: { error: "invalid_request", message: "this authorization request is invalid" },
      }),
    );
    renderPage();
    expect(await screen.findByText("This request can't be used")).toBeTruthy();
  });
});

/** RFC-0036 §5: Studio on a playground session — the session bar and the screens it leaves out. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundSessionBar } from "../src/components/PlaygroundSessionBar.tsx";
import { PlaygroundUnavailable } from "../src/components/PlaygroundUnavailable.tsx";
import { isPlaygroundBlockedPath, minutesLeft } from "../src/components/usePlayground.ts";
import { ApiRequestError, isNotEnabled } from "../src/lib/api/http.ts";
import { INSTANCE, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const playground = (expiresAt: string) => ({
  ...INSTANCE,
  features: {
    ...INSTANCE.features,
    playground: {
      expiresAt,
      resetUrl: "/_playground/reset",
      deployUrl: "https://example.test/deploy",
    },
  },
});

describe("playground helpers", () => {
  it("counts whole minutes left, never below zero", () => {
    const now = Date.parse("2026-10-20T18:00:00Z");
    expect(minutesLeft("2026-10-20T18:41:00Z", now)).toBe(41);
    expect(minutesLeft("2026-10-20T18:00:20Z", now)).toBe(1);
    expect(minutesLeft("2026-10-20T17:59:00Z", now)).toBe(0);
  });

  it("reads a playground refusal as a feature that is off", () => {
    const refusal = (status: number, error: string) =>
      new ApiRequestError(status, { error, message: "x" } as never);
    expect(isNotEnabled(refusal(403, "playground"))).toBe(true);
    expect(isNotEnabled(refusal(404, "not_found"))).toBe(true);
    expect(isNotEnabled(refusal(403, "forbidden"))).toBe(false);
  });

  it("knows the account screens a playground leaves out", () => {
    for (const p of ["/team", "/agents", "/agents/skills", "/account"])
      expect(isPlaygroundBlockedPath(p), p).toBe(true);
    for (const p of ["/sites", "/sites/s1/team", "/accounts-x"])
      expect(isPlaygroundBlockedPath(p), p).toBe(false);
  });
});

describe("PlaygroundSessionBar", () => {
  it("renders nothing outside a playground", async () => {
    const fetch = serve(on("GET", "/api/instance", { status: 200, body: INSTANCE }));
    render(wrap(<PlaygroundSessionBar />));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("playground-bar")).toBeNull();
  });

  it("shows the time left and Deploy, and Reset deletes the session", async () => {
    const expires = new Date(Date.now() + 41 * 60_000 + 30_000).toISOString();
    const fetch = serve(
      on("GET", "/api/instance", { status: 200, body: playground(expires) }),
      on("POST", "/_playground/reset", { status: 204 }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...globalThis.location, assign });
    render(wrap(<PlaygroundSessionBar />));
    expect(await screen.findByText(/41 minutes left/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Deploy to Cloudflare/ }).getAttribute("href")).toBe(
      "https://example.test/deploy",
    );
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(
      fetch.mock.calls.some(
        ([u, init]) => String(u) === "/_playground/reset" && init?.method === "POST",
      ),
    ).toBe(true);
  });
});

describe("PlaygroundUnavailable", () => {
  it("says where the screen works", () => {
    render(wrap(<PlaygroundUnavailable deployUrl="https://example.test/deploy" />));
    expect(screen.getByText("Available in your own install")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Deploy to Cloudflare/ })).toBeTruthy();
  });
});

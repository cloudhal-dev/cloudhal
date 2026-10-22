import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/index.tsx";
import { AuthRequestError } from "../src/lib/auth.ts";
import { AccountPage } from "../src/routes/AccountPage.tsx";
import { SiteSettingsPage } from "../src/routes/SiteSettingsPage.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => vi.fn(),
}));

const account = vi.hoisted(() => ({
  current: vi.fn(),
  sessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  changePassword: vi.fn(),
  updateName: vi.fn(),
}));
vi.mock("../src/lib/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/auth.ts")>()),
  account,
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

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
function serve(route: Route) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = route(url, init) ?? { status: 404, body: { error: "not_found", message: url } };
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const INSTANCE = {
  signUp: "first-user",
  features: {
    agentKeys: true,
    mcp: true,
    activity: true,
    previewLinks: false,
    deployTransfer: false,
  },
};

const SESSION = {
  id: "s1",
  token: "tok_current",
  createdAt: "2026-10-08T09:00:00Z",
  updatedAt: "2026-10-08T09:30:00Z",
  expiresAt: "2026-10-15T09:00:00Z",
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36",
};

beforeEach(() => {
  for (const fn of Object.values(account)) fn.mockReset();
  account.current.mockResolvedValue({
    user: {
      id: "u1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      createdAt: "2026-10-01T00:00:00Z",
    },
    session: SESSION,
  });
  account.sessions.mockResolvedValue([
    SESSION,
    { ...SESSION, id: "s2", token: "tok_other", userAgent: "curl/8.7.1", ipAddress: null },
  ]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const accountServer = () =>
  serve((url) => {
    if (url === "/api/instance") return { status: 200, body: INSTANCE };
    if (url === "/api/me")
      return { status: 200, body: { actor: { kind: "human", id: "user_u1aaaa", name: "Ada" } } };
    return undefined;
  });

describe("AccountPage", () => {
  it("validates the password change, then maps a wrong current password onto its field", async () => {
    accountServer();
    account.changePassword.mockRejectedValue(
      new AuthRequestError(400, "Invalid password", "INVALID_PASSWORD"),
    );
    render(wrap(<AccountPage />));
    const submit = await screen.findByRole("button", { name: "Change password" });
    fireEvent.click(submit);
    expect(await screen.findByText("Enter your current password")).toBeInTheDocument();
    expect(screen.getByText("Enter a new password")).toBeInTheDocument();
    expect(account.changePassword).not.toHaveBeenCalled();

    const [current, next, confirm] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[autocomplete$="password"]'),
    );
    fireEvent.change(current as HTMLInputElement, { target: { value: "old-password" } });
    fireEvent.change(next as HTMLInputElement, { target: { value: "new-password-1" } });
    fireEvent.change(confirm as HTMLInputElement, { target: { value: "new-password-2" } });
    fireEvent.click(submit);
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();

    fireEvent.change(confirm as HTMLInputElement, { target: { value: "new-password-1" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(account.changePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password-1",
        revokeOtherSessions: true,
      }),
    );
    expect(await screen.findByText("That isn't your current password")).toBeInTheDocument();
  });

  it("lists sessions with the current one marked and confirms signing another out", async () => {
    accountServer();
    account.revokeSession.mockResolvedValue({ status: true });
    const { container } = render(wrap(<AccountPage />));
    await waitFor(() =>
      expect(container.querySelector('[data-session-id="s1"]')).toHaveAttribute("data-current"),
    );
    expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out curl" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(account.revokeSession).toHaveBeenCalledWith("tok_other"));
  });

  it("asks for a fresh sign-in when the session list needs one", async () => {
    accountServer();
    account.sessions.mockRejectedValue(
      new AuthRequestError(403, "Session is not fresh", "SESSION_NOT_FRESH"),
    );
    render(wrap(<AccountPage />));
    expect(await screen.findByText("Sign in again to see your sessions")).toBeInTheDocument();
  });

  it("explains the sign-up policy and what the server runs", async () => {
    accountServer();
    const { container } = render(wrap(<AccountPage />));
    await waitFor(() =>
      expect(container.querySelector("[data-sign-up]")).toHaveAttribute(
        "data-sign-up",
        "first-user",
      ),
    );
    expect(screen.getByText("Owner only")).toBeInTheDocument();
    expect(container.querySelector('[data-feature="previewLinks"]')).toHaveAttribute(
      "data-enabled",
      "false",
    );
  });
});

const SITE = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Blog",
  slug: "blog",
  defaultLocale: "en",
  locales: ["en", "tr"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  rev: 3,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("SiteSettingsPage", () => {
  it("adds a pasted URL as the primary domain with a full-document PUT", async () => {
    const fetch = serve((url, init) => {
      if (url === "/api/instance") return { status: 200, body: INSTANCE };
      if (url === "/api/sites/site_1" && init?.method === "PUT")
        return { status: 200, body: { ...JSON.parse(String(init.body)), rev: 4 } };
      if (url === "/api/sites/site_1") return { status: 200, body: SITE };
      return undefined;
    });
    render(wrap(<SiteSettingsPage />));
    const input = await screen.findByPlaceholderText("www.example.com");
    fireEvent.change(input, { target: { value: "localhost:4321" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText(/Use a hostname like blog\.example\.com/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "https://Blog.Example.com/about" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      const put = fetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
      expect(put).toBeDefined();
      const body = JSON.parse(String((put?.[1] as RequestInit | undefined)?.body));
      expect(body.rev).toBe(3);
      expect(body.domains).toEqual([{ hostname: "blog.example.com", primary: true }]);
    });
  });

  it("explains a CAS conflict and offers the latest version", async () => {
    serve((url, init) => {
      if (url === "/api/instance") return { status: 200, body: INSTANCE };
      if (url === "/api/sites/site_1" && init?.method === "PUT")
        return { status: 409, body: { error: "conflict", message: "expected rev 3 but found 4" } };
      if (url === "/api/sites/site_1") return { status: 200, body: SITE };
      return undefined;
    });
    render(wrap(<SiteSettingsPage />));
    const name = await screen.findByDisplayValue("Blog");
    fireEvent.change(name, { target: { value: "Blog weekly" } });
    // Every settings section has its own save button: this one is the General section's.
    const general = document.getElementById("general") as HTMLElement;
    fireEvent.click(within(general).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This site changed somewhere else")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load latest/i })).toBeInTheDocument();
  });

  it("says when preview links are not enabled instead of offering a broken form", async () => {
    serve((url) => {
      if (url === "/api/instance") return { status: 200, body: INSTANCE };
      if (url === "/api/sites/site_1") return { status: 200, body: SITE };
      return undefined;
    });
    render(wrap(<SiteSettingsPage />));
    expect(
      await screen.findByText("Preview links aren't enabled on this server"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create link" })).toBeNull();
  });

  it("creates a preview link for a path and shows the token when there is no domain", async () => {
    const fetch = serve((url, init) => {
      if (url === "/api/instance")
        return {
          status: 200,
          body: { ...INSTANCE, features: { ...INSTANCE.features, previewLinks: true } },
        };
      if (url === "/api/sites/site_1") return { status: 200, body: SITE };
      if (url === "/api/sites/site_1/snapshots") return { status: 200, body: [] };
      if (url === "/api/sites/site_1/preview-links" && init?.method === "POST")
        return {
          status: 201,
          body: {
            token: "tok.sig",
            url: null,
            expiresAt: "2026-10-09T10:00:00Z",
            target: "live",
            path: "/blog",
          },
        };
      return undefined;
    });
    render(wrap(<SiteSettingsPage />));
    const path = await screen.findByPlaceholderText("blog/hello");
    fireEvent.change(path, { target: { value: "blog" } });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByTestId("preview-link");
    const post = fetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit | undefined)?.body))).toEqual({
      target: "live",
      path: "/blog",
      ttlSeconds: 86_400,
    });
    expect(screen.getByText("This site has no domain, so there's no full URL")).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteDetails } from "../src/lib/api.ts";
import { forgetHashToken, INVITE_TOKEN_PREFIX, RESET_TOKEN_PREFIX } from "../src/lib/roles.ts";
import { InvitePage } from "../src/routes/InvitePage.tsx";
import { ResetPasswordPage } from "../src/routes/ResetPasswordPage.tsx";
import { bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));
// Better Auth's client keeps its own fetch; the session is stubbed here instead.
let session: { user: { email: string } } | null = null;
vi.mock("../src/lib/auth.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/auth.ts")>();
  return {
    ...real,
    account: { ...real.account, current: async () => session },
    authClient: { ...real.authClient, signOut: async () => (session = null) },
  };
});

const TOKEN = "chinv_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcde";
const RESET = "chrst_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcde";
const DETAILS: InviteDetails = {
  email: "writer@example.com",
  role: "author",
  inviterName: "Halil",
  deploymentName: "Madraka",
  expiresAt: "2099-10-15T10:00:00Z",
  account: "new",
};

/** No one is signed in. */
const signedOut: Route = () => undefined;

beforeEach(() => {
  session = null;
  forgetHashToken(INVITE_TOKEN_PREFIX);
  forgetHashToken(RESET_TOKEN_PREFIX);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("/invite (RFC-0005 §7.3–7.4)", { timeout: 45_000 }, () => {
  it("strips the token from the URL at once and sends it only in POST bodies", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    const fetch = serve(
      signedOut,
      on("POST", "/api/invites/inspect", { status: 200, body: DETAILS }),
    );
    render(wrap(<InvitePage />));
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("chinv_");
    await screen.findByTestId("invite-form");
    expect(bodyOf(fetch, "POST", "/api/invites/inspect")).toEqual({ token: TOKEN });
    // the token never travels in a URL
    expect(fetch.mock.calls.every(([u]) => !String(u).includes("chinv_"))).toBe(true);
  });

  it("shows who invited whom as what, then creates the account and lands in Studio", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    const fetch = serve(
      signedOut,
      on("POST", "/api/invites/inspect", { status: 200, body: DETAILS }),
      on("POST", "/api/invites/accept", {
        status: 200,
        body: {
          user: { id: "u_new", actorId: "user_new", name: "Yeni", email: DETAILS.email },
          role: "author",
        },
      }),
    );
    render(wrap(<InvitePage />));
    const form = await screen.findByTestId("invite-form");
    expect(screen.getByText("Join Madraka")).toBeInTheDocument();
    expect(screen.getByText("Halil invited you as Author.")).toBeInTheDocument();
    expect(form.querySelector('[data-role="author"]')).toBeTruthy();
    const email = within(form).getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("writer@example.com");
    expect(email).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u) === "/api/invites/accept")).toBe(false);

    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "  Yeni   Yazar " } });
    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "correct horse battery" },
    });
    expect(form.querySelector("[data-strength]")).toHaveAttribute("data-strength", "strong");
    fireEvent.change(within(form).getByLabelText("Repeat the password"), {
      target: { value: "correct horse batterY" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Repeat the password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/sites" }));
    expect(bodyOf(fetch, "POST", "/api/invites/accept")).toEqual({
      token: TOKEN,
      password: "correct horse battery",
      name: "Yeni Yazar",
    });
  });

  it("asks an existing account for its password only", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    let tries = 0;
    const fetch = serve(
      signedOut,
      on("POST", "/api/invites/inspect", {
        status: 200,
        body: { ...DETAILS, account: "existing" },
      }),
      on("POST", "/api/invites/accept", () =>
        tries++ === 0
          ? { status: 403, body: { error: "wrong_password", message: "no" } }
          : { status: 200, body: { user: { id: "u", name: "A", email: "a" }, role: "author" } },
      ),
    );
    render(wrap(<InvitePage />));
    const form = await screen.findByTestId("invite-form");
    expect(form).toHaveAttribute("data-account", "existing");
    expect(screen.getByText("You already have an account")).toBeInTheDocument();
    expect(within(form).queryByLabelText("Name")).toBeNull();
    expect(within(form).queryByLabelText("Repeat the password")).toBeNull();
    fireEvent.change(within(form).getByLabelText("Password"), { target: { value: "oldpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    expect(
      await screen.findByText("That password isn't right for this account"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/sites" }));
    expect(bodyOf(fetch, "POST", "/api/invites/accept")).toEqual({
      token: TOKEN,
      password: "oldpassword",
    });
  });

  it("explains a used, revoked or expired link (410)", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    serve(
      signedOut,
      on("POST", "/api/invites/inspect", {
        status: 410,
        body: { error: "invite_gone", message: "gone" },
      }),
    );
    render(wrap(<InvitePage />));
    const dead = await screen.findByTestId("dead-link");
    expect(dead).toHaveTextContent("This invite can't be used");
    expect(within(dead).getByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("explains a link without its secret", async () => {
    window.history.replaceState(null, "", "/invite");
    const fetch = serve(signedOut);
    render(wrap(<InvitePage />));
    expect(await screen.findByTestId("dead-link")).toHaveTextContent("This link is incomplete");
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/invites"))).toBe(false);
  });

  it("refuses to accept while someone else is signed in", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    session = { user: { email: "other@example.com" } };
    serve(on("POST", "/api/invites/inspect", { status: 200, body: DETAILS }));
    render(wrap(<InvitePage />));
    expect(await screen.findByText("You're signed in as other@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("speaks Turkish", async () => {
    window.history.replaceState(null, "", `/invite#${TOKEN}`);
    serve(signedOut, on("POST", "/api/invites/inspect", { status: 200, body: DETAILS }));
    render(wrap(<InvitePage />, "tr"));
    expect(await screen.findByText("Madraka ekibine katıl")).toBeInTheDocument();
    expect(screen.getByText("Halil seni Yazar olarak davet etti.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daveti kabul et" })).toBeInTheDocument();
  });
});

describe("/reset-password (RFC-0005 open question 6)", { timeout: 45_000 }, () => {
  it("strips the token, inspects, sets the password and sends the person to sign in", async () => {
    window.history.replaceState(null, "", `/reset-password#${RESET}`);
    const fetch = serve(
      on("POST", "/api/password-reset/inspect", {
        status: 200,
        body: { name: "Ece", email: "ece@example.com", expiresAt: "2099-10-08T11:00:00Z" },
      }),
      on("POST", "/api/password-reset/complete", { status: 200, body: { ok: true } }),
    );
    render(wrap(<ResetPasswordPage />));
    expect(window.location.hash).toBe("");
    const form = await screen.findByTestId("reset-form");
    expect(screen.getByText("For Ece's account.")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText("Use at least 8 characters")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("New password"), {
      target: { value: "a much longer one" },
    });
    fireEvent.change(within(form).getByLabelText("Repeat the password"), {
      target: { value: "a much longer one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    const done = await screen.findByTestId("reset-done");
    expect(done).toHaveTextContent("You've been signed out everywhere.");
    expect(within(done).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(bodyOf(fetch, "POST", "/api/password-reset/complete")).toEqual({
      token: RESET,
      password: "a much longer one",
    });
  });

  it("explains a used or expired reset link (410)", async () => {
    window.history.replaceState(null, "", `/reset-password#${RESET}`);
    serve(
      on("POST", "/api/password-reset/inspect", {
        status: 410,
        body: { error: "reset_gone", message: "gone" },
      }),
    );
    render(wrap(<ResetPasswordPage />));
    expect(await screen.findByTestId("dead-link")).toHaveTextContent(
      "This reset link can't be used",
    );
  });
});

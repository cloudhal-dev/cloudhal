import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteDialog } from "../src/components/InviteDialog.tsx";
import { useMe } from "../src/components/useMe.ts";
import type { Invite, KeyNarrowing, Member } from "../src/lib/api.ts";
import { MembersPage } from "../src/routes/MembersPage.tsx";
import { asRole, bodyOf, NAMES, on, serve, USER_IDS, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
let search: Record<string, unknown> = {};
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useSearch: () => search,
  useParams: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
  search = {};
});

const member = (role: Member["role"], email = true): Member => ({
  userId: USER_IDS[role],
  actorId: `user_${role}`,
  name: NAMES[role],
  role,
  joinedAt: "2026-10-01T10:00:00Z",
  ...(email ? { email: `${role}@example.com` } : {}),
});
const MEMBERS = [member("editor"), member("owner"), member("administrator"), member("author")];
const INVITE: Invite = {
  id: "inv_1",
  email: "new@example.com",
  role: "author",
  status: "pending",
  delivery: "link",
  inviter: { userId: USER_IDS.owner, name: NAMES.owner },
  createdAt: "2026-10-08T10:00:00Z",
  // a fresh 7-day invite, a few seconds short of 7 days: it must read "in 7 days"
  expiresAt: new Date(Date.now() + 7 * 86_400_000 - 5_000).toISOString(),
  acceptedUserId: null,
  acceptedAt: null,
};

const rowOf = (userId: string) =>
  document.querySelector(`[data-member-id="${userId}"]`) as HTMLElement;
const openMenu = async (userId: string) => {
  fireEvent.click(within(rowOf(userId)).getByRole("button", { name: /Actions for/ }));
};
/** Kumo's Select (Base UI): a real mouse selection starts with a pointerdown on the option. */
async function choose(option: string) {
  const item = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(item, { pointerType: "mouse" });
  fireEvent.click(item);
}
async function pickOption(label: RegExp | string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  await choose(option);
}

describe("Team page (RFC-0005 §10.3)", { timeout: 45_000 }, () => {
  it("lists members Owner first with role badges and emails for Administrators", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [INVITE] } }),
    );
    render(wrap(<MembersPage />));
    // The first render of the file loads the lazy UI chunks; allow for a busy CI machine.
    await screen.findByText("owner@example.com", {}, { timeout: 15_000 });
    const rows = [...document.querySelectorAll("[data-member-id]")].map((r) =>
      r.getAttribute("data-role"),
    );
    expect(rows).toEqual(["owner", "administrator", "editor", "author"]);
    expect(within(rowOf(USER_IDS.owner)).getByText("You")).toBeInTheDocument();
    expect(rowOf(USER_IDS.editor).querySelector("[data-role]")).toHaveTextContent("Editor");
    // pending invites: email, role, inviter, re-invite and revoke
    const invite = await waitFor(() => {
      const el = document.querySelector('[data-invite-id="inv_1"]');
      if (!el) throw new Error("no invite row");
      return el as HTMLElement;
    });
    expect(invite).toHaveTextContent("new@example.com");
    expect(invite).toHaveTextContent("Author");
    expect(invite).toHaveTextContent("You");
    expect(invite).toHaveTextContent("in 7 days");
    fireEvent.click(
      within(invite).getByRole("button", { name: "Actions for the invite to new@example.com" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Re-invite" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Revoke" })).toBeInTheDocument();
  }, 60_000);

  it("shows an Editor names and roles only, with management disabled", async () => {
    const fetch = serve(
      ...asRole("editor"),
      on("GET", "/api/members", {
        status: 200,
        body: { items: MEMBERS.map((m) => ({ ...m, email: undefined })) },
      }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.author)).toBeTruthy());
    expect(screen.queryByText("author@example.com")).toBeNull();
    expect(
      within(rowOf(USER_IDS.author)).getByRole("button", { name: /Actions for/ }),
    ).toBeDisabled();
    // Editors may invite (Authors and Contributors only)
    expect(screen.getAllByRole("button", { name: "Invite people" })[0]).toBeEnabled();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/agent-keys?all=1"))).toBe(false);
  });

  it("changes a role and shows which agent keys were narrowed", async () => {
    const narrowed: KeyNarrowing[] = [
      {
        keyId: "key_1",
        name: "Desk",
        scopes: {
          from: ["content:write", "site:publish"],
          to: ["content:write:own", "site:publish:own"],
        },
        mode: { from: "auto", to: "auto" },
        elevationEnded: false,
      },
    ];
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
      on("PATCH", `/api/members/${USER_IDS.editor}`, {
        status: 200,
        body: { member: { ...member("editor"), role: "author" }, keysNarrowed: narrowed },
      }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.editor)).toBeTruthy());
    await openMenu(USER_IDS.editor);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change role…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Change Ece's role")).toBeInTheDocument();
    await pickOption("New role", "Author");
    // the Owner role is never offered (ownership moves by transfer)
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
    expect(await within(dialog).findByText("Their agent keys narrow too")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Change role" }));
    const list = await screen.findByTestId("keys-narrowed");
    expect(bodyOf(fetch, "PATCH", `/api/members/${USER_IDS.editor}`)).toEqual({ role: "author" });
    expect(list).toHaveTextContent("Agent keys narrowed: 1");
    expect(list.querySelector('[data-narrowed-key="key_1"]')).toHaveTextContent(
      "content:write:own",
    );
  });

  it("explains a rank refusal from the server in words", async () => {
    serve(
      ...asRole("administrator"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
      on("PATCH", `/api/members/${USER_IDS.author}`, {
        status: 403,
        body: { error: "rank", message: "no", details: { problem: "role_too_high" } },
      }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.author)).toBeTruthy());
    // An Administrator cannot act on the Owner or on themselves: the items say why
    await openMenu(USER_IDS.owner);
    expect(await screen.findByRole("menuitem", { name: "Change role…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await openMenu(USER_IDS.author);
    const items = await screen.findAllByRole("menuitem", { name: "Change role…" });
    fireEvent.click(items.at(-1) as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    await pickOption("New role", "Editor");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change role" }));
    expect(await within(dialog).findByText("Your role can't give this role.")).toBeInTheDocument();
  });

  it("removes a member with a summary of what happens and what happened", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", {
        status: 200,
        body: { items: [{ ...INVITE, inviter: { userId: USER_IDS.author, name: "Arda" } }] },
      }),
      (url) =>
        url === "/api/agent-keys?all=1"
          ? {
              status: 200,
              body: [
                {
                  id: "key_a",
                  name: "Arda's agent",
                  start: "ab",
                  scopes: ["content:read"],
                  createdAt: "2026-10-01T10:00:00Z",
                  expiresAt: null,
                  enabled: true,
                  mode: "edits",
                  owner: { userId: USER_IDS.author, name: "Arda", role: "author" },
                },
              ],
            }
          : undefined,
      on("GET", "/api/agent-keys", { status: 200, body: [] }),
      on("DELETE", `/api/members/${USER_IDS.author}`, {
        status: 200,
        body: {
          userId: USER_IDS.author,
          role: "author",
          keysDisabled: 1,
          invitesCanceled: 1,
          requestsDenied: 2,
        },
      }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.author)).toBeTruthy());
    await openMenu(USER_IDS.author);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from team…" }));
    const dialog = await screen.findByTestId("remove-member");
    await waitFor(() => expect(dialog).toHaveTextContent("Their agent keys are disabled: 1."));
    expect(dialog).toHaveTextContent("Their pending invites are cancelled: 1.");
    expect(dialog).toHaveTextContent("Requests their agents are waiting on are denied.");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Arda was removed")).toBeInTheDocument();
    expect(
      screen.getByText("Agent keys disabled: 1 · invites cancelled: 1 · requests denied: 2."),
    ).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, i]) => (i as RequestInit)?.method === "DELETE")).toBe(true);
  });

  it("creates a password reset link and shows it once", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
      on("POST", `/api/members/${USER_IDS.editor}/password-reset`, {
        status: 201,
        body: {
          url: "http://studio.test/reset-password#chrst_secret",
          expiresAt: "2099-10-08T11:00:00Z",
        },
      }),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.editor)).toBeTruthy());
    await openMenu(USER_IDS.editor);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create password reset link…" }));
    expect(await screen.findByText("It works once and expires in one hour.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    const reveal = await screen.findByTestId("reset-reveal");
    expect(reveal).toHaveTextContent("http://studio.test/reset-password#chrst_secret");
    expect(reveal).toHaveTextContent("You won't see this link again");
    fireEvent.click(screen.getByRole("button", { name: "I've copied the link" }));
    await waitFor(() => expect(screen.queryByText(/chrst_secret/)).toBeNull());
  });

  it("transfers ownership only to an Administrator, with the password", async () => {
    let attempts = 0;
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [] } }),
      on("POST", "/api/members/transfer-ownership", () =>
        attempts++ === 0
          ? {
              status: 403,
              body: { error: "wrong_password", message: "the password is not correct" },
            }
          : { status: 200, body: { from: USER_IDS.owner, to: USER_IDS.administrator } },
      ),
    );
    render(wrap(<MembersPage />));
    await waitFor(() => expect(rowOf(USER_IDS.editor)).toBeTruthy());
    // not offered for an Editor
    await openMenu(USER_IDS.editor);
    expect(await screen.findByRole("menuitem", { name: "Transfer ownership…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await openMenu(USER_IDS.administrator);
    const items = await screen.findAllByRole("menuitem", { name: "Transfer ownership…" });
    fireEvent.click(items.at(-1) as HTMLElement);
    const dialog = await screen.findByTestId("transfer-ownership");
    expect(dialog).toHaveTextContent("Ada becomes the Owner and you become an Administrator");
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByText("Enter your password")).toBeInTheDocument();
    expect(attempts).toBe(0);
    fireEvent.change(within(dialog).getByLabelText("Your password"), {
      target: { value: "wrong-one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByText("That password isn't right")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Your password"), {
      target: { value: "right-one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByText("Ownership transferred")).toBeInTheDocument();
    expect(bodyOf(fetch, "POST", "/api/members/transfer-ownership")).toEqual({
      userId: USER_IDS.administrator,
      password: "wrong-one",
    });
  });
});

/** The dialog alone (lighter than the whole page), opened once `/api/me` has answered. */
function InviteHarness() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  return (
    <>
      {me.data && (
        <button type="button" onClick={() => setOpen(true)}>
          Invite people
        </button>
      )}
      <InviteDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

describe("invite dialog (RFC-0005 §7)", { timeout: 45_000 }, () => {
  it("offers only the roles the inviter may give and shows the link exactly once", async () => {
    const fetch = serve(
      ...asRole("editor"),
      on("POST", "/api/invites", (init) => {
        const body = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            invite: { ...INVITE, email: body.email, role: body.role },
            url: "http://studio.test/invite#chinv_secret",
          },
        };
      }),
    );
    render(wrap(<InviteHarness />));
    fireEvent.click(await screen.findByRole("button", { name: "Invite people" }));
    const step = await screen.findByTestId("invite-step-details");
    // the explainer lists exactly the invitable roles
    const explained = [...step.querySelectorAll("[data-role-row]")].map((r) =>
      r.getAttribute("data-role-row"),
    );
    expect(explained).toEqual(["author", "contributor"]);
    fireEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    expect(await screen.findByText("Enter an email address")).toBeInTheDocument();
    fireEvent.change(within(step).getByLabelText("Email"), {
      target: { value: "Writer@Example.com" },
    });
    await pickOption("Role", "Contributor");
    expect(screen.queryByRole("option", { name: "Editor" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    const reveal = await screen.findByTestId("invite-reveal");
    expect(reveal).toHaveTextContent("http://studio.test/invite#chinv_secret");
    expect(reveal).toHaveTextContent("You won't see this link again");
    expect(bodyOf(fetch, "POST", "/api/invites")).toEqual({
      email: "writer@example.com",
      role: "contributor",
      expiresInHours: 168,
    });
    // closing forgets the link; reopening starts at step 1
    fireEvent.click(screen.getByRole("button", { name: "I've copied the link" }));
    await waitFor(() => expect(screen.queryByText(/chinv_secret/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Invite people" }));
    expect(await screen.findByTestId("invite-step-details")).toBeInTheDocument();
    expect(screen.queryByText(/chinv_secret/)).toBeNull();
  });

  it("caps an Administrator invite at 72 hours", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("POST", "/api/invites", {
        status: 201,
        body: { invite: { ...INVITE, role: "administrator" }, url: "http://x/invite#chinv_a" },
      }),
    );
    render(wrap(<InviteHarness />));
    fireEvent.click(await screen.findByRole("button", { name: "Invite people" }));
    const step = await screen.findByTestId("invite-step-details");
    fireEvent.change(within(step).getByLabelText("Email"), {
      target: { value: "boss@example.com" },
    });
    await pickOption("Role", "Administrator");
    expect(
      await within(step).findByText(/Administrator invites expire within 3 days/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: /Link expires after/ }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["1 hour", "1 day", "3 days"]);
    await choose("1 day");
    fireEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    await screen.findByTestId("invite-reveal");
    expect(bodyOf(fetch, "POST", "/api/invites")).toMatchObject({
      role: "administrator",
      expiresInHours: 24,
    });
  });

  it("revokes a pending invite after confirming", async () => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [INVITE] } }),
      on("DELETE", "/api/invites/inv_1", {
        status: 200,
        body: { invite: { ...INVITE, status: "canceled" } },
      }),
    );
    render(wrap(<MembersPage />));
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for the invite to new@example.com" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Revoke" }));
    expect(await screen.findByText("Revoke this invite?")).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Revoke" }).at(-1) as HTMLElement;
    fireEvent.click(confirm);
    expect(await screen.findByText("Invite revoked")).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([u, i]) => String(u) === "/api/invites/inv_1" && (i as RequestInit).method === "DELETE",
      ),
    ).toBe(true);
  });
});

describe("Team page in Turkish", { timeout: 45_000 }, () => {
  it("speaks Turkish, sen form", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/members", { status: 200, body: { items: MEMBERS } }),
      on("GET", "/api/invites", { status: 200, body: { items: [INVITE] } }),
    );
    render(wrap(<MembersPage />, "tr"));
    expect(await screen.findByRole("button", { name: "Kişi davet et" })).toBeInTheDocument();
    expect(await screen.findByText("Bekleyen davetler")).toBeInTheDocument();
    await waitFor(() =>
      expect(rowOf(USER_IDS.administrator).querySelector("[data-role]")).toHaveTextContent(
        "Yönetici",
      ),
    );
    expect(rowOf(USER_IDS.owner)).toHaveTextContent("Sen");
    expect(screen.getByText("Davetler nasıl çalışır")).toBeInTheDocument();
  });
});

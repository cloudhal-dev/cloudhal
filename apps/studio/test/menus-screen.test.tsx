import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMenuBadge, MenuDeleteNotice, UsedInMenusCard } from "../src/components/Menus.tsx";
import { SnapshotDiffDialog } from "../src/components/SnapshotDiffDialog.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { MenusOverview, ResolvedMenu } from "../src/lib/menus.ts";
import { NavigationPage } from "../src/routes/NavigationPage.tsx";
import { DATA } from "./menus-fixtures.ts";
import { CATEGORY, type Call, ITEMS, SITE, serve, TAG } from "./taxonomy-fixtures.ts";

const nav = vi.hoisted(() => ({ search: {} as Record<string, string>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", pageId: "page_about0001" }),
  useNavigate: () => nav.navigate,
  useSearch: () => nav.search,
}));

function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Toasty>{children}</Toasty>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

const about: MenuItem = { id: "item_about00001", kind: "page", pageId: "page_about0001" };
const gone: MenuItem = {
  id: "item_gone000001",
  kind: "page",
  pageId: "page_gone0000001",
  labels: { en: "Old team" },
};
const status: MenuItem = {
  id: "item_status0001",
  kind: "url",
  href: "https://status.example.com",
  labels: { en: "Status" },
};

function menu(items: MenuItem[], patch: Partial<Menu> = {}): Menu {
  return {
    schemaVersion: 1,
    id: "menu_primary001",
    siteId: "site_1",
    key: "primary",
    maxDepth: 3,
    items,
    rev: 2,
    createdAt: "2026-10-08T08:00:00Z",
    updatedAt: "2026-10-08T08:00:00Z",
    ...patch,
  };
}

const LIMITS = { maxDepth: 6, perLevel: 100, total: 500, labelLength: 100, ops: 50 };
const DEPTHS = { primary: 3, footer: 2, sidebar: 6, other: 3 };

function overview(menus: Menu[], derived = true): MenusOverview {
  return {
    menus: menus.map((m) => ({ menu: m, items: m.items.length, hidden: 0, depth: 1 })),
    derived: [
      ...(derived && !menus.some((m) => m.key === "primary")
        ? [
            {
              key: "primary",
              items: [
                {
                  id: "page_about0001",
                  kind: "page" as const,
                  label: "About",
                  href: "/about",
                  external: false,
                  newTab: false,
                  children: [],
                },
              ],
            },
          ]
        : []),
      ...(menus.some((m) => m.key === "footer") ? [] : [{ key: "footer", items: [] }]),
    ],
    wellKnown: ["primary", "footer"],
    limits: LIMITS,
    defaultDepth: DEPTHS,
  };
}

/** The server's resolution, simplified: a page that does not exist is hidden (`missing`). */
function resolve(input: MenuItem[]): ResolvedMenu {
  let shown = 0;
  let hidden = 0;
  const one = (i: MenuItem): ResolvedMenu["items"][number] => {
    const missing = i.kind === "page" && !DATA.pages.some((p) => p.id === i.pageId);
    if (missing) hidden++;
    else shown++;
    const page = i.kind === "page" ? DATA.pages.find((p) => p.id === i.pageId) : undefined;
    return {
      id: i.id,
      kind: i.kind,
      state: missing ? "hidden" : "shown",
      ...(missing ? { reason: "missing" as const } : {}),
      label: (i.labels?.en as string | undefined) ?? page?.title ?? "",
      labelSource: i.labels?.en ? "item" : "target",
      ...(page ? { href: page.path } : i.kind === "url" ? { href: i.href } : {}),
      external: i.kind === "url",
      newTab: false,
      children: (i.children ?? []).map(one),
    };
  };
  const items = input.map(one);
  return { key: "primary", menuId: "menu_primary001", locale: "en", items, shown, hidden };
}

function routes(m: Menu[], can = true, extra: Record<string, unknown> = {}) {
  return {
    "/api/me": {
      actor: { kind: "human", id: "user_1", name: "Halil" },
      can: { "structure.write": can },
    },
    "/api/sites/site_1": { ...SITE, pageIds: ["page_home00001", "page_about0001"] } as Site,
    "/api/sites/site_1/taxonomies": [CATEGORY, TAG],
    "/api/sites/site_1/terms": { items: ITEMS },
    "/api/sites/site_1/pages": DATA.pages,
    "/api/sites/site_1/entries": DATA.entries,
    "/api/sites/site_1/menus": overview(m),
    ...extra,
  };
}

/** Writes: the preview resolves what it gets; saves echo the menu with the next rev. */
function writes(current: () => Menu | undefined) {
  return (call: Call) => {
    if (call.url.endsWith("/menus/preview")) {
      const wanted = call.body?.menus as { key: string; items?: MenuItem[] }[];
      return {
        body: {
          locale: "en",
          menus: wanted.map((w) => {
            const items = w.items ?? (w.key === "primary" ? current()?.items : undefined);
            if (!items) return { key: w.key, derived: true, navigation: [] };
            const resolved = resolve(items);
            return { key: w.key, derived: false, resolved, navigation: [] };
          }),
        },
      };
    }
    if (call.method === "PUT") {
      const m = current() as Menu;
      return {
        body: {
          menu: { ...m, ...(call.body as object), rev: m.rev + 1 },
          delta: {
            before: 0,
            after: 0,
            added: [],
            removed: [],
            moved: [],
            changed: [],
            changes: 1,
          },
          snapshot: { id: "snap_1" },
        },
      };
    }
    return undefined;
  };
}

const row = (id: string) =>
  document.querySelector(`[role="treeitem"][data-item-id="${id}"]`) as HTMLElement;
const rowIds = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map((r) => r.getAttribute("data-item-id"));

beforeEach(() => {
  nav.search = {};
  nav.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Navigation: without a menu", () => {
  it("shows today's derived header and creates a menu from current pages after a preview", async () => {
    const calls = serve(routes([]), (call) => {
      if (call.url.endsWith("/menus/preview"))
        return {
          body: {
            locale: "en",
            menus: [
              { key: "primary", derived: true, navigation: [] },
              { key: "footer", derived: true, navigation: [] },
            ],
          },
        };
      if (call.url.endsWith("/menus/from-pages") && call.body?.dryRun)
        return {
          body: {
            menu: menu([about]),
            categories: 1,
            delta: {
              before: 0,
              after: 1,
              added: [],
              removed: [],
              moved: [],
              changed: [],
              changes: 1,
            },
            resolved: resolve(
              call.body?.categories
                ? [about, { id: "item_news000001", kind: "term", termId: "term_news0001" }]
                : [about],
            ),
          },
        };
      if (call.url.endsWith("/menus/from-pages"))
        return {
          status: 201,
          body: { menu: menu([about]), delta: {}, snapshot: { id: "snap_1" } },
        };
      return undefined;
    });
    render(wrap(<NavigationPage />));
    expect(await screen.findByText("Current header")).toBeInTheDocument();
    expect(rowIds()).toEqual(["page_about0001"]);
    expect(screen.getByText("Page /about")).toBeInTheDocument();
    // Nothing is written before the person sees the items.
    fireEvent.click(screen.getByTestId("from-pages"));
    const dialog = await screen.findByTestId("from-pages-dialog");
    await within(dialog).findByTestId("from-pages-items");
    expect(within(dialog).getByText("About")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Include top-level categories (1)" }),
    );
    await waitFor(() =>
      expect(
        calls.filter((c) => c.url.endsWith("/from-pages") && c.body?.categories === true),
      ).toHaveLength(1),
    );
    expect(calls.filter((c) => c.url.endsWith("/from-pages") && !c.body?.dryRun)).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId("from-pages-confirm")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("from-pages-confirm"));
    await waitFor(() =>
      expect(calls.find((c) => c.url.endsWith("/from-pages") && !c.body?.dryRun)?.body).toEqual({
        key: "primary",
        categories: true,
      }),
    );
  });
});

describe("Navigation: the menu editor", () => {
  it("shows items with target chips, the fallback label hint, and hidden items with a reason and a fix", async () => {
    let current = menu([about, gone, status]);
    serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() =>
      expect(rowIds()).toEqual(["item_about00001", "item_gone000001", "item_status0001"]),
    );
    expect(within(row("item_about00001")).getByText("from the page title")).toBeInTheDocument();
    expect(within(row("item_about00001")).getByText("Page /about")).toBeInTheDocument();
    expect(
      within(row("item_status0001")).getByText("External status.example.com ↗"),
    ).toBeInTheDocument();
    // The deleted page: hidden, with a reason and a fix.
    const badge = await within(row("item_gone000001")).findByText("Hidden: page deleted");
    expect(badge.closest("[data-hidden-reason]")).toHaveAttribute("data-hidden-reason", "missing");
    expect(screen.getByTestId("hidden-banner")).toHaveTextContent("1 item is hidden on your site");
    expect(screen.getByTestId("save-menu")).toBeDisabled();
    // Fix → choose another target: the dialog says the old one is gone.
    fireEvent.click(within(row("item_gone000001")).getByTestId("fix-item"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose another target…" }));
    expect(await screen.findByTestId("menu-item-target-gone")).toHaveTextContent(
      "The page this item linked to was deleted.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Fix → remove.
    fireEvent.click(within(row("item_gone000001")).getByTestId("fix-item"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(rowIds()).toEqual(["item_about00001", "item_status0001"]));
    expect(screen.getByTestId("save-menu")).not.toBeDisabled();
    current = { ...current };
  });

  it("reorders with Alt+arrows, announces it, then saves after showing the delta: one PUT with rev", async () => {
    const current = menu([about, status]);
    const calls = serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    act(() => row("item_status0001").focus());
    fireEvent.keyDown(row("item_status0001"), { key: "ArrowUp", altKey: true });
    expect(rowIds()).toEqual(["item_status0001", "item_about00001"]);
    expect(document.querySelector("[data-menu-tree-live]")).toHaveTextContent(
      "Status moved: position 1 of 2, top level.",
    );
    expect(document.activeElement).toBe(row("item_status0001"));
    fireEvent.click(screen.getByTestId("save-menu"));
    const dialog = await screen.findByTestId("menu-save-dialog");
    expect(screen.getByText("Save Header (primary)")).toBeInTheDocument();
    expect(screen.getByText("1 change · 2 → 2 items")).toBeInTheDocument();
    const lines = within(dialog).getByTestId("menu-delta");
    expect(lines.querySelector('[data-delta-sign="↕"]')).toHaveTextContent(
      // A swap of two: the longest common subsequence keeps one in place (menuDelta).
      "“About” (title): position 1 → 2",
    );
    expect(within(dialog).getByTestId("one-snapshot")).toHaveTextContent(
      "One change, one snapshot. It goes live with the next publish.",
    );
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("menu-save-confirm"));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
    const put = calls.find((c) => c.method === "PUT") as Call;
    expect(put.url).toBe("/api/sites/site_1/menus/menu_primary001");
    expect(put.body).toEqual({ rev: 2, maxDepth: 3, items: [status, about] });
  });

  it("keeps the depth limit: indent is refused and explained; counters show the limits", async () => {
    const current = menu([about, status], { maxDepth: 1 });
    serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    fireEvent.keyDown(row("item_status0001"), { key: "ArrowRight", altKey: true });
    expect(rowIds()).toEqual(["item_about00001", "item_status0001"]);
    expect(document.querySelector("[data-menu-tree-live]")).toHaveTextContent(
      "Status can't go deeper: this menu has at most 1 levels.",
    );
    expect(screen.getByTestId("menu-count")).toHaveTextContent("2 / 500");
    expect(screen.getByTestId("menu-fullest")).toHaveTextContent("2 / 100");
    // The row menu shows the indent as disabled.
    fireEvent.click(
      within(row("item_status0001")).getByRole("button", { name: "More actions for Status" }),
    );
    const indent = await screen.findByRole("menuitem", { name: "Move under the item above" });
    expect(indent).toHaveAttribute("aria-disabled", "true");
  });

  it("refuses to save an empty group and says why", async () => {
    const group = {
      id: "item_group00001",
      kind: "group",
      labels: { en: "More" },
    } as unknown as MenuItem;
    const current = menu([about]);
    serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() => expect(rowIds()).toHaveLength(1));
    // Add a group through the dialog.
    fireEvent.click(screen.getByTestId("add-menu-item"));
    const dialog = await screen.findByTestId("menu-item-dialog");
    const combo = within(within(dialog).getByTestId("target-picker")).getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.input(combo, { target: { value: "Group" } });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /Group \(no link\)/ }));
    // A group needs a label in the default locale.
    fireEvent.click(screen.getByTestId("menu-item-apply"));
    expect(await within(dialog).findByText("Enter a label.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Label/ }), {
      target: { value: "More" },
    });
    fireEvent.click(screen.getByTestId("menu-item-apply"));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    fireEvent.click(screen.getByTestId("save-menu"));
    expect(await screen.findByTestId("menu-problem")).toHaveTextContent(
      "“More” is a group with nothing in it. Add an item under it or remove it.",
    );
    expect(screen.queryByTestId("menu-save-dialog")).toBeNull();
    expect(group.kind).toBe("group");
  });

  it("the target picker groups targets; labels fall back to the title; external links are validated", async () => {
    const current = menu([about]);
    serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() => expect(rowIds()).toHaveLength(1));
    fireEvent.click(screen.getByTestId("add-menu-item"));
    const dialog = await screen.findByTestId("menu-item-dialog");
    const combo = within(within(dialog).getByTestId("target-picker")).getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    // Groups: pages, articles, categories, tags…, collections, other.
    for (const group of ["Pages", "Articles", "Categories", "Collections", "Other"])
      expect(await screen.findByText(group)).toBeInTheDocument();
    fireEvent.input(combo, { target: { value: "Pricing" } });
    fireEvent.click(await screen.findByRole("option", { name: /Pricing/ }));
    // A draft target: hidden until published; the label falls back to its title.
    expect(await within(dialog).findByTestId("menu-item-hidden-hint")).toHaveTextContent(
      "This is a draft. The item stays hidden on your site until it's published.",
    );
    const label = within(dialog).getByRole("textbox", { name: /Label/ });
    expect(label).toHaveAttribute("placeholder", "Pricing");
    expect(
      within(dialog).getByText("Leave empty to show the page title, so renames carry over."),
    ).toBeInTheDocument();

    // Switch to an external link: https only, the host is shown, new tab is opt-in.
    fireEvent.focus(combo);
    fireEvent.input(combo, { target: { value: "External" } });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /External link/ }));
    const href = await within(dialog).findByTestId("menu-item-href");
    const input = href.tagName === "INPUT" ? href : (href.querySelector("input") as HTMLElement);
    fireEvent.change(input, { target: { value: "http://status.example.com" } });
    fireEvent.blur(input);
    expect(
      await within(dialog).findByText("Use https://. Plain http:// links aren't allowed in menus."),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "https://status.example.com" } });
    expect(
      await within(dialog).findByText("Visitors leave for status.example.com."),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Open in a new tab" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Label/ }), {
      target: { value: "Status" },
    });
    fireEvent.click(screen.getByTestId("menu-item-apply"));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    const added = document.querySelectorAll('[role="treeitem"]')[1] as HTMLElement;
    expect(within(added).getByText("External status.example.com ↗")).toBeInTheDocument();
  });

  it("is read-only for people below Editor: no drag handles, no Save, no Add", async () => {
    const current = menu([about, status]);
    serve(
      routes([current], false),
      writes(() => current),
    );
    render(wrap(<NavigationPage />));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    expect(await screen.findByTestId("menus-read-only")).toHaveTextContent(
      "You can look, but not change",
    );
    expect(screen.queryByTestId("save-menu")).toBeNull();
    expect(screen.queryByTestId("add-menu-item")).toBeNull();
    expect(screen.queryByTestId("new-menu")).toBeNull();
    expect(row("item_about00001")).toHaveAttribute("draggable", "false");
  });

  it("speaks Turkish", async () => {
    const current = menu([about, gone]);
    serve(
      routes([current]),
      writes(() => current),
    );
    render(wrap(<NavigationPage />, "tr"));
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    expect(screen.getAllByText("Menüler").length).toBeGreaterThan(0);
    expect(screen.getByText("Üst menü öğeleri")).toBeInTheDocument();
    expect(await screen.findByText("Gizli: sayfa silinmiş")).toBeInTheDocument();
    expect(screen.getByText("sayfa başlığından")).toBeInTheDocument();
    expect(screen.getByTestId("save-menu")).toHaveTextContent("Menüyü kaydet");
  });
});

describe("Used in menus", () => {
  it("lists the items that link to a page, linking to the item in the editor", async () => {
    serve({
      "/api/sites/site_1/menus/references?kind=page&id=page_about0001": {
        items: [
          {
            menuId: "menu_primary001",
            key: "primary",
            items: [{ id: "item_about00001", label: "About", labelSource: "target" }],
          },
        ],
      },
      "/api/sites/site_1/menus/references?kind=contentEntry&id=entry_hello001": { items: [] },
    });
    render(wrap(<UsedInMenusCard siteId="site_1" kind="page" id="page_about0001" />));
    const link = await screen.findByRole("link", { name: "About" });
    expect(link).toHaveAttribute(
      "href",
      "/sites/site_1/navigation?menu=primary&item=item_about00001",
    );
    expect(screen.getByText("Header (primary)")).toBeInTheDocument();
    cleanup();
    render(wrap(<UsedInMenusCard siteId="site_1" kind="contentEntry" id="entry_hello001" />));
    expect(await screen.findByText("Not in any menu")).toBeInTheDocument();
  });

  it("marks pages that a menu links to in the pages list", () => {
    render(wrap(<InMenuBadge keys={["primary", "footer"]} />));
    expect(screen.getByTestId("in-menu-badge")).toHaveTextContent("In menu");
    cleanup();
    render(wrap(<InMenuBadge keys={undefined} />));
    expect(screen.queryByTestId("in-menu-badge")).toBeNull();
  });

  it("warns in the delete dialog that the item will be hidden and flagged", () => {
    render(
      wrap(
        <MenuDeleteNotice
          kind="page"
          refs={[
            {
              menuId: "menu_primary001",
              key: "primary",
              items: [{ id: "item_about00001", label: "About", labelSource: "target" }],
            },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("menu-delete-notice")).toHaveTextContent("A menu links to this page");
    expect(screen.getByTestId("menu-delete-notice")).toHaveTextContent(
      "Header (primary): “About”. After you delete it they stay in the menu, hidden on your site and flagged in Navigation until you fix them.",
    );
    cleanup();
    render(wrap(<MenuDeleteNotice kind="page" refs={[]} />));
    expect(screen.queryByTestId("menu-delete-notice")).toBeNull();
  });
});

describe("Snapshot diff: menus", () => {
  it("names a menu row by its place and shows the delta summary", async () => {
    serve({
      "/api/sites/site_1": SITE,
      "/api/sites/site_1/pages": [],
      "/api/sites/site_1/entries": [],
      "/api/sites/site_1/taxonomies": [],
      "/api/sites/site_1/redirects": [],
      "/api/sites/site_1/snapshots/snap_1/diff/snap_2?assignments=1&menus=1": {
        added: [],
        removed: [],
        changed: [
          {
            before: { kind: "menu", id: "menu_primary001", rev: 1, hash: "a" },
            after: { kind: "menu", id: "menu_primary001", rev: 2, hash: "b" },
          },
        ],
        menus: [
          {
            menuId: "menu_primary001",
            key: "primary",
            change: "changed",
            added: 2,
            removed: 1,
            moved: 1,
            changed: 0,
            before: 3,
            after: 4,
          },
        ],
      },
    });
    render(
      wrap(
        <SnapshotDiffDialog
          siteId="site_1"
          snapshot={{
            schemaVersion: 1,
            id: "snap_2",
            parentId: "snap_1",
            siteId: "site_1",
            siteRev: 2,
            reason: "manual",
            actor: { kind: "human", id: "user_1" },
            nodes: [],
            summary: { added: 0, changed: 1, removed: 0 },
            createdAt: "2026-10-08T09:00:00Z",
          }}
          publishedSnapshotId={undefined}
          onOpenChange={() => {}}
        />,
      ),
    );
    const rowEl = await screen.findByText("Header (primary)");
    const tr = rowEl.closest("[data-node-id]") as HTMLElement;
    expect(within(tr).getByText("Menu")).toBeInTheDocument();
    expect(within(tr).getByTestId("menu-delta-summary")).toHaveTextContent("+2 −1 ↕1 ~0");
    expect(within(tr).getByTestId("menu-delta-summary")).toHaveTextContent("3 → 4 items");
    expect(rowEl.closest("a")).toHaveAttribute("href", "/sites/site_1/navigation?menu=primary");
  });
});

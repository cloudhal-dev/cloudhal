import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DirectionProvider,
  MenuTree,
  type MenuTreeEvent,
  type MenuTreeItem,
  type MenuTreeMove,
  NavigationPreview,
  type NavigationPreviewLabels,
} from "../src/index.ts";

afterEach(cleanup);

const leaf = (id: string, label = id): MenuTreeItem => ({ id, label });

/** Applies a move like `applyMenuOps` does: take the item out, insert it at the index. */
function applyMove(items: MenuTreeItem[], move: MenuTreeMove): MenuTreeItem[] {
  let taken: MenuTreeItem | undefined;
  const without = (list: MenuTreeItem[]): MenuTreeItem[] =>
    list
      .filter((i) => {
        if (i.id === move.itemId) {
          taken = i;
          return false;
        }
        return true;
      })
      .map((i) => (i.children ? { ...i, children: without(i.children) } : i));
  const rest = without(items);
  if (!taken) return items;
  const insert = (list: MenuTreeItem[]): MenuTreeItem[] => {
    if (move.parentId === null) {
      const next = [...list];
      next.splice(move.index, 0, taken as MenuTreeItem);
      return next;
    }
    return list.map((i) => {
      if (i.id === move.parentId) {
        const children = [...(i.children ?? [])];
        children.splice(move.index, 0, taken as MenuTreeItem);
        return { ...i, children };
      }
      return i.children ? { ...i, children: insert(i.children) } : i;
    });
  };
  return insert(rest);
}

const announce = (e: MenuTreeEvent): string => {
  switch (e.type) {
    case "blocked":
      return `blocked ${e.label}: ${e.reason} (max ${e.maxDepth})`;
    case "drop-refused":
      return `refused ${e.label}: ${e.reason}`;
    default:
      return `${e.type} ${e.label}: ${e.position} of ${e.total}, level ${e.level}${e.parentLabel ? ` under ${e.parentLabel}` : ""}`;
  }
};

function Harness({
  initial,
  maxDepth = 3,
  onMove,
  onEdit,
  onRemove,
}: {
  initial: MenuTreeItem[];
  maxDepth?: number;
  onMove?: (m: MenuTreeMove) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [items, setItems] = useState(initial);
  return (
    <MenuTree
      items={items}
      maxDepth={maxDepth}
      onMove={(m) => {
        onMove?.(m);
        setItems((cur) => applyMove(cur, m));
      }}
      {...(onEdit ? { onEdit } : {})}
      {...(onRemove ? { onRemove } : {})}
      labels={{
        tree: "Header items",
        instructions: "Use arrow keys",
        expand: (l) => `Expand ${l}`,
        collapse: (l) => `Collapse ${l}`,
      }}
      announce={announce}
      actions={(ctx) => (
        <span data-testid={`ctx-${ctx.item.id}`} data-can-indent={String(ctx.canIndent)}>
          {ctx.indentBlocked ?? ""}
        </span>
      )}
    />
  );
}

const rows = () =>
  screen
    .getAllByRole("treeitem")
    .map((r) => `${r.getAttribute("data-depth")}:${r.getAttribute("data-item-id")}`);
const row = (id: string) =>
  document.querySelector(`[role="treeitem"][data-item-id="${id}"]`) as HTMLElement;
const live = () => document.querySelector("[data-menu-tree-live]")?.textContent;
const key = (id: string, k: string, alt = false) =>
  act(() => {
    fireEvent.keyDown(row(id), { key: k, altKey: alt });
  });

describe("MenuTree", () => {
  const tree = (): MenuTreeItem[] => [
    leaf("home", "Home"),
    { id: "docs", label: "Docs", children: [leaf("guide", "Guide"), leaf("api", "API")] },
    leaf("blog", "Blog"),
  ];

  it("is a WAI-ARIA tree: levels, set sizes, positions, expanded state, one tab stop", () => {
    render(<Harness initial={tree()} />);
    const t = screen.getByRole("tree", { name: "Header items" });
    expect(t).toHaveAccessibleDescription("Use arrow keys");
    expect(rows()).toEqual(["1:home", "1:docs", "2:guide", "2:api", "1:blog"]);
    expect(row("docs")).toHaveAttribute("aria-expanded", "true");
    expect(row("home")).not.toHaveAttribute("aria-expanded");
    expect(row("api")).toHaveAttribute("aria-level", "2");
    expect(row("api")).toHaveAttribute("aria-setsize", "2");
    expect(row("api")).toHaveAttribute("aria-posinset", "2");
    const tabbable = screen.getAllByRole("treeitem").filter((r) => r.tabIndex === 0);
    expect(tabbable.map((r) => r.getAttribute("data-item-id"))).toEqual(["home"]);
  });

  it("arrow keys move focus; Right/Left expand, collapse and step in and out", () => {
    render(<Harness initial={tree()} />);
    row("home").focus();
    key("home", "ArrowDown");
    expect(document.activeElement).toBe(row("docs"));
    key("docs", "ArrowLeft");
    expect(row("docs")).toHaveAttribute("aria-expanded", "false");
    expect(rows()).toEqual(["1:home", "1:docs", "1:blog"]);
    key("docs", "ArrowRight");
    expect(rows()).toHaveLength(5);
    key("docs", "ArrowRight");
    expect(document.activeElement).toBe(row("guide"));
    key("guide", "ArrowLeft");
    expect(document.activeElement).toBe(row("docs"));
    key("docs", "End");
    expect(document.activeElement).toBe(row("blog"));
    key("blog", "Home");
    expect(document.activeElement).toBe(row("home"));
  });

  it("Alt+arrows reorder, indent and outdent, keep focus on the item and announce each move", () => {
    const onMove = vi.fn();
    render(<Harness initial={tree()} onMove={onMove} />);
    row("blog").focus();
    key("blog", "ArrowUp", true);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: null, index: 1 });
    expect(rows()).toEqual(["1:home", "1:blog", "1:docs", "2:guide", "2:api"]);
    expect(document.activeElement).toBe(row("blog"));
    expect(live()).toBe("moved Blog: 2 of 3, level 1");

    // Indent under the previous sibling (Home), as its last child.
    key("blog", "ArrowRight", true);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: "home", index: 0 });
    expect(rows()).toEqual(["1:home", "2:blog", "1:docs", "2:guide", "2:api"]);
    expect(live()).toBe("indented Blog: 1 of 1, level 2 under Home");
    expect(document.activeElement).toBe(row("blog"));

    // Outdent: right after its parent.
    key("blog", "ArrowLeft", true);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: null, index: 1 });
    expect(live()).toBe("outdented Blog: 2 of 3, level 1");

    // Edges are announced, not silently ignored.
    key("home", "ArrowUp", true);
    expect(live()).toBe("blocked Home: first (max 3)");
    key("home", "ArrowRight", true);
    expect(live()).toBe("blocked Home: no-previous (max 3)");
    key("home", "ArrowLeft", true);
    expect(live()).toBe("blocked Home: top-level (max 3)");
  });

  it("swaps Left and Right in right-to-left languages (ADR-0033)", () => {
    const onMove = vi.fn();
    render(
      <DirectionProvider direction="rtl">
        <Harness initial={tree()} onMove={onMove} />
      </DirectionProvider>,
    );
    row("docs").focus();
    // Right closes and Left opens: the tree's children sit towards the left.
    key("docs", "ArrowRight");
    expect(row("docs")).toHaveAttribute("aria-expanded", "false");
    key("docs", "ArrowLeft");
    expect(row("docs")).toHaveAttribute("aria-expanded", "true");
    key("docs", "ArrowLeft");
    expect(document.activeElement).toBe(row("guide"));
    key("guide", "ArrowRight");
    expect(document.activeElement).toBe(row("docs"));

    // Alt+Left nests under the item above, Alt+Right moves it out.
    row("blog").focus();
    key("blog", "ArrowLeft", true);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: "docs", index: 2 });
    expect(live()).toBe("indented Blog: 3 of 3, level 2 under Docs");
    key("blog", "ArrowRight", true);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: null, index: 2 });
    expect(live()).toBe("outdented Blog: 3 of 3, level 1");
  });

  it("refuses an indent beyond maxDepth, counting the item's own subtree", () => {
    const onMove = vi.fn();
    const items: MenuTreeItem[] = [
      leaf("a", "A"),
      { id: "b", label: "B", children: [leaf("b1", "B1")] },
    ];
    render(<Harness initial={items} maxDepth={2} onMove={onMove} />);
    // B has a child: indenting B would put B1 at level 3.
    expect(screen.getByTestId("ctx-b")).toHaveAttribute("data-can-indent", "false");
    expect(screen.getByTestId("ctx-b")).toHaveTextContent("depth");
    key("b", "ArrowRight", true);
    expect(onMove).not.toHaveBeenCalled();
    expect(live()).toBe("blocked B: depth (max 2)");
    // B1 cannot go under nothing; A alone can be indented? It has no previous sibling.
    expect(screen.getByTestId("ctx-a")).toHaveTextContent("no-previous");
  });

  it("Enter edits and Delete removes; keys inside a row's controls are left alone", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(<Harness initial={tree()} onEdit={onEdit} onRemove={onRemove} />);
    key("docs", "Enter");
    expect(onEdit).toHaveBeenCalledWith("docs");
    key("api", "Delete");
    expect(onRemove).toHaveBeenCalledWith("api");
    const control = within(row("home")).getByTestId("ctx-home");
    fireEvent.keyDown(control, { key: "Delete" });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("pointer drops before, after and inside rows; refuses drops into the item's own subtree or too deep", () => {
    const onMove = vi.fn();
    render(<Harness initial={tree()} onMove={onMove} maxDepth={2} />);
    const rect = (top: number) => ({
      top,
      bottom: top + 40,
      height: 40,
      left: 0,
      right: 400,
      width: 400,
      x: 0,
      y: top,
      toJSON() {},
    });
    for (const [i, id] of ["home", "docs", "guide", "api", "blog"].entries())
      row(id).getBoundingClientRect = () => rect(i * 40) as DOMRect;
    const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
    const drag = (from: string, to: string, y: number) => {
      fireEvent.dragStart(row(from), { dataTransfer });
      for (const make of [createEvent.dragOver, createEvent.drop]) {
        const ev = make(row(to), { dataTransfer });
        Object.defineProperty(ev, "clientY", { value: y });
        fireEvent(row(to), ev);
      }
    };
    // Blog onto the upper edge of Home: before it.
    drag("blog", "home", 2);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "blog", parentId: null, index: 0 });
    for (const [i, id] of ["blog", "home", "docs", "guide", "api"].entries())
      row(id).getBoundingClientRect = () => rect(i * 40) as DOMRect;
    // Home into the middle of Docs: its last child.
    drag("home", "docs", 100);
    expect(onMove).toHaveBeenLastCalledWith({ itemId: "home", parentId: "docs", index: 2 });
    expect(live()).toBe("moved Home: 3 of 3, level 2 under Docs");
    onMove.mockClear();
    // Docs into its own child: refused.
    for (const [i, id] of ["blog", "docs", "guide", "api", "home"].entries())
      row(id).getBoundingClientRect = () => rect(i * 40) as DOMRect;
    drag("docs", "guide", 100);
    expect(onMove).not.toHaveBeenCalled();
    expect(live()).toBe("refused Docs: inside-itself");
    // Blog inside Guide would sit at level 3 of a 2-level menu.
    drag("blog", "guide", 100);
    expect(onMove).not.toHaveBeenCalled();
    expect(live()).toBe("refused Blog: depth");
  });

  it("read-only trees have no drag handles and ignore Alt moves", () => {
    const onMove = vi.fn();
    render(
      <MenuTree
        items={tree()}
        maxDepth={3}
        onMove={onMove}
        readOnly
        labels={{ tree: "T", instructions: "", expand: (l) => l, collapse: (l) => l }}
        announce={announce}
      />,
    );
    expect(row("home")).toHaveAttribute("draggable", "false");
    key("blog", "ArrowUp", true);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("NavigationPreview", () => {
  const labels: NavigationPreviewLabels = {
    header: "Header preview",
    footer: "Footer preview",
    defaultFooter: "RSS",
    credit: "Built with Cloudhal",
    empty: "No items are shown",
    menu: "Menu",
    newTab: "(opens in a new tab)",
    toggle: (l) => `Show items under ${l}`,
  };
  const header = [
    {
      id: "a",
      label: "About",
      href: "/about",
      current: "page" as const,
      inTrail: true,
      children: [],
    },
    {
      id: "d",
      label: "Docs",
      children: [{ id: "g", label: "Guide", href: "/docs/guide", children: [] }],
    },
    {
      id: "s",
      label: "Status",
      href: "https://status.example.com",
      external: true,
      newTab: true,
      children: [],
    },
  ];

  it("renders the header with the current item, dropdowns and external links, and the footer", () => {
    render(<NavigationPreview siteName="Demo" header={header} labels={labels} />);
    const head = screen.getByRole("region", { name: "Header preview" });
    expect(within(head).getByText("About").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(head).getByText("(opens in a new tab)")).toBeInTheDocument();
    expect(screen.queryByTestId("navigation-preview-dropdown")).toBeNull();
    fireEvent.click(within(head).getByRole("button", { name: "Show items under Docs" }));
    expect(screen.getByTestId("navigation-preview-dropdown")).toHaveTextContent("Guide");
    // No footer menu: the theme's own footer.
    expect(screen.getByRole("region", { name: "Footer preview" })).toHaveTextContent(
      "Built with CloudhalRSS",
    );
  });

  it("shows an empty menu as such, and stacks the header on phones", () => {
    render(
      <NavigationPreview
        siteName="Demo"
        header={header}
        footer={[]}
        device="mobile"
        labels={labels}
      />,
    );
    expect(screen.getByTestId("navigation-preview")).toHaveAttribute("data-device", "mobile");
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Footer preview" })).toHaveTextContent(
      "No items are shown",
    );
  });
});

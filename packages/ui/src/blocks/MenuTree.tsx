import { Button, cn, Text } from "@cloudflare/kumo";
import { useDirection } from "@cloudflare/kumo/primitives/direction-provider";
import { CaretDown, CaretRight, DotsSixVertical } from "@phosphor-icons/react";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { DirectionalIcon } from "./DirectionalIcon.tsx";
import { readingKey } from "./reading-keys.ts";

/** One row of the tree, with its children in display order. */
export interface MenuTreeItem {
  id: string;
  /** The text the row shows (the item's label, or the fallback it renders with). */
  label: string;
  /** The label is a fallback (the target's title): shown muted, followed by `hint`. */
  muted?: boolean;
  /** A short note after a muted label, e.g. "from page title". */
  hint?: ReactNode;
  /** What the item links to (a target chip). */
  meta?: ReactNode;
  /** A state badge, e.g. "Hidden: page deleted". */
  status?: ReactNode;
  children?: MenuTreeItem[];
}

/** A move in `applyMenuOps` terms: the item is taken out, then inserted at `index` under `parentId`. */
export interface MenuTreeMove {
  itemId: string;
  /** `null`: top level. */
  parentId: string | null;
  index: number;
}

/** Why a keyboard move did not happen. */
export type MenuTreeBlock = "first" | "last" | "no-previous" | "top-level" | "depth" | "size";

/** What the live region says; the screen words it (`announce`). */
export type MenuTreeEvent =
  | {
      type: "moved" | "indented" | "outdented";
      label: string;
      /** 1-based position among the new siblings, and how many there are. */
      position: number;
      total: number;
      /** 1 for the top level. */
      level: number;
      /** The new parent's label; absent at the top level. */
      parentLabel?: string;
    }
  | { type: "blocked"; label: string; reason: MenuTreeBlock; maxDepth: number }
  | {
      type: "drop-refused";
      label: string;
      reason: "depth" | "size" | "inside-itself";
      maxDepth: number;
    };

export interface MenuTreeLabels {
  /** The tree's accessible name ("Header items"). */
  tree: string;
  /** Keyboard help under the tree, also its description. */
  instructions: string;
  /** Accessible name of the expand/collapse button. */
  expand: (label: string) => string;
  collapse: (label: string) => string;
}

/** What a row's actions need: its place and the moves the block would make. */
export interface MenuTreeRowContext {
  item: MenuTreeItem;
  /** 1 for the top level. */
  depth: number;
  index: number;
  siblings: number;
  parentId: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  /** Why indenting is not possible (`depth`: the menu's `maxDepth` would be exceeded). */
  indentBlocked?: MenuTreeBlock;
  moveUp: () => void;
  moveDown: () => void;
  indent: () => void;
  outdent: () => void;
}

export interface MenuTreeProps {
  items: MenuTreeItem[];
  /** Deepest level an item may sit at (top level = 1). Indents and drops beyond it are refused. */
  maxDepth: number;
  /** Most items one level may hold (default 100). */
  perLevel?: number;
  onMove: (move: MenuTreeMove) => void;
  /** Enter or F2 on a row. */
  onEdit?: (id: string) => void;
  /** Delete or Backspace on a row. */
  onRemove?: (id: string) => void;
  /** Trailing controls of a row (edit, the row menu). */
  actions?: (ctx: MenuTreeRowContext) => ReactNode;
  labels: MenuTreeLabels;
  /** Words every move for screen readers (polite live region). */
  announce: (event: MenuTreeEvent) => string;
  /** Moves focus to this row when it changes (a new item, a deep link). */
  focusId?: string | undefined;
  /** No moves, no drag handles (people without the right to edit). */
  readOnly?: boolean;
  className?: string;
}

interface Row {
  item: MenuTreeItem;
  depth: number;
  index: number;
  siblings: number;
  parentId: string | null;
  hasChildren: boolean;
}

interface Located {
  item: MenuTreeItem;
  parentId: string | null;
  index: number;
  depth: number;
  siblings: MenuTreeItem[];
}

function locateAll(items: MenuTreeItem[]): Map<string, Located> {
  const out = new Map<string, Located>();
  const go = (list: MenuTreeItem[], depth: number, parentId: string | null) => {
    list.forEach((item, index) => {
      out.set(item.id, { item, parentId, index, depth, siblings: list });
      if (item.children?.length) go(item.children, depth + 1, item.id);
    });
  };
  go(items, 1, null);
  return out;
}

/** Levels the item and its subtree occupy (1 for a leaf). */
function height(item: MenuTreeItem): number {
  return 1 + Math.max(0, ...(item.children ?? []).map(height));
}

function contains(item: MenuTreeItem, id: string): boolean {
  return (item.children ?? []).some((c) => c.id === id || contains(c, id));
}

type DropPlace = "before" | "after" | "inside";
interface Drop {
  targetId: string;
  place: DropPlace;
  ok: boolean;
  reason?: "depth" | "size" | "inside-itself";
}

/**
 * Alt with an arrow moves the focused row. Keys are read in the reading order (`readingKey`):
 * in right-to-left languages Alt+Left nests and plain Left opens a row.
 */
const ALT_MOVES: Record<string, "moveUp" | "moveDown" | "indent" | "outdent"> = {
  ArrowUp: "moveUp",
  ArrowDown: "moveDown",
  ArrowRight: "indent",
  ArrowLeft: "outdent",
};

/**
 * The navigation menu editor's tree (RFC-0003 §8, DESIGN.md §2t): Kumo rows in the WAI-ARIA tree
 * pattern. Keyboard first — arrows move focus (Right/Left expand, collapse and step in and out),
 * `Alt+↑/↓` reorder among siblings, `Alt+→/←` indent under the previous sibling and outdent,
 * Enter edits, Delete removes — and every move is announced in a polite live region. Pointer drag
 * and drop is an enhancement on top: drop indicators before, after or inside a row, refused beyond
 * `maxDepth`, past `perLevel` or into the item's own subtree. Controlled: moves are reported with
 * `onMove`, the screen applies them.
 */
export function MenuTree({
  items,
  maxDepth,
  perLevel = 100,
  onMove,
  onEdit,
  onRemove,
  actions,
  labels,
  announce,
  focusId,
  readOnly = false,
  className,
}: MenuTreeProps) {
  const direction = useDirection();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<string | undefined>(focusId);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState<string | undefined>();
  const [drop, setDrop] = useState<Drop | undefined>();
  const refs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | undefined>(undefined);
  const located = useMemo(() => locateAll(items), [items]);
  const locatedRef = useRef(located);
  locatedRef.current = located;

  const rows = useMemo(() => {
    const out: Row[] = [];
    const go = (list: MenuTreeItem[], depth: number, parentId: string | null) => {
      list.forEach((item, index) => {
        const hasChildren = (item.children?.length ?? 0) > 0;
        out.push({ item, depth, index, siblings: list.length, parentId, hasChildren });
        if (hasChildren && !collapsed.has(item.id))
          go(item.children as MenuTreeItem[], depth + 1, item.id);
      });
    };
    go(items, 1, null);
    return out;
  }, [items, collapsed]);

  // Roving tabindex: the active row is the one Tab lands on; it falls back to the first row.
  const current = active && rows.some((r) => r.item.id === active) ? active : rows[0]?.item.id;

  useEffect(() => {
    if (focusId) {
      pendingFocus.current = focusId;
      setActive(focusId);
      // Open the ancestors so the row exists.
      setCollapsed((prev) => {
        let cursor = locatedRef.current.get(focusId)?.parentId;
        if (!cursor) return prev;
        const next = new Set(prev);
        while (cursor) {
          next.delete(cursor);
          cursor = locatedRef.current.get(cursor)?.parentId ?? null;
        }
        return next;
      });
    }
  }, [focusId]);

  // After a move (or a focus request) the row re-renders elsewhere: keep focus on it.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = refs.current.get(id);
    if (el) {
      pendingFocus.current = undefined;
      el.focus();
    }
  });

  const say = useCallback((event: MenuTreeEvent) => setMessage(announce(event)), [announce]);

  /** Applies a move, then announces where the item landed. */
  const commit = useCallback(
    (move: MenuTreeMove, type: "moved" | "indented" | "outdented") => {
      const at = located.get(move.itemId);
      if (!at) return;
      const parent = move.parentId ? located.get(move.parentId) : undefined;
      const newSiblings = move.parentId ? (parent?.item.children ?? []) : items;
      const total = newSiblings.filter((s) => s.id !== move.itemId).length + 1;
      if (move.parentId)
        setCollapsed((prev) => {
          if (!prev.has(move.parentId as string)) return prev;
          const next = new Set(prev);
          next.delete(move.parentId as string);
          return next;
        });
      pendingFocus.current = move.itemId;
      setActive(move.itemId);
      onMove(move);
      say({
        type,
        label: at.item.label,
        position: move.index + 1,
        total,
        level: parent ? parent.depth + 1 : 1,
        ...(parent ? { parentLabel: parent.item.label } : {}),
      });
    },
    [items, located, onMove, say],
  );

  const contextFor = useCallback(
    (row: Row): MenuTreeRowContext => {
      const { item, index, siblings, parentId, depth } = row;
      const prev =
        index > 0 ? (located.get(item.id)?.siblings[index - 1] as MenuTreeItem) : undefined;
      let indentBlocked: MenuTreeBlock | undefined;
      if (!prev) indentBlocked = "no-previous";
      else if (depth + height(item) > maxDepth) indentBlocked = "depth";
      else if ((prev.children?.length ?? 0) >= perLevel) indentBlocked = "size";
      const parent = parentId ? located.get(parentId) : undefined;
      const outdentRoom = parent ? parent.siblings.length < perLevel : false;
      const block = (reason: MenuTreeBlock) =>
        say({ type: "blocked", label: item.label, reason, maxDepth });
      return {
        item,
        depth,
        index,
        siblings,
        parentId,
        canMoveUp: index > 0,
        canMoveDown: index < siblings - 1,
        canIndent: indentBlocked === undefined,
        canOutdent: parent !== undefined && outdentRoom,
        ...(indentBlocked ? { indentBlocked } : {}),
        moveUp: () =>
          index > 0
            ? commit({ itemId: item.id, parentId, index: index - 1 }, "moved")
            : block("first"),
        moveDown: () =>
          index < siblings - 1
            ? commit({ itemId: item.id, parentId, index: index + 1 }, "moved")
            : block("last"),
        indent: () => {
          if (indentBlocked || !prev) return block(indentBlocked ?? "no-previous");
          commit(
            { itemId: item.id, parentId: prev.id, index: prev.children?.length ?? 0 },
            "indented",
          );
        },
        outdent: () => {
          if (!parent) return block("top-level");
          if (!outdentRoom) return block("size");
          commit(
            { itemId: item.id, parentId: parent.parentId, index: parent.index + 1 },
            "outdented",
          );
        },
      };
    },
    [located, maxDepth, perLevel, commit, say],
  );

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      const isOpen = !prev.has(id);
      if (open ?? !isOpen) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setActive(id);
    refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, row: Row, i: number) => {
    // Keys typed into a row's own controls (buttons, menus) are theirs.
    if (e.target !== e.currentTarget) return;
    const key = readingKey(e.key, direction);
    const id = row.item.id;
    const ctx = contextFor(row);
    const expanded = row.hasChildren && !collapsed.has(id);
    let handled = true;
    if (e.altKey && !readOnly) {
      const move = ALT_MOVES[key];
      if (move) ctx[move]();
      else handled = false;
    } else if (key === "ArrowDown") focusRow(rows[i + 1]?.item.id);
    else if (key === "ArrowUp") focusRow(rows[i - 1]?.item.id);
    else if (key === "Home") focusRow(rows[0]?.item.id);
    else if (key === "End") focusRow(rows.at(-1)?.item.id);
    else if (key === "ArrowRight") {
      if (row.hasChildren && !expanded) toggle(id, true);
      else if (expanded) focusRow(rows[i + 1]?.item.id);
    } else if (key === "ArrowLeft") {
      if (expanded) toggle(id, false);
      else focusRow(row.parentId ?? undefined);
    } else if ((key === "Enter" || key === "F2") && onEdit) onEdit(id);
    else if ((key === "Delete" || key === "Backspace") && onRemove && !readOnly) onRemove(id);
    else handled = false;
    if (handled) e.preventDefault();
  };

  // ---- pointer drag and drop (an enhancement over the keyboard moves) ----

  const dropFor = (target: Row, place: DropPlace): Drop => {
    const dragged = dragging ? located.get(dragging) : undefined;
    if (!dragged) return { targetId: target.item.id, place, ok: false };
    const base = { targetId: target.item.id, place };
    if (target.item.id === dragged.item.id || contains(dragged.item, target.item.id))
      return { ...base, ok: false, reason: "inside-itself" };
    const parentId = place === "inside" ? target.item.id : target.parentId;
    const depth = place === "inside" ? target.depth + 1 : target.depth;
    if (depth + height(dragged.item) - 1 > maxDepth) return { ...base, ok: false, reason: "depth" };
    const siblings =
      place === "inside"
        ? (target.item.children ?? [])
        : parentId
          ? (located.get(parentId)?.item.children ?? [])
          : items;
    if (siblings.filter((s) => s.id !== dragged.item.id).length >= perLevel)
      return { ...base, ok: false, reason: "size" };
    return { ...base, ok: true };
  };

  const placeOf = (e: DragEvent<HTMLDivElement>): DropPlace => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
    return ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
  };

  const finishDrop = (d: Drop) => {
    const dragged = dragging ? located.get(dragging) : undefined;
    const target = located.get(d.targetId);
    setDragging(undefined);
    setDrop(undefined);
    if (!dragged || !target) return;
    if (!d.ok) {
      say({
        type: "drop-refused",
        label: dragged.item.label,
        reason: d.reason ?? "depth",
        maxDepth,
      });
      return;
    }
    const parentId = d.place === "inside" ? target.item.id : target.parentId;
    const siblings = (
      d.place === "inside"
        ? (target.item.children ?? [])
        : parentId
          ? (located.get(parentId)?.item.children ?? [])
          : items
    ).filter((s) => s.id !== dragged.item.id);
    const at = siblings.findIndex((s) => s.id === target.item.id);
    const index = d.place === "inside" ? siblings.length : d.place === "before" ? at : at + 1;
    if (dragged.parentId === parentId && dragged.index === index) return;
    commit({ itemId: dragged.item.id, parentId, index }, "moved");
  };

  const instructionsId = useId();

  return (
    <div className={cn("grid min-w-0", className)}>
      <div
        role="tree"
        aria-label={labels.tree}
        aria-describedby={instructionsId}
        className="grid min-w-0"
        data-menu-tree=""
      >
        {rows.map((row, i) => {
          const { item, depth } = row;
          const expanded = row.hasChildren && !collapsed.has(item.id);
          const ctx = contextFor(row);
          const indicator = drop?.targetId === item.id ? drop : undefined;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              role="treeitem"
              aria-level={depth}
              aria-setsize={row.siblings}
              aria-posinset={row.index + 1}
              aria-expanded={row.hasChildren ? expanded : undefined}
              aria-labelledby={`${instructionsId}-${item.id}-label`}
              aria-describedby={
                item.meta || item.status ? `${instructionsId}-${item.id}-meta` : undefined
              }
              tabIndex={current === item.id ? 0 : -1}
              data-item-id={item.id}
              data-depth={depth}
              data-dragging={dragging === item.id ? "" : undefined}
              data-drop={
                indicator ? `${indicator.place}${indicator.ok ? "" : "-refused"}` : undefined
              }
              draggable={!readOnly}
              onFocus={(e) => {
                if (e.target === e.currentTarget) setActive(item.id);
              }}
              onKeyDown={(e) => onKeyDown(e, row, i)}
              onDragStart={(e) => {
                if (readOnly) return;
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", item.id);
                } catch {}
                setDragging(item.id);
              }}
              onDragEnd={() => {
                setDragging(undefined);
                setDrop(undefined);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                const next = dropFor(row, placeOf(e));
                e.dataTransfer.dropEffect = next.ok ? "move" : "none";
                if (
                  drop?.targetId !== next.targetId ||
                  drop.place !== next.place ||
                  drop.ok !== next.ok
                )
                  setDrop(next);
              }}
              onDrop={(e) => {
                if (!dragging) return;
                e.preventDefault();
                finishDrop(dropFor(row, placeOf(e)));
              }}
              className={cn(
                "group/row relative flex min-h-12 min-w-0 items-center gap-2 border-b border-kumo-hairline py-2 pe-3 outline-none last:border-b-0",
                "focus:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:ring-inset",
                dragging === item.id && "opacity-50",
                indicator?.place === "inside" &&
                  indicator.ok &&
                  "bg-kumo-tint ring-2 ring-kumo-brand ring-inset",
                indicator && !indicator.ok && "bg-kumo-danger-tint",
              )}
              style={{ paddingInlineStart: `${0.5 + (depth - 1) * 1.5}rem` }}
            >
              {/* Guides: one hairline per ancestor level. */}
              {Array.from({ length: depth - 1 }, (_, level) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: one guide per level
                  key={level}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-kumo-hairline"
                  style={{ insetInlineStart: `${1.25 + level * 1.5}rem` }}
                />
              ))}
              {indicator && indicator.place !== "inside" && indicator.ok && (
                <span
                  aria-hidden
                  data-drop-line={indicator.place}
                  className={cn(
                    "pointer-events-none absolute end-2 h-0.5 rounded-full bg-kumo-brand",
                    indicator.place === "before" ? "-top-px" : "-bottom-px",
                  )}
                  style={{ insetInlineStart: `${0.5 + (depth - 1) * 1.5}rem` }}
                />
              )}
              {!readOnly && (
                <span
                  aria-hidden
                  className="flex h-lh shrink-0 cursor-grab items-center text-kumo-subtle"
                >
                  <DotsSixVertical size={16} />
                </span>
              )}
              <span className="flex size-6 shrink-0 items-center justify-center">
                {row.hasChildren && (
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    tabIndex={-1}
                    aria-label={expanded ? labels.collapse(item.label) : labels.expand(item.label)}
                    icon={<DirectionalIcon icon={expanded ? CaretDown : CaretRight} size={12} />}
                    onClick={() => toggle(item.id)}
                  />
                )}
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <div
                  id={`${instructionsId}-${item.id}-label`}
                  className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
                >
                  <Text as="span" bold={!item.muted} variant={item.muted ? "secondary" : undefined}>
                    <span className="break-words">{item.label}</span>
                  </Text>
                  {item.hint && (
                    <Text as="span" variant="secondary" size="xs">
                      {item.hint}
                    </Text>
                  )}
                </div>
                {(item.meta || item.status) && (
                  <div
                    id={`${instructionsId}-${item.id}-meta`}
                    className="flex min-w-0 flex-wrap items-center gap-1.5"
                  >
                    {item.meta}
                    {item.status}
                  </div>
                )}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-1">{actions(ctx)}</div>}
            </div>
          );
        })}
      </div>
      <span id={instructionsId} className="sr-only">
        {labels.instructions}
      </span>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-menu-tree-live=""
      >
        {message}
      </div>
    </div>
  );
}

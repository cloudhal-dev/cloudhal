import { Badge, Button, DropdownMenu, Link, SkeletonLine, Text } from "@cloudflare/kumo";
import { ArrowDown, ArrowSquareOut, ArrowUp, DotsThree, Trash } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { useAnnouncer } from "./announcer.ts";
import { directional } from "./DirectionalIcon.tsx";
import { InsetPanel } from "./InsetPanel.tsx";

/** A target's state as the list shows it; `missing` is a stored id with no entry left. */
export type ReferenceTargetStatus = "draft" | "review" | "published" | "archived" | "missing";

/** One chosen target, in stored order. */
export interface ReferenceListItem {
  /** The stored translation group id. */
  id: string;
  /** Absent while it loads. */
  title?: string | undefined;
  /** "Places · Turkish". */
  meta?: string | undefined;
  /** Absent while it loads. */
  status?: ReferenceTargetStatus | undefined;
  /** The target's editor. */
  href?: string | undefined;
}

/** Every word of the block (no English fallback). */
export interface ReferenceListLabels {
  draft: string;
  review: string;
  archived: string;
  /** A dangling id: "Not found". */
  notFound: string;
  /** Next to a target that is not published: "Will not show until published". */
  notShown: string;
  /** Next to a dangling id: "This entry was deleted. Remove it or choose another." */
  notFoundHint: string;
  /** Accessible names per row: "Move Main hall up", "Actions for Main hall". */
  moveUp: (title: string) => string;
  moveDown: (title: string) => string;
  actions: (title: string) => string;
  /** The menu's items. */
  open: string;
  menuMoveUp: string;
  menuMoveDown: string;
  remove: string;
  /** Read while loading (the row's accessible name). */
  loading: string;
  /** Announced (polite): "Main hall moved to position 2", "Main hall removed". */
  moved: (title: string, position: number) => string;
  removed: (title: string) => string;
}

export interface ReferenceListProps {
  /** The list's accessible name (the field's label). */
  label: string;
  items: readonly ReferenceListItem[];
  /** Up and down for a list of several targets. */
  sortable?: boolean;
  readOnly?: boolean;
  onMove?: (index: number, by: -1 | 1) => void;
  onRemove?: (index: number) => void;
  /** Where focus goes when the last row is removed (Studio: the picker's trigger). */
  focusAfterLast?: () => HTMLElement | null | undefined;
  labels: ReferenceListLabels;
}

const STATUS_BADGE = {
  draft: "secondary",
  review: "warning",
  archived: "outline",
  missing: "error",
} as const;

/**
 * The chosen targets of a reference (RFC-0045 §5), in stored order, as `InsetPanel` rows: the
 * title (a link to its editor), the collection and language, and a "Draft", "In review" or
 * "Archived" badge with "Will not show until published"; "Not found" for an id with no entry left.
 * Per row: move up and down (icon buttons from `sm` when sortable, also in the ⋯ menu), open and
 * remove. Badges wrap under the title on narrow screens. After a move, focus stays on the moved
 * row (its move button, else its ⋯); after a remove it goes to the next row, else to
 * `focusAfterLast` (Studio: the picker's trigger). Both are announced in a polite live region.
 */
export function ReferenceList({
  label,
  items,
  sortable = false,
  readOnly = false,
  onMove,
  onRemove,
  focusAfterLast,
  labels,
}: ReferenceListProps) {
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<{ id: string; at: "up" | "down" | "actions" } | "after" | null>(null);
  const [said, say] = useAnnouncer();
  useLayoutEffect(() => {
    const want = focus.current;
    focus.current = null;
    if (want === "after") return void focusAfterLast?.()?.focus();
    if (!want) return;
    const row = root.current?.querySelector(`[data-reference="${CSS.escape(want.id)}"]`);
    const pick = (selector: string) => row?.querySelector<HTMLElement>(selector);
    const target =
      want.at === "actions"
        ? undefined
        : (pick(`[data-reference-move="${want.at}"]:not([disabled])`) ??
          pick("[data-reference-move]:not([disabled])"));
    (target ?? pick("[data-reference-actions]"))?.focus();
  });
  const name = (item: ReferenceListItem) => item.title ?? item.id;
  const move = (i: number, by: -1 | 1) => {
    const item = items[i] as ReferenceListItem;
    // A row moved from the menu keeps focus on its ⋯; one moved by its arrow, on an arrow.
    focus.current = {
      id: item.id,
      at: document.activeElement?.hasAttribute("data-reference-move")
        ? by < 0
          ? "up"
          : "down"
        : "actions",
    };
    say(labels.moved(name(item), i + by + 1));
    onMove?.(i, by);
  };
  const remove = (i: number) => {
    const item = items[i] as ReferenceListItem;
    const next = items[i + 1] ?? items[i - 1];
    focus.current = next ? { id: next.id, at: "actions" } : "after";
    say(labels.removed(name(item)));
    onRemove?.(i);
  };
  return (
    <div ref={root} className="min-w-0" data-reference-list="">
      {items.length > 0 && (
        <ul className="grid min-w-0 gap-2" aria-label={label}>
          {items.map((item, i) => (
            <ReferenceRow
              key={item.id}
              item={item}
              first={i === 0}
              last={i === items.length - 1}
              sortable={sortable}
              readOnly={readOnly}
              onMove={(by) => move(i, by)}
              onRemove={() => remove(i)}
              labels={labels}
            />
          ))}
        </ul>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

/** One target: its title, collection and language, state, and (unless read-only) its actions. */
function ReferenceRow({
  item,
  first,
  last,
  sortable,
  readOnly,
  onMove,
  onRemove,
  labels,
}: {
  item: ReferenceListItem;
  first: boolean;
  last: boolean;
  sortable: boolean;
  readOnly: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  labels: ReferenceListLabels;
}) {
  const name = item.title ?? item.id;
  const status = item.status;
  const shown = status === "published";
  return (
    <li className="min-w-0" data-reference={item.id} data-status={status}>
      {/* The actions stay on the title's line; badges wrap under the title. */}
      <InsetPanel layout="row" className="flex-nowrap items-start">
        <span className="grid min-w-0 flex-1 gap-1">
          {status === undefined ? (
            <span role="status" aria-label={labels.loading}>
              <SkeletonLine />
            </span>
          ) : status === "missing" ? (
            <Text as="span" variant="mono-secondary" truncate>
              {item.id}
            </Text>
          ) : item.href ? (
            <Link href={item.href} className="min-w-0 truncate">
              {name}
            </Link>
          ) : (
            <Text as="span" bold truncate>
              {name}
            </Text>
          )}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.meta && status !== "missing" && (
              <Text as="span" variant="secondary" size="sm">
                {item.meta}
              </Text>
            )}
            {status !== undefined && status !== "published" && (
              <Badge variant={STATUS_BADGE[status]}>
                {status === "missing" ? labels.notFound : labels[status]}
              </Badge>
            )}
            {status !== undefined && !shown && (
              <Text as="span" variant="secondary" size="sm">
                {status === "missing" ? labels.notFoundHint : labels.notShown}
              </Text>
            )}
          </span>
        </span>
        {!readOnly && (
          <span className="flex shrink-0 items-center gap-1">
            {sortable && (
              <span className="hidden items-center gap-1 sm:flex">
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  icon={<ArrowUp />}
                  aria-label={labels.moveUp(name)}
                  disabled={first}
                  onClick={() => onMove(-1)}
                  data-reference-move="up"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  icon={<ArrowDown />}
                  aria-label={labels.moveDown(name)}
                  disabled={last}
                  onClick={() => onMove(1)}
                  data-reference-move="down"
                />
              </span>
            )}
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<DotsThree weight="bold" />}
                    aria-label={labels.actions(name)}
                    data-reference-actions=""
                  />
                }
              />
              <DropdownMenu.Content align="end">
                {item.href && status !== "missing" && (
                  <DropdownMenu.LinkItem href={item.href} icon={directional(ArrowSquareOut)}>
                    {labels.open}
                  </DropdownMenu.LinkItem>
                )}
                {sortable && (
                  <>
                    <DropdownMenu.Item icon={ArrowUp} disabled={first} onClick={() => onMove(-1)}>
                      {labels.menuMoveUp}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item icon={ArrowDown} disabled={last} onClick={() => onMove(1)}>
                      {labels.menuMoveDown}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                  </>
                )}
                <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => onRemove()}>
                  {labels.remove}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </span>
        )}
      </InsetPanel>
    </li>
  );
}

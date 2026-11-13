import { Button, Collapsible, DropdownMenu, Text } from "@cloudflare/kumo";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  Copy,
  DotsThree,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";
import { DirectionalIcon } from "./DirectionalIcon.tsx";
import type { FieldValues } from "./entry-fields-model.ts";
import { useRepeater, withSub } from "./repeater-state.ts";
import { SectionEmpty } from "./SectionEmpty.tsx";

/** Every word of the block (no English fallback). Item numbers are 1-based. */
export interface RepeaterFieldLabels {
  /** "Add item". */
  add: string;
  /** The count next to it: "3 of 20". */
  count: (count: number, max: number) => string;
  /** No items yet: "No items yet". */
  empty: string;
  /** Icon buttons and the menu's accessible name, per item: "Move item 2 up". */
  moveUp: (index: number) => string;
  moveDown: (index: number) => string;
  actions: (index: number) => string;
  /** The menu's items: "Move up", "Move down", "Duplicate", "Remove". */
  menuMoveUp: string;
  menuMoveDown: string;
  duplicate: string;
  remove: string;
  /** Announced (polite): "Item 2 moved to position 1", "Item 2 removed". */
  moved: (from: number, to: number) => string;
  removed: (index: number) => string;
  /** Above the items when some collapsed ones have problems: "2 items need attention". */
  invalidItems: (count: number) => string;
}

/** One item's problems: its own, and per sub-field key. */
export interface RepeaterItemErrors {
  item?: string | undefined;
  subs: ReadonlyMap<string, string>;
}

/** What `renderControl` gets for one sub-field of one item. */
export interface RepeaterControlArgs<S> {
  sub: S;
  item: FieldValues;
  /** 0-based. */
  index: number;
  value: unknown;
  onChange: (v: unknown) => void;
  error: string | undefined;
  readOnly: boolean;
}

export interface RepeaterFieldProps<S extends { key: string }> {
  /** The field's label, its description and its own problem. */
  label: string;
  description?: ReactNode;
  error?: string | undefined;
  items: readonly FieldValues[];
  onChange: (items: FieldValues[]) => void;
  /** The sub-fields of every item, in form order (stacked). */
  subFields: readonly S[];
  /** One sub-field's control (Studio: `FieldControl`, images through `FieldImage`). */
  renderControl: (args: RepeaterControlArgs<S>) => ReactNode;
  /** An item's legend, from an ICU message: "Item 2: Ada Lovelace". */
  legend: (index: number, item: FieldValues) => string;
  /** At most this many items. */
  max: number;
  readOnly?: boolean;
  /** Problems by item index (0-based); a new map opens the items it names. */
  itemErrors?: ReadonlyMap<number, RepeaterItemErrors> | undefined;
  /** After "Remove": the host offers `undo` (Studio: a toast), which puts the item back. */
  onRemoved?: (removed: { index: number; legend: string; undo: () => void }) => void;
  labels: RepeaterFieldLabels;
}

/**
 * A repeater (RFC-0045 §5): an ordered list of items, each a `fieldset` whose `legend` names it,
 * with its sub-fields stacked and folded in a `Collapsible`. "Add item" with the count ("3 of
 * 20"); per item, move up and down (icon buttons from `sm`, also in the ⋯ menu), duplicate and
 * remove. Moving is done with buttons only. After "Add item" focus goes to the new item's first
 * control; after "Remove" to the next item's toggle, else "Add item", and the host gets an undo.
 * Moves and removals are announced in a polite live region. Items with problems open when a new
 * `itemErrors` arrives; collapsed ones are listed above the items.
 */
export function RepeaterField<S extends { key: string }>(props: RepeaterFieldProps<S>) {
  const { items, max, labels, readOnly = false } = props;
  const id = useId();
  const { root, keys, latest, open, said, toggle, add, move, duplicate, remove, reveal } =
    useRepeater(props);
  const collapsedInvalid = [...(props.itemErrors?.keys() ?? [])]
    .filter((i) => i < items.length && !open.has(keys.current[i] as string))
    .sort((a, b) => a - b);
  const full = items.length >= max;
  return (
    <fieldset
      ref={root}
      className="grid min-w-0 gap-3"
      aria-describedby={props.description || props.error ? `${id}-about` : undefined}
      data-repeater=""
    >
      {/* Kumo's own label style (`Field`, `Checkbox.Group`). */}
      <legend className="mb-1.5 text-base font-medium text-kumo-default">{props.label}</legend>
      {(props.description || props.error) && (
        <div className="grid gap-1" id={`${id}-about`}>
          {props.description && (
            <Text variant="secondary" size="sm" as="span">
              {props.description}
            </Text>
          )}
          {props.error && (
            <Text variant="error" size="sm" as="span">
              {props.error}
            </Text>
          )}
        </div>
      )}
      {collapsedInvalid.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-repeater-invalid="">
          <Text variant="error" size="sm" as="span">
            {labels.invalidItems(collapsedInvalid.length)}
          </Text>
          {collapsedInvalid.map((i) => (
            <Button key={keys.current[i]} variant="ghost" size="sm" onClick={() => reveal(i)}>
              {props.legend(i, items[i] as FieldValues)}
            </Button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <SectionEmpty title={labels.empty} />
      ) : (
        <div className="grid min-w-0 gap-3">
          {items.map((item, i) => {
            const key = keys.current[i] as string;
            return (
              <RepeaterItem
                key={key}
                itemKey={key}
                index={i}
                count={items.length}
                open={open.has(key)}
                onOpen={(on) => toggle(key, on)}
                legend={props.legend(i, item)}
                errors={props.itemErrors?.get(i)}
                readOnly={readOnly}
                full={full}
                labels={labels}
                onMove={(by) => move(i, by)}
                onDuplicate={() => duplicate(i)}
                onRemove={() => remove(i)}
              >
                {props.subFields.map((sub) => (
                  <div key={sub.key} className="min-w-0" data-repeater-sub={sub.key}>
                    {props.renderControl({
                      sub,
                      item,
                      index: i,
                      value: item[sub.key],
                      onChange: (v) => {
                        const next = [...latest.current];
                        next[i] = withSub(next[i] ?? {}, sub.key, v);
                        props.onChange(next);
                      },
                      error: props.itemErrors?.get(i)?.subs.get(sub.key),
                      readOnly,
                    })}
                  </div>
                ))}
              </RepeaterItem>
            );
          })}
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            onClick={add}
            disabled={full}
            data-repeater-add=""
          >
            {labels.add}
          </Button>
          <Text variant="secondary" size="sm" as="span">
            {labels.count(items.length, max)}
          </Text>
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </fieldset>
  );
}

interface ItemProps {
  itemKey: string;
  index: number;
  count: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  legend: string;
  errors: RepeaterItemErrors | undefined;
  readOnly: boolean;
  full: boolean;
  labels: RepeaterFieldLabels;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: ReactNode;
}

/** One item: its legend and toggle, its actions, and its sub-fields in a `Collapsible` panel. */
function RepeaterItem(p: ItemProps) {
  const panel = useId();
  const n = p.index + 1;
  const first = p.index === 0;
  const last = p.index === p.count - 1;
  return (
    <fieldset
      className="min-w-0 rounded-lg px-4 py-3 ring ring-kumo-hairline"
      data-repeater-item={p.itemKey}
      aria-invalid={p.errors ? true : undefined}
    >
      <legend className="sr-only">{p.legend}</legend>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={p.open ? <CaretDown /> : <DirectionalIcon icon={CaretRight} />}
          aria-expanded={p.open}
          aria-controls={panel}
          onClick={() => p.onOpen(!p.open)}
          className="min-w-0 justify-start"
          data-repeater-toggle=""
        >
          <span className="truncate">{p.legend}</span>
        </Button>
        {!p.readOnly && (
          <span className="flex shrink-0 items-center gap-1">
            <span className="hidden items-center gap-1 sm:flex">
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<ArrowUp />}
                aria-label={p.labels.moveUp(n)}
                disabled={first}
                onClick={() => p.onMove(-1)}
                data-repeater-move="up"
              />
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<ArrowDown />}
                aria-label={p.labels.moveDown(n)}
                disabled={last}
                onClick={() => p.onMove(1)}
                data-repeater-move="down"
              />
            </span>
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<DotsThree weight="bold" />}
                    aria-label={p.labels.actions(n)}
                  />
                }
              />
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item icon={ArrowUp} disabled={first} onClick={() => p.onMove(-1)}>
                  {p.labels.menuMoveUp}
                </DropdownMenu.Item>
                <DropdownMenu.Item icon={ArrowDown} disabled={last} onClick={() => p.onMove(1)}>
                  {p.labels.menuMoveDown}
                </DropdownMenu.Item>
                <DropdownMenu.Item icon={Copy} disabled={p.full} onClick={p.onDuplicate}>
                  {p.labels.duplicate}
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item icon={Trash} variant="danger" onClick={p.onRemove}>
                  {p.labels.remove}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </span>
        )}
      </div>
      {p.errors?.item && (
        <Text variant="error" size="sm" as="span">
          {p.errors.item}
        </Text>
      )}
      <Collapsible.Root open={p.open} onOpenChange={p.onOpen}>
        <Collapsible.Panel id={panel}>
          <div className="grid min-w-0 gap-4 pt-3" data-repeater-panel="">
            {p.children}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </fieldset>
  );
}

/**
 * The state of `RepeaterField` (RFC-0045 §5): stable item keys, which items are open, problems by
 * item key, focus after add, move, remove and undo, and the live region's words. No words of its
 * own. Writes go through the latest `onChange` and the latest items, so an undo that runs seconds
 * later never brings back what was there when the item was removed.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAnnouncer } from "./announcer.ts";
import { type FieldValues, hasValue } from "./entry-fields-model.ts";
import type { RepeaterFieldLabels, RepeaterItemErrors } from "./RepeaterField.tsx";

type Focus = { key: string; at: "first" | "toggle" | "up" | "down" } | { key?: never; at: "add" };

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** `v` set on `item` under `key`, or the key removed when it is no value. */
export function withSub(item: FieldValues, key: string, v: unknown): FieldValues {
  const next: Record<string, unknown> = { ...item };
  if (hasValue(v)) next[key] = v;
  else delete next[key];
  return next;
}

/** Stable keys for items that have no ids: kept in step with every add, move and removal. */
function useItemKeys(length: number) {
  const counter = useRef(0);
  const keys = useRef<string[]>([]);
  const fresh = () => `item-${counter.current++}`;
  if (keys.current.length !== length) keys.current = Array.from({ length }, fresh);
  return { keys, fresh };
}

/** What `useRepeater` reads of the block's props. */
export interface RepeaterStateProps {
  items: readonly FieldValues[];
  onChange: (items: FieldValues[]) => void;
  legend: (index: number, item: FieldValues) => string;
  itemErrors?: ReadonlyMap<number, RepeaterItemErrors> | undefined;
  onRemoved?: (removed: { index: number; legend: string; undo: () => boolean }) => void;
  max: number;
  labels: RepeaterFieldLabels;
}

/** Problems by item index, as they arrived, moved onto the keys of the items they named then. */
function useErrorsByKey(
  itemErrors: RepeaterStateProps["itemErrors"],
  keys: { current: string[] },
): ReadonlyMap<string, RepeaterItemErrors> {
  const keyed = useRef<{ source: unknown; byKey: Map<string, RepeaterItemErrors> }>({
    source: undefined,
    byKey: new Map(),
  });
  if (keyed.current.source !== itemErrors) {
    const byKey = new Map<string, RepeaterItemErrors>();
    for (const [i, errors] of itemErrors ?? []) {
      const key = keys.current[i];
      if (key) byKey.set(key, errors);
    }
    keyed.current = { source: itemErrors, byKey };
  }
  return keyed.current.byKey;
}

/** Keys, open items, focus and announcements, and the operations that keep them in step. */
export function useRepeater(props: RepeaterStateProps) {
  const { items, labels } = props;
  const root = useRef<HTMLFieldSetElement>(null);
  const { keys, fresh } = useItemKeys(items.length);
  const latest = useRef(items);
  latest.current = items;
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    items.length <= 3 ? new Set(keys.current) : new Set(),
  );
  const [said, say] = useAnnouncer();
  const focus = useRef<Focus | null>(null);
  const errors = useErrorsByKey(props.itemErrors, keys);

  // A new error map opens the items it names.
  useEffect(() => {
    if (!errors.size) return;
    setOpen((was) => new Set([...was, ...errors.keys()]));
  }, [errors]);

  useLayoutEffect(() => {
    const want = focus.current;
    const el = root.current;
    if (!want || !el) return;
    focus.current = null;
    if (want.at === "add")
      return void el.querySelector<HTMLElement>("[data-repeater-add]")?.focus();
    const item = el.querySelector(`[data-repeater-item="${want.key}"]`);
    const pick = (selector: string) => item?.querySelector<HTMLElement>(selector);
    const target =
      want.at === "first"
        ? pick(`[data-repeater-panel] :is(${FOCUSABLE})`)
        : want.at === "toggle"
          ? pick("[data-repeater-toggle]")
          : (pick(`[data-repeater-move="${want.at}"]:not([disabled])`) ??
            pick(`[data-repeater-move]:not([disabled])`) ??
            pick("[data-repeater-toggle]"));
    (target ?? pick("[data-repeater-toggle]"))?.focus();
  });

  const commit = (next: FieldValues[], nextKeys: string[]) => {
    keys.current = nextKeys;
    onChange.current(next);
  };
  /** One item's sub-value, written over the latest items. */
  const setSub = (key: string, sub: string, v: unknown) => {
    const i = keys.current.indexOf(key);
    if (i < 0) return;
    const next = [...latest.current];
    next[i] = withSub(next[i] ?? {}, sub, v);
    onChange.current(next);
  };
  const toggle = (key: string, on: boolean) =>
    setOpen((was) => {
      const next = new Set(was);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const add = () => {
    const key = fresh();
    toggle(key, true);
    focus.current = { key, at: "first" };
    commit([...items, {}], [...keys.current, key]);
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const nextKeys = [...keys.current];
    [next[i], next[j]] = [next[j] as FieldValues, next[i] as FieldValues];
    [nextKeys[i], nextKeys[j]] = [nextKeys[j] as string, nextKeys[i] as string];
    focus.current = { key: nextKeys[j] as string, at: by < 0 ? "up" : "down" };
    say(labels.moved(i + 1, j + 1));
    commit(next, nextKeys);
  };
  const duplicate = (i: number) => {
    const key = fresh();
    toggle(key, true);
    focus.current = { key, at: "first" };
    const at = i + 1;
    commit(
      [...items.slice(0, at), { ...(items[i] as FieldValues) }, ...items.slice(at)],
      [...keys.current.slice(0, at), key, ...keys.current.slice(at)],
    );
  };
  const remove = (i: number) => {
    const removed = items[i] as FieldValues;
    const key = keys.current[i] as string;
    const legend = props.legend(i, removed);
    const nextKeys = keys.current.filter((_, n) => n !== i);
    const after = nextKeys[i];
    focus.current = after ? { key: after, at: "toggle" } : { at: "add" };
    say(labels.removed(i + 1));
    commit(
      items.filter((_, n) => n !== i),
      nextKeys,
    );
    props.onRemoved?.({
      index: i,
      legend,
      // False when it can't: the list is gone (another entry, another screen) or full.
      undo: () => {
        const now = latest.current;
        if (!mounted.current || now.length >= props.max || keys.current.includes(key)) return false;
        const at = Math.min(i, now.length);
        focus.current = { key, at: "toggle" };
        commit(
          [...now.slice(0, at), removed, ...now.slice(at)],
          [...keys.current.slice(0, at), key, ...keys.current.slice(at)],
        );
        return true;
      },
    });
  };

  /** Opens an item and focuses its first control (the list of collapsed problems). */
  const reveal = (key: string) => {
    toggle(key, true);
    focus.current = { key, at: "first" };
  };
  return { root, keys, open, said, errors, toggle, add, move, duplicate, remove, reveal, setSub };
}

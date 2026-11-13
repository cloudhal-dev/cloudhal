import { Badge, Button, cn, Input, LayerDialog, Loader, Text } from "@cloudflare/kumo";
import { CheckSquare, Square } from "@phosphor-icons/react";
import {
  cloneElement,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { SectionEmpty } from "./SectionEmpty.tsx";

/** One search result (the picker route's card, worded by the host). */
export interface EntryPickerItem {
  /** The translation group id: what a reference stores. */
  id: string;
  title: string;
  /** The collection's name ("Places"). */
  collection: string;
  status: "draft" | "review" | "published" | "archived";
  /** The language's name ("Turkish"). */
  locale?: string | undefined;
}

/** One answer of `search`: results, and where to continue when there are more. */
export interface EntryPickerPage {
  items: readonly EntryPickerItem[];
  cursor?: string | undefined;
  /** The server read its row budget before it found enough: more may match after `cursor`. */
  truncated?: boolean | undefined;
}

/** Every word of the block (no English fallback). */
export interface EntryPickerLabels {
  title: string;
  description?: string | undefined;
  /** The search field's label: "Search entries". */
  search: string;
  /** Announced and shown under the field: "3 entries found", "No entries found". */
  results: (count: number) => string;
  searching: string;
  noResults: string;
  failed: string;
  /** Load the next page: "Show more"; after a truncated read: "Keep searching". */
  more: string;
  keepSearching: string;
  /** Under a truncated page: "Not every entry was searched yet." */
  truncated: string;
  /** Multiple choice: "You can choose 3 more". */
  remaining: (count: number) => string;
  /** On a result already chosen, or the entry itself: "Already chosen". */
  unavailable: string;
  status: Record<EntryPickerItem["status"], string>;
  /** The primary action in multiple choice: "Add 2 entries". */
  add: (count: number) => string;
  cancel: string;
  close: string;
}

export interface EntryPickerProps {
  /** The button that opens the picker; focus returns to it when the picker closes. */
  trigger: ReactElement<{ className?: string; "aria-disabled"?: boolean }>;
  /** Searches the allowed collections (Studio: the picker route). The block makes no API calls. */
  search: (q: string, cursor: string | undefined) => Promise<EntryPickerPage>;
  /** Several targets at once (up to `remaining`), or one. */
  multiple: boolean;
  remaining: number;
  /**
   * The field holds all it can: the trigger stays focusable (`aria-disabled`) and opens nothing,
   * so focus is not lost when a pick fills the field.
   */
  disabled?: boolean | undefined;
  /** Group ids that can't be chosen: already chosen ones, the entry's own group. */
  unavailable?: ReadonlySet<string> | undefined;
  onPick: (items: EntryPickerItem[]) => void;
  labels: EntryPickerLabels;
}

const DEBOUNCE_MS = 200;

const STATUS_BADGE = {
  draft: "secondary",
  review: "warning",
  published: "success",
  archived: "outline",
} as const;

interface Results {
  items: EntryPickerItem[];
  cursor?: string | undefined;
  truncated: boolean;
  state: "loading" | "more" | "done" | "failed";
}

const EMPTY: Results = { items: [], truncated: false, state: "loading" };

/** Each group once: a group's languages share its id, and the first one found stands for it. */
function once(items: EntryPickerItem[]): EntryPickerItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.id) && seen.add(i.id) !== undefined);
}

/** Runs `search` for `q` (debounced) and for "Show more", dropping answers that came too late. */
function useSearch(open: boolean, q: string, search: EntryPickerProps["search"]) {
  const [results, setResults] = useState<Results>(EMPTY);
  const run = useRef(0);
  const fetchPage = (cursor: string | undefined, append: boolean) => {
    const mine = ++run.current;
    setResults((r) => (append ? { ...r, state: "more" } : { ...EMPTY }));
    search(q.trim(), cursor).then(
      (page) => {
        if (mine !== run.current) return;
        setResults((r) => ({
          items: once(append ? [...r.items, ...page.items] : [...page.items]),
          cursor: page.cursor,
          truncated: page.truncated === true,
          state: "done",
        }));
      },
      () => {
        if (mine === run.current) setResults((r) => ({ ...r, state: "failed" }));
      },
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query or opening searches again.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchPage(undefined, false), q === "" ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, q]);
  return { results, more: () => fetchPage(results.cursor, true) };
}

/**
 * Choose entries for a reference (RFC-0045 §5): a `LayerDialog` with a labelled search field over
 * a list with combobox semantics (`listbox`, the active option followed with
 * `aria-activedescendant`; arrow keys, Home, End and Enter), each result with its title, a
 * collection badge, a status badge and its language. The result count is announced in a polite
 * live region. One choice picks and closes; several are ticked, then added together, at most
 * `remaining`. "Show more" (or "Keep searching" after a truncated read) follows the cursor. The
 * block makes no API calls (`search`), and focus returns to `trigger` when it closes.
 */
export function EntryPicker(props: EntryPickerProps) {
  const { labels, multiple } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<EntryPickerItem[]>([]);
  const { results, more } = useSearch(open, q, props.search);
  const items = results.items;

  useEffect(() => {
    if (!open) return;
    setQ("");
    setChosen([]);
    setActive(0);
  }, [open]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at the top.
  useEffect(() => setActive(0), [q]);
  useEffect(() => setActive((a) => Math.min(a, Math.max(items.length - 1, 0))), [items.length]);

  const isChosen = (item: EntryPickerItem) => chosen.some((c) => c.id === item.id);
  const blocked = (item: EntryPickerItem) =>
    props.unavailable?.has(item.id) === true ||
    (multiple && !isChosen(item) && chosen.length >= props.remaining);
  const choose = (item: EntryPickerItem | undefined) => {
    if (!item || blocked(item)) return;
    if (!multiple) {
      props.onPick([item]);
      setOpen(false);
      return;
    }
    setChosen((was) => (isChosen(item) ? was.filter((c) => c.id !== item.id) : [...was, item]));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const next = KEY_STEPS[e.key]?.(active, items.length - 1);
    if (next !== undefined && items.length > 0) {
      e.preventDefault();
      setActive(next);
      document.getElementById(`${id}-option-${next}`)?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    }
  };

  const busy = results.state === "loading";
  const said = busy
    ? labels.searching
    : results.state === "failed"
      ? labels.failed
      : labels.results(items.length);
  // A full field keeps its trigger focusable (focus returns to it after a pick), but it opens nothing.
  const trigger = props.disabled
    ? cloneElement(props.trigger, {
        "aria-disabled": true,
        className: cn(props.trigger.props.className, "cursor-not-allowed opacity-50"),
      })
    : props.trigger;
  return (
    <LayerDialog.Root open={open} onOpenChange={(next) => setOpen(next && !props.disabled)}>
      <LayerDialog.Trigger render={trigger} />
      <LayerDialog.Content size="lg" closeLabel={labels.close}>
        <LayerDialog.Title>{labels.title}</LayerDialog.Title>
        {labels.description && (
          <LayerDialog.Description>{labels.description}</LayerDialog.Description>
        )}
        <LayerDialog.Body>
          <div className="grid min-w-0 gap-3" data-entry-picker="">
            <Input
              className="w-full"
              label={labels.search}
              value={q}
              onValueChange={setQ}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={true}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? `${id}-option-${active}` : undefined}
              autoFocus
              description={multiple ? labels.remaining(props.remaining - chosen.length) : undefined}
            />
            <span role="status" aria-live="polite" data-entry-picker-status="">
              <Text
                as="span"
                variant={results.state === "failed" ? "error" : "secondary"}
                size="sm"
              >
                {said}
              </Text>
            </span>
            {busy ? (
              <div className="flex justify-center py-6">
                {/* The status above says "Searching…"; the spinner is only seen. */}
                <span aria-hidden="true">
                  <Loader />
                </span>
              </div>
            ) : results.state === "failed" && items.length === 0 ? null : items.length === 0 &&
              !results.cursor ? (
              <SectionEmpty title={labels.noResults} />
            ) : (
              <div
                id={`${id}-list`}
                role="listbox"
                aria-label={labels.title}
                aria-multiselectable={multiple || undefined}
                className="grid min-w-0 gap-1"
              >
                {items.map((item, i) => (
                  <PickerOption
                    key={item.id}
                    id={`${id}-option-${i}`}
                    item={item}
                    active={i === active}
                    selected={isChosen(item)}
                    disabled={blocked(item)}
                    multiple={multiple}
                    unavailable={props.unavailable?.has(item.id) === true}
                    labels={labels}
                    onChoose={() => {
                      setActive(i);
                      choose(item);
                    }}
                  />
                ))}
              </div>
            )}
            <MoreResults results={results} more={more} labels={labels} />
          </div>
        </LayerDialog.Body>
        {multiple && (
          <LayerDialog.Actions dismissLabel={labels.cancel}>
            <LayerDialog.Actions.Primary
              disabled={chosen.length === 0}
              onClick={() => {
                props.onPick(chosen);
                setOpen(false);
              }}
            >
              {labels.add(chosen.length)}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        )}
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** The active option after a key: arrows step, Home and End jump. */
const KEY_STEPS: Record<string, (active: number, last: number) => number> = {
  ArrowDown: (a, last) => Math.min(a + 1, last),
  ArrowUp: (a) => Math.max(a - 1, 0),
  Home: () => 0,
  End: (_, last) => last,
};

/** "Show more", or "Keep searching" after a truncated read (a failure is the status's to say). */
function MoreResults({
  results,
  more,
  labels,
}: {
  results: Results;
  more: () => void;
  labels: EntryPickerLabels;
}) {
  return (
    <>
      {results.state !== "loading" && results.cursor && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {results.truncated && (
            <Text variant="secondary" size="sm" as="span">
              {labels.truncated}
            </Text>
          )}
          <Button variant="secondary" size="sm" loading={results.state === "more"} onClick={more}>
            {results.truncated ? labels.keepSearching : labels.more}
          </Button>
        </div>
      )}
    </>
  );
}

function PickerOption(p: {
  id: string;
  item: EntryPickerItem;
  active: boolean;
  selected: boolean;
  disabled: boolean;
  multiple: boolean;
  unavailable: boolean;
  labels: EntryPickerLabels;
  onChoose: () => void;
}) {
  const { item, labels } = p;
  const Mark = p.selected ? CheckSquare : Square;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the search field owns the keyboard (aria-activedescendant).
    <div
      id={p.id}
      role="option"
      tabIndex={-1}
      aria-selected={p.multiple ? p.selected : p.active}
      aria-disabled={p.disabled || undefined}
      data-entry-option={item.id}
      data-active={p.active || undefined}
      // Keeps focus in the search field, so the keyboard keeps working after a click.
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onChoose}
      className={cn(
        "flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-3 py-2",
        p.active && "bg-kumo-tint",
        p.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {p.multiple && (
        <span className="flex h-lh items-center" aria-hidden="true">
          <Mark size={16} />
        </span>
      )}
      <span className="grid min-w-0 gap-1">
        <Text as="span" bold truncate>
          {item.title}
        </Text>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{item.collection}</Badge>
          <Badge variant={STATUS_BADGE[item.status]}>{labels.status[item.status]}</Badge>
          {item.locale && (
            <Text as="span" variant="secondary" size="sm">
              {item.locale}
            </Text>
          )}
          {p.unavailable && (
            <Text as="span" variant="secondary" size="sm">
              {labels.unavailable}
            </Text>
          )}
        </span>
      </span>
    </div>
  );
}

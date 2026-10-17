import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import {
  Autocomplete,
  Badge,
  Combobox,
  Select,
  TermChip,
  TermChipList,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { Hourglass, Plus, Star, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { listOf, useT } from "../i18n/index.tsx";
import type { TermListItem } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import {
  type Assignment,
  foldName,
  type TagSuggestion,
  tagSuggestions,
  termTree,
} from "../lib/taxonomy.ts";

/** Name, synonyms and slugs, folded — what a term picker matches a query against. */
function termMatches(term: Term, query: string): boolean {
  const q = foldName(query);
  if (!q) return true;
  if (term.slug.includes(q)) return true;
  for (const label of Object.values(term.labels)) {
    if (!label) continue;
    if (foldName(label.name).includes(q)) return true;
    if ((label.altNames ?? []).some((a) => foldName(a).includes(q))) return true;
  }
  return false;
}

export interface TreeOption {
  id: string;
  term: Term;
  depth: number;
  /** "News › Local" for a child; empty for a root. */
  path: string;
}

/** Live terms in tree order with their depth and ancestor path, for tree-aware pickers. */
export function treeOptions(
  items: readonly TermListItem[],
  name: (t: Term) => string,
  include: (t: Term) => boolean = (t) => t.status !== "retired",
): TreeOption[] {
  return termTree(items.filter((i) => include(i.term))).map((row) => ({
    id: row.item.term.id,
    term: row.item.term,
    depth: row.depth,
    path: row.ancestors.map(name).join(" › "),
  }));
}

/** One option row: indented by depth, the ancestor path muted after the name. */
function OptionLabel({ option, name }: { option: TreeOption; name: string }) {
  const t = useT();
  return (
    <span
      className="flex min-w-0 flex-wrap items-baseline gap-x-2"
      style={option.depth > 0 ? { paddingInlineStart: `${option.depth}rem` } : undefined}
    >
      <span className="min-w-0 truncate">{name}</span>
      {option.path && (
        <Text variant="secondary" size="sm" as="span" truncate>
          {t("pickers.under", { path: option.path })}
        </Text>
      )}
      {option.term.status === "proposed" && (
        <Badge variant="warning" icon={<Hourglass />}>
          {t("taxonomy.state.proposed")}
        </Badge>
      )}
    </span>
  );
}

/**
 * Tree-aware single choice (merge target, new parent, retire redirect): a Kumo `Combobox` that
 * matches names, synonyms and slugs; children are indented and carry their path.
 */
export function TermCombobox({
  label,
  description,
  options,
  value,
  onChange,
  name,
  placeholder,
  error,
  none,
  testId,
}: {
  label: string;
  description?: string | undefined;
  options: TreeOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  name: (t: Term) => string;
  placeholder: string;
  error?: string | undefined;
  /** A first option meaning "none" (top level, no redirect), with this label. */
  none?: string | undefined;
  testId?: string | undefined;
}) {
  const t = useT();
  const NONE = "";
  const ids = [...(none !== undefined ? [NONE] : []), ...options.map((o) => o.id)];
  const byId = new Map(options.map((o) => [o.id, o]));
  const labelOf = (id: string) => (id === NONE ? (none ?? "") : name(byId.get(id)?.term as Term));
  return (
    <div data-testid={testId}>
      <Combobox
        items={ids}
        value={value ?? (none !== undefined ? NONE : null)}
        onValueChange={(v) => onChange(v === NONE || v === null ? null : (v as string))}
        itemToStringLabel={(id: string) => labelOf(id)}
        filter={(id: string, q: string) =>
          id === NONE ? !q : termMatches(byId.get(id)?.term as Term, q)
        }
        label={label}
        description={description}
        error={error}
      >
        <Combobox.TriggerInput
          placeholder={placeholder}
          clearLabel={t("pickers.clear")}
          showOptionsLabel={t("pickers.showOptions")}
        />
        <Combobox.Content>
          <Combobox.Empty>{t("pickers.noMatch")}</Combobox.Empty>
          <Combobox.List>
            {(id: string) => (
              <Combobox.Item key={id || "none"} value={id}>
                {id === NONE ? (
                  <Text variant="secondary" as="span">
                    {none}
                  </Text>
                ) : (
                  <OptionLabel option={byId.get(id) as TreeOption} name={labelOf(id)} />
                )}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
    </div>
  );
}

/**
 * The article's categories (RFC-0002 §8): a tree-aware multi-select `Combobox` with chips, at most
 * `maxPerEntry`, and the primary category — a single choice is the primary; with several, a
 * `Select` picks it. A required taxonomy says so; the editor refuses review/publish without one.
 */
export function CategoryPicker({
  tax,
  items,
  value,
  onChange,
  name,
  label,
  required,
  error,
}: {
  tax: Taxonomy;
  items: readonly TermListItem[];
  value: Assignment;
  onChange: (next: Assignment) => void;
  name: (t: Term) => string;
  label: string;
  required: boolean;
  error?: string | undefined;
}) {
  const t = useT();
  const options = treeOptions(items, name);
  const byId = new Map(items.map((i) => [i.term.id, i.term]));
  const max = tax.maxPerEntry ?? 50;
  const full = value.ids.length >= max;
  const primary =
    value.primary && value.ids.includes(value.primary)
      ? value.primary
      : value.ids.length === 1
        ? value.ids[0]
        : undefined;
  const set = (ids: string[], nextPrimary = value.primary) =>
    onChange({
      ids,
      primary:
        nextPrimary && ids.includes(nextPrimary)
          ? nextPrimary
          : ids.length === 1
            ? ids[0]
            : undefined,
    });
  const optionById = new Map(options.map((o) => [o.id, o]));
  const termName = (id: string) => {
    const term = byId.get(id);
    return term ? name(term) : id;
  };
  return (
    <div className="grid gap-3" data-testid={`picker-${tax.key}`}>
      <Combobox
        multiple
        items={options.map((o) => o.id)}
        value={value.ids}
        onValueChange={(ids) => set((ids as string[]).slice(0, max))}
        itemToStringLabel={(id: string) => termName(id)}
        filter={(id: string, q: string) => termMatches(byId.get(id) as Term, q)}
        label={label}
        required={required}
        error={error}
        description={
          full
            ? t("pickers.atMost", { max })
            : required
              ? t("pickers.categoryRequiredHint", { max })
              : t("pickers.categoryHint", { max })
        }
      >
        <Combobox.TriggerMultipleWithInput
          placeholder={value.ids.length ? "" : t("pickers.categoryPlaceholder")}
          value={value.ids}
          renderItem={(id: string) => (
            <Combobox.Chip key={id} removeLabel={t("pickers.remove", { name: termName(id) })}>
              <span className="flex min-w-0 items-center gap-1">
                {id === primary && value.ids.length > 1 && (
                  <Star size={12} weight="fill" className="shrink-0 text-kumo-warning" />
                )}
                <span className="truncate">{termName(id)}</span>
              </span>
            </Combobox.Chip>
          )}
        />
        <Combobox.Content>
          <Combobox.Empty>{t("pickers.noCategory")}</Combobox.Empty>
          <Combobox.List>
            {(id: string) => (
              <Combobox.Item key={id} value={id} disabled={full && !value.ids.includes(id)}>
                <OptionLabel option={optionById.get(id) as TreeOption} name={termName(id)} />
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
      {value.ids.length > 1 && (
        <div data-testid="primary-select">
          <Select
            label={t("pickers.primary")}
            description={t("pickers.primaryHint")}
            value={primary ?? ""}
            onValueChange={(v) => set(value.ids, (v as string) || undefined)}
            items={Object.fromEntries([
              ["", t("pickers.primaryNone")],
              ...value.ids.map((id) => [id, termName(id)]),
            ])}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The article's tags (RFC-0002 §8): a Kumo `Autocomplete` offering existing tags first — by name,
 * synonym or slug — and "Create" only when nothing matches, with a warning when the new tag looks
 * like one that exists. Chosen tags are chips; at most `maxPerEntry`.
 */
export function TagPicker({
  tax,
  items,
  value,
  onChange,
  onCreate,
  name,
  locale,
  label,
  error,
}: {
  tax: Taxonomy;
  items: readonly TermListItem[];
  value: Assignment;
  onChange: (next: Assignment) => void;
  /** Creates an active tag (people may) and returns it. */
  onCreate(name: string, slug: string): Promise<Term>;
  name: (t: Term) => string;
  locale: string;
  label: string;
  error?: string | undefined;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const max = tax.maxPerEntry ?? 50;
  const full = value.ids.length >= max;
  const terms = items.map((i) => i.term);
  const byId = new Map(terms.map((x) => [x.id, x]));
  const usage = new Map(items.map((i) => [i.term.id, i.usage]));
  const suggestions = full
    ? []
    : tagSuggestions(terms, query, { locale, selected: new Set(value.ids), usage });
  const keyOf = (s: TagSuggestion) => (s.kind === "term" ? s.term.id : `create:${s.slug}`);
  const byKey = new Map(suggestions.map((s) => [keyOf(s), s]));

  const choose = async (s: TagSuggestion) => {
    setQuery("");
    setCreateError(undefined);
    if (s.kind === "term") {
      onChange({ ...value, ids: [...value.ids, s.term.id] });
      return;
    }
    if (!s.slug) {
      setCreateError(t("pickers.createNoSlug"));
      return;
    }
    setCreating(true);
    try {
      const term = await onCreate(s.name, s.slug);
      onChange({ ...value, ids: [...value.ids, term.id] });
    } catch (e) {
      setCreateError(apiErrorText(t, e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-2" data-testid={`picker-${tax.key}`}>
      <Autocomplete
        items={suggestions}
        value={query}
        filter={null}
        openOnInputClick
        autoHighlight
        itemToStringValue={(s: TagSuggestion) => keyOf(s)}
        onValueChange={(v: string, details: { reason: string }) => {
          if (details.reason === "item-press") {
            const s = byKey.get(v);
            if (s) void choose(s);
            return;
          }
          setQuery(v);
        }}
        label={label}
        disabled={full || creating}
        error={createError ?? error}
        description={full ? t("pickers.atMost", { max }) : t("pickers.tagHint", { max })}
      >
        <Autocomplete.InputGroup
          placeholder={full ? t("pickers.tagFull") : t("pickers.tagPlaceholder")}
        />
        <Autocomplete.Content>
          <Autocomplete.List>
            {(s: TagSuggestion) => (
              <Autocomplete.Item key={keyOf(s)} value={s}>
                {s.kind === "term" ? (
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="truncate">{name(s.term)}</span>
                    {s.via === "altName" && s.matched && (
                      <Text variant="secondary" size="sm" as="span">
                        {t("pickers.viaSynonym", { value: s.matched })}
                      </Text>
                    )}
                    {s.via === "slug" && s.matched && (
                      <Text variant="mono-secondary" as="span">
                        {s.matched}
                      </Text>
                    )}
                    {s.via === "similar" && (
                      <Text variant="secondary" size="sm" as="span">
                        {t("pickers.similar")}
                      </Text>
                    )}
                    {s.term.status === "proposed" && (
                      <Badge variant="warning" icon={<Hourglass />}>
                        {t("taxonomy.state.proposed")}
                      </Badge>
                    )}
                  </span>
                ) : (
                  <span className="grid min-w-0 gap-0.5" data-testid="create-tag">
                    <span className="flex items-center gap-2">
                      <Plus size={14} className="shrink-0" />
                      <span className="truncate">{t("pickers.create", { name: s.name })}</span>
                    </span>
                    {s.similar.length > 0 && (
                      <span
                        className="flex items-start gap-1.5 text-kumo-warning"
                        data-testid="near-duplicate"
                      >
                        <span className="flex h-lh items-center">
                          <Warning size={14} weight="fill" />
                        </span>
                        <Text size="sm" as="span">
                          {t("pickers.nearDuplicate", {
                            names: listOf(s.similar.slice(0, 3).map((x) => name(x))),
                          })}
                        </Text>
                      </span>
                    )}
                  </span>
                )}
              </Autocomplete.Item>
            )}
          </Autocomplete.List>
        </Autocomplete.Content>
      </Autocomplete>
      {value.ids.length > 0 && (
        <TermChipList label={label}>
          {value.ids.map((id) => {
            const term = byId.get(id);
            const chip = (
              <TermChip
                key={id}
                tone={term?.status === "proposed" ? "pending" : "default"}
                icon={term?.status === "proposed" ? <Hourglass size={12} /> : undefined}
                removeLabel={t("pickers.remove", { name: term ? name(term) : id })}
                onRemove={() => onChange({ ...value, ids: value.ids.filter((x) => x !== id) })}
              >
                {term ? name(term) : id}
              </TermChip>
            );
            return term?.status === "proposed" ? (
              <Tooltip key={id} content={t("pickers.proposedChip")}>
                {chip}
              </Tooltip>
            ) : (
              chip
            );
          })}
        </TermChipList>
      )}
    </div>
  );
}

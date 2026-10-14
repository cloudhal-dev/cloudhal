import {
  Button,
  Checkbox,
  Field,
  Input,
  InputArea,
  InputGroup,
  Radio,
  Select,
  Text,
} from "@cloudflare/kumo";
import {
  type ArrayPropSchema,
  type FlatObjectPropSchema,
  localized,
  type PropSchema,
  type PropsIssue,
  type PropsSchema,
  type ScalarPropSchema,
} from "@cloudhal/core-ts/blocks";
import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { InsetPanel } from "./InsetPanel.tsx";

/** The form's own words; the fields' words come from the schema (`title`, `description`). */
export interface BlockPropsFormLabels {
  addItem: string;
  removeItem: string;
  moveUp: string;
  moveDown: string;
  /** An item's heading, e.g. "Item {n}" with `{n}` replaced. */
  item: string;
}

export interface BlockPropsFormProps {
  schema: PropsSchema;
  value: Readonly<Record<string, unknown>>;
  onChange: (next: Record<string, unknown>) => void;
  /** From `validateProps`: shown on the field each one names. */
  issues?: readonly PropsIssue[];
  /** The UI language, for the schema's per-locale titles. */
  locale: string;
  labels: BlockPropsFormLabels;
  /** Words for enum values (`tone` → `warning`): the value itself when absent. */
  enumLabel?: (prop: string, value: string) => string;
  disabled?: boolean;
}

type Obj = Record<string, unknown>;

const human = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** Sets `key`, dropping it when emptied (an optional prop left blank is absent, not ""). */
function setKey(obj: Readonly<Obj>, key: string, v: unknown): Obj {
  const next: Obj = { ...obj };
  if (v === undefined || v === "") delete next[key];
  else next[key] = v;
  return next;
}

/**
 * A form for a block's props, generated from its schema (RFC-0015 §8): text, long text and
 * markdown, links, choices (select or radio), numbers, switches, and lists with add, move and
 * remove. Built from the same JSON Schema subset the store validates, so every block type —
 * Cloudhal's or a theme's — gets a form without code of its own.
 */
export function BlockPropsForm({
  schema,
  value,
  onChange,
  issues = [],
  locale,
  labels,
  enumLabel,
  disabled = false,
}: BlockPropsFormProps) {
  const errorAt = (path: string) => issues.find((i) => i.path === path)?.message;
  const text = (v: Parameters<typeof localized>[0]) => localized(v, locale);

  const scalar = (
    key: string,
    s: ScalarPropSchema,
    v: unknown,
    path: string,
    set: (v: unknown) => void,
  ) => {
    const label = text(s.title) || human(key);
    const description = text(s.description) || undefined;
    const error = errorAt(path);
    switch (s.type) {
      case "boolean":
        return (
          <Checkbox
            key={path}
            label={label}
            checked={v === true}
            disabled={disabled}
            onCheckedChange={(on: boolean) => set(on || undefined)}
          />
        );
      case "number":
      case "integer":
        return (
          <Input
            key={path}
            className="w-full"
            type="number"
            label={label}
            description={description}
            error={error}
            value={typeof v === "number" ? String(v) : ""}
            disabled={disabled}
            onValueChange={(raw: string) =>
              set(raw.trim() === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : raw)
            }
          />
        );
      case "string": {
        const current = typeof v === "string" ? v : "";
        if (s.enum) {
          // The schema's own words first (`x-labels`, a theme's), then the host's, then the value.
          const words = (option: string) => {
            const own = s["x-labels"]?.[option];
            return own !== undefined ? text(own) : (enumLabel?.(key, option) ?? option);
          };
          return s["x-widget"] === "radio" ? (
            <Radio.Group
              key={path}
              orientation="horizontal"
              value={current || (typeof s.default === "string" ? s.default : "")}
              onValueChange={(next) => set(next as string)}
              disabled={disabled}
              error={error}
            >
              <Radio.Legend>{label}</Radio.Legend>
              {s.enum.map((option) => (
                <Radio.Item key={option} value={option} label={words(option)} />
              ))}
            </Radio.Group>
          ) : (
            <Select
              key={path}
              className="w-full"
              label={label}
              description={description}
              error={error}
              value={current || (typeof s.default === "string" ? s.default : "")}
              disabled={disabled}
              onValueChange={(next) => set(next as string)}
              items={Object.fromEntries(s.enum.map((option) => [option, words(option)]))}
            />
          );
        }
        if (s.format === "markdown" || s["x-widget"] === "textarea")
          return (
            <InputArea
              key={path}
              className="w-full"
              label={label}
              description={description}
              error={error}
              value={current}
              maxLength={s.maxLength}
              disabled={disabled}
              onValueChange={set}
            />
          );
        if (s.format === "color") {
          const swatch = /^#[0-9a-fA-F]{6}$/.test(current)
            ? current
            : typeof s.default === "string"
              ? s.default
              : undefined;
          return (
            <Field
              key={path}
              label={label}
              description={description}
              error={error ? { message: error, match: true } : undefined}
            >
              <InputGroup className="w-full" disabled={disabled}>
                <InputGroup.Addon>
                  <span
                    aria-hidden="true"
                    data-color-swatch=""
                    className="block size-4 rounded-sm ring ring-kumo-line"
                    style={swatch ? { background: swatch } : undefined}
                  />
                </InputGroup.Addon>
                <InputGroup.Input
                  aria-label={label}
                  value={current}
                  placeholder={typeof s.default === "string" ? s.default : "#000000"}
                  maxLength={7}
                  spellCheck={false}
                  className="font-mono"
                  onChange={(e) => set((e.target as HTMLInputElement).value)}
                />
              </InputGroup>
            </Field>
          );
        }
        return (
          <Input
            key={path}
            className="w-full"
            type={s.format === "url" ? "url" : "text"}
            label={label}
            description={description}
            error={error}
            value={current}
            maxLength={s.maxLength}
            disabled={disabled}
            onValueChange={set}
          />
        );
      }
    }
  };

  const fields = (
    props: Readonly<Record<string, ScalarPropSchema>>,
    obj: Readonly<Obj>,
    base: string,
    set: (next: Obj) => void,
  ) =>
    Object.entries(props).map(([key, s]) =>
      scalar(key, s, obj[key], base ? `${base}/${key}` : key, (v) => set(setKey(obj, key, v))),
    );

  const list = (key: string, s: ArrayPropSchema, v: unknown, set: (v: unknown) => void) => {
    const items = Array.isArray(v) ? (v as unknown[]) : [];
    const max = s.maxItems ?? 50;
    const replace = (next: unknown[]) => set(next.length ? next : undefined);
    const move = (i: number, by: -1 | 1) => {
      const next = [...items];
      const j = i + by;
      [next[i], next[j]] = [next[j], next[i]];
      replace(next);
    };
    const error = errorAt(key);
    return (
      <div key={key} className="grid min-w-0 gap-2" data-prop={key}>
        <div className="grid gap-0.5">
          <Text bold as="span">
            {text(s.title) || human(key)}
          </Text>
          {s.description && (
            <Text variant="secondary" size="sm" as="span">
              {text(s.description)}
            </Text>
          )}
          {error && (
            <Text variant="error" size="sm" as="span">
              {error}
            </Text>
          )}
        </div>
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list items have no id; every input is controlled by the item's value.
          <InsetPanel key={i}>
            <div className="grid min-w-0 gap-3" data-item={i}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm" as="span" variant="secondary">
                  {labels.item.replace("{n}", String(i + 1))}
                </Text>
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<ArrowUp />}
                    aria-label={labels.moveUp}
                    disabled={disabled || i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<ArrowDown />}
                    aria-label={labels.moveDown}
                    disabled={disabled || i === items.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<Trash />}
                    aria-label={labels.removeItem}
                    disabled={disabled}
                    onClick={() => replace(items.filter((_, j) => j !== i))}
                  />
                </span>
              </div>
              {s.items.type === "object"
                ? fields(
                    (s.items as FlatObjectPropSchema).properties,
                    (item ?? {}) as Obj,
                    `${key}/${i}`,
                    (next) => replace(items.map((x, j) => (j === i ? next : x))),
                  )
                : scalar(key, s.items, item, `${key}/${i}`, (next) =>
                    replace(items.map((x, j) => (j === i ? next : x))),
                  )}
            </div>
          </InsetPanel>
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            disabled={disabled || items.length >= max}
            onClick={() => replace([...items, s.items.type === "object" ? {} : ""])}
          >
            {labels.addItem}
          </Button>
        </div>
      </div>
    );
  };

  const field = (key: string, s: PropSchema) => {
    const set = (v: unknown) => onChange(setKey(value, key, v));
    if (s.type === "array") return list(key, s, value[key], set);
    if (s.type === "object")
      return (
        <fieldset key={key} className="grid min-w-0 gap-3" data-prop={key}>
          <Text bold as="legend">
            {text(s.title) || human(key)}
          </Text>
          {fields(s.properties, (value[key] ?? {}) as Obj, key, (next) =>
            set(Object.keys(next).length ? next : undefined),
          )}
        </fieldset>
      );
    return scalar(key, s, value[key], key, set);
  };

  return (
    <div className="grid min-w-0 gap-4" data-block-props-form="">
      {errorAt("") && (
        <Text variant="error" size="sm">
          {errorAt("")}
        </Text>
      )}
      {Object.entries(schema.properties).map(([key, s]) => field(key, s))}
    </div>
  );
}

import {
  Badge,
  Button,
  Checkbox,
  Input,
  InputArea,
  Link,
  Select,
  Switch,
  Text,
} from "@cloudflare/kumo";
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { fieldHelp, fieldLabel, optionLabel } from "@cloudhal/core-ts/fields";
import { type ReactNode, useEffect, useState } from "react";
import { DateTimeField, type DateTimeFieldLabels, type DateTimeValue } from "./DateTimeField.tsx";
import {
  type FieldValues,
  fallbackText,
  hasValue,
  instantOf,
  readField,
  writeField,
} from "./entry-fields-model.ts";
import { wallClockOf, zonedToInstant } from "./zoned-time.ts";

/** The form's own words; the fields' words come from their definitions (`labels`). */
export interface EntryFieldsFormLabels {
  /** The marker of a `requiredToPublish` field: "Needed to publish". */
  neededToPublish: string;
  /** Under a non-localized field of a translation: "From the original (English)". */
  fromOriginal: string;
  /** The link to the original next to it: "Open the original". */
  openOriginal: string;
  /** Under an empty localized field whose control has no placeholder: "The original: {value}". */
  originalValue: (text: string) => string;
  yes: string;
  no: string;
  /** A select's empty choice: "No value". */
  noValue: string;
  /** Removes a date or a date and time: "Clear". */
  clear: string;
  /** What an image of the original is called in a fallback line: "The original's image". */
  originalImage: string;
  /** The date and time controls' words (`DateTimeField`). */
  date: DateTimeFieldLabels;
}

/** What the host renders for a rich text field (Studio: the lazy markdown body editor). */
export interface FieldRichTextSlot {
  def: FieldDefinition;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  placeholder: string | undefined;
}

/** What the host renders for an image field (Studio: the media picker); the value is an asset id. */
export interface FieldImageSlot {
  def: FieldDefinition;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: string | undefined;
  onChange: (assetId: string | undefined) => void;
  readOnly: boolean;
}

/** The translation group's original, when the entry is a translation in the same site. */
export interface EntryFieldsOriginal {
  values: FieldValues | undefined;
  /** Its editor. */
  href: string;
}

export interface EntryFieldsFormProps {
  /** The collection's definitions, in form order. */
  definitions: readonly FieldDefinition[];
  /** The entry's own `fields`. */
  value: FieldValues | undefined;
  onChange: (next: Record<string, unknown>) => void;
  /** The Studio language (labels, numbers, dates) and the site's default (label fallback). */
  locale: string;
  defaultLocale: string;
  /** Worded problems by field key (from the API's `details.issues`). */
  errors?: Readonly<Record<string, string>>;
  /** A field's limits in words ("Up to 200 characters"), shown after its help. */
  hint?: (def: FieldDefinition) => string | undefined;
  original?: EntryFieldsOriginal | undefined;
  /** The zone a new date and time is entered in (the site's), and how a zone reads. */
  timeZone: string;
  zoneLabel: (timeZone: string) => string;
  labels: EntryFieldsFormLabels;
  renderRichText?: (slot: FieldRichTextSlot) => ReactNode;
  renderImage?: (slot: FieldImageSlot) => ReactNode;
  disabled?: boolean;
}

/** One field as its control sees it. */
interface Ctl {
  def: FieldDefinition;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: unknown;
  set: (v: unknown) => void;
  readOnly: boolean;
  /** The original's value as text, for an empty localized field of a translation. */
  placeholder: string | undefined;
  props: EntryFieldsFormProps;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function TextControl({ def, label, description, error, value, set, readOnly, placeholder }: Ctl) {
  const common = {
    className: "w-full",
    label,
    description,
    error,
    value: str(value),
    placeholder,
    disabled: readOnly,
    onValueChange: set,
  };
  if (def.type === "text" && def.multiline)
    return <InputArea {...common} maxLength={def.maxLength} autoResize minRows={2} maxRows={8} />;
  return (
    <Input
      {...common}
      type={def.type === "url" ? "url" : "text"}
      maxLength={def.type === "text" ? def.maxLength : def.type === "url" ? 2048 : undefined}
    />
  );
}

function NumberControl({ def, label, description, error, value, set, readOnly, placeholder }: Ctl) {
  const integer = def.type === "number" && def.integer === true;
  return (
    <Input
      className="w-full"
      type="number"
      label={label}
      description={description}
      error={error}
      value={typeof value === "number" ? String(value) : str(value)}
      placeholder={placeholder}
      disabled={readOnly}
      min={def.type === "number" ? def.minimum : undefined}
      max={def.type === "number" ? def.maximum : undefined}
      step={integer ? 1 : "any"}
      onValueChange={(raw: string) =>
        set(raw.trim() === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : raw)
      }
    />
  );
}

function BooleanControl({ label, description, value, set, readOnly }: Ctl) {
  return (
    <div className="grid gap-1.5">
      <Switch
        label={label}
        checked={value === true}
        disabled={readOnly}
        onCheckedChange={(on: boolean) => set(on || undefined)}
      />
      {description && (
        <Text variant="secondary" size="sm" as="span">
          {description}
        </Text>
      )}
    </div>
  );
}

function SelectControl(c: Ctl) {
  const { def, label, description, error, value, set, readOnly, placeholder, props } = c;
  if (def.type !== "select") return null;
  const words = (v: string) => optionLabel(def, v, props.locale, props.defaultLocale);
  if (def.multiple) {
    const chosen = Array.isArray(value) ? value.map(String) : [];
    return (
      <Checkbox.Group
        legend={label}
        description={description}
        error={error}
        disabled={readOnly}
        value={chosen}
        allValues={def.options.map((o) => o.value)}
        onValueChange={(next: string[]) =>
          set(def.options.map((o) => o.value).filter((v) => next.includes(v)))
        }
      >
        {def.options.map((o) => (
          <Checkbox.Item key={o.value} value={o.value} label={words(o.value)} />
        ))}
      </Checkbox.Group>
    );
  }
  return (
    <Select
      className="w-full"
      label={label}
      description={description}
      error={error}
      value={str(value)}
      placeholder={placeholder}
      disabled={readOnly}
      onValueChange={(v) => set(v as string)}
      items={{
        "": props.labels.noValue,
        ...Object.fromEntries(def.options.map((o) => [o.value, words(o.value)])),
      }}
    />
  );
}

/** A date, or a date and time in a zone (`{ at, timeZone }`): the wall clock is kept while partial. */
function DateControl({ def, label, description, error, value, set, readOnly, props }: Ctl) {
  const instant = instantOf(value);
  const zone = instant?.timeZone ?? props.timeZone;
  const stored: DateTimeValue =
    def.type === "date"
      ? { date: str(value) || undefined }
      : instant
        ? wallClockOf(instant.at, zone)
        : {};
  const key = JSON.stringify(stored);
  const [draft, setDraft] = useState<DateTimeValue>(stored);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follows the stored value only.
  useEffect(() => setDraft(stored), [key]);
  const change = (next: DateTimeValue) => {
    setDraft(next);
    if (def.type === "date") return set(next.date);
    if (next.date && next.time)
      set({ at: zonedToInstant({ date: next.date, time: next.time }, zone).at, timeZone: zone });
  };
  const empty = !hasValue(draft.date) && !hasValue(draft.time);
  return (
    <div className="grid gap-1.5">
      <DateTimeField
        label={label}
        description={description}
        value={draft}
        onChange={change}
        locale={props.locale}
        timeZone={zone}
        zoneLabel={props.zoneLabel(zone)}
        labels={props.labels.date}
        error={error}
        disabled={readOnly}
        dateOnly={def.type === "date"}
        className="w-full"
      />
      {!readOnly && !empty && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft({});
              set(undefined);
            }}
          >
            {props.labels.clear}
          </Button>
        </div>
      )}
    </div>
  );
}

function RichTextControl(c: Ctl) {
  const slot: FieldRichTextSlot = {
    def: c.def,
    label: c.label,
    description: c.description,
    error: c.error,
    value: str(c.value),
    onChange: c.set,
    readOnly: c.readOnly,
    placeholder: c.placeholder,
  };
  if (c.props.renderRichText) return <>{c.props.renderRichText(slot)}</>;
  return (
    <InputArea
      className="w-full font-mono"
      label={c.label}
      description={c.description}
      error={c.error}
      value={slot.value}
      placeholder={c.placeholder}
      disabled={c.readOnly}
      onValueChange={c.set}
      autoResize
      minRows={4}
      maxRows={16}
    />
  );
}

function ImageControl(c: Ctl) {
  const slot: FieldImageSlot = {
    def: c.def,
    label: c.label,
    description: c.description,
    error: c.error,
    value: str(c.value) || undefined,
    onChange: c.set,
    readOnly: c.readOnly,
  };
  if (c.props.renderImage) return <>{c.props.renderImage(slot)}</>;
  return (
    <Input
      className="w-full font-mono"
      label={c.label}
      description={c.description}
      error={c.error}
      value={slot.value ?? ""}
      disabled={c.readOnly}
      onValueChange={c.set}
    />
  );
}

const CONTROLS: Record<FieldDefinition["type"], (c: Ctl) => ReactNode> = {
  text: TextControl,
  url: TextControl,
  richText: RichTextControl,
  number: NumberControl,
  boolean: BooleanControl,
  date: DateControl,
  datetime: DateControl,
  image: ImageControl,
  select: SelectControl,
};

/** Placeholders only fit controls that show text; the rest say it under the control. */
const HAS_PLACEHOLDER = new Set(["text", "url", "number", "richText"]);

/** The description: "Needed to publish", help, limits, and where a translation's value comes from. */
function describe(
  def: FieldDefinition,
  props: EntryFieldsFormProps,
  extra: { inherited: boolean; fallback: string | undefined },
): ReactNode {
  const { labels, locale, defaultLocale, original } = props;
  const help = fieldHelp(def, locale, defaultLocale);
  const hint = props.hint?.(def);
  const required = def.type !== "boolean" && def.requiredToPublish === true;
  const words = [help, hint].filter(Boolean).join(" ");
  const fallback =
    extra.fallback && !HAS_PLACEHOLDER.has(def.type) ? labels.originalValue(extra.fallback) : "";
  if (!required && !words && !extra.inherited && !fallback) return undefined;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-field-description={def.key}>
      {required && (
        <Badge variant="outline" data-needed-to-publish="">
          {labels.neededToPublish}
        </Badge>
      )}
      {words && <span>{words}</span>}
      {fallback && <span data-field-fallback="">{fallback}</span>}
      {extra.inherited && original && (
        <span data-field-inherited="">
          {labels.fromOriginal} · <Link href={original.href}>{labels.openOriginal}</Link>
        </span>
      )}
    </span>
  );
}

/**
 * An entry's typed custom fields (RFC-0041 §7, DESIGN.md §2ah): one Kumo control per type — text
 * (`Input`, `InputArea` when multiline), rich text (the host's markdown editor, else a markdown
 * `InputArea`), number, boolean (`Switch`), date and date-time (`DateTimeField`, the lazy
 * `DatePicker` in the Studio locale; date-times in their own zone), URL, image (the host's media
 * picker) and select (`Select`, a `Checkbox` group when multiple). Labels and help come from the
 * definitions in the Studio language; required fields carry "Needed to publish"; errors show on
 * their field. On a translation, non-localized fields show the original's value read-only with a
 * link to it, and empty localized ones show the original's value as their placeholder.
 */
export function EntryFieldsForm(props: EntryFieldsFormProps) {
  const { definitions, value, onChange, locale, defaultLocale, original, labels } = props;
  const context = {
    locale,
    defaultLocale,
    yes: labels.yes,
    no: labels.no,
    image: labels.originalImage,
  };
  return (
    <div className="grid min-w-0 gap-5" data-entry-fields-form="">
      {definitions.map((def) => {
        const inherited = original !== undefined && !def.localized;
        const own = readField(value, def);
        const theirs = original ? readField(original.values, def) : undefined;
        const fallback =
          original && def.localized && !hasValue(own) && hasValue(theirs)
            ? fallbackText(def, theirs, context)
            : undefined;
        const Control = CONTROLS[def.type];
        return (
          <div key={def.key} className="min-w-0" data-field={def.key} data-field-type={def.type}>
            <Control
              def={def}
              label={fieldLabel(def, locale, defaultLocale)}
              description={describe(def, props, { inherited, fallback })}
              error={props.errors?.[def.key]}
              value={inherited ? theirs : own}
              set={(v) => onChange(writeField(value, def, v))}
              readOnly={props.disabled === true || inherited}
              placeholder={fallback && HAS_PLACEHOLDER.has(def.type) ? fallback : undefined}
              props={props}
            />
          </div>
        );
      })}
    </div>
  );
}

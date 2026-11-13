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
import type {
  FieldDefinition,
  ReferenceField,
  ReferenceSubField,
  SubFieldDefinition,
} from "@cloudhal/core-contracts";
import { FIELD_LIMITS, fieldHelp, optionLabel } from "@cloudhal/core-ts/fields";
import { type ReactNode, useEffect, useId, useState } from "react";
import { DateTimeField, type DateTimeFieldLabels, type DateTimeValue } from "./DateTimeField.tsx";
import { hasValue, instantOf, referenceIds } from "./entry-fields-model.ts";
import { wallClockOf, zonedToInstant } from "./zoned-time.ts";

/** A field or a repeater's sub-field: what one control edits. */
export type AnyFieldDefinition = FieldDefinition | SubFieldDefinition;

/** The controls' own words; the fields' words come from their definitions (`labels`). */
export interface FieldControlLabels {
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
  def: AnyFieldDefinition;
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
  def: AnyFieldDefinition;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: string | undefined;
  onChange: (assetId: string | undefined) => void;
  readOnly: boolean;
}

/**
 * What the host renders for a reference (RFC-0045 §5; Studio: `ReferenceList` and `EntryPicker`
 * around the picker route), inside the block's `fieldset`, which carries the label, the
 * description and the error. Values are translation group ids, in order.
 */
export interface FieldReferenceSlot {
  def: ReferenceField | ReferenceSubField;
  /** The value's path under `fields`: `venue`, or `speakers/2/person` in a repeater item. */
  path: string;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: readonly string[];
  /** A list of targets (`multiple`), or one. */
  multiple: boolean;
  /** At most this many targets (1 unless `multiple`). */
  max: number;
  onChange: (ids: readonly string[]) => void;
  readOnly: boolean;
  /**
   * An empty localized field of a translation: the original's targets. The form words them under
   * the control through `referenceTitle`; the host loads them so it can.
   */
  fallback: readonly string[] | undefined;
}

/** Everything a control needs besides its own field. */
export interface FieldControlContext {
  /** The Studio language (labels, numbers, dates) and the site's default (label fallback). */
  locale: string;
  defaultLocale: string;
  /** The zone a new date and time is entered in (the site's), and how a zone reads. */
  timeZone: string;
  zoneLabel: (timeZone: string) => string;
  labels: FieldControlLabels;
  renderRichText?: ((slot: FieldRichTextSlot) => ReactNode) | undefined;
  renderImage?: ((slot: FieldImageSlot) => ReactNode) | undefined;
  renderReference?: ((slot: FieldReferenceSlot) => ReactNode) | undefined;
}

export interface FieldControlProps {
  def: AnyFieldDefinition;
  /** The value's path under `fields` (`venue`, `speakers/2/person`). */
  path: string;
  label: string;
  description: ReactNode;
  error: string | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  /** The original's value as text, for an empty localized field of a translation. */
  placeholder?: string | undefined;
  /** The original's value itself, for controls that show it their own way (references). */
  fallbackValue?: unknown;
  context: FieldControlContext;
}

type Ctl = FieldControlProps;

const str = (v: unknown) => (typeof v === "string" ? v : "");

function TextControl({
  def,
  label,
  description,
  error,
  value,
  onChange,
  readOnly,
  placeholder,
}: Ctl) {
  const common = {
    className: "w-full",
    label,
    description,
    error,
    value: str(value),
    placeholder,
    disabled: readOnly,
    onValueChange: onChange,
  };
  if (def.type === "text" && def.multiline)
    return <InputArea {...common} maxLength={def.maxLength} autoResize minRows={2} maxRows={8} />;
  return (
    <Input
      {...common}
      type={def.type === "url" ? "url" : "text"}
      maxLength={
        def.type === "text"
          ? def.maxLength
          : def.type === "url"
            ? FIELD_LIMITS.urlLength
            : undefined
      }
    />
  );
}

function NumberControl(c: Ctl) {
  const { def, label, description, error, value, onChange, readOnly, placeholder } = c;
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
        onChange(raw.trim() === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : raw)
      }
    />
  );
}

function BooleanControl({ label, description, value, onChange, readOnly }: Ctl) {
  return (
    <div className="grid gap-1.5">
      <Switch
        label={label}
        checked={value === true}
        disabled={readOnly}
        onCheckedChange={(on: boolean) => onChange(on || undefined)}
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
  const { def, label, description, error, value, onChange, readOnly, placeholder, context } = c;
  if (def.type !== "select") return null;
  const words = (v: string) => optionLabel(def, v, context.locale, context.defaultLocale);
  if ("multiple" in def && def.multiple) {
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
          onChange(def.options.map((o) => o.value).filter((v) => next.includes(v)))
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
      onValueChange={(v) => onChange(v as string)}
      items={{
        "": context.labels.noValue,
        ...Object.fromEntries(def.options.map((o) => [o.value, words(o.value)])),
      }}
    />
  );
}

/** A date, or a date and time in a zone (`{ at, timeZone }`): the wall clock is kept while partial. */
function DateControl(c: Ctl) {
  const { def, label, description, error, value, onChange, readOnly, context } = c;
  const instant = instantOf(value);
  const zone = instant?.timeZone ?? context.timeZone;
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
    if (def.type === "date") return onChange(next.date);
    if (next.date && next.time)
      onChange({
        at: zonedToInstant({ date: next.date, time: next.time }, zone).at,
        timeZone: zone,
      });
  };
  const empty = !hasValue(draft.date) && !hasValue(draft.time);
  return (
    <div className="grid gap-1.5">
      <DateTimeField
        label={label}
        description={description}
        value={draft}
        onChange={change}
        locale={context.locale}
        timeZone={zone}
        zoneLabel={context.zoneLabel(zone)}
        labels={context.labels.date}
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
              onChange(undefined);
            }}
          >
            {context.labels.clear}
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
    onChange: c.onChange,
    readOnly: c.readOnly,
    placeholder: c.placeholder,
  };
  if (c.context.renderRichText) return <>{c.context.renderRichText(slot)}</>;
  return (
    <InputArea
      className="w-full font-mono"
      label={c.label}
      description={c.description}
      error={c.error}
      value={slot.value}
      placeholder={c.placeholder}
      disabled={c.readOnly}
      onValueChange={c.onChange}
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
    onChange: c.onChange,
    readOnly: c.readOnly,
  };
  if (c.context.renderImage) return <>{c.context.renderImage(slot)}</>;
  return (
    <Input
      className="w-full font-mono"
      label={c.label}
      description={c.description}
      error={c.error}
      value={slot.value ?? ""}
      disabled={c.readOnly}
      onValueChange={c.onChange}
    />
  );
}

/** A stored value read-only, as JSON: a reference without a host picker, or a value of no known shape. */
function StoredValueControl({ label, description, error, value }: Ctl) {
  return (
    <Input
      className="w-full font-mono"
      label={label}
      description={description}
      error={error}
      value={value === undefined ? "" : JSON.stringify(value)}
      disabled
    />
  );
}

/** RFC-0045: a reference through the host's picker; one id is stored bare, several as a list. */
function ReferenceControl(c: Ctl) {
  const about = useId();
  const { def } = c;
  if (def.type !== "reference" || !c.context.renderReference) return StoredValueControl(c);
  const multiple = "multiple" in def && def.multiple === true;
  const max = multiple ? ("maxItems" in def ? def.maxItems : undefined) : 1;
  const fallback = referenceIds(c.fallbackValue);
  const slot: FieldReferenceSlot = {
    def,
    path: c.path,
    label: c.label,
    description: c.description,
    error: c.error,
    value: referenceIds(c.value),
    multiple,
    max: max ?? FIELD_LIMITS.listItems,
    onChange: (ids) => c.onChange(multiple ? [...ids] : ids[0]),
    readOnly: c.readOnly,
    fallback: fallback.length ? fallback : undefined,
  };
  return (
    <fieldset
      className="grid min-w-0 gap-2"
      aria-describedby={c.description || c.error ? about : undefined}
      data-field-reference={c.path}
    >
      {/* Kumo's own label style (`Field`, `Checkbox.Group`). */}
      <legend className="mb-1.5 text-base font-medium text-kumo-default">{c.label}</legend>
      {c.context.renderReference(slot)}
      {(c.description || c.error) && (
        <span className="grid gap-1" id={about}>
          {c.description && (
            <Text variant="secondary" size="sm" as="span">
              {c.description}
            </Text>
          )}
          {c.error && (
            <Text variant="error" size="sm" as="span">
              {c.error}
            </Text>
          )}
        </span>
      )}
    </fieldset>
  );
}

const CONTROLS: Record<AnyFieldDefinition["type"], (c: Ctl) => ReactNode> = {
  text: TextControl,
  url: TextControl,
  richText: RichTextControl,
  number: NumberControl,
  boolean: BooleanControl,
  date: DateControl,
  datetime: DateControl,
  image: ImageControl,
  select: SelectControl,
  reference: ReferenceControl,
  // A repeater renders through `RepeaterField` (EntryFieldsForm); never as a sub-field.
  repeater: StoredValueControl,
};

/** Placeholders only fit controls that show text; the rest say it under the control. */
export const HAS_PLACEHOLDER: ReadonlySet<string> = new Set(["text", "url", "number", "richText"]);

/** What a description says besides the field's own help. */
export interface DescribeExtra {
  /** A limit in words ("Up to 80 characters."), after the help. */
  hint?: string | undefined;
  /** The original's value in words, for a control without a placeholder. */
  fallback?: string | undefined;
  /** The value is the original's: "From the original · Open the original". */
  inherited?: { href: string } | undefined;
  /** One more line, such as a shared list's "Not translated" note. */
  note?: string | undefined;
}

/** A field's description: "Needed to publish", help, limits, and where a translation's value comes from. */
export function describeField(
  def: AnyFieldDefinition,
  context: Pick<FieldControlContext, "labels" | "locale" | "defaultLocale">,
  extra: DescribeExtra = {},
): ReactNode {
  const { labels } = context;
  const help = fieldHelp(def, context.locale, context.defaultLocale);
  const required = def.type !== "boolean" && def.requiredToPublish === true;
  const words = [help, extra.hint, extra.note].filter(Boolean).join(" ");
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
      {extra.inherited && (
        <span data-field-inherited="">
          {labels.fromOriginal} · <Link href={extra.inherited.href}>{labels.openOriginal}</Link>
        </span>
      )}
    </span>
  );
}

/**
 * One typed value's Kumo control (RFC-0041 §7, RFC-0045 §5): text (`Input`, `InputArea` when
 * multiline), rich text (the host's markdown editor, else a markdown `InputArea`), number, boolean
 * (`Switch`), date and date-time (`DateTimeField`), URL, image (the host's media picker), select
 * (`Select`, a `Checkbox` group when multiple) and reference (the host's picker, else the stored
 * ids read-only). `EntryFieldsForm` uses it for fields, `RepeaterField` items for sub-fields.
 */
export function FieldControl(props: FieldControlProps) {
  const Control = CONTROLS[props.def.type];
  return <Control {...props} />;
}

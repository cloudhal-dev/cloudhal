import type { FieldDefinition } from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import { type ReactNode, useMemo } from "react";
import { EntryRepeater, type EntryRepeaterLabels } from "./EntryRepeater.tsx";
import {
  errorUnder,
  type FallbackContext,
  type FieldValues,
  fallbackText,
  hasValue,
  type RepeaterErrors,
  readField,
  repeaterErrors,
  writeField,
} from "./entry-fields-model.ts";
import {
  describeField,
  FieldControl,
  type FieldControlContext,
  type FieldControlLabels,
  type FieldImageSlot,
  type FieldReferenceSlot,
  type FieldRichTextSlot,
  HAS_PLACEHOLDER,
} from "./FieldControl.tsx";

export type {
  AnyFieldDefinition,
  FieldImageSlot,
  FieldReferenceSlot,
  FieldRichTextSlot,
} from "./FieldControl.tsx";

/** The form's own words; the fields' words come from their definitions (`labels`). */
export interface EntryFieldsFormLabels extends FieldControlLabels, EntryRepeaterLabels {
  /** Under a list shared by every language (a repeater that is not localized). */
  sharedList: string;
  /** The original's items in a fallback line when they have no names: "3 items". */
  items: (count: number) => string;
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
  /**
   * Worded problems by path under `fields` (from the API's `details.issues`): `venue`,
   * `startsAt/at`, or in a repeater `speakers/2` and `speakers/2/person`.
   */
  errors?: Readonly<Record<string, string>>;
  /** A field's limits in words ("Up to 200 characters"), shown after its help. */
  hint?: (def: FieldDefinition) => string | undefined;
  original?: EntryFieldsOriginal | undefined;
  /** The site has more than one language: shared lists say so. */
  multilingual?: boolean;
  /** The zone a new date and time is entered in (the site's), and how a zone reads. */
  timeZone: string;
  zoneLabel: (timeZone: string) => string;
  labels: EntryFieldsFormLabels;
  renderRichText?: (slot: FieldRichTextSlot) => ReactNode;
  renderImage?: (slot: FieldImageSlot) => ReactNode;
  /** RFC-0045: a reference's picker (Studio: `ReferenceList` and `EntryPicker`). */
  renderReference?: (slot: FieldReferenceSlot) => ReactNode;
  /** A target's title, when the host knows it (repeater legends, a translation's fallback line). */
  referenceTitle?: (groupId: string) => string | undefined;
  /** After a repeater item is removed: the host offers `undo` (Studio: a toast). */
  onItemRemoved?: (removed: { field: string; legend: string; undo: () => void }) => void;
  disabled?: boolean;
}

/**
 * What one field shows: its own value, or on a translation the original's (read-only when the
 * field is shared), the original's value in words for an empty localized one, and the description.
 */
function fieldState(
  def: FieldDefinition,
  props: EntryFieldsFormProps,
  context: FieldControlContext,
  fallbackContext: FallbackContext,
) {
  const { original } = props;
  const inherited = original !== undefined && !def.localized;
  const own = readField(props.value, def);
  const theirs = original ? readField(original.values, def) : undefined;
  const emptyLocalized = original !== undefined && def.localized && !hasValue(own);
  const fallback =
    emptyLocalized && hasValue(theirs) ? fallbackText(def, theirs, fallbackContext) : undefined;
  const shared = def.type === "repeater" && !def.localized && props.multilingual === true;
  const description = describeField(def, context, {
    hint: props.hint?.(def),
    fallback,
    inherited: inherited && original ? { href: original.href } : undefined,
    note: shared ? props.labels.sharedList : undefined,
  });
  return {
    inherited,
    shown: inherited ? theirs : own,
    fallback,
    fallbackValue: emptyLocalized ? theirs : undefined,
    description,
  };
}

/**
 * An entry's typed custom fields (RFC-0041 §7, RFC-0045 §5, DESIGN.md §2ah): one `FieldControl`
 * per field, and `RepeaterField` items for repeaters, their sub-fields at item paths. Labels and
 * help come from the definitions in the Studio language; required fields carry "Needed to
 * publish"; errors show on their control by path. On a translation, non-localized fields show the
 * original's value read-only with a link to it, and empty localized ones show the original's
 * value as their placeholder.
 */
export function EntryFieldsForm(props: EntryFieldsFormProps) {
  const { definitions, value, onChange, locale, defaultLocale, labels } = props;
  const context: FieldControlContext = {
    locale,
    defaultLocale,
    timeZone: props.timeZone,
    zoneLabel: props.zoneLabel,
    labels,
    renderRichText: props.renderRichText,
    renderImage: props.renderImage,
    renderReference: props.renderReference,
  };
  const fallbackContext: FallbackContext = {
    locale,
    defaultLocale,
    yes: labels.yes,
    no: labels.no,
    image: labels.originalImage,
    referenceTitle: props.referenceTitle,
    items: labels.items,
  };
  // One map per error object, so a repeater opens its invalid items once per failed save.
  const { errors } = props;
  const nested = useMemo(() => {
    const out = new Map<string, RepeaterErrors>();
    for (const def of definitions)
      if (def.type === "repeater") out.set(def.key, repeaterErrors(errors, def.key));
    return out;
  }, [definitions, errors]);
  return (
    <div className="grid min-w-0 gap-5" data-entry-fields-form="">
      {definitions.map((def) => {
        const { inherited, shown, fallback, fallbackValue, description } = fieldState(
          def,
          props,
          context,
          fallbackContext,
        );
        const label = fieldLabel(def, locale, defaultLocale);
        const readOnly = props.disabled === true || inherited;
        const set = (v: unknown) => onChange(writeField(value, def, v));
        return (
          <div key={def.key} className="min-w-0" data-field={def.key} data-field-type={def.type}>
            {def.type === "repeater" ? (
              <EntryRepeater
                def={def}
                label={label}
                description={description}
                errors={nested.get(def.key) ?? { field: undefined, items: new Map() }}
                value={shown}
                onChange={set}
                readOnly={readOnly}
                context={context}
                labels={labels}
                referenceTitle={props.referenceTitle}
                onRemoved={
                  props.onItemRemoved
                    ? (r) =>
                        props.onItemRemoved?.({ field: def.key, legend: r.legend, undo: r.undo })
                    : undefined
                }
              />
            ) : (
              <FieldControl
                def={def}
                path={def.key}
                label={label}
                description={description}
                error={errorUnder(props.errors, def.key)}
                value={shown}
                onChange={set}
                readOnly={readOnly}
                placeholder={fallback && HAS_PLACEHOLDER.has(def.type) ? fallback : undefined}
                fallbackValue={fallbackValue}
                context={context}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

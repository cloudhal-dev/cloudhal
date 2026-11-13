import type { RepeaterField as RepeaterDefinition } from "@cloudhal/core-contracts";
import { FIELD_LIMITS, fieldLabel } from "@cloudhal/core-ts/fields";
import type { ReactNode } from "react";
import { itemName, type RepeaterErrors, shownItems, unconverted } from "./entry-fields-model.ts";
import { describeField, FieldControl, type FieldControlContext } from "./FieldControl.tsx";
import { RepeaterField, type RepeaterFieldLabels } from "./RepeaterField.tsx";

/** The words a repeater adds to the form's. */
export interface EntryRepeaterLabels {
  repeater: RepeaterFieldLabels;
  /** An item's legend, an ICU message: "Item 2: Ada Lovelace", or "Item 2" without a name. */
  itemLegend: (index: number, name: string | undefined) => string;
}

export interface EntryRepeaterProps {
  def: RepeaterDefinition;
  label: string;
  description: ReactNode;
  errors: RepeaterErrors;
  value: unknown;
  onChange: (items: unknown) => void;
  readOnly: boolean;
  context: FieldControlContext;
  labels: EntryRepeaterLabels;
  referenceTitle?: ((groupId: string) => string | undefined) | undefined;
  onRemoved?:
    | ((removed: { index: number; legend: string; undo: () => boolean }) => void)
    | undefined;
}

/**
 * A repeater field of `EntryFieldsForm` (RFC-0045 §5): `RepeaterField` with each sub-field as a
 * `FieldControl` at its item path (`speakers/2/person`), so images use the host's picker and
 * references the host's `ReferenceList` and `EntryPicker`. Legends name items by their label
 * sub-field (`itemLabel`, else the first text, select or reference).
 */
export function EntryRepeater(props: EntryRepeaterProps) {
  const { def, context } = props;
  const names = {
    locale: context.locale,
    defaultLocale: context.defaultLocale,
    referenceTitle: props.referenceTitle,
  };
  return (
    <RepeaterField
      label={props.label}
      description={props.description}
      error={props.errors.field}
      items={shownItems(def, props.value)}
      onChange={props.onChange}
      subFields={def.fields}
      max={def.maxItems ?? FIELD_LIMITS.listItems}
      readOnly={props.readOnly}
      itemErrors={props.errors.items.size ? props.errors.items : undefined}
      legend={(i, item) => props.labels.itemLegend(i + 1, itemName(def, item, names))}
      onRemoved={props.onRemoved}
      labels={props.labels.repeater}
      renderControl={({ sub, index, value, onChange, error, readOnly }) => {
        // A sub-field a running type change has not converted in this item yet: as stored.
        const changing = unconverted(def, sub, value);
        return (
          <FieldControl
            def={sub}
            path={`${def.key}/${index}/${sub.key}`}
            label={fieldLabel(sub, context.locale, context.defaultLocale)}
            description={describeField(sub, context, {
              note: changing ? context.labels.beingChanged : undefined,
            })}
            error={error}
            value={value}
            onChange={onChange}
            readOnly={readOnly || changing}
            asStored={changing}
            context={context}
          />
        );
      }}
    />
  );
}

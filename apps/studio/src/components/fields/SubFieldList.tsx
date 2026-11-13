import { fieldLabel } from "@cloudhal/core-ts/fields";
import { Badge, Button, DropdownMenu, Input, LayerDialog, Select, Text } from "@cloudhal/ui";
import { ArrowDown, ArrowUp, DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import {
  emptyForm,
  type FieldForm,
  type FormProblems,
  formProblems,
  hasProblems,
} from "../../lib/field-form.ts";
import {
  moveSub,
  namesItems,
  STAGE4_LIMITS,
  type SubFieldForm,
  subId,
} from "../../lib/field-form-stage4.ts";

type FT = TFunction<"fields">;
const NONE = "__none";

/** What the sub-field dialog needs to draw a sub-field's form (FieldDialog's own parts). */
export type RenderSubForm = (c: {
  form: FieldForm;
  set: (next: FieldForm) => void;
  isNew: boolean;
  problems: FormProblems;
}) => ReactNode;

interface Editing {
  id: string;
  draft: FieldForm;
  isNew: boolean;
  adding: boolean;
}

type Focus = { id: string; at: "up" | "down" | "menu" } | "add" | null;

/**
 * A repeater's own settings in the fields builder (RFC-0045 §5): its sub-fields as rows (label,
 * key in mono, type, "Not saved"), each with up and down and a ⋯ menu (Edit…; Remove for one not
 * saved yet: a saved sub-field is renamed, retyped or removed through the field's operations), "Add
 * sub-field" (up to ten), the maximum number of items and the sub-field that names them. Focus
 * stays on a moved row and goes to the next row, or "Add sub-field", after a removal.
 */
export function RepeaterFields({
  form,
  set,
  problems,
  defaultLocale,
  uiLocale,
  locales,
  renderSubForm,
}: {
  form: FieldForm;
  set: (next: FieldForm) => void;
  problems: FormProblems;
  defaultLocale: string;
  uiLocale: string;
  locales: readonly string[];
  renderSubForm: RenderSubForm;
}) {
  const { t } = useI18n("fields");
  const d = "fields.dialog.repeater" as const;
  // `isNew`: not saved yet (key and type editable); `adding`: not in the list yet.
  const [editing, setEditing] = useState<Editing>();
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<Focus>(null);
  // Every write reads the latest form: the nested dialog applies after the outer one re-rendered.
  const latest = useRef(form);
  latest.current = form;
  useLayoutEffect(() => {
    const want = focus.current;
    focus.current = null;
    if (!want) return;
    if (want === "add")
      return void root.current?.querySelector<HTMLElement>("[data-sub-add]")?.focus();
    const row = root.current?.querySelector(`[data-sub-row="${want.id}"]`);
    // The same arrow, else the other one (at an end), else the row's menu.
    const pick = (selector: string) => row?.querySelector<HTMLElement>(selector);
    (
      pick(`[data-sub-move="${want.at}"]:not([disabled])`) ??
      (want.at === "menu" ? undefined : pick("[data-sub-move]:not([disabled])")) ??
      pick("[data-sub-menu]")
    )?.focus();
  });
  const subs = form.subFields;
  const full = subs.length >= STAGE4_LIMITS.subFields;
  const remove = (id: string) => {
    const i = subs.findIndex((s) => s.id === id);
    const next = subs[i + 1] ?? subs[i - 1];
    focus.current = next ? { id: next.id, at: "menu" } : "add";
    const left = subs.filter((s) => s.id !== id);
    const gone = subs[i]?.form.key;
    set({ ...form, subFields: left, itemLabel: form.itemLabel === gone ? "" : form.itemLabel });
  };
  const named = subs.filter((s) => namesItems(s.form) && s.form.key);
  const label = (s: SubFieldForm) =>
    s.form.labels[defaultLocale]?.label.trim() ||
    (s.form.key ? fieldLabel({ key: s.form.key, labels: {} }, uiLocale, defaultLocale) : "");
  return (
    <div className="grid gap-5" ref={root} data-testid="repeater-fields">
      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <Text bold as="span">
            {t(`${d}.subFields`)}
          </Text>
          <Text variant="secondary" size="sm" as="span">
            {t(`${d}.subFieldsHint`, { max: STAGE4_LIMITS.subFields })}
          </Text>
          {problems.subFields && (
            <Text variant="error" size="sm" as="span">
              {t(`${d}.errors.subFields.${problems.subFields}`)}
            </Text>
          )}
        </div>
        {subs.length > 0 && (
          <div className="grid divide-y divide-kumo-hairline" data-testid="sub-field-list">
            {subs.map((s, i) => (
              <SubFieldRow
                key={s.id}
                t={t}
                sub={s}
                label={label(s)}
                first={i === 0}
                last={i === subs.length - 1}
                invalid={problems.sub?.id === s.id}
                onMove={(by) => {
                  focus.current = { id: s.id, at: by < 0 ? "up" : "down" };
                  set({ ...form, subFields: moveSub(subs, s.id, by) });
                }}
                onEdit={() =>
                  setEditing({ id: s.id, draft: s.form, isNew: !s.saved, adding: false })
                }
                onRemove={() => remove(s.id)}
              />
            ))}
          </div>
        )}
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            // At the limit it stays focusable (focus comes back here when the dialog closes).
            aria-disabled={full || undefined}
            className={full ? "cursor-not-allowed opacity-50" : undefined}
            onClick={() => {
              if (full) return;
              setEditing({
                id: subId(),
                draft: emptyForm("text", locales),
                isNew: true,
                adding: true,
              });
            }}
            data-sub-add=""
          >
            {t(`${d}.add`)}
          </Button>
        </div>
      </div>
      <RepeaterLimits
        form={form}
        set={set}
        problems={problems}
        named={named.map((n) => ({ id: n.id, key: n.form.key, label: label(n) }))}
      />
      <SubFieldDialog
        t={t}
        editing={editing}
        onClose={() => setEditing(undefined)}
        taken={(id) => latest.current.subFields.filter((s) => s.id !== id).map((s) => s.form.key)}
        defaultLocale={defaultLocale}
        renderSubForm={renderSubForm}
        onApply={(id, draft) => {
          const now = latest.current;
          const was = now.subFields.find((s) => s.id === id)?.form;
          const subFields = was
            ? now.subFields.map((s) => (s.id === id ? { ...s, form: draft } : s))
            : [...now.subFields, { id, saved: false, form: draft }];
          // The item name follows a renamed item field, and lets go of one that can't name items.
          const named = was?.key === now.itemLabel;
          const itemLabel = !named ? now.itemLabel : namesItems(draft) ? draft.key : "";
          set({ ...now, subFields, itemLabel });
        }}
      />
    </div>
  );
}

/** A list's maximum number of items and the item field that names each item. */
function RepeaterLimits({
  form,
  set,
  problems,
  named,
}: {
  form: FieldForm;
  set: (next: FieldForm) => void;
  problems: FormProblems;
  /** The item fields that can name items, by their stable row id. */
  named: { id: string; key: string; label: string }[];
}) {
  // Options are the rows' ids, not their keys: renaming the chosen field keeps it chosen.
  const byId = new Map(named.map((n) => [n.id, n.key]));
  const chosen = named.find((n) => n.key === form.itemLabel)?.id;
  const { t } = useI18n("fields");
  const d = "fields.dialog.repeater" as const;
  return (
    <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
      <Input
        className="w-full"
        type="number"
        label={t(`${d}.maxItems`)}
        description={t(`${d}.maxItemsHint`, { max: STAGE4_LIMITS.maxItems })}
        value={form.maxItems}
        onValueChange={(maxItems) => set({ ...form, maxItems })}
        error={
          problems.maxItems ? t(`${d}.errors.maxItems`, { max: STAGE4_LIMITS.maxItems }) : undefined
        }
        min={1}
        max={STAGE4_LIMITS.maxItems}
      />
      <Select
        className="w-full"
        label={t(`${d}.itemLabel`)}
        description={t(`${d}.itemLabelHint`)}
        value={chosen ?? NONE}
        onValueChange={(v) =>
          set({ ...form, itemLabel: v === NONE ? "" : (byId.get(v as string) ?? "") })
        }
        items={{
          [NONE]: t(`${d}.itemLabelFirst`),
          ...Object.fromEntries(named.map((s) => [s.id, s.label])),
        }}
        error={problems.itemLabel ? t(`${d}.errors.itemLabel`) : undefined}
      />
    </div>
  );
}

function SubFieldRow({
  t,
  sub,
  label,
  first,
  last,
  invalid,
  onMove,
  onEdit,
  onRemove,
}: {
  t: FT;
  sub: SubFieldForm;
  label: string;
  first: boolean;
  last: boolean;
  invalid: boolean;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const d = "fields.dialog.repeater" as const;
  const name = label || sub.form.key;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-sub-row={sub.id}
    >
      <div className="grid min-w-0 gap-1">
        <Text as="span" bold truncate>
          {name}
        </Text>
        <span className="flex flex-wrap items-center gap-2">
          {sub.form.key && (
            <Text as="span" variant="mono-secondary">
              {sub.form.key}
            </Text>
          )}
          <Badge variant="secondary">{t(`fields.types.${sub.form.type}`)}</Badge>
          {!sub.saved && <Badge variant="beta">{t("fields.builder.unsaved")}</Badge>}
        </span>
        {invalid && (
          <Text variant="error" size="sm" as="span">
            {t(`${d}.errors.sub`)}
          </Text>
        )}
      </div>
      <span className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowUp />}
          aria-label={t("fields.builder.moveUp", { name })}
          disabled={first}
          onClick={() => onMove(-1)}
          data-sub-move="up"
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowDown />}
          aria-label={t("fields.builder.moveDown", { name })}
          disabled={last}
          onClick={() => onMove(1)}
          data-sub-move="down"
        />
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<DotsThree weight="bold" />}
                aria-label={t("fields.builder.menuFor", { name })}
                data-sub-menu=""
              />
            }
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={PencilSimple} onClick={onEdit}>
              {t("fields.builder.edit")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={Trash}
              variant="danger"
              disabled={sub.saved}
              onClick={onRemove}
            >
              {sub.saved ? t(`${d}.removeSaved`) : t("fields.builder.removeNew")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </span>
    </div>
  );
}

/** "Add sub-field" / "Edit sub-field": a nested `LayerDialog` with the sub-field's form. */
function SubFieldDialog({
  t,
  editing,
  onClose,
  taken,
  defaultLocale,
  renderSubForm,
  onApply,
}: {
  t: FT;
  editing: Editing | undefined;
  onClose: () => void;
  taken: (id: string) => string[];
  defaultLocale: string;
  renderSubForm: RenderSubForm;
  onApply: (id: string, form: FieldForm) => void;
}) {
  const d = "fields.dialog.repeater" as const;
  const [form, setForm] = useState<FieldForm>();
  const [submitted, setSubmitted] = useState(false);
  const [shown, setShown] = useState<string>();
  if (editing && shown !== editing.id) {
    setShown(editing.id);
    setForm(editing.draft);
    setSubmitted(false);
  }
  if (!editing && shown !== undefined) setShown(undefined);
  const current = form ?? editing?.draft;
  const problems =
    current && editing
      ? subProblems(current, { defaultLocale, taken: taken(editing.id), isNew: editing.isNew })
      : {};
  return (
    <LayerDialog.Root open={editing !== undefined} onOpenChange={(o) => !o && onClose()}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {editing?.adding ? t(`${d}.addTitle`) : t(`${d}.editTitle`)}
        </LayerDialog.Title>
        <LayerDialog.Description>{t(`${d}.dialogDescription`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="sub-field-form">
            {current &&
              editing &&
              renderSubForm({
                form: current,
                set: setForm,
                isNew: editing.isNew,
                problems: submitted ? problems : {},
              })}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            onClick={() => {
              setSubmitted(true);
              if (!current || !editing || hasProblems(problems)) return;
              onApply(editing.id, current);
              onClose();
            }}
            data-testid="sub-field-apply"
          >
            {editing?.adding ? t(`${d}.addApply`) : t("fields.dialog.apply")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** A sub-field form's problems: the field's own, without what only fields have. */
function subProblems(
  form: FieldForm,
  ctx: { defaultLocale: string; taken: readonly string[]; isNew: boolean },
): FormProblems {
  const { maxItems: _m, subFields: _s, itemLabel: _i, sub: _u, ...rest } = formProblems(form, ctx);
  return rest;
}

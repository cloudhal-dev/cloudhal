import type { Site } from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import { Button, Checkbox, Input, Text } from "@cloudhal/ui";
import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/index.tsx";
import { collectionName, collectionsQuery } from "../../lib/collections.ts";
import type { FieldForm, FormProblems } from "../../lib/field-form.ts";
import { STAGE4_LIMITS } from "../../lib/field-form-stage4.ts";
import { listFieldDefs } from "../../lib/listings.ts";
import { ConditionRow, freshCondition } from "../listings/ContentListQuery.tsx";
import { SwitchField } from "../TaxonomySettingsDialog.tsx";

/**
 * A reference's own settings in the fields builder (RFC-0045 §5): the target collections (a
 * `Checkbox.Group` of the site's collections, one to five), and for a field — not a repeater's
 * sub-field — "Several" with its maximum (new fields only: a saved field changes it through
 * "Change type…") and, with one target collection, conditions on its listing fields (no `now`).
 */
export function ReferenceFields({
  site,
  form,
  set,
  isNew,
  problems,
  sub = false,
  noConditions = false,
}: {
  site: Site;
  form: FieldForm;
  set: (next: FieldForm) => void;
  isNew: boolean;
  problems: FormProblems;
  /** A repeater's sub-field: one target, no conditions. */
  sub?: boolean;
  /** A type change's target: collections, "Several" and the maximum only. */
  noConditions?: boolean;
}) {
  const { t, locale } = useI18n("fields");
  const d = "fields.dialog.reference" as const;
  const registry = useQuery(collectionsQuery(site.id));
  const keys = [
    ...new Set([...(registry.data ?? []).map((c) => c.key), ...form.collections]),
  ].sort();
  const name = (key: string) => collectionName(site, key, locale, t("nav.articles"));
  const target = form.collections.length === 1 ? form.collections[0] : undefined;
  const targetDefs = target ? listFieldDefs(site.collections?.[target]) : [];
  return (
    <div className="grid gap-5" data-testid="reference-fields">
      <Checkbox.Group
        legend={t(`${d}.collections`)}
        description={t(`${d}.collectionsHint`, { max: STAGE4_LIMITS.collections })}
        error={
          problems.collections ? t(`${d}.errors.collections.${problems.collections}`) : undefined
        }
        value={form.collections}
        allValues={keys}
        onValueChange={(next: string[]) => {
          const collections = keys.filter((k) => next.includes(k));
          // Conditions are on the one target's listing fields: a new target keeps only its own.
          const only = collections.length === 1 ? collections[0] : undefined;
          const fits = new Set(
            only ? listFieldDefs(site.collections?.[only]).map((d) => d.key) : [],
          );
          const where = only === target ? form.where : form.where.filter((w) => fits.has(w.field));
          set({ ...form, collections, where });
        }}
      >
        {keys.map((k) => (
          <Checkbox.Item key={k} value={k} label={name(k)} />
        ))}
      </Checkbox.Group>
      {!sub && (
        <>
          <SwitchField
            testId="reference-multiple"
            label={t(`${d}.multiple`)}
            hint={isNew ? t(`${d}.multipleHint`) : t("fields.dialog.needsOperation")}
            checked={form.multiple}
            onChange={(multiple) => set({ ...form, multiple })}
            disabled={!isNew}
          />
          {form.multiple && (
            <Input
              className="w-full"
              type="number"
              label={t(`${d}.maxItems`)}
              description={t(`${d}.maxItemsHint`, { max: STAGE4_LIMITS.maxItems })}
              value={form.maxItems}
              onValueChange={(maxItems) => set({ ...form, maxItems })}
              error={
                problems.maxItems
                  ? t(`${d}.errors.maxItems`, { max: STAGE4_LIMITS.maxItems })
                  : undefined
              }
              min={1}
              max={STAGE4_LIMITS.maxItems}
            />
          )}
          {problems.where && (
            <Text variant="error" size="sm" as="span">
              {t(`${d}.errors.where`)}
            </Text>
          )}
          {!noConditions && (
            <Conditions
              target={target}
              targetName={target ? name(target) : ""}
              defs={targetDefs}
              site={site}
              form={form}
              set={set}
            />
          )}
        </>
      )}
    </div>
  );
}

/** "Only entries where": conditions a newly chosen target meets (one target collection only). */
function Conditions({
  target,
  targetName,
  defs,
  site,
  form,
  set,
}: {
  target: string | undefined;
  targetName: string;
  defs: ReturnType<typeof listFieldDefs>;
  site: Site;
  form: FieldForm;
  set: (next: FieldForm) => void;
}) {
  const { t, locale } = useI18n("fields");
  const d = "fields.dialog.reference" as const;
  const label = (def: (typeof defs)[number]) => fieldLabel(def, locale, site.defaultLocale);
  const full = form.where.length >= STAGE4_LIMITS.conditions;
  return (
    <div className="grid gap-3" data-testid="reference-where">
      <div className="grid gap-0.5">
        <Text bold as="span">
          {t(`${d}.where`)}
        </Text>
        <Text variant="secondary" size="sm" as="span">
          {!target
            ? t(`${d}.whereOneCollection`)
            : defs.length === 0
              ? t(`${d}.whereNoListFields`, { collection: targetName })
              : t(`${d}.whereHint`)}
        </Text>
      </div>
      {target &&
        form.where.map((cond, i) => (
          <ConditionRow
            // Conditions have no id; a field change replaces its row.
            key={`${i}:${cond.field}`}
            cond={cond}
            defs={defs}
            label={label}
            defaultLocale={site.defaultLocale}
            errors={[]}
            noNow
            onChange={(next) =>
              set({ ...form, where: form.where.map((w, j) => (j === i ? next : w)) })
            }
            onRemove={() => set({ ...form, where: form.where.filter((_, j) => j !== i) })}
          />
        ))}
      {target && defs.length > 0 && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            // At the limit it stays focusable, so focus isn't lost after adding the last one.
            aria-disabled={full || undefined}
            className={full ? "cursor-not-allowed opacity-50" : undefined}
            onClick={() => {
              if (full || !defs[0]) return;
              set({ ...form, where: [...form.where, freshCondition(defs[0], undefined, true)] });
            }}
          >
            {t(`${d}.addCondition`)}
          </Button>
        </div>
      )}
    </div>
  );
}

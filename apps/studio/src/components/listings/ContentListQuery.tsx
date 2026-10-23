import type {
  ContentListSection,
  FieldCondition,
  FieldDefinition,
  FieldOrder,
} from "@cloudhal/core-contracts";
import {
  FIELD_QUERY_LIMITS,
  FIELD_QUERY_OPS,
  type FieldQueryOp,
  fieldLabel,
  NOW,
  optionLabel,
} from "@cloudhal/core-ts/fields";
import { Button, Checkbox, Input, Link, Select, Text } from "@cloudhal/ui";
import { Plus, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { listFieldDefs, sortable, timeKind } from "../../lib/listings.ts";

const NONE = "__none";

/** A condition's defaults when its field or operator changes. */
function freshCondition(def: FieldDefinition, op?: FieldQueryOp): FieldCondition {
  const chosen = op ?? FIELD_QUERY_OPS[def.type][0] ?? "set";
  if (chosen === "set" || chosen === "unset") return { field: def.key, op: chosen };
  if (def.type === "date" || def.type === "datetime")
    return { field: def.key, op: chosen, value: NOW };
  if (def.type === "boolean") return { field: def.key, op: chosen, value: "true" };
  if (def.type === "select") {
    const first = def.options[0]?.value ?? "";
    return chosen === "in"
      ? { field: def.key, op: chosen, values: [first] }
      : { field: def.key, op: chosen, value: first };
  }
  return { field: def.key, op: chosen, value: "" };
}

/** The section with `where` / `orderBy` replaced (empty ones left out, as the contract asks). */
function withQuery(
  section: ContentListSection,
  where: FieldCondition[],
  orderBy: FieldOrder | undefined,
): ContentListSection {
  const { where: _w, orderBy: _o, ...rest } = section;
  return {
    ...rest,
    ...(where.length ? { where: where as ContentListSection["where"] } : {}),
    ...(orderBy ? { orderBy } : {}),
  };
}

/**
 * The page editor's content list conditions (RFC-0042 §4): "only entries where" rows over the
 * listed collection's listing fields — each with the operators its type allows and a value control
 * for that type (`now` or a date for dates, the options of a choice, yes / no) — and an order by a
 * number or date field. The save's `invalid_query` issues show under their row.
 */
export function ContentListQuery({
  siteId,
  section,
  onChange,
  issues,
}: {
  siteId: string;
  section: ContentListSection;
  onChange: (section: ContentListSection) => void;
  /** The last save's `invalid_query` issues of this section (`where/0/value`, `orderBy/field`). */
  issues: readonly { path: string; message: string }[];
}) {
  const { t, locale } = useI18n("listings");
  const c = "listings.contentList";
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const settings = site.data?.collections?.[section.collection];
  const defs = listFieldDefs(settings);
  const where = section.where ?? [];
  const label = (d: FieldDefinition) => fieldLabel(d, locale, site.data?.defaultLocale ?? "en");
  const issueAt = (prefix: string) =>
    issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}/`));
  if (!site.data) return null;
  if (defs.length === 0)
    return (
      <Text variant="secondary" size="sm">
        {t(`${c}.noListFields`)}{" "}
        <Link href={`/sites/${siteId}/collections/${section.collection}/settings#listing-fields`}>
          {t(`${c}.settingsLink`)}
        </Link>
      </Text>
    );
  const setWhere = (next: FieldCondition[]) => onChange(withQuery(section, next, section.orderBy));
  const sortDefs = defs.filter(sortable);
  const orderDef = defs.find((d) => d.key === section.orderBy?.field);
  return (
    <div className="grid gap-4" data-testid="content-list-query">
      <div className="grid gap-3">
        <Text bold as="span">
          {t(`${c}.where`)}
        </Text>
        {where.map((cond, i) => (
          <ConditionRow
            key={`${i}:${cond.field}`}
            cond={cond}
            defs={defs}
            label={label}
            defaultLocale={site.data?.defaultLocale ?? "en"}
            errors={issueAt(`where/${i}`).map((x) => x.message)}
            onChange={(next) => setWhere(where.map((w, j) => (j === i ? next : w)))}
            onRemove={() => setWhere(where.filter((_, j) => j !== i))}
          />
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            disabled={where.length >= FIELD_QUERY_LIMITS.conditions}
            onClick={() => defs[0] && setWhere([...where, freshCondition(defs[0])])}
            data-testid="add-condition"
          >
            {t(`${c}.add`)}
          </Button>
        </div>
      </div>
      {sortDefs.length > 0 && (
        <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
          <Select
            className="w-full"
            label={t(`${c}.orderBy`)}
            value={section.orderBy?.field ?? NONE}
            onValueChange={(v) =>
              onChange(
                withQuery(
                  section,
                  where,
                  v === NONE
                    ? undefined
                    : { field: v as string, direction: section.orderBy?.direction ?? "asc" },
                ),
              )
            }
            items={{
              [NONE]: t(`${c}.orderNone`),
              ...Object.fromEntries(sortDefs.map((d) => [d.key, label(d)])),
            }}
            error={issueAt("orderBy")[0]?.message}
            data-testid="order-by-field"
          />
          {section.orderBy && (
            <Select
              className="w-full"
              label={t(`${c}.direction`)}
              value={section.orderBy.direction}
              onValueChange={(v) =>
                section.orderBy &&
                onChange(
                  withQuery(section, where, {
                    field: section.orderBy.field,
                    direction: v === "desc" ? "desc" : "asc",
                  }),
                )
              }
              items={{
                asc: t(`${c}.asc`, { kind: timeKind(orderDef) }),
                desc: t(`${c}.desc`, { kind: timeKind(orderDef) }),
              }}
              data-testid="order-by-direction"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One condition: field, operator (only its type's), the value control, remove. */
function ConditionRow({
  cond,
  defs,
  label,
  defaultLocale,
  errors,
  onChange,
  onRemove,
}: {
  cond: FieldCondition;
  defs: readonly FieldDefinition[];
  label: (d: FieldDefinition) => string;
  defaultLocale: string;
  errors: readonly string[];
  onChange: (cond: FieldCondition) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n("listings");
  const c = "listings.contentList";
  const def = defs.find((d) => d.key === cond.field);
  const ops = def ? FIELD_QUERY_OPS[def.type] : [];
  return (
    <div className="grid gap-2" data-condition={cond.field}>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Select
          className="w-full"
          label={t(`${c}.field`)}
          value={cond.field}
          onValueChange={(v) => {
            const next = defs.find((d) => d.key === v);
            if (next) onChange(freshCondition(next));
          }}
          items={Object.fromEntries(defs.map((d) => [d.key, label(d)]))}
        />
        <Select
          className="w-full"
          label={t(`${c}.op`)}
          value={cond.op}
          onValueChange={(v) => def && onChange(freshCondition(def, v as FieldQueryOp))}
          items={Object.fromEntries(
            ops.map((op) => [op, t(`${c}.ops.${op}`, { kind: timeKind(def) })]),
          )}
          data-testid={`condition-op-${cond.field}`}
        />
        {def && (
          <ValueControl cond={cond} def={def} defaultLocale={defaultLocale} onChange={onChange} />
        )}
        <Button
          variant="ghost"
          shape="square"
          icon={<Trash />}
          aria-label={t(`${c}.remove`)}
          title={t(`${c}.remove`)}
          onClick={onRemove}
        />
      </div>
      {errors.map((e) => (
        <Text key={e} variant="error" size="sm">
          {e}
        </Text>
      ))}
    </div>
  );
}

/** The value of a condition, by its field's type; none for "has a value" / "is empty". */
function ValueControl({
  cond,
  def,
  defaultLocale,
  onChange,
}: {
  cond: FieldCondition;
  def: FieldDefinition;
  defaultLocale: string;
  onChange: (cond: FieldCondition) => void;
}) {
  const { t, locale } = useI18n("listings");
  const c = "listings.contentList";
  const label = t(`${c}.value`);
  if (cond.op === "set" || cond.op === "unset") return <span />;
  const value = cond.value ?? "";
  const set = (v: string) => onChange({ field: cond.field, op: cond.op, value: v });
  if (def.type === "select") {
    const items = Object.fromEntries(
      def.options.map((o) => [o.value, optionLabel(def, o.value, locale, defaultLocale)]),
    );
    if (cond.op === "in")
      return (
        <Checkbox.Group
          legend={label}
          value={[...(cond.values ?? [])]}
          allValues={def.options.map((o) => o.value)}
          onValueChange={(next: string[]) => {
            const values = def.options
              .map((o) => o.value)
              .filter((v) => next.includes(v))
              .slice(0, FIELD_QUERY_LIMITS.values);
            onChange(
              values.length
                ? { field: cond.field, op: "in", values: values as FieldCondition["values"] }
                : { field: cond.field, op: "in" },
            );
          }}
        >
          {def.options.map((o) => (
            <Checkbox.Item key={o.value} value={o.value} label={items[o.value] ?? o.value} />
          ))}
        </Checkbox.Group>
      );
    return (
      <Select
        className="w-full"
        label={label}
        value={value}
        onValueChange={(v) => set(v as string)}
        items={items}
      />
    );
  }
  if (def.type === "boolean")
    return (
      <Select
        className="w-full"
        label={label}
        value={value}
        onValueChange={(v) => set(v as string)}
        items={{ true: t(`${c}.yes`), false: t(`${c}.no`) }}
      />
    );
  if (def.type === "date" || def.type === "datetime")
    return (
      <div className="grid gap-2">
        <Select
          className="w-full"
          label={label}
          value={value === NOW ? NOW : "date"}
          onValueChange={(v) => set(v === NOW ? NOW : "")}
          items={{ [NOW]: t(`${c}.now`), date: t(`${c}.aDate`) }}
          data-testid={`condition-when-${cond.field}`}
        />
        {value !== NOW && (
          <Input
            className="w-full"
            aria-label={label}
            type={def.type === "date" ? "date" : "text"}
            value={value}
            onValueChange={set}
            description={def.type === "date" ? t(`${c}.dateHint`) : t(`${c}.instantHint`)}
          />
        )}
      </div>
    );
  return (
    <Input
      className="w-full"
      label={label}
      type={def.type === "number" ? "number" : "text"}
      value={value}
      maxLength={100}
      onValueChange={set}
      data-testid={`condition-value-${cond.field}`}
    />
  );
}

import type { MenuItem, Site } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Checkbox,
  Combobox,
  DirectionalIcon,
  directional,
  Input,
  InsetPanel,
  LayerDialog,
  Select,
  Text,
} from "@cloudhal/ui";
import { ArrowSquareOut, FolderSimple, Globe, Info, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { type MessageKey, useI18n, useT } from "../i18n/index.tsx";
import {
  choiceOf,
  choiceValue,
  emptyForm,
  formOf,
  hasFormErrors,
  hostOf,
  type ItemForm,
  itemFromForm,
  MENU_LIMITS,
  needsLabel,
  newMenuItemId,
  type TargetData,
  type TargetGroup,
  type TargetOption,
  targetOptions,
  targetTitle,
  validateItemForm,
} from "../lib/menus.ts";
import { foldName } from "../lib/taxonomy.ts";

/** Opens elsewhere; mirrors in right-to-left languages (ADR-0033 C1). */
const OpenOutside = directional(ArrowSquareOut);

interface Group {
  value: string;
  items: TargetOption[];
}

/** Where a new item goes: the top level or under an item that still has room for a level. */
export interface ParentOption {
  id: string;
  label: string;
  depth: number;
}

const TOP = "__top__";

function optionMatches(o: TargetOption, q: string): boolean {
  if (!q) return true;
  const query = foldName(q);
  return (
    foldName(o.label).includes(query) || (o.detail ? foldName(o.detail).includes(query) : false)
  );
}

/**
 * Add or edit one menu item (RFC-0003 §8): the target picker — a grouped `Combobox` over pages,
 * articles, each taxonomy's terms and collections, plus "External link" and "Group" — then the
 * label per site locale with the fallback as placeholder, and "Open in a new tab" for external
 * links. The result goes into the editor's draft; saving the menu is a separate step.
 */
export function MenuItemDialog({
  open,
  onOpenChange,
  item,
  site,
  data,
  taxonomyName,
  parents,
  defaultParent = null,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item being edited; absent: a new one. */
  item: MenuItem | undefined;
  site: Pick<Site, "defaultLocale" | "locales">;
  data: TargetData;
  /** A taxonomy's name in Studio's words, by key ("Categories"). */
  taxonomyName: (key: string) => string;
  /** New items only: where it may go. */
  parents: ParentOption[];
  defaultParent?: string | null;
  onApply: (item: MenuItem, parentId: string | null) => void;
}) {
  const t = useT("menus");
  const { locale: uiLocale } = useI18n();
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [parent, setParent] = useState<string>(TOP);
  const [attempted, setAttempted] = useState(false);
  const [hrefTouched, setHrefTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(item ? formOf(item) : emptyForm());
    setParent(defaultParent ?? TOP);
    setAttempted(false);
    setHrefTouched(false);
  }, [open, item?.id]);

  const locales = [site.defaultLocale, ...site.locales.filter((l) => l !== site.defaultLocale)];
  const options = useMemo(() => targetOptions(data), [data]);
  const special = (o: TargetOption) =>
    o.value === "url"
      ? t("menus.picker.url")
      : o.value === "group"
        ? t("menus.picker.group")
        : o.label;
  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    const push = (value: string, items: TargetOption[]) => {
      if (items.length > 0) out.push({ value, items });
    };
    const of = (g: TargetGroup) => options.filter((o) => o.group === g);
    push(t("menus.picker.groups.pages"), of("pages"));
    push(t("menus.picker.groups.articles"), of("articles"));
    for (const key of [...new Set(of("terms").map((o) => o.taxonomy as string))])
      push(
        taxonomyName(key),
        of("terms").filter((o) => o.taxonomy === key),
      );
    push(t("menus.picker.groups.collections"), of("collections"));
    push(t("menus.picker.groups.other"), of("other"));
    return out;
  }, [options, uiLocale]);
  const value = options.find((o) => o.value === choiceValue(form.target)) ?? null;
  const errors = validateItemForm(form, site);
  const show = (field: "target" | "href" | "labels") =>
    attempted || (field === "href" && hrefTouched);
  const kind = form.target?.kind;
  const host = kind === "url" ? hostOf(form.href.trim()) : undefined;
  const status = value?.status;
  const nodeTarget = kind === "page" || kind === "contentEntry" || kind === "term";

  const apply = () => {
    setAttempted(true);
    if (hasFormErrors(errors)) return;
    const next = itemFromForm(form, item?.id ?? newMenuItemId());
    onApply(next, parent === TOP ? null : parent);
    onOpenChange(false);
  };

  const fallbackFor = (l: string): string | undefined => {
    const title = targetTitle(form.target, data, l);
    if (l !== site.defaultLocale) return form.labels[site.defaultLocale]?.trim() || title;
    return title;
  };
  const hintFor = (l: string): string => {
    if (l === site.defaultLocale)
      return needsLabel(form.target)
        ? t("menus.item.labelRequired")
        : nodeTarget
          ? t(`menus.item.labelFallback.${kind as "page" | "contentEntry" | "term"}`)
          : t("menus.item.labelPickFirst");
    return t("menus.item.labelOtherLocale", { locale: site.defaultLocale });
  };
  const labelError = (l: string) => {
    const e = errors.labels[l];
    return show("labels") && e
      ? t(`menus.item.errors.label.${e}`, { max: MENU_LIMITS.labelLength })
      : undefined;
  };

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {item ? t("menus.item.editTitle") : t("menus.item.addTitle")}
        </LayerDialog.Title>
        <LayerDialog.Description>{t("menus.item.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="menu-item-dialog">
            <div data-testid="target-picker">
              <Combobox
                items={groups}
                value={value}
                onValueChange={(v) => {
                  const o = v as TargetOption | null;
                  setForm({ ...form, target: o ? choiceOf(o.value) : undefined });
                }}
                isItemEqualToValue={(a: TargetOption, b: TargetOption) => a.value === b.value}
                itemToStringLabel={(o: TargetOption) => special(o)}
                filter={(o: TargetOption, q: string) =>
                  optionMatches(o, q) || optionMatches({ ...o, label: special(o) }, q)
                }
                label={t("menus.item.target")}
                description={t("menus.item.targetHint")}
                error={show("target") && errors.target ? t("menus.item.errors.target") : undefined}
              >
                <Combobox.TriggerInput
                  placeholder={t("menus.item.targetPlaceholder")}
                  clearLabel={t("pickers.clear")}
                  showOptionsLabel={t("pickers.showOptions")}
                />
                <Combobox.Content>
                  <Combobox.Empty>{t("pickers.noMatch")}</Combobox.Empty>
                  <Combobox.List>
                    {(group: Group) => (
                      <Combobox.Group key={group.value} items={group.items}>
                        <Combobox.GroupLabel>{group.value}</Combobox.GroupLabel>
                        <Combobox.Collection>
                          {(o: TargetOption) => (
                            <Combobox.Item key={o.value} value={o}>
                              <span
                                className="flex min-w-0 items-center gap-2"
                                style={{ paddingInlineStart: `${(o.depth ?? 0) * 0.75}rem` }}
                                data-option={o.value}
                              >
                                {o.value === "url" ? (
                                  <OpenOutside size={16} className="shrink-0 text-kumo-subtle" />
                                ) : o.value === "group" ? (
                                  <FolderSimple size={16} className="shrink-0 text-kumo-subtle" />
                                ) : null}
                                <span className="min-w-0 truncate">{special(o)}</span>
                                {o.detail && o.group !== "collections" && (
                                  <Text variant="mono-secondary" as="span" truncate>
                                    {o.detail}
                                  </Text>
                                )}
                                {o.status && (
                                  <span className="shrink-0">
                                    <Badge variant="outline">
                                      {t(`menus.picker.status.${o.status}` as MessageKey)}
                                    </Badge>
                                  </span>
                                )}
                              </span>
                            </Combobox.Item>
                          )}
                        </Combobox.Collection>
                      </Combobox.Group>
                    )}
                  </Combobox.List>
                </Combobox.Content>
              </Combobox>
            </div>
            {kind === "url" && (
              <div className="grid gap-3">
                <Input
                  label={t("menus.item.href")}
                  description={t("menus.item.hrefHint")}
                  value={form.href}
                  placeholder="https://status.example.com"
                  inputMode="url"
                  spellCheck={false}
                  className="w-full font-mono"
                  onValueChange={(v) => setForm({ ...form, href: v })}
                  onBlur={() => setHrefTouched(true)}
                  error={
                    show("href") && errors.href
                      ? t(`menus.item.errors.href.${errors.href}`)
                      : undefined
                  }
                  data-testid="menu-item-href"
                />
                {host && !errors.href && (
                  <InsetPanel layout="row">
                    <span className="flex items-center gap-2">
                      <Globe size={16} className="shrink-0 text-kumo-subtle" />
                      <Text as="span">{t("menus.item.leavesFor", { host })}</Text>
                    </span>
                  </InsetPanel>
                )}
                <Checkbox
                  label={t("menus.item.newTab")}
                  checked={form.newTab}
                  onCheckedChange={(on) => setForm({ ...form, newTab: on === true })}
                />
              </div>
            )}
            {kind === "group" && (
              <InsetPanel>
                <span className="flex items-start gap-2">
                  <span className="flex h-lh items-center text-kumo-subtle">
                    <Info size={16} />
                  </span>
                  <Text variant="secondary" size="sm" as="span">
                    {t("menus.item.groupHint")}
                  </Text>
                </span>
              </InsetPanel>
            )}
            {item && nodeTarget && !value && (
              <Banner
                variant="alert"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t(`menus.item.targetGone.${kind}`)}
                data-testid="menu-item-target-gone"
              />
            )}
            {status && (
              <Banner
                variant="secondary"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t(`menus.item.hiddenUntil.${status}` as MessageKey)}
                data-testid="menu-item-hidden-hint"
              />
            )}
            <fieldset className="grid gap-4" data-testid="menu-item-labels">
              <legend className="sr-only">{t("menus.item.labels")}</legend>
              {locales.map((l) => (
                <Input
                  key={l}
                  label={
                    locales.length > 1
                      ? t("menus.item.labelIn", { locale: l })
                      : t("menus.item.label")
                  }
                  description={hintFor(l)}
                  value={form.labels[l] ?? ""}
                  placeholder={fallbackFor(l) ?? ""}
                  required={l === site.defaultLocale && needsLabel(form.target)}
                  className="w-full"
                  onValueChange={(v) => setForm({ ...form, labels: { ...form.labels, [l]: v } })}
                  error={labelError(l)}
                  data-locale={l}
                />
              ))}
            </fieldset>
            {!item && parents.length > 0 && (
              <Select
                label={t("menus.item.place")}
                description={t("menus.item.placeHint")}
                value={parent}
                onValueChange={(v) => setParent(String(v))}
                items={Object.fromEntries([
                  [TOP, t("menus.item.topLevel")],
                  ...parents.map((p) => [
                    p.id,
                    `${"— ".repeat(p.depth - 1)}${t("menus.item.under", { label: p.label })}`,
                  ]),
                ])}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={apply} data-testid="menu-item-apply">
            {item ? t("menus.item.apply") : t("menus.item.add")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

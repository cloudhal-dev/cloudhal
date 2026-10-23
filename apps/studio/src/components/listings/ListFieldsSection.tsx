import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import { Badge, Button, Link, SectionEmpty, Select, Text } from "@cloudhal/ui";
import { ArrowDown, ArrowUp, Columns, Trash } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { liveFields, pagesInUse, sortable } from "../../lib/listings.ts";
import { ErrorBanner } from "../ErrorBanner.tsx";
import { SettingsSection } from "../Settings.tsx";
import { LISTING_SECTIONS } from "./sections.ts";
import { same, useSaveSetting } from "./useSaveSetting.ts";

const MAX = 4;

/**
 * A collection › Settings › Listing fields (RFC-0042 §4, §7): an ordered choice of up to four of
 * its fields — the list's columns and what filters, sorting and `contentList` conditions may use.
 * Saved alone (`listFields`); a 409 `list_field_in_use` names the pages whose sections still use a
 * field taken out.
 */
export function ListFieldsSection({
  site,
  collection,
  settings,
  readOnlyReason,
}: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
  readOnlyReason: string | undefined;
}) {
  const { t, locale } = useI18n("listings", "fields");
  const saved = settings.listFields ?? [];
  const [draft, setDraft] = useState<string[]>([...saved]);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as string[]), [savedKey]);
  const save = useSaveSetting(site, collection, "listFields", t("listings.listFields.saved"));
  const defs = liveFields(settings);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const dirty = !same(draft, saved);
  const canEdit = readOnlyReason === undefined;
  const label = (key: string) => {
    const def = byKey.get(key);
    return def ? fieldLabel(def, locale, site.defaultLocale) : key;
  };
  const free = defs.filter((d) => !draft.includes(d.key));
  const move = (i: number, by: -1 | 1) => {
    const next = [...draft];
    const j = i + by;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    setDraft(next);
  };
  const pages = pagesInUse(save.error);
  return (
    <SettingsSection
      id={LISTING_SECTIONS.listFields}
      title={t("listings.listFields.title")}
      description={t("listings.listFields.description")}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft([...saved])} disabled={save.isPending}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => save.mutate(draft as CollectionSettings["listFields"])}
            loading={save.isPending}
            disabled={!canEdit || !dirty}
            title={readOnlyReason}
            data-testid="save-list-fields"
          >
            {t("listings.listFields.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ErrorBanner error={save.error} />
        {pages.length > 0 && (
          <div className="grid gap-1.5" data-testid="list-fields-in-use">
            <Text variant="secondary">{t("listings.listFields.inUse")}</Text>
            <div className="grid gap-1">
              {pages.map((p) => (
                <Link key={p.id} href={`/sites/${site.id}/pages/${p.id}`}>
                  {p.path}
                </Link>
              ))}
            </div>
          </div>
        )}
        {draft.length === 0 ? (
          <SectionEmpty
            icon={<Columns size={32} className="text-kumo-inactive" />}
            title={t("listings.listFields.empty")}
            description={
              defs.length === 0
                ? t("listings.listFields.noFields")
                : t("listings.listFields.emptyDescription")
            }
          />
        ) : (
          <div className="grid divide-y divide-kumo-hairline" data-testid="list-field-rows">
            {draft.map((key, i) => (
              <ListFieldRow
                key={key}
                fieldKey={key}
                def={byKey.get(key)}
                label={label(key)}
                first={i === 0}
                last={i === draft.length - 1}
                canEdit={canEdit}
                onMove={(by) => move(i, by)}
                onRemove={() => setDraft(draft.filter((k) => k !== key))}
              />
            ))}
          </div>
        )}
        {defs.length > 0 && (
          <Select
            className="w-full"
            label={t("listings.listFields.add")}
            description={draft.length >= MAX ? t("listings.listFields.full") : undefined}
            placeholder={t("listings.listFields.choose")}
            value={null as string | null}
            onValueChange={(v) => v && setDraft([...draft, v as string])}
            items={Object.fromEntries(free.map((d) => [d.key, label(d.key)]))}
            disabled={!canEdit || draft.length >= MAX || free.length === 0}
            data-testid="add-list-field"
          />
        )}
      </div>
    </SettingsSection>
  );
}

/** One chosen field: label, key, type and "Sortable"; up, down and remove. */
function ListFieldRow({
  fieldKey,
  def,
  label,
  first,
  last,
  canEdit,
  onMove,
  onRemove,
}: {
  fieldKey: string;
  def: FieldDefinition | undefined;
  label: string;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n("listings", "fields");
  const iconButton = (text: string, icon: ReactNode, onClick: () => void, off: boolean) => (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      icon={icon}
      aria-label={text}
      title={text}
      onClick={onClick}
      disabled={!canEdit || off}
    />
  );
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-list-field={fieldKey}
    >
      <div className="grid min-w-0 gap-1">
        <Text as="span" bold truncate>
          {label}
        </Text>
        <span className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="mono-secondary">
            {fieldKey}
          </Text>
          {def && <Badge variant="secondary">{t(`fields.types.${def.type}`)}</Badge>}
          {def && sortable(def) && (
            <Badge variant="outline">{t("listings.listFields.sortable")}</Badge>
          )}
        </span>
      </div>
      <span className="flex items-center gap-1">
        {iconButton(
          t("listings.listFields.moveUp", { label }),
          <ArrowUp />,
          () => onMove(-1),
          first,
        )}
        {iconButton(
          t("listings.listFields.moveDown", { label }),
          <ArrowDown />,
          () => onMove(1),
          last,
        )}
        {iconButton(t("listings.listFields.remove", { label }), <Trash />, onRemove, false)}
      </span>
    </div>
  );
}

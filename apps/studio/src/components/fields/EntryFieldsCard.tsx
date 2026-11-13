import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { memberGroup } from "@cloudhal/core-ts/fields";
import {
  EntryFieldsForm,
  type EntryFieldsFormLabels,
  type EntryFieldsOriginal,
  Label,
  SectionCard,
  Text,
} from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { chooseMember, issuesByPath, referenceIdsIn } from "../../lib/field-references.ts";
import { fieldIssues } from "../../lib/fields.ts";
import { languageName } from "../../lib/languages.ts";
import { zoneLabel } from "../../lib/schedules.ts";
import { primaryHostname } from "../../lib/site-settings.ts";
import { BodyEditor } from "../BodyEditor.tsx";
import { FieldImage } from "./FieldImage.tsx";
import { FieldReference } from "./FieldReference.tsx";
import { useGroupCards } from "./useGroupCards.ts";
import { useItemUndo } from "./useItemUndo.ts";

type FT = TFunction<"fields">;

const ISSUE_CODES = [
  "invalid_value",
  "unknown_field",
  "field_not_localized",
  "required_field",
  "too_large",
  "unknown_entry",
  "too_many_references",
] as const;
type IssueCode = (typeof ISSUE_CODES)[number];
const isIssueCode = (code: string): code is IssueCode =>
  (ISSUE_CODES as readonly string[]).includes(code);

/** A field's limits in words: length, bounds, whole numbers. */
export function fieldHint(t: FT, def: FieldDefinition): string | undefined {
  if (def.type === "text" && def.maxLength !== undefined)
    return t("fields.hints.maxLength", { count: def.maxLength });
  if (def.type !== "number") return undefined;
  const parts = [
    def.minimum !== undefined && def.maximum !== undefined
      ? t("fields.hints.range", { min: def.minimum, max: def.maximum })
      : def.minimum !== undefined
        ? t("fields.hints.min", { min: def.minimum })
        : def.maximum !== undefined
          ? t("fields.hints.max", { max: def.maximum })
          : undefined,
    def.integer ? t("fields.hints.integer") : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/** A repeater's words (RFC-0045 §5). */
function repeaterLabels(t: FT): EntryFieldsFormLabels["repeater"] {
  const r = "fields.repeater" as const;
  return {
    add: t(`${r}.add`),
    count: (count, max) => t(`${r}.count`, { count, max }),
    empty: t(`${r}.empty`),
    moveUp: (index) => t(`${r}.moveUp`, { index }),
    moveDown: (index) => t(`${r}.moveDown`, { index }),
    actions: (index) => t(`${r}.actions`, { index }),
    menuMoveUp: t(`${r}.menuMoveUp`),
    menuMoveDown: t(`${r}.menuMoveDown`),
    duplicate: t(`${r}.duplicate`),
    remove: t(`${r}.remove`),
    moved: (from, to) => t(`${r}.moved`, { from, to }),
    removed: (index) => t(`${r}.removed`, { index }),
    invalidItems: (count) => t(`${r}.invalidItems`, { count }),
  };
}

/** The form's words, in the Studio language. */
function useFormLabels(t: FT, originalLocale: string | undefined, locale: string) {
  return useMemo<EntryFieldsFormLabels>(() => {
    const d = "fields.editor.date" as const;
    return {
      neededToPublish: t("fields.editor.neededToPublish"),
      fromOriginal: t("fields.editor.fromOriginal", {
        language: originalLocale ? languageName(locale, originalLocale) : "",
      }),
      openOriginal: t("fields.editor.openOriginal"),
      originalValue: (value) => t("fields.editor.originalValue", { value }),
      yes: t("fields.editor.yes"),
      no: t("fields.editor.no"),
      noValue: t("fields.editor.noValue"),
      clear: t("fields.editor.clear"),
      originalImage: t("fields.editor.originalImage"),
      sharedList: t("fields.editor.sharedList"),
      beingChanged: t("fields.editor.beingChanged"),
      items: (count) => t("fields.editor.originalItems", { count }),
      itemLegend: (index, name) =>
        t("fields.editor.itemLegend", { index, named: name ? "yes" : "no", name: name ?? "" }),
      repeater: repeaterLabels(t),
      date: {
        date: t(`${d}.date`),
        pickDate: t(`${d}.pickDate`),
        chooseDate: t(`${d}.chooseDate`),
        invalidTime: t(`${d}.invalidTime`),
        calendar: {
          previousMonth: t(`${d}.previousMonth`),
          nextMonth: t(`${d}.nextMonth`),
          navigation: t(`${d}.months`),
          day: (date, { today, selected }) => {
            const named = selected ? t(`${d}.daySelected`, { date }) : date;
            return today ? t(`${d}.dayToday`, { date: named }) : named;
          },
        },
      },
    };
  }, [t, originalLocale, locale]);
}

/** The translation group's original in this site, when the entry is one of its translations. */
function useOriginal(siteId: string, entry: ContentEntry) {
  const tr = entry.translation;
  const id = tr && tr.group !== entry.id && !tr.source?.siteId ? tr.group : undefined;
  return useQuery({
    queryKey: ["entry", siteId, id],
    queryFn: () => api.entries.get(siteId, id as string),
    enabled: id !== undefined,
  });
}

/**
 * The entry editor's "Fields" card (RFC-0041 §7): the collection's typed fields as
 * `EntryFieldsForm`, saved with the entry. Shown only when the collection has definitions; loaded
 * lazily with them. Rich text uses the body editor, images the media picker; issues from the
 * last save show on their field.
 */
export function EntryFieldsCard({
  siteId,
  site,
  entry,
  onChange,
  error,
  disabled,
}: {
  siteId: string;
  site: Site;
  entry: ContentEntry;
  onChange: (fields: Record<string, unknown>) => void;
  /** The last save's error: its `details.issues` show on the fields. */
  error: unknown;
  disabled: boolean;
}) {
  const { t, locale } = useI18n("fields", "bodyEditor", "media");
  const onItemRemoved = useItemUndo(entry.id);
  const definitions = site.collections?.[entry.collection]?.fields ?? [];
  const original = useOriginal(siteId, entry);
  const labels = useFormLabels(t, original.data?.locale, locale);
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [path, issue] of Object.entries(issuesByPath(fieldIssues(error))))
      out[path] = isIssueCode(issue.code) ? t(`fields.issues.${issue.code}`) : issue.message;
    return out;
  }, [error, t]);
  // RFC-0045: the members of every target the entry and its original name.
  const ids = useMemo(
    () => [
      ...referenceIdsIn(definitions, entry.fields),
      ...referenceIdsIn(definitions, original.data?.fields),
    ],
    [definitions, entry.fields, original.data?.fields],
  );
  const groups = useGroupCards(siteId, ids);
  const titleOf = (groupId: string) => {
    const members = groups.cards.get(groupId);
    const collections = members?.map((m) => m.collection) ?? [];
    const options = { locale: entry.locale, defaultLocale: site.defaultLocale, collections };
    return members ? chooseMember(members, options)?.title : undefined;
  };
  const from: EntryFieldsOriginal | undefined = original.data
    ? {
        values: original.data.fields,
        href: entryHref(siteId, original.data.id, original.data.collection),
      }
    : undefined;
  const defaultLocale = site.defaultLocale;
  return (
    <SectionCard id="fields" title={t("fields.editor.title")}>
      <EntryFieldsForm
        definitions={definitions}
        value={entry.fields}
        onChange={onChange}
        locale={locale}
        defaultLocale={defaultLocale}
        errors={errors}
        hint={(def) => fieldHint(t, def)}
        original={from}
        timeZone={site.timeZone ?? "UTC"}
        zoneLabel={(zone) => zoneLabel(zone)}
        labels={labels}
        disabled={disabled}
        multilingual={site.locales.length > 1}
        referenceTitle={titleOf}
        renderImage={(slot) => (
          <FieldImage siteId={siteId} defaultLocale={defaultLocale} slot={slot} />
        )}
        renderReference={(slot) => (
          <FieldReference
            siteId={siteId}
            site={site}
            entryLocale={entry.locale}
            ownGroup={memberGroup(entry)}
            slot={slot}
            groups={groups}
          />
        )}
        onItemRemoved={onItemRemoved}
        renderRichText={(slot) => (
          <div className="grid min-w-0 gap-1.5" data-field-rich-text={slot.def.key}>
            <Label>{slot.label}</Label>
            <BodyEditor
              siteId={siteId}
              defaultLocale={defaultLocale}
              host={primaryHostname(site.domains ?? [])}
              value={slot.value}
              onChange={slot.onChange}
              size="sm"
              readOnly={slot.readOnly}
            />
            {(slot.description || slot.placeholder) && (
              <Text variant="secondary" size="sm" as="span">
                {slot.description}
                {slot.placeholder && ` ${labels.originalValue(slot.placeholder)}`}
              </Text>
            )}
            {slot.error && (
              <Text variant="error" size="sm" as="span">
                {slot.error}
              </Text>
            )}
          </div>
        )}
      />
    </SectionCard>
  );
}

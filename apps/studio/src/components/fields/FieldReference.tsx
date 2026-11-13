import type { Site } from "@cloudhal/core-contracts";
import {
  Banner,
  Button,
  EntryPicker,
  type EntryPickerItem,
  type EntryPickerLabels,
  type FieldReferenceSlot,
  ReferenceList,
  type ReferenceListItem,
  type ReferenceListLabels,
  Text,
} from "@cloudhal/ui";
import { ArrowClockwise, PencilSimple, Plus } from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { formatList, type TFunction, useI18n } from "../../i18n/index.tsx";
import { type ReferenceCard, referencesApi } from "../../lib/api/references.ts";
import { collectionName } from "../../lib/collections.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { chooseMember } from "../../lib/field-references.ts";
import { languageName } from "../../lib/languages.ts";
import type { useGroupCards } from "./useGroupCards.ts";

type FT = TFunction<"fields">;

/** The targets' members the form knows (`useGroupCards`). */
export type GroupCards = ReturnType<typeof useGroupCards>;

function useListLabels(t: FT): ReferenceListLabels {
  return useMemo(
    () => ({
      draft: t("status.draft"),
      review: t("status.review"),
      archived: t("status.archived"),
      notFound: t("fields.reference.notFound"),
      notShown: t("fields.reference.notShown"),
      notFoundHint: t("fields.reference.notFoundHint"),
      moveUp: (title) => t("fields.reference.moveUp", { title }),
      moveDown: (title) => t("fields.reference.moveDown", { title }),
      actions: (title) => t("fields.reference.actions", { title }),
      open: t("fields.reference.open"),
      menuMoveUp: t("fields.reference.menuMoveUp"),
      menuMoveDown: t("fields.reference.menuMoveDown"),
      remove: t("fields.reference.remove"),
      loading: t("common.loading"),
      moved: (title, position) => t("fields.reference.moved", { title, position }),
      removed: (title) => t("fields.reference.removed", { title }),
    }),
    [t],
  );
}

function usePickerLabels(t: FT, multiple: boolean, collections: string): EntryPickerLabels {
  return useMemo(() => {
    const p = "fields.reference.picker" as const;
    return {
      title: t(`${p}.title`, { multiple: multiple ? "yes" : "no" }),
      description: t(`${p}.description`, { collections }),
      search: t(`${p}.search`),
      results: (count) => t(`${p}.results`, { count }),
      searching: t(`${p}.searching`),
      noResults: t(`${p}.noResults`),
      failed: t(`${p}.failed`),
      more: t(`${p}.more`),
      keepSearching: t(`${p}.keepSearching`),
      truncated: t(`${p}.truncated`),
      remaining: (count) => t(`${p}.remaining`, { count }),
      unavailable: t(`${p}.unavailable`),
      status: {
        draft: t("status.draft"),
        review: t("status.review"),
        published: t("status.published"),
        archived: t("status.archived"),
      },
      add: (count) => t(`${p}.add`, { count }),
      cancel: t("common.cancel"),
      close: t("common.close"),
    };
  }, [t, multiple, collections]);
}

/**
 * A reference field in the entry editor (RFC-0045 §5): the chosen targets as `ReferenceList`
 * (in stored order, the member in the entry's language, its state, "Not found" for a deleted
 * one) and `EntryPicker` over the picker route (`GET …/entries/pick`, keyset cursor and
 * `truncated`). The entry's own group and the chosen ones can't be picked again.
 */
export function FieldReference({
  siteId,
  site,
  entryLocale,
  ownGroup,
  slot,
  groups,
}: {
  siteId: string;
  site: Site;
  entryLocale: string;
  ownGroup: string;
  slot: FieldReferenceSlot;
  /** The targets' members, and where the picker's cards go so a new target shows at once. */
  groups: GroupCards;
}) {
  const { t, locale } = useI18n("fields");
  const { def, value, multiple, max } = slot;
  const name = (collection: string) => collectionName(site, collection, locale, t("nav.articles"));
  const collections = formatList(locale, def.collections.map(name));
  const listLabels = useListLabels(t);
  const pickerLabels = usePickerLabels(t, multiple, collections);
  const options = {
    locale: entryLocale,
    defaultLocale: site.defaultLocale,
    collections: def.collections,
  };
  const items: ReferenceListItem[] = value.map((id) => {
    const members = groups.cards.get(id);
    if (members === undefined) return { id };
    const member = chooseMember(members, options);
    if (!member) return { id, status: "missing" };
    return {
      id,
      title: member.title,
      status: member.status,
      href: entryHref(siteId, member.id, member.collection),
      meta: t("fields.reference.meta", {
        collection: name(member.collection),
        language: languageName(locale, member.locale),
      }),
    };
  });
  const set = (next: string[]) => slot.onChange(next);
  const remaining = multiple ? max - value.length : 1;
  const toItem = (card: ReferenceCard): EntryPickerItem => ({
    id: card.groupId,
    title: card.title,
    collection: name(card.collection),
    status: card.status,
    locale: languageName(locale, card.locale),
  });
  const trigger = useRef<HTMLButtonElement>(null);
  // The picker's cards by group, so a new target shows before the groups' query answers.
  const found = useRef(new Map<string, ReferenceCard>()).current;
  return (
    <div className="grid min-w-0 gap-2" data-field-reference-host={slot.path}>
      {groups.failed && (
        <Banner
          variant="error"
          title={t("fields.reference.loadFailed")}
          action={
            <Banner.Action
              icon={<ArrowClockwise />}
              loading={groups.retrying}
              onClick={groups.retry}
            >
              {t("fields.reference.retry")}
            </Banner.Action>
          }
        />
      )}
      <ReferenceList
        label={slot.label}
        items={items}
        sortable={multiple && items.length > 1}
        readOnly={slot.readOnly}
        onMove={(i, by) => {
          const next = [...value];
          const j = i + by;
          [next[i], next[j]] = [next[j] as string, next[i] as string];
          set(next);
        }}
        onRemove={(i) => set(value.filter((_, n) => n !== i))}
        focusAfterLast={() => trigger.current}
        labels={listLabels}
      />
      {!slot.readOnly && (
        <span className="flex flex-wrap items-center gap-3">
          <EntryPicker
            trigger={
              <Button
                variant="secondary"
                size="sm"
                icon={!multiple && value.length ? <PencilSimple /> : <Plus />}
                ref={trigger}
              >
                {multiple
                  ? t("fields.reference.add")
                  : value.length
                    ? t("fields.reference.change")
                    : t("fields.reference.choose")}
              </Button>
            }
            multiple={multiple}
            disabled={remaining <= 0}
            remaining={Math.max(remaining, 0)}
            unavailable={new Set([...value, ownGroup])}
            search={async (q, cursor) => {
              const page = await referencesApi.pick(siteId, {
                collections: def.collections,
                q,
                ...(cursor ? { cursor } : {}),
              });
              for (const card of page.entries) found.set(card.groupId, card);
              return {
                items: page.entries.map(toItem),
                cursor: page.cursor,
                truncated: page.truncated === true,
              };
            }}
            onPick={(picked) => {
              const ids = picked.map((p) => p.id);
              groups.add(ids.flatMap((id) => found.get(id) ?? []));
              set(multiple ? [...value, ...ids] : ids.slice(0, 1));
            }}
            labels={pickerLabels}
          />
          {multiple && (
            <Text variant="secondary" size="sm" as="span">
              {t("fields.reference.full", { max })}
            </Text>
          )}
        </span>
      )}
    </div>
  );
}

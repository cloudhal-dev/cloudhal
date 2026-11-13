import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { memberGroup } from "@cloudhal/core-ts/fields";
import { Banner, UsedByList, type UsedByRow } from "@cloudhal/ui";
import { LinkBreak, Prohibit } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import { ApiRequestError } from "../../lib/api/http.ts";
import {
  type ReferenceCard,
  type ReferencedDetails,
  type Referrer,
  referencesApi,
} from "../../lib/api/references.ts";
import { collectionName } from "../../lib/collections.ts";
import { entryHref } from "../../lib/entry-href.ts";
import { referrerFieldWords } from "../../lib/field-references.ts";
import { languageName } from "../../lib/languages.ts";

type FT = TFunction<"fields">;

/** The store's answer to "can this entry be deleted?": its refusal's details, or none. */
async function deleteCheck(entry: ContentEntry): Promise<ReferencedDetails | null> {
  try {
    await referencesApi.deleteCheck(entry);
    return null;
  } catch (e) {
    if (e instanceof ApiRequestError && e.body.error === "entry_referenced")
      return e.body.details as ReferencedDetails;
    throw e;
  }
}

function statusWords(t: FT) {
  return {
    draft: t("status.draft"),
    review: t("status.review"),
    published: t("status.published"),
    archived: t("status.archived"),
  };
}

/**
 * The delete dialog's references (RFC-0045 §5), from the store itself:
 * - its plan (`DELETE …?dryRun=1`) refuses with `entry_referenced` while a published entry shows
 *   a reference and this is the group's last usable entry: Delete stays off, the published
 *   referrers are listed, and the dialog says that archiving this entry doesn't release it;
 * - otherwise, when no other entry of the group is left, draft referrers are listed as "Will show
 *   nothing for this field"; when others are left, it names the language whose pages lose the card.
 * `onBlocked` tells the dialog: undefined while asking, then whether the store refuses.
 */
export function DeleteReferences({
  site,
  entry,
  open,
  onBlocked,
}: {
  site: Site;
  entry: ContentEntry;
  open: boolean;
  onBlocked: (blocked: boolean | undefined) => void;
}) {
  const { t, locale } = useI18n("fields");
  const group = memberGroup(entry);
  const check = useQuery({
    queryKey: ["delete-check", site.id, entry.id, entry.rev],
    queryFn: () => deleteCheck(entry),
    enabled: open,
    retry: false,
    gcTime: 0,
  });
  const referrers = useQuery({
    queryKey: ["entry-referrers", site.id, entry.id, "delete"],
    queryFn: () => referencesApi.referrers(site.id, entry.id, { limit: 100 }),
    enabled: open && check.data === null,
  });
  const members = useQuery({
    queryKey: ["entry-groups", site.id, group],
    queryFn: () => referencesApi.groups(site.id, [group]),
    enabled: open && check.data === null,
  });
  const report = useRef(onBlocked);
  report.current = onBlocked;
  const blocked = check.isPending ? undefined : check.isError ? false : check.data !== null;
  useEffect(() => report.current(blocked), [blocked]);
  if (check.data) return <Blocked t={t} site={site} details={check.data} locale={locale} />;
  if (!referrers.data || !members.data) return null;
  const others = (members.data.groups[group] ?? []).filter(
    (m) => m.id !== entry.id && m.status !== "archived",
  );
  const rows = referrers.data.referrers;
  if (rows.length === 0) return null;
  if (others.length === 0)
    return <DraftsShowNothing t={t} site={site} rows={rows} locale={locale} />;
  return <LocaleLoses t={t} site={site} entry={entry} others={others} locale={locale} />;
}

/** The store refuses: published referrers, and why archiving doesn't help. */
function Blocked({
  t,
  site,
  details,
  locale,
}: {
  t: FT;
  site: Site;
  details: ReferencedDetails;
  locale: string;
}) {
  const rows: UsedByRow[] = details.referrers.map((r) => {
    const words = referrerFieldWords(site, r.collection, r.field, locale);
    return {
      id: `${r.id} ${r.field}`,
      title: r.title,
      href: entryHref(site.id, r.id, r.collection),
      detail: t("fields.delete.where", {
        collection: collectionName(site, r.collection, locale, t("nav.articles")),
        field: words.sub
          ? t("fields.usedBy.subField", { field: words.field, sub: words.sub })
          : words.field,
      }),
      status: "published",
    };
  });
  return (
    <div className="grid gap-3" data-testid="delete-references" data-blocked="">
      <Banner
        variant="error"
        icon={<Prohibit weight="fill" />}
        title={t("fields.delete.blockedTitle", { count: details.total })}
        description={t("fields.delete.blocked")}
      />
      <UsedByList rows={rows} labels={listLabels(t)} />
      {details.total > rows.length && (
        <Banner
          variant="default"
          description={t("fields.delete.more", { count: details.total - rows.length })}
        />
      )}
    </div>
  );
}

/** The last usable entry of its group goes: drafts that name it will show nothing. */
function DraftsShowNothing({
  t,
  site,
  rows,
  locale,
}: {
  t: FT;
  site: Site;
  rows: readonly Referrer[];
  locale: string;
}) {
  const drafts = rows.filter((r) => r.status !== "published");
  if (drafts.length === 0) return null;
  return (
    <div className="grid gap-3" data-testid="delete-references" data-drafts="">
      <Banner
        variant="alert"
        icon={<LinkBreak weight="bold" />}
        title={t("fields.delete.draftsTitle", { count: drafts.length })}
        description={t("fields.delete.drafts")}
      />
      <UsedByList
        rows={drafts.map((r) => ({
          id: `${r.id} ${r.field}`,
          title: r.title,
          href: entryHref(site.id, r.id, r.collection),
          detail: t("fields.delete.where", {
            collection: collectionName(site, r.collection, locale, t("nav.articles")),
            field: referrerFieldWords(site, r.collection, r.field, locale).field,
          }),
          status: r.status,
          note: t("fields.delete.showsNothing"),
        }))}
        labels={listLabels(t)}
      />
    </div>
  );
}

/** Other entries of the group stay: pages in this entry's language lose its card. */
function LocaleLoses({
  t,
  site,
  entry,
  others,
  locale,
}: {
  t: FT;
  site: Site;
  entry: ContentEntry;
  others: readonly ReferenceCard[];
  locale: string;
}) {
  const language = languageName(locale, entry.locale);
  const fallback =
    site.localization?.fallback === "default-with-notice" &&
    entry.locale !== site.defaultLocale &&
    others.some((m) => m.locale === site.defaultLocale);
  return (
    <div data-testid="delete-references" data-locale-loses={entry.locale}>
      <Banner
        variant="alert"
        icon={<LinkBreak weight="bold" />}
        title={t("fields.delete.localeTitle", { language })}
        description={
          fallback
            ? t("fields.delete.localeFallback", {
                language,
                fallback: languageName(locale, site.defaultLocale),
              })
            : t("fields.delete.locale", { language })
        }
      />
    </div>
  );
}

function listLabels(t: FT) {
  return {
    entry: t("fields.usedBy.entry"),
    status: t("fields.usedBy.status"),
    caption: t("fields.delete.caption"),
    statuses: statusWords(t),
  };
}

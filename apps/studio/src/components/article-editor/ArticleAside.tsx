/**
 * The article editor's cards about where the article reaches: readers, comments, menus, the
 * entries that reference it (RFC-0045 "Used by"), languages.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { ArticleCommentsCard } from "../ArticleCommentsCard.tsx";
import { EntryUsedByCard } from "../EntryFieldCards.tsx";
import { UsedInMenusCard } from "../Menus.tsx";
import { ReadersCard } from "../Readers.tsx";
import { TranslationsCard } from "../Translations.tsx";

export function ArticleReachCards({
  siteId,
  entry,
  dirty,
}: {
  siteId: string;
  entry: ContentEntry;
  dirty: boolean;
}) {
  return (
    <>
      <ReadersCard siteId={siteId} node={entry} kind="article" />
      <ArticleCommentsCard siteId={siteId} entry={entry} />
      <UsedInMenusCard siteId={siteId} kind="contentEntry" id={entry.id} />
      <EntryUsedByCard siteId={siteId} entry={entry} />
      <TranslationsCard siteId={siteId} node={entry} dirty={dirty} />
    </>
  );
}

/**
 * Pages and Articles on a multilingual site (an internal review (2026-10) §4a,
 * DESIGN.md §2a): one row per translation group with a Languages cell, a language filter that
 * shows one language's versions flat, and the working language new pages and articles start in.
 * A single-language site gets none of it: the list is exactly the nodes it was given.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { LanguageChips, Select, Toolbar } from "@cloudhal/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { entryHref, entryRoute } from "../lib/entry-href.ts";
import { languageName } from "../lib/languages.ts";
import {
  handTranslationDraft,
  isMultilingual,
  type LanguageCell,
  type TranslationGroupRow,
  translationGroups,
} from "../lib/translation-groups.ts";
import {
  newNodeLocale,
  readWorkingLanguage,
  writeWorkingLanguage,
} from "../lib/working-language.ts";
import { useToast } from "./Toast.ts";

type Localized = Page | ContentEntry;

const GROUPED = "__grouped";

export interface TranslationList<N extends Localized> {
  /** The rows to list: every node, one per group, or one language's nodes. */
  items: N[];
  /** Grouped: the Languages column is shown, with each row's group. */
  groupOf?: ((id: string) => TranslationGroupRow<N> | undefined) | undefined;
  multilingual: boolean;
  filter: string;
  setFilter: (value: string) => void;
  /** The locale a new page or article starts in. */
  newLocale: string;
}

/** Groups `sorted` by translation on a multilingual site, or filters it to one language. */
export function useTranslationList<N extends Localized>(
  siteId: string,
  site: Site | undefined,
  sorted: N[],
): TranslationList<N> {
  const multilingual = isMultilingual(site);
  const [chosen, setChosen] = useState(GROUPED);
  const [working, setWorking] = useState(() => readWorkingLanguage(siteId));
  const translations = useQuery({
    queryKey: ["translations", siteId, "all"],
    queryFn: () => api.translations.list(siteId),
    enabled: multilingual,
  });
  const outdated = useMemo(
    () =>
      new Set(
        (translations.data?.items ?? []).filter((r) => r.stale || r.sourceMissing).map((r) => r.id),
      ),
    [translations.data],
  );
  const filter = site?.locales.includes(chosen) ? chosen : GROUPED;
  const groups = useMemo(
    () =>
      multilingual && site && filter === GROUPED
        ? translationGroups(sorted, site, outdated)
        : undefined,
    [multilingual, site, filter, sorted, outdated],
  );
  const byId = useMemo(() => new Map(groups?.map((g) => [g.node.id, g])), [groups]);
  const items = !multilingual
    ? sorted
    : groups
      ? groups.map((g) => g.node)
      : sorted.filter((n) => n.locale === filter);
  return {
    items,
    groupOf: groups ? (id) => byId.get(id) : undefined,
    multilingual,
    filter,
    setFilter: (value) => {
      setChosen(value);
      if (value === GROUPED) return;
      writeWorkingLanguage(siteId, value);
      setWorking(value);
    },
    newLocale: newNodeLocale(site, working),
  };
}

/** The toolbar's language `Select`: grouped by default, or one language (the working language). */
export function LanguageFilter({
  list,
  site,
}: {
  list: TranslationList<Localized>;
  site: Site | undefined;
}) {
  const { t, locale } = useI18n();
  if (!list.multilingual || !site) return null;
  return (
    <Select
      aria-label={t("translationList.filter")}
      value={list.filter}
      onValueChange={(v) => list.setFilter(v as string)}
      items={Object.fromEntries([
        [GROUPED, t("translationList.grouped")],
        ...site.locales.map((l) => [l, languageName(locale, l)]),
      ])}
      render={<Toolbar.Button />}
      data-testid="language-filter"
    />
  );
}

/** Where a version is edited in Studio. */
const editorHref = (siteId: string, n: Localized) =>
  "sections" in n ? `/sites/${siteId}/pages/${n.id}` : entryHref(siteId, n.id, n.collection);

/** A new draft in `locale` from `source`: its content to translate, linked to its group. */
async function writeByHand(siteId: string, source: Localized, locale: string): Promise<Localized> {
  const group = await api.translations.group(siteId, source.id);
  const hash = group.items.find((m) => m.id === source.id)?.hash ?? "";
  const draft = handTranslationDraft(source, locale, hash);
  if (draft.kind === "page") return (await api.pages.create(siteId, draft.input)).page;
  return api.entries.create(siteId, draft.input);
}

/** A grouped row's Languages cell: a chip per site language; a missing one is started by hand. */
export function LanguagesCell<N extends Localized>({
  siteId,
  row,
  canWrite,
}: {
  siteId: string;
  row: TranslationGroupRow<N>;
  /** The person may create this kind of node. */
  canWrite: boolean;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const source = row.cells.find((c) => c.node?.id === row.group)?.node ?? row.node;
  const create = useMutation({
    mutationFn: (target: string) => writeByHand(siteId, source, target),
    onSuccess: async (node) => {
      await qc.invalidateQueries({ queryKey: ["translations", siteId] });
      await qc.invalidateQueries({ queryKey: ["sections" in node ? "pages" : "entries", siteId] });
      await ("sections" in node
        ? navigate({ to: "/sites/$siteId/pages/$pageId", params: { siteId, pageId: node.id } })
        : navigate(entryRoute(siteId, node.id, node.collection)));
    },
    onError: (e) => toast.error(apiErrorText(t, e)),
  });
  const item = (c: LanguageCell<N>) => ({
    locale: c.locale,
    state: c.state,
    ...(c.node ? { href: editorHref(siteId, c.node) } : {}),
  });
  const present = row.cells.filter((c) => c.node).length;
  return (
    <LanguageChips
      items={row.cells.map(item)}
      labels={{
        group: t("translationList.column"),
        describe: (i) =>
          t("translationList.state", { language: languageName(locale, i.locale), state: i.state }),
        summary: t("translationList.summary", { count: present, total: row.cells.length }),
        summaryLabel: t("translationList.summaryLabel", {
          count: present,
          total: row.cells.length,
        }),
        writeByHand: t("translationList.writeByHand"),
      }}
      onWriteByHand={canWrite ? (l) => create.mutate(l) : undefined}
      busyLocale={create.isPending ? create.variables : undefined}
    />
  );
}

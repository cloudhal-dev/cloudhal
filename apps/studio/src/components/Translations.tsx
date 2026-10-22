/**
 * RFC-0033 §8: a page's or article's language versions in the editor's side column — each
 * language by name, its status, how it was made (original, a person, machine, machine reviewed),
 * whether it is out of date — and a person's review of a machine translation. Agents translate
 * through MCP (`save_translation`); only people review, here.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { Badge, Button, Link, SectionCard, SectionEmpty, Text } from "@cloudhal/ui";
import { Translate } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api, type TranslationRow } from "../lib/api.ts";
import { entryHref } from "../lib/entry-href.ts";
import { languageName } from "../lib/languages.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Status } from "./Status.tsx";

const METHOD_KEY = {
  original: "translations.method.original",
  human: "translations.method.human",
  machine: "translations.method.machine",
  "machine-reviewed": "translations.method.machineReviewed",
} as const;

/** Where a version is edited in Studio. */
function editorHref(siteId: string, row: TranslationRow): string {
  return row.kind === "page"
    ? `/sites/${siteId}/pages/${row.id}`
    : entryHref(siteId, row.id, row.collection);
}

export function TranslationsCard({
  siteId,
  node,
  dirty,
}: {
  siteId: string;
  /** The saved node (the editor's query data): its `rev` is what the review sends. */
  node: Page | ContentEntry;
  /** Unsaved edits: reviewing would race them, so it waits for a save. */
  dirty: boolean;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const key = ["translations", siteId, node.id, node.rev];
  const group = useQuery({ queryKey: key, queryFn: () => api.translations.group(siteId, node.id) });
  const review = useMutation({
    mutationFn: () => api.translations.review(siteId, node.id, node.rev),
    onSuccess: async (saved) => {
      setConfirm(false);
      // The editor's query (`["page" | "entry", siteId, id]`) takes the reviewed node.
      qc.setQueryData(["sections" in saved ? "page" : "entry", siteId, saved.id], saved);
      await qc.invalidateQueries({ queryKey: ["translations", siteId] });
    },
  });
  const name = (l: string) => languageName(locale, l);
  const rows = group.data?.items ?? [];
  const canReview = node.translation?.method === "machine" && !node.translation.review;
  return (
    <SectionCard
      title={t("translations.title")}
      icon={<Translate size={16} />}
      actions={rows.length > 1 ? <Badge variant="secondary">{rows.length}</Badge> : undefined}
      id="translations"
    >
      {group.data === undefined ? (
        <Text variant="secondary" size="sm">
          {t("common.loading")}
        </Text>
      ) : rows.length < 2 ? (
        <SectionEmpty
          icon={<Translate size={32} className="text-kumo-inactive" />}
          title={t("translations.none", { language: name(node.locale) })}
          description={t("translations.noneDescription")}
        />
      ) : (
        <div className="grid gap-3">
          <dl className="grid divide-y divide-kumo-hairline">
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid min-w-0 gap-1 py-2 first:pt-0 last:pb-0"
                data-translation={row.locale}
              >
                <dt className="flex min-w-0 items-center justify-between gap-2">
                  <Text as="span">{name(row.locale)}</Text>
                  <Status status={row.status} />
                </dt>
                <dd className="grid min-w-0 gap-1">
                  {row.id === node.id ? (
                    <Text as="span" variant="secondary" size="sm">
                      {t("translations.current")}
                    </Text>
                  ) : (
                    <Link href={editorHref(siteId, row)} variant="inline">
                      <span className="block truncate">{row.title}</span>
                    </Link>
                  )}
                  <span className="flex flex-wrap gap-1">
                    {row.method && <Badge variant="outline">{t(METHOD_KEY[row.method])}</Badge>}
                    {row.stale && <Badge variant="warning">{t("translations.stale")}</Badge>}
                    {row.sourceMissing && (
                      <Badge variant="warning">{t("translations.sourceMissing")}</Badge>
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          {canReview && (
            <div className="grid gap-1">
              <Button variant="secondary" disabled={dirty} onClick={() => setConfirm(true)}>
                {t("translations.review")}
              </Button>
              {dirty && (
                <Text variant="secondary" size="sm">
                  {t("translations.reviewSaveFirst")}
                </Text>
              )}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("translations.reviewTitle")}
        description={t("translations.reviewDescription")}
        confirmLabel={t("translations.review")}
        busy={review.isPending}
        error={review.error}
        onConfirm={() => review.mutate()}
      />
    </SectionCard>
  );
}

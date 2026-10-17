import { Banner, Button, InsetPanel, LayerDialog, SkeletonLine, Text } from "@cloudhal/ui";
import { ArrowCounterClockwise, CheckCircle, Tag, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { listOf, useT } from "../i18n/index.tsx";
import { api, type TagsMigrationResult } from "../lib/api.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { invalidateTaxonomy } from "./Taxonomy.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

/**
 * The one-time offer to move a site's legacy `tags` to terms (RFC-0002, Compatibility &
 * migration; DESIGN.md §2p): a `Banner` with "Preview the move", opening `TagsMigrationDialog`.
 */
export function TagsMigrationBanner({ siteId }: { siteId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // The migration rewrites the site's vocabulary: Administrators (`site:settings`, RFC-0005).
  const gate = useGate("settings.write");
  return (
    <>
      <Banner
        icon={<Tag weight="fill" />}
        title={t("migration.banner.title")}
        description={t("migration.banner.description")}
        action={
          <Banner.Action
            variant="secondary"
            onClick={() => setOpen(true)}
            disabled={!gate.allowed}
            title={gate.reason}
          >
            {t("migration.banner.action")}
          </Banner.Action>
        }
        data-testid="tags-migration-banner"
      />
      <TagsMigrationDialog siteId={siteId} open={open} onOpenChange={setOpen} />
    </>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 first:pt-0 last:pb-0">
      <Text variant="secondary" as="span">
        {label}
      </Text>
      <Text as="span">{children}</Text>
    </div>
  );
}

/**
 * Dry run first (nothing is written), then the run — which snapshots before and after, so it can
 * be undone from here or with `cloudhal migrate tags-to-terms --revert`.
 */
export function TagsMigrationDialog({
  siteId,
  open,
  onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [done, setDone] = useState<TagsMigrationResult | undefined>();
  useEffect(() => {
    if (open) setDone(undefined);
  }, [open]);
  const dry = useQuery({
    queryKey: ["tags-migration", siteId],
    queryFn: () => api.migrations.tagsToTerms(siteId, true),
    enabled: open && !done,
    staleTime: 0,
  });
  const run = useMutation({
    mutationFn: () => api.migrations.tagsToTerms(siteId, false),
    onSuccess: async (result) => {
      setDone(result);
      await invalidateTaxonomy(qc, siteId);
      toast.success(
        t("migration.done.toast"),
        t("migration.done.toastDetail", { tags: result.tags.length, entries: result.entries }),
      );
    },
  });
  const revert = useMutation({
    mutationFn: (migrationId: string) => api.migrations.revertTagsToTerms(siteId, migrationId),
    onSuccess: async (result) => {
      await invalidateTaxonomy(qc, siteId);
      toast.success(
        t("migration.revert.toast"),
        t("migration.revert.toastDetail", { count: result.restored }),
      );
      onOpenChange(false);
    },
  });
  const r = done ?? dry.data;
  return (
    <LayerDialog.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissDisabled={run.isPending || revert.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {done ? t("migration.done.title") : t("migration.dialog.title")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {done ? t("migration.done.description") : t("migration.dialog.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="tags-migration">
            <ErrorBanner error={dry.error ?? run.error ?? revert.error} />
            {!r ? (
              <InsetPanel className="gap-3">
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
              </InsetPanel>
            ) : r.upToDate && !done ? (
              <Banner
                variant="secondary"
                icon={<CheckCircle weight="fill" />}
                title={t("migration.dialog.upToDate")}
                description={t("migration.dialog.upToDateDescription")}
              />
            ) : (
              <>
                <InsetPanel label={t("migration.dialog.summary")}>
                  <div className="grid divide-y divide-kumo-hairline">
                    <SummaryRow label={t("migration.dialog.tags")}>
                      {r.tags.length === 0
                        ? t("migration.dialog.none")
                        : `${r.tags.length} · ${listOf(r.tags.slice(0, 6))}${r.tags.length > 6 ? "…" : ""}`}
                    </SummaryRow>
                    <SummaryRow label={t("migration.dialog.entries")}>{r.entries}</SummaryRow>
                    <SummaryRow label={t("migration.dialog.terms")}>
                      {t("migration.dialog.termsValue", {
                        created: r.termsCreated,
                        reused: r.termsReused,
                      })}
                    </SummaryRow>
                    <SummaryRow label={t("migration.dialog.taxonomies")}>
                      {r.taxonomiesCreated.length > 0
                        ? listOf(r.taxonomiesCreated)
                        : t("migration.dialog.none")}
                    </SummaryRow>
                  </div>
                </InsetPanel>
                {r.skipped.length > 0 && (
                  <Banner
                    variant="alert"
                    size="sm"
                    icon={<Warning weight="fill" />}
                    title={t("migration.dialog.skipped", { count: r.skipped.length })}
                    description={r.skipped
                      .slice(0, 3)
                      .map((s) => s.reason)
                      .join(" · ")}
                  />
                )}
                {!done && (
                  <Text variant="secondary" size="sm">
                    {t("migration.dialog.how")}
                  </Text>
                )}
                {done && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Text variant="secondary" size="sm" as="span">
                      {t("migration.done.undoHint")}
                    </Text>
                    <Button
                      variant="secondary"
                      icon={<ArrowCounterClockwise />}
                      loading={revert.isPending}
                      onClick={() => revert.mutate(done.migrationId)}
                      data-testid="migration-undo"
                    >
                      {t("migration.done.undo")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={done ? t("common.close") : t("common.cancel")}>
          {done ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {t("migration.done.close")}
            </LayerDialog.Actions.Primary>
          ) : (
            <LayerDialog.Actions.Primary
              loading={run.isPending}
              disabled={!dry.data || dry.data.upToDate}
              onClick={() => run.mutate()}
              data-testid="migration-run"
            >
              {t("migration.dialog.run")}
            </LayerDialog.Actions.Primary>
          )}
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

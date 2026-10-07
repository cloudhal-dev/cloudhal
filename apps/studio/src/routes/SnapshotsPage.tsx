import type { Snapshot } from "@cloudhal/core-contracts";
import { ApprovalDialog, LayerCard, Pagination, SnapshotTimeline, Toolbar } from "@cloudhal/ui";
import { Camera, RocketLaunch } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { usePaging } from "../components/usePaging.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

type Pending =
  | { kind: "publish"; snapshot: Snapshot }
  | { kind: "rollback"; snapshot: Snapshot }
  | { kind: "create"; publish: boolean };

export function SnapshotsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
  });
  const paging = usePaging(
    snapshots.data,
    (s, q) => (s.label ?? "").toLowerCase().includes(q) || s.id.includes(q),
  );
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState<Pending | undefined>();

  const act = useMutation({
    mutationFn: async (p: Pending) => {
      if (p.kind === "create")
        return api.snapshots.create(siteId, { ...(label ? { label } : {}), publish: p.publish });
      if (p.kind === "publish") return api.snapshots.publish(siteId, p.snapshot.id);
      return api.snapshots.rollback(siteId, p.snapshot.id);
    },
    onSuccess: async (_r, p) => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      setPending(undefined);
      setLabel("");
      toast.success(
        p.kind === "create"
          ? p.publish
            ? t("snapshots.publishedSnapshot")
            : t("snapshots.created")
          : p.kind === "publish"
            ? t("snapshots.published")
            : t("snapshots.rolledBack"),
      );
    },
    onError: (e) => toast.error(t("snapshots.failed"), e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="grid gap-4">
      <ErrorBanner error={snapshots.error ?? act.error} />
      <Toolbar size="sm" className="w-full max-w-2xl" aria-label={t("snapshots.title")}>
        <Toolbar.Input
          aria-label={t("snapshots.label")}
          placeholder={t("snapshots.labelPlaceholder")}
          value={label}
          onChange={(e) => setLabel((e.target as HTMLInputElement).value)}
          className="flex-1"
        />
        <Toolbar.Button
          icon={<Camera />}
          onClick={() => act.mutate({ kind: "create", publish: false })}
          disabled={act.isPending}
        >
          {t("snapshots.snapshot")}
        </Toolbar.Button>
        <Toolbar.Button
          icon={<RocketLaunch />}
          onClick={() => setPending({ kind: "create", publish: true })}
          disabled={act.isPending}
          data-testid="snapshot-publish"
        >
          {t("snapshots.snapshotAndPublish")}
        </Toolbar.Button>
      </Toolbar>
      <LayerCard className="p-0">
        {snapshots.isPending ? (
          <TableSkeleton columns={5} rows={3} />
        ) : (
          <SnapshotTimeline
            snapshots={paging.pageItems}
            publishedSnapshotId={site.data?.publishedSnapshotId}
            onPublish={(s) => setPending({ kind: "publish", snapshot: s })}
            onRollback={(s) => setPending({ kind: "rollback", snapshot: s })}
            emptyIcon={<Camera size={48} className="text-kumo-inactive" />}
            formatDate={(iso) => new Date(iso).toLocaleString(locale)}
            labels={{
              empty: t("snapshots.empty"),
              emptyDescription: t("snapshots.emptyDescription"),
              live: t("common.live"),
              publish: t("common.publish"),
              rollBack: t("common.rollBack"),
              columns: {
                snapshot: t("snapshots.columns.snapshot"),
                actor: t("snapshots.columns.actor"),
                changes: t("snapshots.columns.changes"),
                when: t("snapshots.columns.when"),
              },
              reasons: {
                manual: t("snapshots.reasons.manual"),
                agentMutation: t("snapshots.reasons.agentMutation"),
                publish: t("snapshots.reasons.publish"),
                rollback: t("snapshots.reasons.rollback"),
                scheduled: t("snapshots.reasons.scheduled"),
                import: t("snapshots.reasons.import"),
              },
            }}
          />
        )}
      </LayerCard>
      {paging.total > paging.perPage && (
        <Pagination
          page={paging.page}
          perPage={paging.perPage}
          totalCount={paging.total}
          setPage={paging.setPage}
        />
      )}
      <ApprovalDialog
        open={pending !== undefined}
        onOpenChange={(o) => !o && setPending(undefined)}
        title={
          pending?.kind === "rollback" ? t("snapshots.rollbackTitle") : t("snapshots.publishTitle")
        }
        description={
          pending?.kind === "create"
            ? t("snapshots.createDescription")
            : pending
              ? t("snapshots.becomesLive", { name: pending.snapshot.label ?? pending.snapshot.id })
              : undefined
        }
        confirmLabel={pending?.kind === "rollback" ? t("common.rollBack") : t("common.publish")}
        cancelLabel={t("common.cancel")}
        destructive={pending?.kind === "rollback"}
        busy={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
      />
    </div>
  );
}

import type { Snapshot } from "@cloudhal/core-contracts";
import {
  ApprovalDialog,
  Button,
  Empty,
  Input,
  LayerCard,
  LayerDialog,
  PageLayout,
  Pagination,
  Radio,
  SnapshotTimeline,
  Table,
} from "@cloudhal/ui";
import { Camera, MagnifyingGlass } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { usePublishMode } from "../components/Publish.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { SnapshotDiffDialog } from "../components/SnapshotDiffDialog.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { usePaging } from "../components/usePaging.ts";
import { approvalsKey } from "../components/usePendingApprovals.ts";
import { useT } from "../i18n/index.tsx";
import { api, type PublishResult, publishResultOf } from "../lib/api.ts";

type Pending =
  | { kind: "publish"; snapshot: Snapshot }
  | { kind: "rollback"; snapshot: Snapshot }
  | { kind: "create"; publish: boolean };

type AfterCreate = "keep" | "publish";

/**
 * Site › Snapshots (DESIGN.md §2a): every frozen version of the site, newest first. "Create
 * snapshot" opens a small dialog (label + whether to publish); publishing, rolling back and
 * snapshot-and-publish always pass `ApprovalDialog`. Compare opens the diff (§2i) at `?diff=<id>`.
 */
export function SnapshotsPage() {
  const t = useT();
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
    (s, q) => (s.label ?? "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [after, setAfter] = useState<AfterCreate>("keep");
  const [pending, setPending] = useState<Pending | undefined>();
  // Role gating (DESIGN.md §2s): Authors may have to request a publish; Contributors cannot
  // publish and nobody below Editor rolls back. The server decides; this only says so up front.
  const publishing = usePublishMode(siteId);
  const rollbackGate = useGate("rollback");
  const request = publishing.mode === "request";
  // The open diff lives in the URL (`?diff=<id>`) so Activity can link straight to it.
  const navigate = useNavigate();
  const { diff: diffId } = useSearch({ strict: false }) as { diff?: string };
  const setDiff = (id: string | undefined) =>
    navigate({
      to: "/sites/$siteId/snapshots",
      params: { siteId },
      search: id ? { diff: id } : {},
      replace: !id,
    });
  const listed = snapshots.data?.find((s) => s.id === diffId);
  const fetched = useQuery({
    queryKey: ["snapshot", siteId, diffId],
    queryFn: () => api.snapshots.get(siteId, diffId as string),
    enabled: !!diffId && snapshots.isSuccess && !listed,
  });
  const diffSnapshot = diffId ? (listed ?? fetched.data) : undefined;

  const act = useMutation({
    mutationFn: async (p: Pending): Promise<PublishResult | undefined> => {
      const trimmed = label.trim();
      if (p.kind === "create") {
        const created = await api.snapshots.create(siteId, {
          ...(trimmed ? { label: trimmed } : {}),
          publish: p.publish,
        });
        return p.publish ? publishResultOf(created) : undefined;
      }
      if (p.kind === "publish") return api.snapshots.publish(siteId, p.snapshot.id);
      await api.snapshots.rollback(siteId, p.snapshot.id);
      return undefined;
    },
    onSuccess: async (result, p) => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      setPending(undefined);
      setCreateOpen(false);
      if (p.kind === "create") {
        setLabel("");
        setAfter("keep");
      }
      // An Author's publish that includes others' work became a request (202, RFC-0005 §6).
      if (result?.kind === "requested") {
        await qc.invalidateQueries({ queryKey: approvalsKey(siteId) });
        toast.notice({
          id: result.request.id,
          title: t("publishing.requested"),
          description: t("publishing.requestedDescription"),
          tone: "info",
          actions: [
            {
              label: t("publishing.openRequest"),
              onClick: () => void navigate({ to: "/sites/$siteId/approvals", params: { siteId } }),
            },
          ],
        });
        return;
      }
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

  /** The dialog's primary action: create now, or hand over to the publish confirmation. */
  const submitCreate = () => {
    if (after === "publish") {
      setCreateOpen(false);
      setPending({ kind: "create", publish: true });
    } else {
      act.mutate({ kind: "create", publish: false });
    }
  };

  const createButton = (
    <Button
      variant="primary"
      icon={<Camera />}
      onClick={() => setCreateOpen(true)}
      data-testid="create-snapshot"
    >
      {t("snapshots.create")}
    </Button>
  );
  const searching = paging.search.trim() !== "";

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.snapshots.title") }]} />}
      icon={<Camera size={24} />}
      title={t("pageHeaders.snapshots.title")}
      description={t("pageHeaders.snapshots.description")}
      actions={createButton}
    >
      <ErrorBanner error={snapshots.error ?? act.error ?? fetched.error} />
      <ListToolbar
        search={paging.search}
        onSearch={paging.setSearch}
        placeholder={t("snapshots.search")}
      />
      {snapshots.data?.length === 0 ? (
        <Empty
          icon={<Camera size={48} className="text-kumo-inactive" />}
          title={t("snapshots.empty")}
          description={t("snapshots.emptyDescription")}
          contents={createButton}
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          {snapshots.isPending ? (
            <Table>
              <TableSkeleton columns={6} rows={4} />
            </Table>
          ) : (
            <SnapshotTimeline
              snapshots={paging.pageItems}
              publishedSnapshotId={site.data?.publishedSnapshotId}
              onPublish={(s) => setPending({ kind: "publish", snapshot: s })}
              onRollback={(s) => setPending({ kind: "rollback", snapshot: s })}
              publishDisabledReason={publishing.mode === "none" ? publishing.reason : undefined}
              rollbackDisabledReason={rollbackGate.reason}
              onCompare={(s) => setDiff(s.id)}
              emptyIcon={<MagnifyingGlass size={48} className="text-kumo-inactive" />}
              renderTime={(iso) => <RelativeTime iso={iso} />}
              labels={{
                empty: searching ? t("snapshots.noMatches") : t("snapshots.empty"),
                emptyDescription: searching
                  ? t("snapshots.noMatchesDescription")
                  : t("snapshots.emptyDescription"),
                live: t("common.live"),
                publish: request ? t("publishing.request") : t("common.publish"),
                rollBack: t("common.rollBack"),
                compare: t("snapshots.compare"),
                actions: t("snapshots.actions"),
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
      )}
      {paging.total > paging.perPage && (
        <Pagination
          page={paging.page}
          perPage={paging.perPage}
          totalCount={paging.total}
          setPage={paging.setPage}
        />
      )}
      <LayerDialog.Root
        open={createOpen}
        onOpenChange={setCreateOpen}
        dismissDisabled={act.isPending}
      >
        <LayerDialog.Content size="base" closeLabel={t("common.close")}>
          <LayerDialog.Title>{t("snapshots.createTitle")}</LayerDialog.Title>
          <LayerDialog.Description>{t("snapshots.createIntro")}</LayerDialog.Description>
          <LayerDialog.Body>
            <div className="grid gap-6" data-testid="create-snapshot-dialog">
              <Input
                label={t("snapshots.label")}
                placeholder={t("snapshots.labelPlaceholder")}
                description={t("snapshots.labelDescription")}
                value={label}
                onValueChange={setLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
                maxLength={200}
                className="w-full"
                autoFocus
              />
              <Radio.Group
                appearance="card"
                legend={t("snapshots.afterCreate")}
                value={after}
                onValueChange={(v) => setAfter(v as AfterCreate)}
              >
                <Radio.Item
                  value="keep"
                  label={t("snapshots.keepOption")}
                  description={t("snapshots.keepOptionDescription")}
                />
                <Radio.Item
                  value="publish"
                  label={request ? t("publishing.requestOption") : t("snapshots.publishOption")}
                  description={
                    publishing.mode === "none"
                      ? (publishing.reason ?? t("snapshots.publishOptionDescription"))
                      : request
                        ? t("publishing.requestOptionDescription")
                        : t("snapshots.publishOptionDescription")
                  }
                  disabled={publishing.mode === "none"}
                />
              </Radio.Group>
            </div>
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t("common.cancel")}>
            <LayerDialog.Actions.Primary
              onClick={submitCreate}
              loading={act.isPending && pending === undefined}
              data-testid="create-snapshot-submit"
            >
              {after === "publish" ? t("snapshots.continueToPublish") : t("snapshots.create")}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Root>
      <SnapshotDiffDialog
        siteId={siteId}
        snapshot={diffSnapshot}
        publishedSnapshotId={site.data?.publishedSnapshotId}
        onOpenChange={(o) => !o && setDiff(undefined)}
      />
      <ApprovalDialog
        open={pending !== undefined}
        onOpenChange={(o) => !o && setPending(undefined)}
        title={
          pending?.kind === "rollback"
            ? t("snapshots.rollbackTitle")
            : request
              ? t("publishing.requestTitle")
              : t("snapshots.publishTitle")
        }
        description={
          pending?.kind !== "rollback" && request
            ? t("publishing.requestDescription")
            : pending?.kind === "create"
              ? t("snapshots.createDescription")
              : pending
                ? t("snapshots.becomesLive", {
                    name: pending.snapshot.label ?? pending.snapshot.id,
                  })
                : undefined
        }
        confirmLabel={
          pending?.kind === "rollback"
            ? t("common.rollBack")
            : request
              ? t("publishing.sendRequest")
              : t("common.publish")
        }
        cancelLabel={t("common.cancel")}
        destructive={pending?.kind === "rollback"}
        busy={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
      />
    </PageLayout>
  );
}

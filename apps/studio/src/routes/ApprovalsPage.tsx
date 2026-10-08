import {
  Badge,
  Banner,
  Button,
  Collapsible,
  Empty,
  LayerCard,
  RefreshButton,
  SkeletonLine,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { CheckCircle, ClockCountdown, HandPalm, Info, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ActivityViews } from "../components/ActivityViews.tsx";
import { ModeBadge } from "../components/AgentModes.tsx";
import { ApproveRequestDialog } from "../components/ApproveRequestDialog.tsx";
import { ActorCell, ToolCell, useToolLabel } from "../components/Audit.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { approvalsKey } from "../components/usePendingApprovals.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { isManualModeRequest } from "../lib/agents.ts";
import { type Approval, api, isNotEnabled } from "../lib/api.ts";
import {
  expiresSoon,
  formatArguments,
  isNoLongerPending,
  needsConfirmation,
  STATUS_VARIANT,
  splitApprovals,
} from "../lib/approvals.ts";

type Decision = "approve" | "deny";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function SectionHeading({ title, count }: { title: string; count?: number | undefined }) {
  return (
    <div className="flex items-center gap-2">
      <Text variant="heading" as="h2">
        {title}
      </Text>
      {count !== undefined && count > 0 && <Badge variant="warning">{count}</Badge>}
    </div>
  );
}

/**
 * The request's question as plain text. Manual-mode writes (ADR-0015) carry a terse policy reason
 * ("manual mode: update_entry needs a person's approval"); those read as a localised sentence.
 */
function usePromptText() {
  const t = useT();
  const label = useToolLabel();
  return useCallback(
    (request: Approval, short = false) => {
      if (!isManualModeRequest(request.prompt) || needsConfirmation(request.tool))
        return request.prompt;
      const tool = label(request.tool);
      return short
        ? t("approvals.manualPromptShort", { tool })
        : t("approvals.manualPrompt", { agent: request.actor.name ?? request.actor.id, tool });
    },
    [t, label],
  );
}

/** One pending request: who asks for what, the server's question as plain text, and the decision. */
function PendingRequest({
  request,
  busy,
  onDecide,
}: {
  request: Approval;
  busy: Decision | undefined;
  onDecide: (decision: Decision) => void;
}) {
  const t = useT();
  const promptText = usePromptText();
  const args = formatArguments(request.input);
  const soon = expiresSoon(request.expiresAt);
  const manual = isManualModeRequest(request.prompt) && !needsConfirmation(request.tool);
  const prompt = promptText(request);
  return (
    <div className="grid gap-3 px-5 py-4" data-approval-id={request.id} data-tool={request.tool}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2">
          <ToolCell tool={request.tool} />
          <div className="grid gap-1">
            <Text variant="secondary" size="xs" as="span">
              {t("approvals.columns.agent")}
            </Text>
            <ActorCell actor={request.actor} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            icon={<X />}
            loading={busy === "deny"}
            disabled={busy !== undefined}
            onClick={() => onDecide("deny")}
          >
            {t("approvals.deny")}
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle />}
            loading={busy === "approve"}
            disabled={busy !== undefined}
            onClick={() => onDecide("approve")}
          >
            {t("approvals.approve")}
          </Button>
        </div>
      </div>
      {manual ? (
        // Manual mode: the server's reason is a terse policy line; say what it means instead.
        <div className="grid gap-1.5" data-manual-mode="true">
          <div className="flex items-start gap-2">
            <span className="flex h-lh items-center">
              <ModeBadge mode="manual" />
            </span>
            <Text>{prompt}</Text>
          </div>
          <Text variant="secondary" size="sm">
            {t("approvals.manualHint")}
          </Text>
        </div>
      ) : (
        // Server-built text that can quote agent-written titles: rendered as plain text.
        <Text>{prompt}</Text>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-1.5">
          <Text variant="secondary" size="sm" as="span">
            {t("approvals.requested")}
          </Text>
          <RelativeTime iso={request.createdAt} />
        </span>
        <span className="flex items-center gap-1.5">
          <Text variant="secondary" size="sm" as="span">
            {t("approvals.expires")}
          </Text>
          <RelativeTime iso={request.expiresAt} />
          {soon && (
            <Badge variant="warning" icon={<ClockCountdown />}>
              {t("approvals.expiresSoon")}
            </Badge>
          )}
        </span>
      </div>
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>{t("approvals.arguments")}</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          {args ? (
            <div className="max-h-80 min-w-0 overflow-auto">
              <CodeHighlighted code={args} lang="json" showCopyButton />
            </div>
          ) : (
            <Text variant="secondary">{t("approvals.noArguments")}</Text>
          )}
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </div>
  );
}

function StatusBadgeFor({ status }: { status: Approval["status"] }) {
  const t = useT();
  return (
    <span data-status={status}>
      <Badge variant={STATUS_VARIANT[status]} appearance="dot">
        {t(`approvals.statuses.${status}`)}
      </Badge>
    </span>
  );
}

function HistoryTable({
  rows,
  pending,
  meId,
}: {
  rows: Approval[];
  pending: boolean;
  /** The signed-in person's actor id, to say "by you". */
  meId: string | undefined;
}) {
  const t = useT();
  const promptText = usePromptText();
  return (
    <LayerCard className="overflow-x-auto p-0">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t("approvals.columns.request")}</Table.Head>
            <Table.Head>{t("approvals.columns.status")}</Table.Head>
            <Table.Head>{t("approvals.columns.agent")}</Table.Head>
            <Table.Head>{t("approvals.columns.requested")}</Table.Head>
            <Table.Head>{t("approvals.columns.decided")}</Table.Head>
          </Table.Row>
        </Table.Header>
        {pending ? (
          <TableSkeleton columns={5} rows={3} />
        ) : rows.length === 0 ? (
          <Table.Body>
            <Table.Row>
              <Table.Cell colSpan={5}>
                <Empty
                  size="sm"
                  icon={<HandPalm size={32} className="text-kumo-inactive" />}
                  title={t("approvals.noHistory")}
                  description={t("approvals.noHistoryDescription")}
                />
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        ) : (
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id} data-approval-id={r.id}>
                <Table.Cell>
                  <div className="grid w-72 gap-1">
                    <ToolCell tool={r.tool} />
                    <Tooltip content={promptText(r)} className="block min-w-0 text-left">
                      <Text variant="secondary" size="sm" truncate>
                        {promptText(r, true)}
                      </Text>
                    </Tooltip>
                  </div>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  <StatusBadgeFor status={r.status} />
                </Table.Cell>
                <Table.Cell className="min-w-44 max-w-64">
                  <ActorCell actor={r.actor} />
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  <RelativeTime iso={r.createdAt} />
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  {r.decidedAt ? (
                    <div className="grid gap-0.5">
                      <RelativeTime iso={r.decidedAt} />
                      {r.decidedBy &&
                        (r.decidedBy === meId ? (
                          <Text variant="secondary" size="sm" as="span">
                            {t("approvals.decidedByYou")}
                          </Text>
                        ) : (
                          <Tooltip content={r.decidedBy} className="block max-w-40 text-left">
                            <Text variant="mono-secondary" truncate as="span">
                              {t("approvals.decidedBy", { actor: r.decidedBy })}
                            </Text>
                          </Tooltip>
                        ))}
                    </div>
                  ) : (
                    <Text variant="secondary" as="span">
                      —
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        )}
      </Table>
    </LayerCard>
  );
}

/** Site › Activity › Approvals: agents' gated calls waiting for a person (ADR-0014, DESIGN.md §2m). */
export function ApprovalsPage() {
  const { t } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const toast = useToast();
  const all = useQuery({
    queryKey: [...approvalsKey(siteId), "all"],
    queryFn: () => api.approvals.list(siteId),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [confirming, setConfirming] = useState<Approval | undefined>();
  const decide = useMutation({
    mutationFn: ({ request, decision }: { request: Approval; decision: Decision }) =>
      api.approvals.decide(siteId, request.id, decision),
    onSuccess: async (_r, { request, decision }) => {
      setConfirming(undefined);
      const agent = request.actor.name ?? request.actor.id;
      if (decision === "approve")
        toast.success(t("approvals.approved"), t("approvals.approvedDescription", { agent }));
      else toast.success(t("approvals.denied"), t("approvals.deniedDescription", { agent }));
      await qc.invalidateQueries({ queryKey: approvalsKey(siteId) });
    },
    onError: async (error) => {
      if (isNoLongerPending(error)) {
        setConfirming(undefined);
        toast.error(t("approvals.noLongerPending"), t("approvals.noLongerPendingDescription"));
        await qc.invalidateQueries({ queryKey: approvalsKey(siteId) });
      } else if (!confirming) {
        toast.error(t("approvals.failed"), errorMessage(error));
      }
    },
  });
  const onDecide = (request: Approval, decision: Decision) => {
    decide.reset();
    if (decision === "approve" && needsConfirmation(request.tool)) setConfirming(request);
    else decide.mutate({ request, decision });
  };
  const busyFor = (request: Approval): Decision | undefined =>
    decide.isPending && decide.variables?.request.id === request.id
      ? decide.variables.decision
      : undefined;
  const notEnabled = isNotEnabled(all.error);
  const { pending, history } = splitApprovals(all.data ?? []);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActivityViews siteId={siteId} value="approvals" />
        {!notEnabled && (
          <RefreshButton
            variant="secondary"
            size="sm"
            aria-label={t("common.retry")}
            loading={all.isRefetching}
            onClick={() => all.refetch()}
          />
        )}
      </div>
      {notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("approvals.notEnabledTitle")}
          description={t("approvals.notEnabledDescription")}
        />
      ) : (
        <>
          <ErrorBanner error={all.error} onRetry={() => all.refetch()} retrying={all.isFetching} />
          <Text variant="secondary">{t("approvals.description")}</Text>
          <div className="grid gap-3" data-testid="pending-approvals">
            <SectionHeading title={t("approvals.pending")} count={pending.length} />
            {all.isPending ? (
              <LayerCard className="grid gap-3 px-5 py-4" role="status">
                <span className="sr-only">{t("common.loading")}</span>
                <SkeletonLine minWidth={30} maxWidth={45} />
                <SkeletonLine minWidth={60} maxWidth={90} />
                <SkeletonLine minWidth={40} maxWidth={55} />
              </LayerCard>
            ) : pending.length === 0 ? (
              <Empty
                icon={<CheckCircle size={48} className="text-kumo-inactive" />}
                title={t("approvals.noPending")}
                description={t("approvals.noPendingDescription")}
              />
            ) : (
              <LayerCard className="p-0">
                <div className="divide-y divide-kumo-hairline">
                  {pending.map((r) => (
                    <PendingRequest
                      key={r.id}
                      request={r}
                      busy={busyFor(r)}
                      onDecide={(d) => onDecide(r, d)}
                    />
                  ))}
                </div>
              </LayerCard>
            )}
          </div>
          <div className="grid gap-3">
            <SectionHeading title={t("approvals.history")} />
            <HistoryTable rows={history} pending={all.isPending} meId={me.data?.actor.id} />
          </div>
        </>
      )}
      <ApproveRequestDialog
        siteId={siteId}
        request={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(undefined);
            decide.reset();
          }
        }}
        busy={decide.isPending}
        error={
          confirming && decide.error && !isNoLongerPending(decide.error)
            ? errorMessage(decide.error)
            : undefined
        }
        onConfirm={(request) => decide.mutate({ request, decision: "approve" })}
      />
    </div>
  );
}

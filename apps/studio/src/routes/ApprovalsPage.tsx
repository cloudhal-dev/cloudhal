import {
  Badge,
  Banner,
  Button,
  Collapsible,
  PageLayout,
  RefreshButton,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import {
  CheckCircle,
  ClockCountdown,
  ClockCounterClockwise,
  HandPalm,
  Info,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ModeBadge } from "../components/AgentModes.tsx";
import { ApproveElevationDialog } from "../components/ApproveElevationDialog.tsx";
import { ApproveRequestDialog } from "../components/ApproveRequestDialog.tsx";
import { ActorCell, ToolCell, useToolLabel } from "../components/Audit.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import {
  cannotTake,
  ElevationRequestCell,
  ElevationRequestDetails,
  UntilIfApprovedNow,
  useElevationRequestText,
} from "../components/ElevationRequest.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { useNow } from "../components/useNow.ts";
import { approvalsKey } from "../components/usePendingApprovals.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { autoCheckHeldBack, isManualModeRequest } from "../lib/agents.ts";
import { type Approval, api, isNotEnabled, type KeyMode } from "../lib/api.ts";
import {
  elevationRequestOf,
  expiresSoon,
  formatArguments,
  isNoLongerPending,
  needsConfirmation,
  requestOwnMode,
  STATUS_VARIANT,
  splitApprovals,
} from "../lib/approvals.ts";

type Decision = "approve" | "deny";
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The request's question as plain text. Manual-mode writes (ADR-0015) carry a terse policy reason
 * ("manual mode: update_entry needs a person's approval"); those read as a localised sentence.
 */
function usePromptText() {
  const t = useT();
  const label = useToolLabel();
  const elevationText = useElevationRequestText();
  return useCallback(
    (request: Approval, short = false) => {
      // Elevation requests (ADR-0016): the server's line is English; say it in the person's language.
      const elevation = elevationRequestOf(request);
      if (elevation) {
        const text = elevationText(request, elevation);
        if (short) return text.short;
        return elevation.reason ? `${text.sentence} “${elevation.reason}”` : text.sentence;
      }
      if (!isManualModeRequest(request) || needsConfirmation(request.tool)) return request.prompt;
      const tool = label(request.tool);
      return short
        ? t("approvals.manualPromptShort", { tool })
        : t("approvals.manualPrompt", { agent: request.actor.name ?? request.actor.id, tool });
    },
    [t, label, elevationText],
  );
}

/** One pending request: who asks for what, the server's question as plain text, and the decision. */
function PendingRequest({
  request,
  busy,
  onDecide,
  ownMode,
  now,
}: {
  request: Approval;
  busy: Decision | undefined;
  onDecide: (decision: Decision) => void;
  /** Elevation requests: the key's own mode, for "Edits → Auto". */
  ownMode: KeyMode | undefined;
  now: number;
}) {
  const t = useT();
  const promptText = usePromptText();
  const args = formatArguments(request.input);
  const soon = expiresSoon(request.expiresAt);
  const elevation = elevationRequestOf(request);
  const manual = isManualModeRequest(request) && !needsConfirmation(request.tool);
  const heldBack = autoCheckHeldBack(request);
  const prompt = promptText(request);
  return (
    <div className="grid gap-3 px-5 py-4" data-approval-id={request.id} data-tool={request.tool}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2">
          {elevation ? <ElevationRequestCell /> : <ToolCell tool={request.tool} />}
          {/* The actor's badge says it is an agent; aligned with the tool's label line. */}
          <ActorCell actor={request.actor} />
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
      {elevation ? (
        // An agent asks for more autonomy: never the server's English line, the reason as text.
        <ElevationRequestDetails request={request} elevation={elevation} ownMode={ownMode} />
      ) : manual ? (
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
        <div className="grid gap-1.5">
          <div className="flex items-start gap-2">
            {request.mode && (
              <span className="flex h-lh items-center">
                <ModeBadge mode={request.mode} subtle />
              </span>
            )}
            {/* Server-built text that can quote agent-written titles: rendered as plain text. */}
            <Text>{prompt}</Text>
          </div>
          {heldBack && (
            // Auto mode did not publish this on its own: say why, in the person's language.
            <Text variant="secondary" size="sm" data-auto-held-back={heldBack.code}>
              {t("approvals.autoHeldBack", {
                reason: t(`approvals.autoCheck.${heldBack.code}`, {
                  changes: heldBack.changes,
                  limit: heldBack.limit,
                }),
              })}
            </Text>
          )}
        </div>
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
        {elevation && !cannotTake(ownMode, elevation) && (
          <UntilIfApprovedNow minutes={elevation.minutes} now={now} />
        )}
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

function StatusBadgeFor({
  status,
  elevation = false,
}: {
  status: Approval["status"];
  /** An elevation request: "used" means the server granted it, so it reads "Granted". */
  elevation?: boolean;
}) {
  const t = useT();
  const granted = elevation && status === "consumed";
  return (
    <span data-status={status}>
      <Badge variant={granted ? "success" : STATUS_VARIANT[status]} appearance="dot">
        {granted ? t("approvals.elevation.granted") : t(`approvals.statuses.${status}`)}
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
    <SectionCard
      id="history"
      title={t("approvals.history")}
      icon={<ClockCounterClockwise size={16} />}
      flush
    >
      {!pending && rows.length === 0 ? (
        <SectionEmpty
          size="sm"
          icon={<HandPalm size={32} className="text-kumo-inactive" />}
          title={t("approvals.noHistory")}
          description={t("approvals.noHistoryDescription")}
        />
      ) : (
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
          ) : (
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.id} data-approval-id={r.id}>
                  <Table.Cell>
                    <div className="grid w-72 gap-1">
                      {elevationRequestOf(r) ? (
                        <span data-elevation-history>
                          <ElevationRequestCell />
                        </span>
                      ) : (
                        <ToolCell tool={r.tool} />
                      )}
                      <Tooltip content={promptText(r)} className="block min-w-0 text-left">
                        <Text variant="secondary" size="sm" truncate>
                          {promptText(r, true)}
                        </Text>
                      </Tooltip>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap">
                    <StatusBadgeFor
                      status={r.status}
                      elevation={elevationRequestOf(r) !== undefined}
                    />
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
      )}
    </SectionCard>
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
  const [granting, setGranting] = useState<Approval | undefined>();
  const now = useNow();
  // Elevation requests show the key's own mode; the owner's key list knows it best.
  const hasElevationRequests = (all.data ?? []).some(
    (a) => a.status === "pending" && elevationRequestOf(a) !== undefined,
  );
  const keys = useQuery({
    queryKey: ["agent-keys"],
    queryFn: api.agentKeys.list,
    enabled: hasElevationRequests,
    retry: false,
  });
  const ownModeOf = (request: Approval | undefined): KeyMode | undefined =>
    request ? requestOwnMode(request, keys.data) : undefined;
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
    // Granting an elevation always goes through its dialog (mode, time, Auto consent).
    if (decision === "approve" && elevationRequestOf(request)) setGranting(request);
    else if (decision === "approve" && needsConfirmation(request.tool)) setConfirming(request);
    else decide.mutate({ request, decision });
  };
  // A request decided elsewhere (or expired) while its grant dialog is open: close and say so.
  useEffect(() => {
    if (!granting || !all.data) return;
    if (all.data.some((a) => a.id === granting.id && a.status === "pending")) return;
    setGranting(undefined);
    toast.error(t("approvals.noLongerPending"), t("approvals.noLongerPendingDescription"));
  }, [all.data]);
  const busyFor = (request: Approval): Decision | undefined =>
    decide.isPending && decide.variables?.request.id === request.id
      ? decide.variables.decision
      : undefined;
  const notEnabled = isNotEnabled(all.error);
  const { pending, history } = splitApprovals(all.data ?? []);

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.approvals.title") }]} />}
      title={t("pageHeaders.approvals.title")}
      description={t("pageHeaders.approvals.description")}
      actions={
        notEnabled ? undefined : (
          <RefreshButton
            variant="secondary"
            aria-label={t("approvals.refresh")}
            loading={all.isRefetching}
            onClick={() => all.refetch()}
          />
        )
      }
    >
      {notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("approvals.notEnabledTitle")}
          description={t("approvals.notEnabledDescription")}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <ErrorBanner error={all.error} onRetry={() => all.refetch()} retrying={all.isFetching} />
          <div className="min-w-0" data-testid="pending-approvals">
            <SectionCard
              id="pending"
              title={t("approvals.pending")}
              icon={<HandPalm size={16} />}
              description={pending.length > 0 ? t("approvals.pendingDescription") : undefined}
              flush={!all.isPending}
            >
              {all.isPending ? (
                <div className="grid gap-3" role="status">
                  <span className="sr-only">{t("common.loading")}</span>
                  <SkeletonLine minWidth={30} maxWidth={45} />
                  <SkeletonLine minWidth={60} maxWidth={90} />
                  <SkeletonLine minWidth={40} maxWidth={55} />
                </div>
              ) : pending.length === 0 ? (
                <SectionEmpty
                  icon={<CheckCircle size={32} className="text-kumo-inactive" />}
                  title={t("approvals.noPending")}
                  description={t("approvals.noPendingDescription")}
                />
              ) : (
                <div className="divide-y divide-kumo-hairline">
                  {pending.map((r) => (
                    <PendingRequest
                      key={r.id}
                      request={r}
                      busy={busyFor(r)}
                      onDecide={(d) => onDecide(r, d)}
                      ownMode={ownModeOf(r)}
                      now={now}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
          <HistoryTable rows={history} pending={all.isPending} meId={me.data?.actor.id} />
        </div>
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
      <ApproveElevationDialog
        siteId={siteId}
        request={granting}
        ownMode={ownModeOf(granting)}
        onOpenChange={(open) => !open && setGranting(undefined)}
      />
    </PageLayout>
  );
}

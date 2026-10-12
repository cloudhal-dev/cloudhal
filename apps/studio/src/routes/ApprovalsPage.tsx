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
  Hourglass,
  Info,
  LockSimple,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ModeBadge } from "../components/AgentModes.tsx";
import { ApproveElevationDialog } from "../components/ApproveElevationDialog.tsx";
import { ApproveRequestDialog } from "../components/ApproveRequestDialog.tsx";
import { ActorCell, ToolCell, useToolLabel } from "../components/Audit.tsx";
import { ApproveCommentsDialog, CommentRequestDetails } from "../components/CommentApprovals.tsx";
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
import { useMe, useMemberRoles, useRoleRules, useSelf } from "../components/useMe.ts";
import { useNow } from "../components/useNow.ts";
import { approvalsKey } from "../components/usePendingApprovals.ts";
import { type TFunction, useI18n, useT } from "../i18n/index.tsx";
import { autoCheckHeldBack, isManualModeRequest } from "../lib/agents.ts";
import {
  type Approval,
  api,
  errorCode,
  errorDetail,
  isNotEnabled,
  type KeyMode,
  type Role,
} from "../lib/api.ts";
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
import { commentRequestOf, commentsKey } from "../lib/comments.ts";

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
      // A person's own request (cause `role`): the server's line is English; say who asks.
      if (request.cause === "role")
        return t("approvals.role.prompt", { name: request.actor.name ?? request.actor.id });
      if (!isManualModeRequest(request) || needsConfirmation(request.tool)) return request.prompt;
      const tool = label(request.tool);
      return short
        ? t("approvals.manualPromptShort", { tool })
        : t("approvals.manualPrompt", { agent: request.actor.name ?? request.actor.id, tool });
    },
    [t, label, elevationText],
  );
}

/** Whose request it is, from the signed-in person's side (RFC-0005 §6). */
interface Requester {
  /** The person filed it themselves (cause `role`): they may withdraw it, never approve it. */
  mine: boolean;
  /** One of the person's own keys' agents filed it: they may always deny it. */
  myAgent: boolean;
}

/**
 * Why the person cannot approve a request the server marked `canDecide: false`, in their language.
 * The list carries only the boolean; the 403 `cannot_decide` codes (`details.code`) name the same
 * cases, and `cannotDecideMessage` maps those.
 */
function useDecideReason() {
  const t = useT();
  const rules = useRoleRules();
  const me = useMe().data;
  return (request: Approval, who: Requester): string => {
    if (who.mine) return t("approvals.decide.own_request");
    if (request.tool === "request_elevation") {
      if (!who.myAgent) return t("approvals.decide.not_key_creator");
      const cap = me?.role ? rules.modeCaps[me.role] : undefined;
      return t("approvals.decide.mode_above_role", {
        mode: cap ? t(`agents.modes.names.${cap}`) : "",
      });
    }
    if (request.tool === "publish") return t("approvals.decide.not_own");
    return t("approvals.decide.missing_scope");
  };
}

/** A 403 `cannot_decide` in the person's language (`details.code`). */
function cannotDecideMessage(t: TFunction, error: unknown): string | undefined {
  if (errorCode(error) !== "cannot_decide") return undefined;
  const code = errorDetail(error, "code");
  const known = ["own_request", "not_key_creator", "mode_above_role", "missing_scope", "not_own"];
  return code && known.includes(code)
    ? t(`approvals.decide.${code as "own_request"}`, { mode: "" })
    : t("approvals.decide.missing_scope");
}

/** A person's own publish request (cause `role`): what the server's English reason means. */
function useRoleRequestText() {
  const t = useT();
  return (request: Approval) => {
    // The list may not carry `reason`; the server's prompt ends with it ("… (requested by X: <reason>)").
    const reason = request.reason ?? request.prompt;
    const foreign = /(\d+) published article/.exec(reason)?.[1];
    return foreign
      ? t("approvals.role.foreign", { count: Number(foreign) })
      : /pages|settings|taxonom|terms|redirects/.test(reason)
        ? t("approvals.role.structure")
        : t("approvals.role.generic");
  };
}

/** One pending request: who asks for what, the server's question as plain text, and the decision. */
function PendingRequest({
  request,
  busy,
  onDecide,
  ownMode,
  now,
  who,
  role,
}: {
  request: Approval;
  busy: Decision | undefined;
  onDecide: (decision: Decision) => void;
  /** Elevation requests: the key's own mode, for "Edits → Auto". */
  ownMode: KeyMode | undefined;
  now: number;
  who: Requester;
  /** The requester's staff role, when a person asked. */
  role: Role | undefined;
}) {
  const t = useT();
  const promptText = usePromptText();
  const decideReason = useDecideReason();
  const roleText = useRoleRequestText();
  const args = formatArguments(request.input);
  const soon = expiresSoon(request.expiresAt);
  const elevation = elevationRequestOf(request);
  const manual = isManualModeRequest(request) && !needsConfirmation(request.tool);
  const heldBack = autoCheckHeldBack(request);
  const prompt = promptText(request);
  const byRole = request.cause === "role";
  // Agents' comment requests (RFC-0007 §10.3): in words, the drafted reply quoted as plain text.
  const comment = commentRequestOf(request) !== undefined;
  // Older servers omit `canDecide`: everyone could decide there.
  const blocked = request.canDecide === false;
  const reason = blocked ? decideReason(request, who) : undefined;
  // The requester withdraws; the key's creator may always deny their own agent's request.
  const mayDeny = !blocked || who.mine || who.myAgent;
  return (
    <div
      className="grid gap-3 px-5 py-4"
      data-approval-id={request.id}
      data-tool={request.tool}
      data-can-decide={blocked ? "false" : "true"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2">
          {elevation ? <ElevationRequestCell /> : <ToolCell tool={request.tool} />}
          {/* The actor's badge says it is an agent; aligned with the tool's label line. */}
          <ActorCell actor={request.actor} role={role} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            icon={<X />}
            loading={busy === "deny"}
            disabled={busy !== undefined || !mayDeny}
            title={mayDeny ? undefined : reason}
            onClick={() => onDecide("deny")}
          >
            {who.mine ? t("approvals.withdraw") : t("approvals.deny")}
          </Button>
          {!who.mine && (
            <Button
              variant="primary"
              icon={<CheckCircle />}
              loading={busy === "approve"}
              disabled={busy !== undefined || blocked}
              title={reason}
              onClick={() => onDecide("approve")}
            >
              {t("approvals.approve")}
            </Button>
          )}
        </div>
      </div>
      {comment ? (
        <CommentRequestDetails request={request} />
      ) : byRole ? (
        // A person asked for more than their role does alone (RFC-0005 §6): say it in words.
        <div className="grid gap-1.5" data-role-request="true">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" icon={<Hourglass />}>
              {t("approvals.role.waiting")}
            </Badge>
            {who.mine && (
              <Text variant="secondary" size="sm" as="span">
                {t("approvals.role.yours")}
              </Text>
            )}
          </div>
          <Text>
            {t("approvals.role.prompt", { name: request.actor.name ?? request.actor.id })}
          </Text>
          <Text variant="secondary" size="sm">
            {roleText(request)}
          </Text>
        </div>
      ) : elevation ? (
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
        {blocked && !who.mine && (
          <span className="flex items-center gap-1.5" data-decide-reason>
            <LockSimple size={14} className="text-kumo-subtle" aria-hidden />
            <Text variant="secondary" size="sm" as="span">
              {reason}
            </Text>
          </span>
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
  roles,
}: {
  rows: Approval[];
  pending: boolean;
  /** The signed-in person's actor id, to say "by you". */
  meId: string | undefined;
  /** People's roles by actor id, for the badge next to a person's name. */
  roles?: Map<string, Role> | undefined;
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
                    <ActorCell actor={r.actor} role={roles?.get(r.actor.id)} />
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
  const { t } = useI18n("comments");
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const qc = useQueryClient();
  const toast = useToast();
  const all = useQuery({
    queryKey: [...approvalsKey(siteId), "all"],
    queryFn: () => api.approvals.list(siteId),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const self = useSelf();
  const roles = useMemberRoles();
  const whoFor = (request: Approval): Requester => ({
    mine: request.actor.kind === "human" && request.actor.id === me.data?.actor.id,
    myAgent: request.actor.kind === "agent" && self.agentIds.has(request.actor.id),
  });
  const [confirming, setConfirming] = useState<Approval | undefined>();
  const [granting, setGranting] = useState<Approval | undefined>();
  const [commenting, setCommenting] = useState<Approval | undefined>();
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
    onSuccess: async (result, { request, decision }) => {
      setConfirming(undefined);
      setCommenting(undefined);
      const agent = request.actor.name ?? request.actor.id;
      const commentRequest = commentRequestOf(request);
      if (decision === "approve" && commentRequest) {
        // Approving a comment request carried the call out, as this person (RFC-0007 §10.3).
        const results = (result.result as { results?: { ok: boolean }[] } | undefined)?.results;
        const done = results?.filter((r) => r.ok).length;
        toast.success(
          commentRequest.kind === "reply"
            ? t("comments.approvals.carriedReply")
            : commentRequest.kind === "thread"
              ? t("comments.approvals.carriedThread")
              : t("comments.approvals.carried"),
          results && done !== results.length
            ? t("comments.approvals.carriedDescription", { done: done ?? 0, total: results.length })
            : undefined,
        );
        await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
      } else if (decision === "approve" && result.published)
        // A person's publish request runs on approval, with the approver's rights (RFC-0005 §6).
        toast.success(
          t("approvals.role.published"),
          t("approvals.role.publishedDescription", { name: agent }),
        );
      else if (decision === "approve")
        toast.success(t("approvals.approved"), t("approvals.approvedDescription", { agent }));
      else if (whoFor(request).mine) toast.success(t("approvals.withdrawn"));
      else toast.success(t("approvals.denied"), t("approvals.deniedDescription", { agent }));
      // The bell lists pending elevation requests too (§2n).
      await Promise.all([
        qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        ...(result.published
          ? [
              qc.invalidateQueries({ queryKey: ["site", siteId] }),
              qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
            ]
          : []),
      ]);
    },
    onError: async (error, { request }) => {
      const refusal = cannotDecideMessage(t, error);
      if (commentRequestOf(request) && errorCode(error) === "state_changed") {
        // The comments moved after the agent asked: the server closed the request, nothing changed.
        setCommenting(undefined);
        toast.error(
          t("comments.approvals.stateChanged"),
          t("comments.approvals.stateChangedDescription"),
        );
        await Promise.all([
          qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
          qc.invalidateQueries({ queryKey: commentsKey(siteId) }),
        ]);
      } else if (errorCode(error) === "carry_out_failed") {
        setCommenting(undefined);
        toast.error(t("comments.approvals.carryFailed"), errorMessage(error));
        await Promise.all([
          qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
          qc.invalidateQueries({ queryKey: commentsKey(siteId) }),
        ]);
      } else if (errorCode(error) === "state_changed") {
        // The site moved on after a person's publish request: the server closed it.
        setConfirming(undefined);
        toast.error(t("approvals.role.stateChanged"), t("approvals.role.stateChangedDescription"));
        await qc.invalidateQueries({ queryKey: approvalsKey(siteId) });
      } else if (refusal) {
        setConfirming(undefined);
        toast.error(t("approvals.failed"), refusal);
        await qc.invalidateQueries({ queryKey: approvalsKey(siteId) });
      } else if (isNoLongerPending(error)) {
        setConfirming(undefined);
        toast.error(t("approvals.noLongerPending"), t("approvals.noLongerPendingDescription"));
        await Promise.all([
          qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
          qc.invalidateQueries({ queryKey: ["notifications"] }),
        ]);
      } else if (!confirming && !commenting) {
        toast.error(t("approvals.failed"), errorMessage(error));
      }
    },
  });
  const onDecide = (request: Approval, decision: Decision) => {
    decide.reset();
    // Granting an elevation always goes through its dialog (mode, time, Auto consent); comment
    // requests show the comments themselves before they become public (RFC-0007 §14).
    if (decision === "approve" && elevationRequestOf(request)) setGranting(request);
    else if (decision === "approve" && commentRequestOf(request)) setCommenting(request);
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
                      who={whoFor(r)}
                      role={roles.get(r.actor.id)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
          <HistoryTable
            rows={history}
            pending={all.isPending}
            meId={me.data?.actor.id}
            roles={roles}
          />
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
      <ApproveCommentsDialog
        siteId={siteId}
        request={commenting}
        onOpenChange={(open) => {
          if (!open) {
            setCommenting(undefined);
            decide.reset();
          }
        }}
        busy={decide.isPending}
        error={
          commenting && decide.error && !isNoLongerPending(decide.error)
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

import {
  ApprovalDialog,
  Badge,
  Banner,
  Button,
  DateTimeField,
  type DateTimeValue,
  InlineCopyText,
  Input,
  LayerCard,
  LinkButton,
  PageLayout,
  ScheduleStatusBadge,
  SectionCard,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ArrowRight,
  CalendarCheck,
  CalendarDots,
  CheckCircle,
  ClockCountdown,
  HandPalm,
  Package,
  RocketLaunch,
  Warning,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DangerZoneCard, DetailsCard, EditorLayout } from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { ReleaseDiffDialog, ReleaseItems } from "../components/ReleaseParts.tsx";
import {
  itemsLabel,
  problemText,
  ReductionBadge,
  reductionMode,
  scheduleKeys,
  useMoveDialog,
  useReleaseAbilities,
  useReleaseMutations,
  useScheduleWords,
  useSiteZone,
} from "../components/Schedules.tsx";
import { useToast } from "../components/Toast.ts";
import { isNotEnabled, type ReleaseItemView, type ReleaseView } from "../lib/api.ts";
import {
  formatWhen,
  localDateTime,
  MIN_LEAD_MINUTES,
  mayTake,
  releaseActions,
  wallClockOf,
  whenProblem,
} from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One release (RFC-0008 §15.1, §6, §10.4; DESIGN.md §2x), the editor template without a preview:
 * its pinned items with Compare, its approval (who, when, for which time; "single use, for these
 * versions"), after a conflict the three-way view with "Re-pin and approve", and the actions its
 * state and the person's role allow — schedule, move, publish now, unschedule, cancel.
 */
export function ReleasePage() {
  const { t, locale, words, field, duration } = useScheduleWords();
  const { siteId, releaseId } = useParams({ from: "/sites/$siteId/schedules/releases/$releaseId" });
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const release = useQuery({
    queryKey: scheduleKeys.release(siteId, releaseId),
    queryFn: () => schedulesApi.releases.get(siteId, releaseId),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const r = release.data;
  const abilities = useReleaseAbilities(r);
  const mutations = useReleaseMutations(siteId);
  const move = useMoveDialog(siteId);
  const [compare, setCompare] = useState<ReleaseItemView | undefined>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [value, setValue] = useState<DateTimeValue>({});
  const [title, setTitle] = useState("");
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (!r) return;
    setTitle(r.title ?? "");
    const at = r.when?.kind === "at" ? r.when.at : undefined;
    setValue(at ? wallClockOf(at, zone.timeZone) : {});
  }, [r, zone.timeZone]);

  const schedule = useMutation({
    mutationFn: (input: { release: ReleaseView; onApproval: boolean }) =>
      schedulesApi.releases.schedule(
        siteId,
        input.release.id,
        input.release.rev,
        input.onApproval
          ? "on-approval"
          : {
              localTime: localDateTime({ date: value.date ?? "", time: value.time ?? "" }),
              timeZone: zone.timeZone,
            },
      ),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
      const waiting =
        result.status === "approval-pending" || result.release.state === "awaiting_approval";
      const at = result.release.when?.kind === "at" ? result.release.when.at : undefined;
      toast.success(
        waiting
          ? t("schedules.release.done.requested")
          : t("schedules.release.done.scheduled", {
              time: at ? formatWhen(at, locale, zone.timeZone) : "",
            }),
      );
    },
  });
  const retitle = useMutation({
    mutationFn: (input: { release: ReleaseView; title: string }) =>
      schedulesApi.releases.retitle(
        siteId,
        input.release.id,
        input.release.rev,
        input.title.trim() || null,
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
      toast.success(t("schedules.release.done.retitled"));
    },
    onError: (e) => toast.error(t("schedules.actions.failed"), message(e)),
  });

  const rel = "schedules.release" as const;
  const schedulesCrumb = { label: t("schedules.title"), href: `/sites/${siteId}/schedules` };
  if (!r) {
    return (
      <PageLayout
        crumbs={<SiteCrumbs siteId={siteId} trail={[schedulesCrumb, { label: undefined }]} />}
        title={undefined}
        loading={release.isPending}
      >
        {isNotEnabled(release.error) ? (
          <Banner
            variant="secondary"
            icon={<WarningCircle weight="fill" />}
            title={t(`${rel}.notFound`)}
          />
        ) : (
          <ErrorBanner error={release.error} onRetry={() => void release.refetch()} />
        )}
        <LayerCard className="grid gap-3 px-5 py-4">
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={70} maxWidth={90} />
          <SkeletonLine minWidth={50} maxWidth={70} />
        </LayerCard>
      </PageLayout>
    );
  }

  const name = r.title ?? itemsLabel(t, r.items.length);
  const at = r.when?.kind === "at" ? r.when.at : undefined;
  const actions = releaseActions(r.state).filter((a) => mayTake(a, abilities));
  const outcome = r.outcome;
  const when =
    outcome?.kind === "published"
      ? t(`${rel}.published`, { time: formatWhen(outcome.at, locale, zone.timeZone, "long") })
      : r.when?.kind === "on-approval"
        ? t(`${rel}.onApproval`)
        : at
          ? t(`${rel}.publishes`, {
              time: formatWhen(at, locale, zone.timeZone, "long"),
              zone: zone.zoneLabel,
            })
          : t(`${rel}.noTime`);
  const problem = whenProblem(value, zone.timeZone, { leadMinutes: MIN_LEAD_MINUTES });
  const fieldError =
    problem && (attempted || problem.code !== "incomplete")
      ? problemText(t, locale, problem, { value, timeZone: zone.timeZone })
      : undefined;
  const busy =
    schedule.isPending ||
    mutations.unschedule.isPending ||
    mutations.cancel.isPending ||
    mutations.publishNow.isPending ||
    mutations.repin.isPending;
  const approval = r.approval;
  const reduction = reductionMode(r);
  const request = r.view.request;

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[schedulesCrumb, { label: name }]} copy={r.id} />}
      icon={<Package size={24} />}
      title={name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <ScheduleStatusBadge status={{ subject: "release", state: r.state }} words={words} />
          <Text variant="secondary" as="span">
            {when}
          </Text>
        </span>
      }
      actions={
        <>
          {actions.includes("reschedule") && at && (
            <Button
              variant="secondary"
              icon={<CalendarDots />}
              onClick={() => move.start({ releaseId: r.id, title: name, at })}
              disabled={busy}
            >
              {t(`${rel}.when.move`)}
            </Button>
          )}
          {actions.includes("publishNow") && (
            <Button
              variant={r.state === "scheduled" ? "secondary" : "primary"}
              icon={<RocketLaunch />}
              onClick={() => setPublishOpen(true)}
              disabled={busy}
            >
              {t(`${rel}.when.publishNow`)}
            </Button>
          )}
        </>
      }
    >
      <ErrorBanner error={schedule.error ?? release.error} />
      {outcome?.kind === "published" && (
        <Banner
          icon={<CheckCircle weight="fill" />}
          title={t(`${rel}.outcome.published`, {
            time: formatWhen(outcome.at, locale, zone.timeZone),
          })}
          description={
            outcome.latenessSeconds < 60
              ? t(`${rel}.outcome.onTime`)
              : t(`${rel}.outcome.lateness`, { duration: duration(outcome.latenessSeconds) })
          }
          action={
            <LinkButton
              href={`/sites/${siteId}/snapshots?diff=${outcome.snapshotId}`}
              variant="secondary"
              size="sm"
              icon={ArrowRight}
            >
              {t(`${rel}.outcome.snapshot`)}
            </LinkButton>
          }
        />
      )}
      {outcome?.kind === "missed" && (
        <Banner
          variant="error"
          icon={<ClockCountdown weight="fill" />}
          title={words.status.release.missed}
          description={t(`${rel}.outcome.missed`, { duration: duration(outcome.latenessSeconds) })}
        />
      )}
      {outcome?.kind === "expired" && (
        <Banner
          variant="secondary"
          icon={<ClockCountdown weight="fill" />}
          title={t(`${rel}.outcome.expiredTitle`)}
          description={t(`${rel}.outcome.expired.${outcome.reason}`)}
        />
      )}
      {outcome?.kind === "failed" && (
        <Banner
          variant="error"
          icon={<WarningCircle weight="fill" />}
          title={t(`${rel}.outcome.failedTitle`)}
          description={t(`${rel}.outcome.failed.${outcome.code}`)}
        />
      )}
      {outcome?.kind === "canceled" && (
        <Banner
          variant="secondary"
          icon={<XCircle weight="fill" />}
          title={t(`${rel}.outcome.canceledTitle`)}
          description={t(`${rel}.outcome.canceled`, { name: outcome.by.name ?? outcome.by.id })}
        />
      )}
      <EditorLayout
        main={
          <div className="grid min-w-0 content-start gap-6">
            {r.state === "conflict" && (
              <SectionCard
                title={t(`${rel}.conflict.title`)}
                icon={<Warning size={16} />}
                description={t(`${rel}.conflict.description`)}
                footer={
                  <>
                    <Button
                      variant="secondary-destructive"
                      onClick={() => setCancelOpen(true)}
                      disabled={busy || !abilities.write}
                    >
                      {t(`${rel}.danger.cancel.action`)}
                    </Button>
                    <Button
                      variant="primary"
                      icon={<ArrowClockwise />}
                      loading={mutations.repin.isPending}
                      disabled={busy || !abilities.write}
                      onClick={() =>
                        mutations.repin.mutate({ id: r.id, rev: r.rev, approve: abilities.approve })
                      }
                      data-testid="repin"
                    >
                      {abilities.approve
                        ? t(`${rel}.conflict.repin`)
                        : t(`${rel}.conflict.repinOnly`)}
                    </Button>
                  </>
                }
              >
                <Text variant="secondary" size="sm">
                  {t(`${rel}.approval.singleUse`)}
                </Text>
              </SectionCard>
            )}
            <SectionCard
              title={t(`${rel}.items.title`)}
              icon={<Package size={16} />}
              description={t(`${rel}.items.description`)}
              actions={<Badge variant="secondary">{r.view.items.length}</Badge>}
              flush
            >
              <ReleaseItems siteId={siteId} release={r} onCompare={setCompare} />
            </SectionCard>
            <SectionCard title={t(`${rel}.approval.title`)} icon={<HandPalm size={16} />}>
              <div className="grid gap-2" data-approval-state={r.approvalState}>
                <span className="flex flex-wrap items-center gap-2">
                  {r.approvalState === "pending" ? (
                    <ScheduleStatusBadge
                      status={{ subject: "approval", state: "waiting" }}
                      words={words}
                    />
                  ) : reduction ? (
                    <ReductionBadge mode={reduction} />
                  ) : approval?.kind === "auto" ? (
                    <ScheduleStatusBadge
                      status={{ subject: "approval", state: "auto" }}
                      words={words}
                    />
                  ) : approval ? (
                    <ScheduleStatusBadge
                      status={{ subject: "approval", state: "approved" }}
                      words={words}
                    />
                  ) : (
                    <Text variant="secondary" as="span">
                      {t(`${rel}.approval.none`)}
                    </Text>
                  )}
                </span>
                {approval?.kind === "person" && (
                  <Text>
                    {t(`${rel}.approval.byPerson`, { name: approval.by.name ?? approval.by.id })}{" "}
                    {t(`${rel}.approval.at`, {
                      time: formatWhen(approval.at, locale, zone.timeZone),
                    })}
                  </Text>
                )}
                {approval?.kind === "auto" && !reduction && (
                  <Text>
                    {t(`${rel}.approval.auto`, {
                      name: approval.by.name ?? approval.by.id,
                      time: formatWhen(approval.windowEnds, locale, zone.timeZone),
                    })}
                  </Text>
                )}
                {request && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Text variant="secondary" size="sm" as="span">
                      {t(`${rel}.approval.requestedBy`, {
                        name: request.actor.name ?? request.actor.id,
                      })}
                    </Text>
                    <RelativeTime iso={request.createdAt} />
                  </span>
                )}
                {r.approvalState === "pending" && (
                  <Text variant="secondary" size="sm">
                    {t(`${rel}.approval.expires`)}
                  </Text>
                )}
                <Text variant="secondary" size="sm">
                  {t(`${rel}.approval.singleUse`)}
                </Text>
                {r.approvalState === "pending" && (
                  <div>
                    <LinkButton
                      href={`/sites/${siteId}/approvals`}
                      variant="secondary"
                      size="sm"
                      icon={ArrowRight}
                    >
                      {t(`${rel}.approval.review`)}
                    </LinkButton>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <>
            <SectionCard title={t(`${rel}.when.title`)} icon={<CalendarCheck size={16} />}>
              {actions.includes("schedule") ? (
                <>
                  <DateTimeField
                    label={t(`${rel}.when.field`)}
                    value={value}
                    onChange={setValue}
                    locale={locale}
                    timeZone={zone.timeZone}
                    zoneLabel={zone.zoneLabel}
                    hourCycle={zone.hourCycle}
                    labels={field}
                    error={fieldError}
                    min={zone.today}
                    today={zone.today}
                    className="w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      icon={<CalendarCheck />}
                      loading={schedule.isPending && !schedule.variables?.onApproval}
                      disabled={busy}
                      onClick={() => {
                        setAttempted(true);
                        if (problem && problem.code !== "gap") return;
                        schedule.mutate({ release: r, onApproval: false });
                      }}
                      data-testid="schedule-release"
                    >
                      {abilities.approve ? t(`${rel}.when.schedule`) : t(`${rel}.when.request`)}
                    </Button>
                    <Button
                      variant="secondary"
                      loading={schedule.isPending && schedule.variables?.onApproval}
                      disabled={busy}
                      onClick={() => schedule.mutate({ release: r, onApproval: true })}
                    >
                      {t(`${rel}.when.onApproval`)}
                    </Button>
                  </div>
                </>
              ) : (
                <Text>{when}</Text>
              )}
            </SectionCard>
            <SectionCard
              title={t(`${rel}.rename.label`)}
              footer={
                <Button
                  variant="primary"
                  loading={retitle.isPending}
                  disabled={!abilities.write || title.trim() === (r.title ?? "")}
                  onClick={() => retitle.mutate({ release: r, title })}
                >
                  {t(`${rel}.rename.save`)}
                </Button>
              }
            >
              <Input
                className="w-full"
                aria-label={t(`${rel}.rename.label`)}
                value={title}
                placeholder={itemsLabel(t, r.items.length)}
                maxLength={200}
                disabled={!abilities.write}
                onValueChange={setTitle}
              />
            </SectionCard>
            <DetailsCard
              rows={[
                { label: t(`${rel}.details.id`), value: <InlineCopyText>{r.id}</InlineCopyText> },
                {
                  label: t(`${rel}.details.createdBy`),
                  value: (
                    <Text as="span" truncate>
                      {r.createdBy.name ?? r.createdBy.id}
                    </Text>
                  ),
                },
                {
                  label: t(`${rel}.details.created`),
                  value: <RelativeTime iso={r.createdAt} size="base" />,
                },
                {
                  label: t(`${rel}.details.updated`),
                  value: <RelativeTime iso={r.updatedAt} size="base" />,
                },
                { label: t(`${rel}.details.revision`), value: <Text as="span">{r.rev}</Text> },
              ]}
            />
            {(actions.includes("unschedule") || actions.includes("cancel")) && (
              <DangerZoneCard
                items={[
                  ...(actions.includes("unschedule")
                    ? [
                        {
                          title: t(`${rel}.danger.unschedule.title`),
                          description: t(`${rel}.danger.unschedule.description`),
                          actionLabel: t(`${rel}.danger.unschedule.action`),
                          variant: "secondary" as const,
                          icon: <CalendarDots />,
                          onAction: () => mutations.unschedule.mutate(r),
                        },
                      ]
                    : []),
                  ...(actions.includes("cancel")
                    ? [
                        {
                          title: t(`${rel}.danger.cancel.title`),
                          description: t(`${rel}.danger.cancel.description`),
                          actionLabel: t(`${rel}.danger.cancel.action`),
                          icon: <XCircle />,
                          onAction: () => setCancelOpen(true),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </>
        }
      />
      {move.element}
      <ReleaseDiffDialog
        siteId={siteId}
        releaseId={r.id}
        item={compare}
        onOpenChange={(open) => {
          if (!open) setCompare(undefined);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t(`${rel}.danger.cancel.confirmTitle`)}
        description={t(`${rel}.danger.cancel.confirmDescription`)}
        confirmLabel={t(`${rel}.danger.cancel.action`)}
        busy={mutations.cancel.isPending}
        error={mutations.cancel.error ? message(mutations.cancel.error) : undefined}
        onConfirm={() => mutations.cancel.mutate(r, { onSuccess: () => setCancelOpen(false) })}
      />
      <ApprovalDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t(`${rel}.publishNow.title`)}
        description={t(`${rel}.publishNow.description`)}
        confirmLabel={t(`${rel}.publishNow.confirm`)}
        cancelLabel={t("schedules.move.cancel")}
        busy={mutations.publishNow.isPending}
        onConfirm={async () => {
          await mutations.publishNow.mutateAsync(r).catch(() => undefined);
          setPublishOpen(false);
        }}
      />
    </PageLayout>
  );
}

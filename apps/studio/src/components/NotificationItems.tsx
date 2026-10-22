import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenu,
  directional,
  LinkButton,
  NotificationItem,
  SkeletonLine,
  Text,
  TransitionArrow,
} from "@cloudhal/ui";
import {
  ArrowRight,
  CalendarDots,
  CaretDown,
  ChatsCircle,
  ClockClockwise,
  ClockCountdown,
  Flag,
  PauseCircle,
  Robot,
  ShieldStar,
  Stop,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Suspense, use } from "react";
import { useI18n } from "../i18n/index.tsx";
import {
  api,
  type CommentNotification,
  type ElevationEndingNotification,
  type ElevationRequestNotification,
  type MemberJoinedNotification,
  type RoleChangedNotification,
  type ScheduleNotification,
  type StudioNotification,
} from "../lib/api.ts";
import { formatUntil } from "../lib/elevation.ts";
import {
  commentNotice,
  DEFAULT_EXTEND_MINUTES,
  EXTEND_PRESETS,
  type ExtendTarget,
  endingParams,
  extendTargetOf,
  isCommentNotification,
  isScheduleNotification,
  notificationHref,
  requestParams,
} from "../lib/notifications.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { useEndElevation, useExtendElevation } from "./Elevation.tsx";
import { AgentReason, useShortDuration } from "./ElevationRequest.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { RoleBadge } from "./Roles.tsx";
import { useToast } from "./Toast.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";

/*
 * The bell panel's items (DESIGN.md §2n). They load with the first opening of a bell that has
 * something in it (`NotificationsBell.tsx`), never with the shell: their mode, role and comment
 * badges and the extend / end controls are only needed then.
 */

/**
 * "Extend 1 hour" with a ▾ for the other presets (30 min, 1 hour, 4 hours), each showing when the
 * elevation would then end. An extension counts from now and keeps the mode in force.
 */
function ExtendButton({
  target,
  now,
  pending,
  disabled,
  onExtend,
}: {
  target: ExtendTarget;
  now: number;
  pending: boolean;
  disabled: boolean;
  onExtend: (minutes: number) => void;
}) {
  const { t, locale } = useI18n();
  const { elevation } = useAgentModeRules();
  const presets = EXTEND_PRESETS.filter(
    (m) => m >= elevation.minMinutes && m <= elevation.maxMinutes,
  );
  const label = (m: number) => t(`notifications.extend.presets.${m as 30 | 60 | 240}`);
  return (
    <ButtonGroup aria-label={t("notifications.extend.group")}>
      <Button
        variant="secondary"
        size="sm"
        icon={<ClockClockwise />}
        loading={pending}
        disabled={disabled}
        onClick={() => onExtend(DEFAULT_EXTEND_MINUTES)}
        data-extend={target.keyId}
      >
        {t("notifications.extend.button", { duration: label(DEFAULT_EXTEND_MINUTES) })}
      </Button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="secondary"
              size="sm"
              shape="square"
              icon={<CaretDown />}
              disabled={pending || disabled}
              aria-label={t("notifications.extend.more")}
            />
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.Group>
            <DropdownMenu.Label>{t("notifications.extend.fromNow")}</DropdownMenu.Label>
            {presets.map((m) => (
              <DropdownMenu.Item key={m} onClick={() => onExtend(m)} data-extend-preset={m}>
                {t("notifications.extend.presetUntil", {
                  duration: label(m),
                  time: formatUntil(new Date(now + m * 60_000).toISOString(), locale, { now }),
                })}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu>
    </ButtonGroup>
  );
}

/** "Elevation ending soon": the mode with its timer, the sentence, Extend / End now / Agents. */
function EndingItem({
  item,
  now,
  onNavigate,
}: {
  item: ElevationEndingNotification;
  now: number;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  const extend = useExtendElevation();
  const end = useEndElevation();
  const target = extendTargetOf(item);
  const p = endingParams(t, locale, item, now);
  return (
    <NotificationItem
      icon={<ClockCountdown size={16} />}
      tone="warning"
      title={t("notifications.ending.title")}
      actions={
        <>
          {target && (
            <ExtendButton
              target={target}
              now={now}
              pending={extend.isPending}
              disabled={end.isPending}
              onExtend={(minutes) => extend.mutate({ targets: [target], minutes })}
            />
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<Stop />}
            loading={end.isPending}
            disabled={extend.isPending}
            onClick={() => end.mutate([{ id: item.keyId }])}
            data-end={item.keyId}
          >
            {t("agents.elevation.endNow")}
          </Button>
          <LinkButton
            href={notificationHref(item)}
            variant="ghost"
            size="sm"
            icon={directional(ArrowRight)}
            onClick={onNavigate}
          >
            {t("notifications.openAgents")}
          </LinkButton>
        </>
      }
    >
      <div className="grid gap-1.5" data-notification={item.id}>
        <div className="flex flex-wrap items-center gap-1.5">
          <ModeBadge mode={item.mode} />
          <Badge variant="warning" icon={<ClockCountdown />}>
            {t("agents.elevation.left", { time: p.left })}
          </Badge>
        </div>
        <Text>{t("notifications.ending.sentence", p)}</Text>
      </div>
    </NotificationItem>
  );
}

/** "Planner asks for Edits · 30 min", the agent's reason quoted as plain text, Review. */
function RequestItem({
  item,
  onNavigate,
}: {
  item: ElevationRequestNotification;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const shortDuration = useShortDuration();
  return (
    <NotificationItem
      icon={<Robot size={16} />}
      tone="info"
      title={t("notifications.request.title", requestParams(t, item, shortDuration))}
      meta={<RelativeTime iso={item.createdAt} size="xs" />}
      actions={
        <LinkButton
          href={notificationHref(item)}
          variant="secondary"
          size="sm"
          icon={directional(ArrowRight)}
          onClick={onNavigate}
        >
          {t("notifications.request.review")}
        </LinkButton>
      }
    >
      <div className="grid" data-notification={item.id}>
        <AgentReason reason={item.reason || undefined} testId="notification-reason" />
      </div>
    </NotificationItem>
  );
}

/** "Ada joined as Editor" — someone the person invited accepted (RFC-0005 §7). */
function MemberJoinedItem({
  item,
  onNavigate,
}: {
  item: MemberJoinedNotification;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  return (
    <NotificationItem
      icon={<UserPlus size={16} />}
      tone="success"
      title={t("notifications.memberJoined.title", { name: item.name ?? t("members.someone") })}
      meta={<RelativeTime iso={item.at} size="xs" />}
      actions={
        <LinkButton
          href={notificationHref(item)}
          variant="ghost"
          size="sm"
          icon={directional(ArrowRight)}
          onClick={onNavigate}
        >
          {t("notifications.openTeam")}
        </LinkButton>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5" data-notification={item.id}>
        <RoleBadge value={item.role} />
        <Text variant="secondary" size="sm" as="span">
          {t("notifications.memberJoined.body")}
        </Text>
      </div>
    </NotificationItem>
  );
}

/** "Your role is now Author" — someone changed the person's role (RFC-0005 open question 4). */
function RoleChangedItem({
  item,
  onNavigate,
}: {
  item: RoleChangedNotification;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  return (
    <NotificationItem
      icon={<ShieldStar size={16} />}
      tone="info"
      title={t("notifications.roleChanged.title", { role: t(`roles.names.${item.to}`) })}
      meta={<RelativeTime iso={item.at} size="xs" />}
      actions={
        <LinkButton
          href={notificationHref(item)}
          variant="ghost"
          size="sm"
          icon={directional(ArrowRight)}
          onClick={onNavigate}
        >
          {t("notifications.openTeam")}
        </LinkButton>
      }
    >
      <div className="grid gap-1.5" data-notification={item.id}>
        <span className="flex flex-wrap items-center gap-1.5">
          <RoleBadge value={item.from} tooltip={false} />
          <TransitionArrow size={12} />
          <RoleBadge value={item.to} />
        </span>
        <Text variant="secondary" size="sm">
          {t("notifications.roleChanged.body", { name: item.by.name ?? item.by.id })}
        </Text>
      </div>
    </NotificationItem>
  );
}

const COMMENT_ICON = {
  "comments-pending": ChatsCircle,
  "comments-reported": Flag,
  "comments-paused": PauseCircle,
  "comments-purge-waiting": ClockCountdown,
  "comments-approval": Robot,
} as const;

/**
 * Reader comments (RFC-0007 §13, DESIGN.md §2w): "12 comments wait for moderation", reports,
 * a paused day, a takedown still waiting for the live page, an agent's comment request — each
 * with where to act on it. The words are counts and names, never reader text.
 */
function CommentItem({
  item,
  now,
  onNavigate,
}: {
  item: CommentNotification;
  now: number;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const purge = useMutation({
    mutationFn: () => api.comments.purgeSiteCache(item.siteId),
    onSuccess: () => toast.success(t("notifications.comments.purgeWaiting.purged")),
    onError: (e) => toast.error(t("notifications.comments.purgeWaiting.failed"), e.message),
  });
  const { title, body } = commentNotice(t, locale, item, now);
  const Icon = COMMENT_ICON[item.kind];
  const tone =
    item.kind === "comments-reported" ||
    item.kind === "comments-paused" ||
    item.kind === "comments-purge-waiting"
      ? "warning"
      : "info";
  const action =
    item.kind === "comments-paused"
      ? t("notifications.comments.settings")
      : item.kind === "comments-purge-waiting"
        ? t("notifications.comments.open")
        : t("notifications.comments.review");
  return (
    <NotificationItem
      icon={<Icon size={16} />}
      tone={tone}
      title={title}
      meta={
        <RelativeTime
          iso={item.kind === "comments-approval" ? item.createdAt : item.at}
          size="xs"
        />
      }
      actions={
        <>
          {item.kind === "comments-purge-waiting" && (
            <Button
              variant="secondary"
              size="sm"
              loading={purge.isPending}
              onClick={() => purge.mutate()}
            >
              {t("notifications.comments.purgeWaiting.purge")}
            </Button>
          )}
          <LinkButton
            href={notificationHref(item)}
            variant={item.kind === "comments-purge-waiting" ? "ghost" : "secondary"}
            size="sm"
            icon={directional(ArrowRight)}
            onClick={onNavigate}
          >
            {action}
          </LinkButton>
        </>
      }
    >
      <div className="grid" data-notification={item.id} data-kind={item.kind}>
        <Text variant="secondary" size="sm">
          {body}
        </Text>
      </div>
    </NotificationItem>
  );
}

/** The schedule notices' words load with the first one (`lib/schedule-notices.ts`), never with the shell. */
let noticesModule: Promise<typeof import("../lib/schedule-notices.ts")> | undefined;
const loadNotices = () => {
  noticesModule ??= import("../lib/schedule-notices.ts");
  return noticesModule;
};

const SCHEDULE_ICON = {
  "schedule-upcoming": CalendarDots,
  "schedule-published": CalendarDots,
  "automation-digest": CalendarDots,
  "automation-paused": PauseCircle,
} as const;

/**
 * A release or automation notice (RFC-0008 §14, DESIGN.md §2n): what happened in the person's
 * words and the one place to act on it. Suspends until the `schedules` words are there.
 */
function ScheduleNoticeItem({
  item,
  onNavigate,
}: {
  item: ScheduleNotification;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n("schedules");
  const { scheduleNotice } = use(loadNotices());
  const notice = scheduleNotice(t, locale, item);
  const Icon = SCHEDULE_ICON[item.kind as keyof typeof SCHEDULE_ICON] ?? WarningCircle;
  // The scheduler is the deployment's: from a site, its settings say how it runs.
  const params = useParams({ strict: false }) as { siteId?: string };
  const href =
    item.kind === "scheduler-stalled" && params.siteId
      ? `/sites/${params.siteId}/settings#schedules`
      : notificationHref(item);
  return (
    <NotificationItem
      icon={<Icon size={16} />}
      tone={notice.tone}
      title={notice.title}
      meta={<RelativeTime iso={item.at} size="xs" />}
      actions={
        <LinkButton
          href={href}
          variant="secondary"
          size="sm"
          icon={directional(ArrowRight)}
          onClick={onNavigate}
        >
          {notice.action}
        </LinkButton>
      }
    >
      <div className="grid" data-notification={item.id} data-kind={item.kind}>
        <Text variant="secondary" size="sm">
          {notice.body}
        </Text>
      </div>
    </NotificationItem>
  );
}

export function NoticeLoading() {
  return (
    <div className="grid gap-2 px-4 py-3">
      <SkeletonLine minWidth={40} maxWidth={70} />
      <SkeletonLine minWidth={60} maxWidth={90} />
    </div>
  );
}

/** The bell panel's items, one per notification, each with where to act on it. */
export function NotificationList({
  items,
  now,
  onNavigate,
}: {
  items: readonly StudioNotification[];
  now: number;
  onNavigate: () => void;
}) {
  return items.map((item) =>
    isScheduleNotification(item) ? (
      <Suspense key={item.id} fallback={<NoticeLoading />}>
        <ScheduleNoticeItem item={item} onNavigate={onNavigate} />
      </Suspense>
    ) : isCommentNotification(item) ? (
      <CommentItem key={item.id} item={item} now={now} onNavigate={onNavigate} />
    ) : item.kind === "elevation-ending" ? (
      <EndingItem key={item.id} item={item} now={now} onNavigate={onNavigate} />
    ) : item.kind === "elevation-request" ? (
      <RequestItem key={item.id} item={item} onNavigate={onNavigate} />
    ) : item.kind === "member-joined" ? (
      <MemberJoinedItem key={item.id} item={item} onNavigate={onNavigate} />
    ) : (
      <RoleChangedItem key={item.id} item={item} onNavigate={onNavigate} />
    ),
  );
}

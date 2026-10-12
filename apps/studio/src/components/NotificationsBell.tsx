import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenu,
  LinkButton,
  NotificationBell,
  NotificationItem,
  SectionEmpty,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  BellSimple,
  CaretDown,
  ChatsCircle,
  ClockClockwise,
  ClockCountdown,
  Flag,
  GearSix,
  PauseCircle,
  Robot,
  ShieldStar,
  Stop,
  UserPlus,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import {
  api,
  type CommentNotification,
  type ElevationEndingNotification,
  type ElevationRequestNotification,
  type MemberJoinedNotification,
  type RoleChangedNotification,
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
  liveNotifications,
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
import { useNotificationAlerts, useNotifications } from "./useNotifications.ts";
import { useNow } from "./useNow.ts";

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
            icon={ArrowRight}
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
          icon={ArrowRight}
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
          icon={ArrowRight}
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
          icon={ArrowRight}
          onClick={onNavigate}
        >
          {t("notifications.openTeam")}
        </LinkButton>
      }
    >
      <div className="grid gap-1.5" data-notification={item.id}>
        <span className="flex flex-wrap items-center gap-1.5">
          <RoleBadge value={item.from} tooltip={false} />
          <ArrowRight size={12} className="text-kumo-subtle" aria-hidden />
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
            icon={ArrowRight}
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

/**
 * The top bar's bell (DESIGN.md §1, §2n): a count of what needs the person — elevations about to
 * end, agents asking for one — and a panel to act on them right there. It also hosts the one-time
 * toasts and browser notifications, since it is mounted whenever someone is signed in.
 */
export function NotificationsBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  useNotificationAlerts(notifications.data);
  // "8 min left" ages between polls; ended items drop out before the server confirms it.
  const now = useNow(15_000);
  const items = liveNotifications(notifications.data?.items, now);
  const close = () => setOpen(false);
  return (
    <NotificationBell
      label={
        items.length > 0
          ? t("notifications.bellCount", { count: items.length })
          : t("notifications.title")
      }
      count={items.length}
      title={t("notifications.title")}
      open={open}
      onOpenChange={setOpen}
      headerActions={
        items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : undefined
      }
      footer={
        <Button
          variant="ghost"
          size="sm"
          icon={<GearSix />}
          onClick={() => {
            close();
            void navigate({ to: "/account", hash: "notifications" });
          }}
        >
          {t("notifications.settings")}
        </Button>
      }
    >
      {items.length === 0 ? (
        <SectionEmpty
          icon={<BellSimple size={32} className="text-kumo-inactive" />}
          title={t("notifications.empty")}
          description={t("notifications.emptyDescription")}
        />
      ) : (
        items.map((item) =>
          isCommentNotification(item) ? (
            <CommentItem key={item.id} item={item} now={now} onNavigate={close} />
          ) : item.kind === "elevation-ending" ? (
            <EndingItem key={item.id} item={item} now={now} onNavigate={close} />
          ) : item.kind === "elevation-request" ? (
            <RequestItem key={item.id} item={item} onNavigate={close} />
          ) : item.kind === "member-joined" ? (
            <MemberJoinedItem key={item.id} item={item} onNavigate={close} />
          ) : (
            <RoleChangedItem key={item.id} item={item} onNavigate={close} />
          ),
        )
      )}
    </NotificationBell>
  );
}

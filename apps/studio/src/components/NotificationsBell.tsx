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
  ClockClockwise,
  ClockCountdown,
  GearSix,
  Robot,
  Stop,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import type { ElevationEndingNotification, ElevationRequestNotification } from "../lib/api.ts";
import { formatUntil } from "../lib/elevation.ts";
import {
  DEFAULT_EXTEND_MINUTES,
  EXTEND_PRESETS,
  type ExtendTarget,
  endingParams,
  extendTargetOf,
  liveNotifications,
  notificationHref,
  requestParams,
} from "../lib/notifications.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { useEndElevation, useExtendElevation } from "./Elevation.tsx";
import { AgentReason, useShortDuration } from "./ElevationRequest.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
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
          item.kind === "elevation-ending" ? (
            <EndingItem key={item.id} item={item} now={now} onNavigate={close} />
          ) : (
            <RequestItem key={item.id} item={item} onNavigate={close} />
          ),
        )
      )}
    </NotificationBell>
  );
}

import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { loadNamespace, useI18n } from "../i18n/index.tsx";
import { api, isNotEnabled, type NotificationsPage, type StudioNotification } from "../lib/api.ts";
import {
  browserPermission,
  commentNotice,
  DEFAULT_EXTEND_MINUTES,
  endingParams,
  extendTargetOf,
  freshNotifications,
  isCommentNotification,
  isScheduleNotification,
  liveNotifications,
  notificationHref,
  notificationsPollInterval,
  readBrowserPreference,
  readShownIds,
  rememberShownIds,
  requestParams,
  shouldRaiseBrowserNotification,
} from "../lib/notifications.ts";
import { splitHref } from "./AppLink.tsx";
import { useExtendElevation } from "./elevation-actions.ts";
import { type ToastAction, useToast } from "./Toast.ts";
import { useShortDuration } from "./useShortDuration.ts";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * What needs the signed-in person's attention (`GET /api/notifications`), polled while the app
 * frame is mounted — every minute, every 15 s while an elevation is ending — also in a background
 * tab, so browser notifications can arrive. A server without the endpoint answers 404 once: the
 * bell then stays empty and nothing is fetched again (not on an interval, focus or remount).
 */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: api.notifications.list,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
    retryOnMount: false,
    refetchOnMount: (query) => !isNotEnabled(query.state.error),
    refetchOnWindowFocus: (query) => !isNotEnabled(query.state.error),
    refetchInterval: (query) => notificationsPollInterval(query.state.data, query.state.error),
    refetchIntervalInBackground: true,
  });
}

/**
 * Query clients whose first answer has been taken as the baseline. One client lives as long as the
 * page, so this is "this session": the app frame remounting (account ↔ site surface) keeps it.
 */
const baselined = new WeakSet<QueryClient>();

/** The words for one item, shared by its toast and its browser notification. */
function useDescribe() {
  const { t, locale } = useI18n();
  const shortDuration = useShortDuration();
  return (item: StudioNotification): { title: string; body: string } | undefined => {
    // Schedule notices are worded by a module that loads with them (`lib/schedule-notices.ts`).
    if (isScheduleNotification(item)) return undefined;
    if (isCommentNotification(item)) return commentNotice(t, locale, item);
    if (item.kind === "elevation-ending") {
      const p = endingParams(t, locale, item);
      return {
        title: t("notifications.toast.endingTitle", p),
        body: t("notifications.toast.endingBody", p),
      };
    }
    if (item.kind === "member-joined")
      return {
        title: t("notifications.memberJoined.title", { name: item.name ?? t("members.someone") }),
        body: t("notifications.memberJoined.toast", { role: t(`roles.names.${item.role}`) }),
      };
    if (item.kind === "role-changed")
      return {
        title: t("notifications.roleChanged.title", { role: t(`roles.names.${item.to}`) }),
        body: t("notifications.roleChanged.body", { name: item.by.name ?? item.by.id }),
      };
    return {
      title: t("notifications.request.title", requestParams(t, item, shortDuration)),
      body: item.reason
        ? t("notifications.request.reason", { reason: item.reason })
        : t("approvals.elevation.noReason"),
    };
  };
}

/**
 * Announces each notification **once** (DESIGN.md §2n): a toast when its id first appears while
 * Studio is open — with "Extend 1 hour" or "Review" in it — and, when the person opted in, the
 * browser allows it and Studio is not on screen, a system notification that brings Studio back to
 * Agents or Approvals. Ids already announced are remembered per browser (`localStorage`), so a
 * reload does not repeat them; whatever is there on the session's first answer is not announced
 * at all — the bell lists it.
 */
export function useNotificationAlerts(page: NotificationsPage | undefined) {
  const qc = useQueryClient();
  const { t, locale } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const extend = useExtendElevation();
  const describe = useDescribe();
  // The latest callbacks, so the effect runs on new data only.
  const latest = useRef({ toast, navigate, extend: extend.mutate, describe, t, locale });
  latest.current = { toast, navigate, extend: extend.mutate, describe, t, locale };

  useEffect(() => {
    if (!page) return;
    const live = liveNotifications(page.items);
    if (!baselined.has(qc)) {
      baselined.add(qc);
      rememberShownIds(live.map((i) => i.id));
      return;
    }
    const fresh = freshNotifications(live, readShownIds());
    if (fresh.length === 0) return;
    rememberShownIds(fresh.map((i) => i.id));
    // Something changed elsewhere (another tab, the API, an agent): bring the lists up to date.
    if (fresh.some((i) => i.kind === "elevation-ending"))
      void qc.invalidateQueries({ queryKey: ["agent-keys"] });
    if (fresh.some((i) => i.kind === "elevation-request"))
      void qc.invalidateQueries({ queryKey: ["approvals"] });
    // Someone joined, or the person's own role changed: what they may do changed with it.
    if (fresh.some((i) => i.kind === "member-joined" || i.kind === "role-changed")) {
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["invites"] });
    }
    // Reader comments moved (new pending, reports, an agent's request): refresh the queue.
    if (fresh.some(isCommentNotification)) {
      void qc.invalidateQueries({ queryKey: ["comments"] });
      if (fresh.some((i) => i.kind === "comments-approval"))
        void qc.invalidateQueries({ queryKey: ["approvals"] });
    }
    if (fresh.some((i) => i.kind === "role-changed")) {
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["agent-keys"] });
    }
    // A release ran, moved or stopped (RFC-0008 §14): the calendar and the release are stale.
    if (fresh.some(isScheduleNotification)) void qc.invalidateQueries({ queryKey: ["schedules"] });
    const { toast, navigate, extend, describe, t, locale } = latest.current;
    const go = (href: string) => {
      const target = splitHref(href);
      return navigate({
        to: target.to as "/",
        ...(target.search ? { search: target.search as never } : {}),
        ...(target.hash ? { hash: target.hash } : {}),
      });
    };
    const system = shouldRaiseBrowserNotification({
      enabled: readBrowserPreference(),
      permission: browserPermission(),
      visibility: document.visibilityState,
    });
    // Schedule notices bring their own words: the module and the namespace load first.
    const schedules = fresh.filter(isScheduleNotification);
    if (schedules.length > 0)
      void Promise.all([
        import("../lib/schedule-notices.ts"),
        loadNamespace("schedules", locale),
      ]).then(([{ scheduleNotice }]) => {
        for (const item of schedules) {
          const notice = scheduleNotice(t as never, locale, item);
          const href = notificationHref(item);
          toast.notice({
            id: item.id,
            title: notice.title,
            description: notice.body,
            tone: notice.tone,
            actions: [{ label: notice.action, onClick: () => void go(href) }],
          });
          if (system)
            raiseBrowserNotification(item.id, notice.title, notice.body, () => void go(href));
        }
      });
    for (const item of fresh) {
      const words = describe(item);
      if (!words) continue;
      const { title, body } = words;
      const href = notificationHref(item);
      const actions: ToastAction[] = [];
      if (item.kind === "elevation-ending") {
        const target = extendTargetOf(item);
        if (target) {
          actions.push({
            label: t("notifications.extend.button", {
              duration: t(`notifications.extend.presets.${DEFAULT_EXTEND_MINUTES}`),
            }),
            onClick: () => extend({ targets: [target], minutes: DEFAULT_EXTEND_MINUTES }),
          });
        }
        actions.push({ label: t("notifications.openAgents"), onClick: () => void go(href) });
      } else if (item.kind === "elevation-request") {
        actions.push({ label: t("notifications.request.review"), onClick: () => void go(href) });
      } else if (isCommentNotification(item)) {
        actions.push({
          label:
            item.kind === "comments-paused"
              ? t("notifications.comments.settings")
              : t("notifications.comments.review"),
          onClick: () => void go(href),
        });
      } else {
        actions.push({ label: t("notifications.openTeam"), onClick: () => void go(href) });
      }
      toast.notice({
        id: item.id,
        title,
        description: body,
        tone:
          item.kind === "elevation-ending" ||
          item.kind === "comments-reported" ||
          item.kind === "comments-paused" ||
          item.kind === "comments-purge-waiting"
            ? "warning"
            : "info",
        actions,
      });
      if (system) raiseBrowserNotification(item.id, title, body, () => void go(href));
    }
  }, [page, qc]);
}

/** A system notification; clicking it brings Studio forward and opens where the item leads. */
export function raiseBrowserNotification(
  tag: string,
  title: string,
  body: string,
  open: () => void,
): void {
  try {
    const notification = new window.Notification(title, { body, tag });
    notification.onclick = () => {
      window.focus();
      open();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the toast still shows.
  }
}

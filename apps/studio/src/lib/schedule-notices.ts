/**
 * The schedule notifications in words (RFC-0008 §14): one title, sentence, tone and action per
 * kind, shared by the bell's item, its one-time toast and the browser notification. Loaded with
 * the `schedules` namespace only when a schedule notice arrives (never with the shell). It imports
 * no Studio module at run time (types only), so loading it splits nothing out of the shell's chunk.
 */
import { dateTimeFormat, formatNumber, numberFormat } from "@cloudhal/messages/format";
import type { TFunction } from "../i18n/index.tsx";
import type { ScheduleNotification } from "./api.ts";

type T = TFunction<"schedules">;

/** "14:02, 12 Oct" — the last tick, in the reader's zone. */
const absoluteTime = (iso: string, locale: string) =>
  dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** "3 min", "2 hr", "1 day" from minutes, in the locale's short units. */
function formatDuration(minutes: number, locale: string): string {
  const unit = minutes >= 1440 ? "day" : minutes >= 60 ? "hour" : "minute";
  const value = unit === "day" ? minutes / 1440 : unit === "hour" ? minutes / 60 : minutes;
  return numberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "minute" ? 0 : 1,
  }).format(value);
}

export interface ScheduleNotice {
  title: string;
  body: string;
  tone: "warning" | "info";
  /** The one action: Review, Open, Resolve, Publish now, Scheduler status, History. */
  action: string;
}

const time = (iso: string | null | undefined, locale: string) =>
  iso ? dateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
const late = (seconds: number | undefined, locale: string) =>
  formatDuration(Math.max(1, Math.round((seconds ?? 0) / 60)), locale);

export function scheduleNotice(t: T, locale: string, item: ScheduleNotification): ScheduleNotice {
  const n = "schedules.notices" as const;
  const a = `${n}.actions` as const;
  if (item.kind === "scheduler-stalled")
    return {
      title: t(`${n}.stalled.title`),
      body: item.lastTickAt
        ? t(`${n}.stalled.body`, { time: absoluteTime(item.lastTickAt, locale) })
        : t(`${n}.stalled.never`),
      tone: "warning",
      action: t(`${a}.status`),
    };
  if (item.kind === "automation-paused")
    return {
      title: t(`${n}.automationPaused.title`, { name: item.name }),
      body: t(`schedules.automations.pausedReason.${(item.reason ?? "person") as "person"}`),
      tone: "warning",
      action: t(`${a}.open`),
    };
  if (item.kind === "automation-failed")
    return {
      title: t(`${n}.automationFailed.title`, { name: item.name }),
      body: t(`${n}.automationFailed.body`, { code: item.reason ?? "failed" }),
      tone: "warning",
      action: t(`${a}.history`),
    };
  if (!("releaseId" in item))
    return {
      title: t(`${n}.digest.title`),
      // The digest's counts in the person's words (its plain-text report is in the run's History).
      body: item.counts
        ? t(`${n}.digest.counts`, {
            published: formatNumber(locale, item.counts.published ?? 0),
            scheduled: formatNumber(locale, item.counts.scheduled ?? 0),
            attention: formatNumber(locale, item.counts["needs-attention"] ?? 0),
            open: formatNumber(locale, item.counts["open-findings"] ?? 0),
          })
        : t(`${n}.digest.body`, { name: item.name }),
      tone: "info",
      action: t(`${a}.open`),
    };
  const title = item.title ?? t(`${n}.untitled`);
  const at = time(item.executeAt, locale);
  switch (item.kind) {
    case "schedule-approval-due":
      return {
        title: t(`${n}.approvalDue.title`, { title, time: at }),
        body: t(`${n}.approvalDue.body`),
        tone: "warning",
        action: t(`${a}.review`),
      };
    case "schedule-upcoming":
      return {
        title: t(`${n}.upcoming.title`, { title, time: at }),
        body: t(`${n}.upcoming.body`),
        tone: "info",
        action: t(`${a}.open`),
      };
    case "schedule-published":
      return {
        title: t(`${n}.published.title`, { title }),
        body: t(`${n}.published.body`, {
          time: time(item.at, locale),
          late:
            (item.latenessSeconds ?? 0) < 60
              ? t(`${n}.onTime`)
              : t("schedules.history.row.late", { duration: late(item.latenessSeconds, locale) }),
        }),
        tone: "info",
        action: t(`${a}.open`),
      };
    case "schedule-conflict":
      return {
        title: t(`${n}.conflict.title`, { title, count: item.changed ?? 1 }),
        body: t(`${n}.conflict.body`),
        tone: "warning",
        action: t(`${a}.resolve`),
      };
    case "schedule-missed":
      return {
        title: t(`${n}.missed.title`, { title }),
        body: t(`${n}.missed.body`, { duration: late(item.latenessSeconds, locale) }),
        tone: "warning",
        action: t(`${a}.publishNow`),
      };
    case "schedule-expired": {
      const reason = (item.reason ?? "other") as "other";
      const known = [
        "unapproved",
        "approval_lost",
        "creator_removed",
        "auto_window_ended",
      ].includes(reason);
      return {
        title: t(`${n}.expired.title`, { title }),
        body: t(`schedules.release.outcome.expired.${known ? reason : "other"}`),
        tone: "warning",
        action: t(`${a}.open`),
      };
    }
    default: {
      const code = (item.reason ?? "other") as "other";
      const known = [
        "dependency_missing",
        "invalid_snapshot",
        "site_missing",
        "node_body_missing",
        "store_error",
      ].includes(code);
      return {
        title: t(`${n}.failed.title`, { title }),
        body: t(`schedules.release.outcome.failed.${known ? code : "other"}`),
        tone: "warning",
        action: t(`${a}.open`),
      };
    }
  }
}

import type { ContentEntry } from "@cloudhal/core-contracts";
import {
  ArticleCommentsSummary,
  type ArticleCommentsSummaryLabels,
  LinkButton,
  SectionCard,
  SectionEmpty,
} from "@cloudhal/ui";
import { ChatsCircle, GearSix, LockSimple, RocketLaunch } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type TFunction, useI18n } from "../i18n/index.tsx";
import { api, type CommentThreadMode, isNotEnabled } from "../lib/api.ts";
import { commentThreadKey, threadModeOf } from "../lib/comments.ts";
import { isOwnEntry } from "../lib/roles.ts";
import {
  CloseDateDialog,
  closeLine,
  HideThreadConfirm,
  useSetThread,
} from "./CommentThreadControls.tsx";
import { useGate, useMe, useSelf } from "./useMe.ts";

function summaryLabels(t: TFunction<"comments">): ArticleCommentsSummaryLabels {
  const c = "comments.editorCard" as const;
  return {
    mode: t(`${c}.mode`),
    modes: {
      default: t("comments.thread.modes.default"),
      open: t("comments.thread.modes.open"),
      closed: t("comments.thread.modes.closed"),
      hidden: t("comments.thread.modes.hidden"),
    },
    state: {
      open: t("comments.thread.state.open"),
      closed: t("comments.thread.state.closed"),
      hidden: t("comments.thread.state.hidden"),
      off: t("comments.thread.state.off"),
    },
    now: t(`${c}.now`),
    approved: (_count, formatted) => t(`${c}.approved`, { formatted }),
    pending: (_count, formatted) => t(`${c}.pending`, { formatted }),
    reported: (_count, formatted) => t(`${c}.reported`, { formatted }),
    counts: t(`${c}.counts`),
    change: t(`${c}.change`),
    moderate: t(`${c}.moderate`),
    loading: t("comments.loading"),
  };
}

/**
 * The article editor's "Comments" card (RFC-0007 §14, DESIGN.md §2w; aside after Readers): the
 * thread's mode (Default · Open · Closed · Hidden), what readers get now, when it closes, the
 * counts and a link to moderate. Absent when the deployment has no comments; Contributors see the
 * reason; an Author sees someone else's article's mode, not a control.
 */
export function ArticleCommentsCard({
  siteId,
  entry,
}: {
  siteId: string;
  /** The article as saved. */
  entry: Pick<ContentEntry, "id" | "publishedAt" | "author">;
}) {
  const { t, locale } = useI18n("comments");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const available = instance.data?.features.comments?.available === true;
  const known = !useMe().isPending;
  const read = useGate("comments.read");
  const moderateOwn = useGate("comments.moderate");
  const moderateAny = useGate("comments.moderateAny");
  const settingsGate = useGate("comments.settings");
  const self = useSelf();
  const published = entry.publishedAt !== undefined;
  const thread = useQuery({
    queryKey: commentThreadKey(siteId, entry.id),
    queryFn: () => api.comments.thread(siteId, entry.id),
    enabled: known && available && read.allowed && published,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const setThread = useSetThread(siteId, entry.id);
  const [closeOpen, setCloseOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  if (!available || (published && isNotEnabled(thread.error))) return null;

  const own = isOwnEntry(entry, self);
  const reason = !moderateOwn.allowed
    ? moderateOwn.reason
    : !moderateAny.allowed && !own
      ? t("comments.editorCard.notOwn")
      : undefined;
  const view = thread.data?.thread;
  const counts = thread.data?.counts;
  const changeMode = (next: CommentThreadMode) => {
    if (!view || next === view.mode) return;
    if (next === "hidden") setHideOpen(true);
    else setThread.mutate({ rev: view.rev, mode: next });
  };

  const empty = !read.allowed ? (
    <SectionEmpty
      icon={<LockSimple size={32} className="text-kumo-inactive" />}
      title={t("comments.editorCard.notPermitted")}
      description={read.reason}
    />
  ) : !published ? (
    <SectionEmpty
      icon={<RocketLaunch size={32} className="text-kumo-inactive" />}
      title={t("comments.editorCard.neverPublished")}
    />
  ) : view?.state === "off" ? (
    <SectionEmpty
      icon={<ChatsCircle size={32} className="text-kumo-inactive" />}
      title={t("comments.editorCard.off")}
      contents={
        settingsGate.allowed ? (
          <LinkButton
            href={`/sites/${siteId}/settings#comments`}
            variant="secondary"
            size="sm"
            icon={GearSix}
          >
            {t("comments.editorCard.offAction")}
          </LinkButton>
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <SectionCard
      title={t("comments.editorCard.title")}
      icon={<ChatsCircle size={16} />}
      data-testid="article-comments-card"
    >
      <ArticleCommentsSummary
        locale={locale}
        labels={summaryLabels(t)}
        mode={view?.mode ?? "default"}
        state={view?.state ?? "open"}
        {...(reason
          ? { modeReadOnlyReason: reason }
          : { onModeChange: (m: CommentThreadMode) => changeMode(threadModeOf(m)) })}
        {...(view ? { closes: closeLine(t, view, locale) } : {})}
        {...(reason
          ? {}
          : {
              onChangeClose: () => {
                setThread.reset();
                setCloseOpen(true);
              },
            })}
        counts={{
          approved: counts?.approved ?? 0,
          pending: counts?.pending ?? 0,
          reported: counts?.reported ?? 0,
        }}
        href={`/sites/${siteId}/comments/${encodeURIComponent(entry.id)}`}
        saving={setThread.isPending}
        loading={thread.isPending}
        empty={empty}
      />
      <CloseDateDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        current={view?.closesAt ?? null}
        busy={setThread.isPending}
        error={setThread.error?.message}
        onSave={(closesAt) =>
          view &&
          setThread.mutate(
            { rev: view.rev, mode: view.mode, closesAt },
            { onSuccess: () => setCloseOpen(false) },
          )
        }
      />
      <HideThreadConfirm
        open={hideOpen}
        onOpenChange={setHideOpen}
        busy={setThread.isPending}
        onConfirm={() =>
          view &&
          setThread.mutate(
            { rev: view.rev, mode: "hidden" },
            { onSuccess: () => setHideOpen(false) },
          )
        }
      />
    </SectionCard>
  );
}

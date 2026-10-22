import { Badge, Banner, Button, Link, Select, SkeletonLine } from "@cloudhal/ui";
import { ArrowClockwise, ChatsCircle, LockSimple, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api, type CommentSettings, isNotEnabled } from "../lib/api.ts";
import { apiErrorText, isConflict } from "../lib/api-errors.ts";
import { CLOSE_OPTIONS, daysFrom, daysValue } from "../lib/comment-settings.ts";
import { commentSettingsKey, commentsKey } from "../lib/comments.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { SettingsSection } from "./Settings.tsx";
import { SwitchField } from "./TaxonomySettingsDialog.tsx";
import { useToast } from "./Toast.ts";
import { useGate, useMe } from "./useMe.ts";

/** The section's id in the collection settings' table of contents. */
export const COLLECTION_COMMENTS_SECTION = "comments";

/** One collection's row of `comment_settings.collections` (RFC-0007 §4.5). */
export type CollectionComments = CommentSettings["collections"][string];

const OFF: CollectionComments = { enabled: false };

/** The collection's row, off when the site has none for it yet. */
export function commentsOf(settings: CommentSettings, collection: string): CollectionComments {
  return settings.collections[collection] ?? OFF;
}

/** The PUT's patch: every collection as saved, with this one replaced (only `collections`). */
export function collectionCommentsPatch(
  settings: CommentSettings,
  collection: string,
  next: CollectionComments,
) {
  return { collections: { ...settings.collections, [collection]: next } };
}

const sameRow = (a: CollectionComments, b: CollectionComments) =>
  a.enabled === b.enabled && (a.closeAfterDays ?? "site") === (b.closeAfterDays ?? "site");

/** The section's data: the site's comment settings, this collection's row and its draft. */
function useCollectionComments(siteId: string, collection: string) {
  const { t } = useI18n("commentsSettings");
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const read = useGate("comments.read");
  const gate = useGate("comments.settings");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const feature = instance.data?.features.comments;
  const settings = useQuery({
    queryKey: commentSettingsKey(siteId),
    queryFn: () => api.comments.settings(siteId),
    enabled: !me.isPending && read.allowed && feature?.available !== false,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const latest = settings.data?.settings;
  const saved = latest ? commentsOf(latest, collection) : undefined;
  const [form, setForm] = useState<CollectionComments>();
  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved?.enabled, saved?.closeAfterDays]);
  const save = useMutation({
    mutationFn: ({ base, next }: { base: CommentSettings; next: CollectionComments }) =>
      api.comments.updateSettings(
        siteId,
        base.rev,
        collectionCommentsPatch(base, collection, next),
      ),
    onSuccess: async (result) => {
      qc.setQueryData<Awaited<ReturnType<typeof api.comments.settings>>>(
        commentSettingsKey(siteId),
        (prev) => (prev ? { ...prev, settings: result.settings } : prev),
      );
      toast.success(
        t("commentsSettings.saved"),
        result.purge !== "none" ? t("commentsSettings.savedPurged") : undefined,
      );
      await qc.invalidateQueries({
        queryKey: commentsKey(siteId),
        predicate: (q) => q.queryKey[2] !== "settings",
      });
    },
  });
  return {
    read,
    gate,
    settings,
    latest,
    saved,
    form,
    setForm,
    save,
    dirty: !!form && !!saved && !sameRow(form, saved),
    unavailable: feature?.available === false || isNotEnabled(settings.error),
  };
}
type State = ReturnType<typeof useCollectionComments>;

/** A failed save: the 409 with "Load latest", anything else as an error. */
function SaveError({ state }: { state: State }) {
  const { t } = useI18n("commentsSettings");
  const { save, settings } = state;
  if (!save.error) return null;
  if (!isConflict(save.error))
    return (
      <Banner
        variant="error"
        size="sm"
        title={t("commentsSettings.failed")}
        description={apiErrorText(t, save.error)}
      />
    );
  return (
    <div role="alert">
      <Banner
        variant="alert"
        icon={<Warning weight="fill" />}
        title={t("commentsSettings.conflictTitle")}
        description={t("commentsSettings.conflictDescription")}
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowClockwise />}
            onClick={() => {
              save.reset();
              void settings.refetch();
            }}
            loading={settings.isFetching}
          >
            {t("commentsSettings.loadLatest")}
          </Banner.Action>
        }
      />
    </div>
  );
}

/** The controls: on/off and when threads close, with the site-wide state and a link to the rest. */
function CommentsFields({
  siteId,
  state,
  form,
  siteEnabled,
}: {
  siteId: string;
  state: State;
  form: CollectionComments;
  siteEnabled: boolean;
}) {
  const { t } = useI18n("collections", "commentsSettings");
  const off = !state.gate.allowed;
  const daysLabel = (days: number | null) =>
    days === null
      ? t("commentsSettings.closeAfter.never")
      : days === 365
        ? t("commentsSettings.closeAfter.year")
        : t("commentsSettings.closeAfter.days", { days });
  const current = form.closeAfterDays;
  const options =
    current === undefined || CLOSE_OPTIONS.includes(current)
      ? CLOSE_OPTIONS
      : [...CLOSE_OPTIONS, current];
  return (
    <div className="grid gap-5">
      <SaveError state={state} />
      {!siteEnabled && (
        <Banner
          variant="secondary"
          size="sm"
          icon={<ChatsCircle weight="fill" />}
          title={t("collections.settings.commentsSiteOff")}
          description={t("collections.settings.commentsSiteOffDescription")}
        />
      )}
      <SwitchField
        testId="collection-comments"
        label={t("collections.settings.commentsEnabled")}
        hint={t("collections.settings.commentsEnabledHint")}
        checked={form.enabled}
        onChange={(enabled) => state.setForm({ ...form, enabled })}
        disabled={off}
      />
      <Select
        className="w-full"
        label={t("collections.settings.commentsCloseAfter")}
        description={t("collections.settings.commentsCloseAfterHint")}
        value={daysValue(current)}
        onValueChange={(v) => {
          const days = daysFrom(String(v));
          const { closeAfterDays: _old, ...rest } = form;
          state.setForm(days === undefined ? rest : { ...rest, closeAfterDays: days });
        }}
        items={[
          { value: "site", label: t("commentsSettings.collections.sameAsSite") },
          ...options.map((d) => ({ value: daysValue(d), label: daysLabel(d) })),
        ]}
        disabled={off || !form.enabled}
        data-testid="collection-comments-close"
      />
      <Link href={`/sites/${siteId}/settings#comments`}>
        {t("collections.settings.commentsLink")}
      </Link>
    </div>
  );
}

/** What the section shows: no access, not on this server, the error, loading, or the form. */
function CommentsBody({ siteId, state }: { siteId: string; state: State }) {
  const { t } = useI18n("commentsSettings");
  const { read, settings, form, latest } = state;
  if (!read.allowed)
    return (
      <Banner
        variant="secondary"
        icon={<LockSimple weight="fill" />}
        title={t("commentsSettings.noAccessTitle")}
        description={read.reason}
      />
    );
  if (state.unavailable)
    return (
      <Banner
        variant="secondary"
        icon={<ChatsCircle weight="fill" />}
        title={t("commentsSettings.unavailableTitle")}
        description={t("commentsSettings.unavailableDescription")}
      />
    );
  if (settings.error && !form)
    return (
      <ErrorBanner
        error={settings.error}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      />
    );
  if (!form || !latest)
    return (
      <div className="grid gap-3" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <SkeletonLine minWidth={30} maxWidth={45} />
        <SkeletonLine minWidth={60} maxWidth={85} />
      </div>
    );
  return <CommentsFields siteId={siteId} state={state} form={form} siteEnabled={latest.enabled} />;
}

/**
 * A collection › Settings › Comments (RFC-0040 §4): whether readers can comment on this
 * collection's entries and when its threads close. The words and the gates are those of
 * Site settings › Comments (`comments.read` to see, `comments.settings` to change); the values stay
 * in `comment_settings` (RFC-0007 §4.5), saved with its `rev` — never on the collection.
 */
export function CollectionCommentsSection({
  siteId,
  collection,
}: {
  siteId: string;
  collection: string;
}) {
  const { t } = useI18n("collections", "commentsSettings");
  const state = useCollectionComments(siteId, collection);
  const { saved, form, latest, save, dirty, gate } = state;
  return (
    <SettingsSection
      id={COLLECTION_COMMENTS_SECTION}
      title={t("collections.settings.comments")}
      description={t("collections.settings.commentsDescription")}
      aside={
        saved ? (
          <Badge variant={saved.enabled ? "success" : "neutral"} appearance="dot">
            {t(saved.enabled ? "commentsSettings.status.on" : "commentsSettings.status.off")}
          </Badge>
        ) : undefined
      }
      footer={
        form && latest && !state.unavailable && state.read.allowed ? (
          <>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  state.setForm(saved);
                  save.reset();
                }}
                disabled={save.isPending}
              >
                {t("common.discard")}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => save.mutate({ base: latest, next: form })}
              loading={save.isPending}
              disabled={!gate.allowed || !dirty}
              title={gate.reason}
              data-testid="collection-comments-save"
            >
              {t("common.saveChanges")}
            </Button>
          </>
        ) : undefined
      }
    >
      <CommentsBody siteId={siteId} state={state} />
    </SettingsSection>
  );
}

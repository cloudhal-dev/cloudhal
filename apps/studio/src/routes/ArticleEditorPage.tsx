import type { ContentEntry, PublishStatus } from "@cloudhal/core-contracts";
import { collectionPermalink, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
import {
  ApprovalDialog,
  Button,
  DeleteResource,
  DropdownMenu,
  Field,
  type ImagePreviewStatus,
  InlineCopyText,
  Input,
  InputArea,
  InputGroup,
  LayerCard,
  PageLayout,
  SectionCard,
  SkeletonLine,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { Copy, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArticleCorrectionsCard } from "../components/ArticleCorrections.tsx";
import { ArticleTermsCard } from "../components/ArticleTerms.tsx";
import { ArticleReachCards } from "../components/article-editor/ArticleAside.tsx";
import { BodyEditor } from "../components/BodyEditor.tsx";
import { BodyProposals } from "../components/BodyProposals.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DraftEditorPreview } from "../components/DraftPreview.tsx";
import { deleteResourceProps } from "../components/deleteLabels.ts";
import {
  DangerZoneCard,
  type DetailRow,
  DetailsCard,
  EditorLayout,
  PreviewToggle,
  usePreviewVisible,
} from "../components/EditorLayout.tsx";
import {
  isScheduleError,
  ScheduleAction,
  ScheduleAside,
  ScheduleLock,
} from "../components/EditorSchedule.tsx";
import { EntryPath } from "../components/EntryPath.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ViewOnlyBanner } from "../components/Gating.tsx";
import { EntryAddress, ViewLiveButton } from "../components/LiveAddress.tsx";
import { MenuDeleteNotice, useMenuReferences } from "../components/Menus.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { ArticleSeoPreviewCard, CountedHint, CoverImageCard } from "../components/Seo.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { TagsMigrationBanner } from "../components/TagsMigration.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
import { useCollectionCrumb } from "../components/useCollectionView.ts";
import { useSavedToast } from "../components/useLiveSite.ts";
import { useCan, useGate, useSelf } from "../components/useMe.ts";
import { useT } from "../i18n/index.tsx";
import { api, type NewEntry } from "../lib/api.ts";
import { entryAccess } from "../lib/roles.ts";
import { cleanImageRef, hasErrors, SEO_LIMITS, validateImageRef } from "../lib/seo.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import { missingPrimaries } from "../lib/taxonomy.ts";
import { isDirty, setOptional } from "../lib/util.ts";
import { slugify } from "../lib/workflow.ts";

/** A copy of the article as a new draft with a free slug. */
function duplicateOf(entry: ContentEntry, title: string): NewEntry {
  const suffix = `-copy-${Date.now().toString(36).slice(-4)}`;
  return {
    collection: entry.collection,
    slug: `${entry.slug.slice(0, 128 - suffix.length)}${suffix}`,
    locale: entry.locale,
    status: "draft",
    title,
    body: entry.body,
    fields: entry.fields,
    tags: entry.tags,
    ...(entry.terms ? { terms: entry.terms } : {}),
    ...(entry.summary !== undefined ? { summary: entry.summary } : {}),
    ...(entry.coverImage ? { coverImage: entry.coverImage } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** What is sent: the cover image's fields trimmed. */
function forSave(entry: ContentEntry): ContentEntry {
  return entry.coverImage ? { ...entry, coverImage: cleanImageRef(entry.coverImage) } : entry;
}

/** Why the form is read-only for someone who may not change this article (§2s). */
const READ_ONLY_REASON = {
  notOwn: "gating.entryNotOwn",
  published: "gating.entryPublished",
} as const;

export function ArticleEditorPage() {
  const t = useT();
  const { siteId, entryId } = useParams({ from: "/sites/$siteId/articles/$entryId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const savedToast = useSavedToast();
  const query = useQuery({
    queryKey: ["entry", siteId, entryId],
    queryFn: () => api.entries.get(siteId, entryId),
  });
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const taxonomy = useTaxonomyData(siteId);
  const host = primaryHostname(site.data?.domains ?? []);
  const [draft, setDraft] = useState<ContentEntry | undefined>();
  const [showErrors, setShowErrors] = useState(false);
  /** Required taxonomies (keys) the last save attempt lacked a primary term for. */
  const [missing, setMissing] = useState<string[]>([]);
  const [coverStatus, setCoverStatus] = useState<ImagePreviewStatus>("empty");
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Menus linking here (RFC-0003): named in the delete dialog, listed in the "In menus" card.
  const menuRefs = useMenuReferences(siteId, { kind: "contentEntry", id: entryId });
  const [previewVisible, setPreviewVisible] = usePreviewVisible();
  // A release holds this article (RFC-0008 §6.2): it publishes as pinned, so the form is locked.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const dirty = isDirty(draft, query.data);
  // Own work (RFC-0005 §4, I9): Editors change any article, Authors their own, Contributors their
  // own until it is published. Cosmetic — the server answers 403 `not_own` either way.
  const editAny = useCan("entries.editAny");
  const editOwnPublished = useCan("entries.editOwnPublished");
  const publishGate = useGate("entries.editOwnPublished");
  const self = useSelf();

  const save = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.update(forSave(entry)),
    onSuccess: async (saved) => {
      setDraft(saved);
      setShowErrors(false);
      setMissing([]);
      qc.setQueryData(["entry", siteId, entryId], saved);
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      savedToast(saved, query.data?.status);
    },
  });
  const duplicate = useMutation({
    mutationFn: (entry: ContentEntry) =>
      api.entries.create(
        siteId,
        duplicateOf(entry, t("editor.copyTitle", { title: entry.title || t("articles.untitled") })),
      ),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      toast.success(t("editor.duplicated"), created.slug);
      await navigate({
        to: "/sites/$siteId/articles/$entryId",
        params: { siteId, entryId: created.id },
      });
    },
  });
  const remove = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.remove(entry),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate({ href: articlesCrumb.href });
    },
  });
  const articlesCrumb = useCollectionCrumb(siteId, query.data?.collection);

  if (!draft) {
    return (
      <PageLayout
        crumbs={<SiteCrumbs siteId={siteId} trail={[articlesCrumb, { label: undefined }]} />}
        title={undefined}
        loading={query.isPending}
      >
        <ErrorBanner error={query.error} />
        <LayerCard className="grid gap-3 px-5 py-4">
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={70} maxWidth={90} />
          <SkeletonLine minWidth={50} maxWidth={70} />
        </LayerCard>
      </PageLayout>
    );
  }
  const set = <K extends keyof ContentEntry>(key: K, value: ContentEntry[K]) =>
    setDraft({ ...draft, [key]: value });
  const coverErrors = validateImageRef(draft.coverImage);
  /**
   * Every save path checks the cover image and — for review and published — the required primary
   * category (RFC-0002 invariant 2) first; an article the server would refuse never leaves Studio.
   */
  const valid = (status: PublishStatus = draft.status) => {
    const lacking = missingPrimaries(draft, taxonomy.taxonomies.data ?? [], status).map(
      (x) => x.key,
    );
    setMissing(lacking);
    if (lacking.length > 0) {
      toast.error(
        t("articleTerms.requiredToast", {
          singular: taxonomy
            .label(
              (taxonomy.taxonomies.data ?? []).find((x) => x.key === lacking[0]) ?? {
                key: lacking[0] ?? "",
                labels: {},
              },
              "singular",
            )
            .toLocaleLowerCase(),
        }),
      );
      document.getElementById("terms")?.scrollIntoView?.({ block: "center" });
      return false;
    }
    if (!hasErrors(coverErrors)) return true;
    setShowErrors(true);
    toast.error(t("seo.fixErrors"));
    document.getElementById("cover-image")?.scrollIntoView?.({ block: "center" });
    return false;
  };
  const changeStatus = (next: PublishStatus) => {
    if (valid(next)) save.mutate({ ...draft, status: next });
  };
  const migrated = (taxonomy.taxonomies.data?.length ?? 0) > 0;
  const access = entryAccess(draft, { editAny, editOwnPublished }, self);
  const readOnlyReason = access === "edit" ? undefined : t(READ_ONLY_REASON[access]);
  const lockedReason = locked ? t("editor.locked") : undefined;
  // Contributors move their drafts to review; Authors and above set every status.
  const allowedStatuses: PublishStatus[] | undefined = editOwnPublished
    ? undefined
    : ["draft", "review"];
  const title = draft.title || t("articles.untitled");
  const words = wordCount(draft.body.value);
  const details: DetailRow[] = [
    { label: t("editor.id"), value: <InlineCopyText>{draft.id}</InlineCopyText> },
    {
      label: t("editor.collection"),
      value: (
        <Text variant="mono-secondary" as="span">
          {draft.collection}
        </Text>
      ),
    },
    {
      label: t("editor.locale"),
      value: <Text as="span">{draft.locale}</Text>,
    },
    {
      label: t("editor.author"),
      value: (
        <Text as="span" truncate>
          {draft.author.name ?? draft.author.id}
        </Text>
      ),
    },
    {
      label: t("editor.revision"),
      value: <Text as="span">{draft.rev}</Text>,
    },
    ...(draft.publishedAt
      ? [
          {
            label: t("editor.publishedAt"),
            value: <RelativeTime iso={draft.publishedAt} size="base" />,
          },
        ]
      : []),
    { label: t("editor.updatedAt"), value: <RelativeTime iso={draft.updatedAt} size="base" /> },
  ];

  return (
    <PageLayout
      crumbs={
        <SiteCrumbs siteId={siteId} trail={[articlesCrumb, { label: title }]} copy={draft.id} />
      }
      title={title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Status status={draft.status} />
          <EntryPath siteId={siteId} entry={draft} />
        </span>
      }
      actions={
        <>
          <PreviewToggle visible={previewVisible} onChange={setPreviewVisible} />
          <ViewLiveButton siteId={siteId} item={draft} />
          <StatusActions
            status={draft.status}
            busy={save.isPending}
            onChange={changeStatus}
            onPublish={() => {
              if (valid("published")) setPublishOpen(true);
            }}
            allowed={allowedStatuses}
            publishReason={publishGate.reason}
            readOnlyReason={readOnlyReason ?? lockedReason}
            menu={
              <>
                <DropdownMenu.Item icon={Copy} onClick={() => duplicate.mutate(draft)}>
                  {t("editor.duplicate")}
                </DropdownMenu.Item>
                {readOnlyReason ? (
                  // A disabled item takes no pointer events, so the tooltip hangs on a wrapper.
                  <Tooltip content={readOnlyReason} side="left" render={<div />}>
                    <DropdownMenu.Item icon={Trash} variant="danger" disabled>
                      {t("editor.deleteArticle")}
                    </DropdownMenu.Item>
                  </Tooltip>
                ) : (
                  <DropdownMenu.Item
                    icon={Trash}
                    variant="danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("editor.deleteArticle")}
                  </DropdownMenu.Item>
                )}
              </>
            }
          />
          <ScheduleAction
            siteId={siteId}
            node={{ id: draft.id, kind: "contentEntry", title, status: draft.status }}
            dirty={dirty}
            prepare={() =>
              // Scheduling publishes it at that time: mark it Published (Authors and above) and
              // save what is unsaved, first.
              dirty || (editOwnPublished && draft.status !== "published")
                ? save.mutateAsync(editOwnPublished ? { ...draft, status: "published" } : draft)
                : undefined
            }
            disabled={readOnlyReason !== undefined || locked}
            reason={readOnlyReason ?? lockedReason}
          />
          <Button
            variant="primary"
            onClick={() => {
              if (valid()) save.mutate(draft);
            }}
            loading={save.isPending}
            disabled={!dirty || readOnlyReason !== undefined || locked}
            title={readOnlyReason ?? lockedReason}
            data-testid="save"
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <ErrorBanner
        error={
          (isScheduleError(save.error) ? undefined : save.error) ?? remove.error ?? duplicate.error
        }
      />
      {taxonomy.taxonomies.isSuccess && !migrated && <TagsMigrationBanner siteId={siteId} />}
      <ViewOnlyBanner reason={readOnlyReason} />
      <ScheduleLock siteId={siteId} nodeId={draft.id} dirty={dirty} onLockChange={setLocked} />
      <EditorLayout
        previewVisible={previewVisible}
        preview={
          <DraftEditorPreview
            queryKey={["entry-preview", siteId, entryId]}
            src={api.preview.entry(siteId, entryId)}
            rev={draft.rev}
            name={title}
            dirty={dirty}
            input={{
              id: draft.id,
              siteId: draft.siteId,
              title: draft.title,
              summary: draft.summary,
              body: draft.body,
              coverImage: draft.coverImage,
            }}
            render={api.entries.previewDraft}
          />
        }
        main={
          // Someone else's article (or a Contributor's published one) is read-only: one disabled
          // fieldset turns every field off at once; the banner above says why (§2s).
          <fieldset
            disabled={readOnlyReason !== undefined || locked}
            className="grid min-w-0 content-start gap-6"
            data-read-only={readOnlyReason || locked ? "true" : undefined}
          >
            <SectionCard title={t("editor.article")}>
              <Input
                label={t("editor.title")}
                value={draft.title}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    title: v,
                    slug: draft.slug.startsWith("untitled") ? slugify(v) : draft.slug,
                  })
                }
                className="w-full"
              />
              <Field
                label={t("editor.slug")}
                description={
                  draft.publishedAt ? t("articleTerms.slugRedirect") : t("editor.slugHint")
                }
              >
                <InputGroup className="w-full">
                  <InputGroup.Addon>
                    {permalinkPrefix(collectionPermalink(site.data, draft.collection))}/
                  </InputGroup.Addon>
                  <InputGroup.Input
                    aria-label={t("editor.slug")}
                    value={draft.slug}
                    onChange={(e) => set("slug", slugify((e.target as HTMLInputElement).value))}
                  />
                </InputGroup>
              </Field>
              <EntryAddress siteId={siteId} entry={draft} />
              <InputArea
                label={t("editor.summary")}
                value={draft.summary ?? ""}
                onValueChange={(v) => setDraft(setOptional(draft, "summary", v))}
                description={
                  <CountedHint
                    hint={t("editor.summaryHint")}
                    count={draft.summary?.trim().length ?? 0}
                    recommended={SEO_LIMITS.descriptionRecommended}
                  />
                }
                required={false}
                autoResize
                minRows={2}
                maxRows={6}
                className="w-full"
              />
            </SectionCard>
            <ArticleTermsCard
              entry={draft}
              onChange={(next) => {
                setDraft(next);
                if (missing.length) setMissing([]);
              }}
              data={taxonomy}
              missing={missing}
            />
            <CoverImageCard
              siteId={siteId}
              defaultLocale={site.data?.defaultLocale ?? draft.locale}
              image={draft.coverImage}
              savedSrc={query.data?.coverImage?.src}
              host={host}
              errors={coverErrors}
              showErrors={showErrors}
              onChange={(image) => setDraft(setOptional(draft, "coverImage", image))}
              onStatusChange={setCoverStatus}
            />
            <SectionCard
              title={t("editor.bodyTitle")}
              actions={
                <Text variant="secondary" size="sm" as="span">
                  {t("editor.markdown")} · {t("editor.words", { count: words })}
                </Text>
              }
            >
              {draft.body.format === "markdown" && (
                <BodyProposals
                  siteId={siteId}
                  nodeId={draft.id}
                  dirty={dirty}
                  readOnly={readOnlyReason !== undefined || locked}
                  onDecided={() => query.refetch()}
                />
              )}
              {draft.body.format === "markdown" ? (
                <BodyEditor
                  siteId={siteId}
                  defaultLocale={site.data?.defaultLocale ?? draft.locale}
                  host={host}
                  nodeId={draft.id}
                  pageLocale={draft.locale}
                  value={draft.body.value}
                  onChange={(v) => set("body", { ...draft.body, value: v })}
                  readOnly={readOnlyReason !== undefined || locked}
                  focusSave={{
                    dirty,
                    saving: save.isPending,
                    disabled: readOnlyReason !== undefined || locked,
                    onSave: () => {
                      if (valid()) save.mutate(draft);
                    },
                  }}
                />
              ) : (
                <InputArea
                  aria-label={t("editor.body")}
                  value={draft.body.value}
                  onValueChange={(v) => set("body", { ...draft.body, value: v })}
                  autoResize
                  minRows={12}
                  maxRows={32}
                  className="w-full font-mono"
                />
              )}
            </SectionCard>
            <ArticleCorrectionsCard
              entry={draft}
              onChange={setDraft}
              disabled={readOnlyReason !== undefined || locked}
            />
          </fieldset>
        }
        aside={
          <>
            <ScheduleAside
              siteId={siteId}
              nodeId={draft.id}
              kind="contentEntry"
              availability={draft.availability}
              onChange={(availability) =>
                setDraft(setOptional(draft, "availability", availability))
              }
              saveError={save.error}
              disabled={readOnlyReason !== undefined || locked}
            />
            <ArticleSeoPreviewCard
              entry={draft}
              siteName={site.data?.name ?? ""}
              host={host}
              coverStatus={coverStatus}
            />
            <ArticleReachCards siteId={siteId} entry={query.data ?? draft} dirty={dirty} />
            <DetailsCard rows={details} />
            <DangerZoneCard
              title={t("editor.deleteArticleTitle")}
              description={t("editor.deleteArticleHint")}
              actionLabel={t("editor.deleteArticle")}
              onAction={() => setDeleteOpen(true)}
              disabledReason={readOnlyReason}
            />
          </>
        }
      />
      <ApprovalDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("editor.publishArticleTitle")}
        description={t("editor.publishArticleDescription")}
        confirmLabel={t("common.publish")}
        cancelLabel={t("common.cancel")}
        busy={save.isPending}
        onConfirm={async () => {
          await save.mutateAsync({ ...draft, status: "published" });
          setPublishOpen(false);
        }}
      />
      <DeleteResource
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        {...deleteResourceProps(t, t("editor.article"))}
        resourceName={draft.slug}
        notice={<MenuDeleteNotice refs={menuRefs.data} kind="contentEntry" />}
        isDeleting={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(draft);
        }}
      />
    </PageLayout>
  );
}

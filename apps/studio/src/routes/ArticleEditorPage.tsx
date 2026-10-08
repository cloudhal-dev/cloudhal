import type { ContentEntry, PublishStatus } from "@cloudhal/core-contracts";
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
import { ArticleTermsCard } from "../components/ArticleTerms.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import {
  DangerZoneCard,
  type DetailRow,
  DetailsCard,
  EditorLayout,
  PreviewToggle,
  usePreviewVisible,
} from "../components/EditorLayout.tsx";
import { EditorPreview } from "../components/EditorPreview.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ViewOnlyBanner } from "../components/Gating.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { ArticleSeoPreviewCard, CountedHint, CoverImageCard } from "../components/Seo.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { TagsMigrationBanner } from "../components/TagsMigration.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
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

export function ArticleEditorPage() {
  const t = useT();
  const { siteId, entryId } = useParams({ from: "/sites/$siteId/articles/$entryId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
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
  const [previewVisible, setPreviewVisible] = usePreviewVisible();
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
      toast.success(t("editor.saved"), t("common.rev", { rev: saved.rev }));
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
      await navigate({ to: "/sites/$siteId/articles", params: { siteId } });
    },
  });
  const articlesCrumb = {
    label: t("pageHeaders.articles.title"),
    href: `/sites/${siteId}/articles`,
  };

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
  const readOnlyReason =
    access === "notOwn"
      ? t("gating.entryNotOwn")
      : access === "published"
        ? t("gating.entryPublished")
        : undefined;
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
          <Text variant="mono-secondary" as="span">
            /{draft.collection}/{draft.slug}
          </Text>
        </span>
      }
      actions={
        <>
          <PreviewToggle visible={previewVisible} onChange={setPreviewVisible} />
          <StatusActions
            status={draft.status}
            busy={save.isPending}
            onChange={changeStatus}
            onPublish={() => {
              if (valid("published")) setPublishOpen(true);
            }}
            allowed={allowedStatuses}
            publishReason={publishGate.reason}
            readOnlyReason={readOnlyReason}
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
          <Button
            variant="primary"
            onClick={() => {
              if (valid()) save.mutate(draft);
            }}
            loading={save.isPending}
            disabled={!dirty || readOnlyReason !== undefined}
            title={readOnlyReason}
            data-testid="save"
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? remove.error ?? duplicate.error} />
      {taxonomy.taxonomies.isSuccess && !migrated && <TagsMigrationBanner siteId={siteId} />}
      <ViewOnlyBanner reason={readOnlyReason} />
      <EditorLayout
        previewVisible={previewVisible}
        preview={
          <EditorPreview
            src={api.preview.entry(siteId, entryId)}
            rev={draft.rev}
            name={title}
            dirty={dirty}
          />
        }
        main={
          // Someone else's article (or a Contributor's published one) is read-only: one disabled
          // fieldset turns every field off at once; the banner above says why (§2s).
          <fieldset
            disabled={readOnlyReason !== undefined}
            className="grid min-w-0 content-start gap-6"
            data-read-only={readOnlyReason ? "true" : undefined}
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
                  <InputGroup.Addon>/{draft.collection}/</InputGroup.Addon>
                  <InputGroup.Input
                    aria-label={t("editor.slug")}
                    value={draft.slug}
                    onChange={(e) => set("slug", slugify((e.target as HTMLInputElement).value))}
                  />
                </InputGroup>
              </Field>
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
                  {t("editor.markdown")} ·{" "}
                  {words === 1 ? t("editor.wordsOne") : t("editor.wordsOther", { count: words })}
                </Text>
              }
            >
              <InputArea
                aria-label={t("editor.body")}
                value={draft.body.value}
                onValueChange={(v) => set("body", { ...draft.body, value: v })}
                autoResize
                minRows={12}
                maxRows={32}
                className="w-full font-mono"
              />
            </SectionCard>
          </fieldset>
        }
        aside={
          <>
            <ArticleSeoPreviewCard
              entry={draft}
              siteName={site.data?.name ?? ""}
              host={host}
              coverStatus={coverStatus}
            />
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
        resourceType={t("editor.article")}
        resourceName={draft.slug}
        isDeleting={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(draft);
        }}
      />
    </PageLayout>
  );
}

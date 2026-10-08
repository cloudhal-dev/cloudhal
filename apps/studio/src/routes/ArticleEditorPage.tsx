import type { ContentEntry, PublishStatus } from "@cloudhal/core-contracts";
import {
  ApprovalDialog,
  Button,
  DeleteResource,
  DropdownMenu,
  Field,
  Grid,
  InlineCopyText,
  Input,
  InputArea,
  InputGroup,
  LayerCard,
  PageLayout,
  SectionCard,
  SkeletonLine,
  TagInput,
  Text,
} from "@cloudhal/ui";
import { Copy, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { RelativeTime } from "../components/RelativeTime.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { useToast } from "../components/Toast.ts";
import { useT } from "../i18n/index.tsx";
import { api, type NewEntry } from "../lib/api.ts";
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
    ...(entry.summary !== undefined ? { summary: entry.summary } : {}),
    ...(entry.coverImage ? { coverImage: entry.coverImage } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

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
  const [draft, setDraft] = useState<ContentEntry | undefined>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewVisible, setPreviewVisible] = usePreviewVisible();
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const dirty = isDirty(draft, query.data);

  const save = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.update(entry),
    onSuccess: async (saved) => {
      setDraft(saved);
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
  const changeStatus = (next: PublishStatus) => save.mutate({ ...draft, status: next });
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
            onPublish={() => setPublishOpen(true)}
            menu={
              <>
                <DropdownMenu.Item icon={Copy} onClick={() => duplicate.mutate(draft)}>
                  {t("editor.duplicate")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  icon={Trash}
                  variant="danger"
                  onClick={() => setDeleteOpen(true)}
                >
                  {t("editor.deleteArticle")}
                </DropdownMenu.Item>
              </>
            }
          />
          <Button
            variant="primary"
            onClick={() => save.mutate(draft)}
            loading={save.isPending}
            disabled={!dirty}
            data-testid="save"
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? remove.error ?? duplicate.error} />
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
          <>
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
              <Grid variant="2up" gap="none" className="items-start gap-x-4 gap-y-5">
                <Field label={t("editor.slug")} description={t("editor.slugHint")}>
                  <InputGroup className="w-full">
                    <InputGroup.Addon>/{draft.collection}/</InputGroup.Addon>
                    <InputGroup.Input
                      aria-label={t("editor.slug")}
                      value={draft.slug}
                      onChange={(e) => set("slug", slugify((e.target as HTMLInputElement).value))}
                    />
                  </InputGroup>
                </Field>
                <TagInput
                  label={t("editor.tags")}
                  value={draft.tags}
                  onValueChange={(tags: string[]) =>
                    set("tags", [
                      ...new Set(tags.map((x) => slugify(x)).filter((x) => x && x !== "untitled")),
                    ])
                  }
                  description={t("editor.tagsHint")}
                  className="w-full"
                />
              </Grid>
              <InputArea
                label={t("editor.summary")}
                value={draft.summary ?? ""}
                onValueChange={(v) => setDraft(setOptional(draft, "summary", v))}
                required={false}
                autoResize
                minRows={2}
                maxRows={6}
                className="w-full"
              />
            </SectionCard>
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
          </>
        }
        aside={
          <>
            <DetailsCard rows={details} />
            <DangerZoneCard
              title={t("editor.deleteArticleTitle")}
              description={t("editor.deleteArticleHint")}
              actionLabel={t("editor.deleteArticle")}
              onAction={() => setDeleteOpen(true)}
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

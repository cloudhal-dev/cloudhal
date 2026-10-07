import type { ContentEntry, PublishStatus } from "@cloudhal/core-contracts";
import {
  ApprovalDialog,
  Button,
  DeleteResource,
  Grid,
  InlineCopyText,
  Input,
  InputArea,
  LayerCard,
  PageHeader,
  TagInput,
  Text,
} from "@cloudhal/ui";
import { FloppyDisk, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { useToast } from "../components/Toast.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { setOptional } from "../lib/util.ts";
import { slugify } from "../lib/workflow.ts";

export function ArticleEditorPage() {
  const t = useT();
  const { siteId, entryId } = useParams({ from: "/sites/$siteId/articles/$entryId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const query = useQuery({
    queryKey: ["entry", siteId, entryId],
    queryFn: () => api.entries.get(siteId, entryId),
  });
  const [draft, setDraft] = useState<ContentEntry | undefined>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.update(entry),
    onSuccess: async (saved) => {
      setDraft(saved);
      qc.setQueryData(["entry", siteId, entryId], saved);
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      toast.success(t("editor.saved"), t("common.rev", { rev: saved.rev }));
    },
  });
  const remove = useMutation({
    mutationFn: (entry: ContentEntry) => api.entries.remove(entry),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate({ to: "/sites/$siteId/articles", params: { siteId } });
    },
  });

  if (!draft) return <ErrorBanner error={query.error} />;
  const set = <K extends keyof ContentEntry>(key: K, value: ContentEntry[K]) =>
    setDraft({ ...draft, [key]: value });
  const changeStatus = (next: PublishStatus) => save.mutate({ ...draft, status: next });

  return (
    <div className="grid gap-6">
      <PageHeader
        breadcrumbs={
          <Crumbs
            items={[
              { label: t("sites.title"), href: "/sites" },
              { label: site.data?.name ?? "…", href: `/sites/${siteId}` },
              { label: t("articles.title"), href: `/sites/${siteId}/articles` },
              { label: draft.title || t("articles.untitled") },
            ]}
          />
        }
        title={draft.title || t("articles.untitled")}
        actions={
          <>
            <StatusActions
              status={draft.status}
              busy={save.isPending}
              onChange={changeStatus}
              onPublish={() => setPublishOpen(true)}
            />
            <Button
              variant="secondary"
              icon={<FloppyDisk />}
              onClick={() => save.mutate(draft)}
              loading={save.isPending}
              data-testid="save"
            >
              {t("common.save")}
            </Button>
          </>
        }
      />
      <ErrorBanner error={save.error ?? remove.error} />
      <Grid variant="2-1" gap="base">
        <LayerCard className="px-5 py-4">
          <div className="grid gap-4">
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
            />
            <Input
              label={t("editor.summary")}
              value={draft.summary ?? ""}
              onValueChange={(v) => setDraft(setOptional(draft, "summary", v))}
              required={false}
            />
            <InputArea
              label={t("editor.body")}
              value={draft.body.value}
              onValueChange={(v) => set("body", { ...draft.body, value: v })}
              autoResize
              minRows={14}
              maxRows={40}
              className="font-mono"
            />
          </div>
        </LayerCard>
        <div className="grid content-start gap-4">
          <LayerCard className="px-5 py-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Text variant="heading" as="h2">
                  {t("editor.metadata")}
                </Text>
                <Status status={draft.status} />
              </div>
              <Input
                label={t("editor.slug")}
                value={draft.slug}
                onValueChange={(v) => set("slug", slugify(v))}
                description={`/${draft.collection}/${draft.slug}`}
              />
              <TagInput
                label={t("editor.tags")}
                value={draft.tags}
                onValueChange={(tags: string[]) =>
                  set("tags", [
                    ...new Set(tags.map((x) => slugify(x)).filter((x) => x && x !== "untitled")),
                  ])
                }
                description={t("editor.tagsHint")}
              />
              <dl className="grid gap-1.5 text-kumo-subtle text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt>ID</dt>
                  <dd>
                    <InlineCopyText>{draft.id}</InlineCopyText>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>{t("common.rev", { rev: draft.rev })}</dt>
                  <dd>
                    {t("common.updated", { when: new Date(draft.updatedAt).toLocaleString() })}
                  </dd>
                </div>
              </dl>
            </div>
          </LayerCard>
          <Button
            variant="secondary-destructive"
            icon={<Trash />}
            onClick={() => setDeleteOpen(true)}
          >
            {t("editor.deleteArticle")}
          </Button>
        </div>
      </Grid>
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
    </div>
  );
}

import type { Page, PublishStatus, Section } from "@cloudhal/core-contracts";
import {
  ApprovalDialog,
  Button,
  ClipboardText,
  DeleteResource,
  DropdownMenu,
  Empty,
  Grid,
  InlineCopyText,
  Input,
  InputArea,
  LayerCard,
  PageHeader,
  Select,
  SkeletonLine,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { ArrowDown, ArrowUp, FloppyDisk, Plus, Rows, Trash, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Content } from "../components/AppFrame.tsx";
import { EditorCrumbs } from "../components/EditorCrumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { useToast } from "../components/Toast.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { setOptional } from "../lib/util.ts";

const KINDS: Section["kind"][] = ["hero", "richText", "image", "contentList"];

function newSection(kind: Section["kind"], heading: string): Section {
  const id = `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  switch (kind) {
    case "hero":
      return { id, kind, heading };
    case "richText":
      return { id, kind, format: "markdown", body: "" };
    case "image":
      return { id, kind, image: { src: "/assets/image.jpg", alt: "" } };
    case "contentList":
      return { id, kind, collection: "posts", limit: 10, sort: "newest" };
  }
}

function SectionForm({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  const t = useT();
  switch (section.kind) {
    case "hero":
      return (
        <div className="grid gap-3">
          <Input
            label={t("editor.heading")}
            value={section.heading}
            onValueChange={(v) => onChange({ ...section, heading: v })}
          />
          <Input
            label={t("editor.subheading")}
            value={section.subheading ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "subheading", v))}
            required={false}
          />
        </div>
      );
    case "richText":
      return (
        <InputArea
          label={`${t("editor.body")}`}
          value={section.body}
          onValueChange={(v) => onChange({ ...section, body: v })}
          autoResize
          minRows={6}
          maxRows={30}
          className="font-mono"
        />
      );
    case "image":
      return (
        <div className="grid gap-3">
          <Input
            label={t("editor.imageUrl")}
            value={section.image.src}
            onValueChange={(v) => onChange({ ...section, image: { ...section.image, src: v } })}
          />
          <Input
            label={t("editor.altText")}
            value={section.image.alt}
            onValueChange={(v) => onChange({ ...section, image: { ...section.image, alt: v } })}
          />
          <Input
            label={t("editor.caption")}
            value={section.caption ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "caption", v))}
            required={false}
          />
        </div>
      );
    case "contentList":
      return (
        <Grid variant="3up" gap="sm">
          <Input
            label={t("editor.collection")}
            value={section.collection}
            onValueChange={(v) => onChange({ ...section, collection: v })}
          />
          <Input
            label={t("editor.limit")}
            type="number"
            value={String(section.limit)}
            onValueChange={(v) =>
              onChange({ ...section, limit: Math.max(1, Math.min(100, Number(v) || 1)) })
            }
          />
          <Select
            label={t("editor.sort")}
            value={section.sort}
            onValueChange={(v) => onChange({ ...section, sort: v as typeof section.sort })}
            items={{
              newest: t("editor.sortNewest"),
              oldest: t("editor.sortOldest"),
              title: t("editor.sortTitle"),
            }}
          />
        </Grid>
      );
  }
}

export function PageEditorPage() {
  const t = useT();
  const { siteId, pageId } = useParams({ from: "/sites/$siteId/pages/$pageId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const query = useQuery({
    queryKey: ["page", siteId, pageId],
    queryFn: () => api.pages.get(siteId, pageId),
  });
  const [draft, setDraft] = useState<Page | undefined>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: (page: Page) => api.pages.update(page),
    onSuccess: async (saved) => {
      setDraft(saved);
      qc.setQueryData(["page", siteId, pageId], saved);
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      toast.success(t("editor.saved"), t("common.rev", { rev: saved.rev }));
    },
  });
  const remove = useMutation({
    mutationFn: (page: Page) => api.pages.remove(page),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      await navigate({ to: "/sites/$siteId", params: { siteId } });
    },
  });
  if (!draft) {
    return (
      <Content>
        <ErrorBanner error={query.error} />
        <LayerCard className="px-5 py-4">
          <SkeletonLine />
        </LayerCard>
      </Content>
    );
  }
  const updateSection = (i: number, s: Section) =>
    setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const sections = [...draft.sections];
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j] as Section, sections[i] as Section];
    setDraft({ ...draft, sections });
  };
  const addMenu = (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="secondary" icon={<Plus />} />}>
        {t("editor.addSection")}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {KINDS.map((k) => (
          <DropdownMenu.Item
            key={k}
            onClick={() =>
              setDraft({
                ...draft,
                sections: [...draft.sections, newSection(k, t("editor.heading"))],
              })
            }
          >
            {k}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
  return (
    <Content>
      <PageHeader
        breadcrumbs={
          <EditorCrumbs
            siteId={siteId}
            siteName={site.data?.name}
            section={{ label: t("nav.pages"), href: `/sites/${siteId}/pages` }}
            current={draft.title}
            id={draft.id}
          />
        }
        title={draft.title}
        actions={
          <>
            <StatusActions
              status={draft.status}
              busy={save.isPending}
              onChange={(next: PublishStatus) => save.mutate({ ...draft, status: next })}
              onPublish={() => setPublishOpen(true)}
            />
            <Button
              variant="secondary"
              icon={<FloppyDisk />}
              onClick={() => save.mutate(draft)}
              loading={save.isPending}
            >
              {t("common.save")}
            </Button>
          </>
        }
      />
      <ErrorBanner error={save.error ?? remove.error} />
      <Grid variant="2-1" gap="base">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Text variant="heading" as="h2">
              {t("editor.sections")}
            </Text>
            {addMenu}
          </div>
          {draft.sections.length === 0 ? (
            <Empty
              size="sm"
              icon={<Rows size={32} className="text-kumo-inactive" />}
              title={t("editor.noSections")}
              description={t("editor.noSectionsDescription")}
              contents={addMenu}
            />
          ) : (
            draft.sections.map((s, i) => (
              <LayerCard key={s.id} data-section-kind={s.kind}>
                <LayerCard.Secondary className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Text bold as="span">
                      {s.kind}
                    </Text>
                    <InlineCopyText>{s.id}</InlineCopyText>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip
                      content={t("editor.moveUp")}
                      render={
                        <Button
                          variant="ghost"
                          size="xs"
                          shape="square"
                          icon={<ArrowUp />}
                          aria-label={t("editor.moveUp")}
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                        />
                      }
                    />
                    <Tooltip
                      content={t("editor.moveDown")}
                      render={
                        <Button
                          variant="ghost"
                          size="xs"
                          shape="square"
                          icon={<ArrowDown />}
                          aria-label={t("editor.moveDown")}
                          onClick={() => move(i, 1)}
                          disabled={i === draft.sections.length - 1}
                        />
                      }
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      shape="square"
                      aria-label={t("editor.remove")}
                      onClick={() =>
                        setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                </LayerCard.Secondary>
                <LayerCard.Primary>
                  <SectionForm section={s} onChange={(next) => updateSection(i, next)} />
                </LayerCard.Primary>
              </LayerCard>
            ))
          )}
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <LayerCard>
            <LayerCard.Secondary className="flex items-center justify-between px-5 py-3">
              <Text variant="heading" as="h2">
                {t("editor.metadata")}
              </Text>
              <Status status={draft.status} />
            </LayerCard.Secondary>
            <LayerCard.Primary className="grid gap-4 px-5 py-4">
              <Input
                label={t("editor.title")}
                value={draft.title}
                onValueChange={(v) => setDraft({ ...draft, title: v })}
              />
              <Input
                label={t("editor.path")}
                value={draft.path}
                onValueChange={(v) => setDraft({ ...draft, path: v })}
                description={t("editor.pathHint")}
              />
              <div className="grid gap-2">
                <ClipboardText size="sm" text={draft.id} />
                <Text variant="secondary" size="xs">
                  {t("common.rev", { rev: draft.rev })} ·{" "}
                  {t("common.updated", { when: new Date(draft.updatedAt).toLocaleString() })}
                </Text>
              </div>
            </LayerCard.Primary>
          </LayerCard>
          <Button
            variant="secondary-destructive"
            icon={<Trash />}
            onClick={() => setDeleteOpen(true)}
          >
            {t("editor.deletePage")}
          </Button>
        </div>
      </Grid>
      <ApprovalDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("editor.publishPageTitle")}
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
        resourceType={t("editor.page")}
        resourceName={draft.path}
        isDeleting={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(draft);
        }}
      />
    </Content>
  );
}

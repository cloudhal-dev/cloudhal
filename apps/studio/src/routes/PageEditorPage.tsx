import type { Page, PublishStatus, Section } from "@cloudhal/core-contracts";
import {
  ApprovalDialog,
  Badge,
  Button,
  DeleteResource,
  DropdownMenu,
  Empty,
  Grid,
  InlineCopyText,
  Input,
  InputArea,
  LayerCard,
  PageLayout,
  SectionCard,
  Select,
  SkeletonLine,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Copy,
  type Icon,
  Image as ImageIcon,
  ListBullets,
  Plus,
  Rows,
  TextAlignLeft,
  TextHOne,
  Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { BodyEditor } from "../components/BodyEditor.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DraftEditorPreview } from "../components/DraftPreview.tsx";
import {
  DangerZoneCard,
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
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ViewOnlyBanner } from "../components/Gating.tsx";
import { ImageRefField } from "../components/MediaPicker.tsx";
import { MenuDeleteNotice, UsedInMenusCard, useMenuReferences } from "../components/Menus.tsx";
import { ReadersCard } from "../components/Readers.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { PageSeoCard } from "../components/Seo.tsx";
import { Status } from "../components/Status.tsx";
import { StatusActions } from "../components/StatusActions.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { useT } from "../i18n/index.tsx";
import { api, type NewPage } from "../lib/api.ts";
import { cleanSeo, hasErrors, validateImageRef, validateSeo } from "../lib/seo.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import { isDirty, setOptional } from "../lib/util.ts";

const KINDS: Section["kind"][] = ["hero", "richText", "image", "contentList"];
const KIND_ICON: Record<Section["kind"], Icon> = {
  hero: TextHOne,
  richText: TextAlignLeft,
  image: ImageIcon,
  contentList: ListBullets,
};

const sectionId = () => `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const copySuffix = () => `copy-${Date.now().toString(36).slice(-4)}`;

function newSection(kind: Section["kind"], heading: string): Section {
  const id = sectionId();
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

/** A copy of the page as a new draft (fresh section ids, a free path). */
function duplicateOf(page: Page, title: string): NewPage {
  return {
    path: page.path === "/" ? `/${copySuffix()}` : `${page.path}-${copySuffix()}`,
    title,
    locale: page.locale,
    status: "draft",
    sections: page.sections.map((s) => ({ ...s, id: sectionId() })),
    ...(page.seo ? { seo: page.seo } : {}),
    ...(page.metadata ? { metadata: page.metadata } : {}),
  };
}

/** Field rows inside a section card: stacked on phones, side by side when there is room. */
const FIELD_ROW = "items-start gap-x-4 gap-y-5";

/** Where a section's image comes from: the site (media library, primary domain). */
interface MediaContext {
  siteId: string;
  defaultLocale: string;
  host: string | undefined;
}

function SectionForm({
  section,
  onChange,
  media,
  readOnly,
}: {
  section: Section;
  onChange: (s: Section) => void;
  media: MediaContext;
  /** The fieldset turns off native fields; the rich body editor needs telling. */
  readOnly: boolean;
}) {
  const t = useT();
  switch (section.kind) {
    case "hero":
      return (
        <>
          <Input
            label={t("editor.heading")}
            value={section.heading}
            onValueChange={(v) => onChange({ ...section, heading: v })}
            className="w-full"
          />
          <Input
            label={t("editor.subheading")}
            value={section.subheading ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "subheading", v))}
            required={false}
            className="w-full"
          />
          {/* The hero's picture is optional (RFC-0004 §2.2 slot `HeroSection.image`). */}
          <ImageRefField
            siteId={media.siteId}
            defaultLocale={media.defaultLocale}
            image={section.image}
            savedSrc={undefined}
            host={media.host}
            errors={validateImageRef(section.image)}
            showErrors={false}
            onChange={(image) => onChange(setOptional(section, "image", image))}
            testId={`hero-${section.id}`}
            labels={{ empty: t("editor.heroNoImage") }}
          />
        </>
      );
    case "richText":
      return section.format === "markdown" ? (
        <BodyEditor
          siteId={media.siteId}
          defaultLocale={media.defaultLocale}
          host={media.host}
          value={section.body}
          onChange={(v) => onChange({ ...section, body: v })}
          size="sm"
          readOnly={readOnly}
        />
      ) : (
        <InputArea
          label={t("editor.body")}
          value={section.body}
          onValueChange={(v) => onChange({ ...section, body: v })}
          autoResize
          minRows={6}
          maxRows={24}
          className="w-full font-mono"
        />
      );
    case "image":
      return (
        <>
          <ImageRefField
            siteId={media.siteId}
            defaultLocale={media.defaultLocale}
            image={section.image}
            savedSrc={undefined}
            host={media.host}
            errors={validateImageRef(section.image)}
            showErrors={false}
            // The section needs an image: clearing the fields keeps an empty address to fill in.
            onChange={(image) => onChange({ ...section, image: image ?? { src: "", alt: "" } })}
            testId={`image-${section.id}`}
          />
          <Input
            label={t("editor.caption")}
            value={section.caption ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "caption", v))}
            required={false}
            className="w-full"
          />
        </>
      );
    case "contentList":
      return (
        <Grid variant="3up" gap="none" className={FIELD_ROW}>
          <Input
            label={t("editor.collection")}
            value={section.collection}
            onValueChange={(v) => onChange({ ...section, collection: v })}
            className="w-full"
          />
          <Input
            label={t("editor.limit")}
            type="number"
            min={1}
            max={100}
            value={String(section.limit)}
            onValueChange={(v) =>
              onChange({ ...section, limit: Math.max(1, Math.min(100, Number(v) || 1)) })
            }
            className="w-full"
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
            className="w-full"
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
  const query = useQuery({
    queryKey: ["page", siteId, pageId],
    queryFn: () => api.pages.get(siteId, pageId),
  });
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const host = primaryHostname(site.data?.domains ?? []);
  const [draft, setDraft] = useState<Page | undefined>();
  const [showErrors, setShowErrors] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Menus linking here (RFC-0003): named in the delete dialog, listed in the "In menus" card.
  const menuRefs = useMenuReferences(siteId, { kind: "page", id: pageId });
  const [removeIndex, setRemoveIndex] = useState<number | undefined>();
  const [previewVisible, setPreviewVisible] = usePreviewVisible();
  // A release holds this page (RFC-0008 §6.2): it publishes as pinned, so the form is locked.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const dirty = isDirty(draft, query.data);
  // Pages are structure: Editors and above; others read them (RFC-0005 §2.2, DESIGN.md §2s).
  const readOnlyReason = useGate("pages.write").reason;
  const lockedReason = locked ? t("editor.locked") : undefined;
  const save = useMutation({
    mutationFn: (page: Page) => api.pages.update(cleanSeo(page)),
    onSuccess: async (saved) => {
      setDraft(saved);
      setShowErrors(false);
      qc.setQueryData(["page", siteId, pageId], saved);
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      toast.success(t("editor.saved"), t("common.rev", { rev: saved.rev }));
    },
  });
  const duplicate = useMutation({
    mutationFn: (page: Page) =>
      api.pages.create(siteId, duplicateOf(page, t("editor.copyTitle", { title: page.title }))),
    onSuccess: async ({ page }) => {
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      toast.success(t("editor.duplicated"), page.path);
      await navigate({ to: "/sites/$siteId/pages/$pageId", params: { siteId, pageId: page.id } });
    },
  });
  const remove = useMutation({
    mutationFn: (page: Page) => api.pages.remove(page),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      await navigate({ to: "/sites/$siteId/pages", params: { siteId } });
    },
  });
  const pagesCrumb = { label: t("pageHeaders.pages.title"), href: `/sites/${siteId}/pages` };

  if (!draft) {
    return (
      <PageLayout
        crumbs={<SiteCrumbs siteId={siteId} trail={[pagesCrumb, { label: undefined }]} />}
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

  const seoErrors = validateSeo(draft.seo);
  /** Every save path checks the SEO fields first; an invalid canonical never leaves Studio. */
  const valid = () => {
    if (!hasErrors(seoErrors)) return true;
    setShowErrors(true);
    toast.error(t("seo.fixErrors"));
    document.getElementById("seo")?.scrollIntoView?.({ block: "center" });
    return false;
  };
  const updateSection = (i: number, s: Section) =>
    setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const sections = [...draft.sections];
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j] as Section, sections[i] as Section];
    setDraft({ ...draft, sections });
  };
  const kindLabel = (k: Section["kind"]) => t(`editor.sectionKinds.${k}`);
  const toRemove = removeIndex === undefined ? undefined : draft.sections[removeIndex];
  const addMenu = (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="secondary" icon={<Plus />} />}>
        {t("editor.addSection")}
        <CaretDown size={12} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {KINDS.map((k) => (
          <DropdownMenu.Item
            key={k}
            icon={KIND_ICON[k]}
            onClick={() =>
              setDraft({
                ...draft,
                sections: [...draft.sections, newSection(k, t("editor.heading"))],
              })
            }
          >
            {kindLabel(k)}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
  const iconButton = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip
      content={label}
      render={
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={icon}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        />
      }
    />
  );

  return (
    <PageLayout
      crumbs={
        <SiteCrumbs siteId={siteId} trail={[pagesCrumb, { label: draft.title }]} copy={draft.id} />
      }
      title={draft.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Status status={draft.status} />
          <Text variant="mono-secondary" as="span">
            {draft.path}
          </Text>
        </span>
      }
      actions={
        <>
          <PreviewToggle visible={previewVisible} onChange={setPreviewVisible} />
          <StatusActions
            status={draft.status}
            busy={save.isPending}
            onChange={(next: PublishStatus) => {
              if (valid()) save.mutate({ ...draft, status: next });
            }}
            onPublish={() => {
              if (valid()) setPublishOpen(true);
            }}
            readOnlyReason={readOnlyReason ?? lockedReason}
            menu={
              readOnlyReason ? (
                // Disabled items take no pointer events, so the tooltip hangs on a wrapper.
                <Tooltip content={readOnlyReason} side="left" render={<div />}>
                  <DropdownMenu.Item icon={Copy} disabled>
                    {t("editor.duplicate")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item icon={Trash} variant="danger" disabled>
                    {t("editor.deletePage")}
                  </DropdownMenu.Item>
                </Tooltip>
              ) : (
                <>
                  <DropdownMenu.Item icon={Copy} onClick={() => duplicate.mutate(draft)}>
                    {t("editor.duplicate")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    icon={Trash}
                    variant="danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("editor.deletePage")}
                  </DropdownMenu.Item>
                </>
              )
            }
          />
          <ScheduleAction
            siteId={siteId}
            node={{ id: draft.id, kind: "page", title: draft.title, status: draft.status }}
            dirty={dirty}
            prepare={() =>
              // Scheduling publishes it at that time: mark it Published and save what is unsaved.
              dirty || draft.status !== "published"
                ? save.mutateAsync({ ...draft, status: "published" })
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
      <ViewOnlyBanner reason={readOnlyReason} />
      <ScheduleLock siteId={siteId} nodeId={draft.id} dirty={dirty} onLockChange={setLocked} />
      <EditorLayout
        previewVisible={previewVisible}
        preview={
          <DraftEditorPreview
            queryKey={["page-preview", siteId, pageId]}
            src={api.preview.page(siteId, pageId)}
            rev={draft.rev}
            name={draft.path}
            dirty={dirty}
            input={{
              id: draft.id,
              siteId: draft.siteId,
              title: draft.title,
              seo: draft.seo,
              sections: draft.sections,
            }}
            render={api.pages.previewDraft}
          />
        }
        main={
          // Read-only for roles below Editor: one disabled fieldset turns every field off (§2s).
          <fieldset
            disabled={readOnlyReason !== undefined || locked}
            className="grid min-w-0 content-start gap-6"
            data-read-only={readOnlyReason || locked ? "true" : undefined}
          >
            <SectionCard title={t("editor.page")}>
              <Grid variant="2up" gap="none" className={FIELD_ROW}>
                <Input
                  label={t("editor.title")}
                  value={draft.title}
                  onValueChange={(v) => setDraft({ ...draft, title: v })}
                  className="w-full"
                />
                <Input
                  label={t("editor.path")}
                  value={draft.path}
                  onValueChange={(v) => setDraft({ ...draft, path: v })}
                  description={t("editor.pathHint")}
                  className="w-full font-mono"
                />
              </Grid>
            </SectionCard>
            <PageSeoCard
              page={draft}
              siteName={site.data?.name ?? ""}
              host={host}
              errors={seoErrors}
              showErrors={showErrors}
              onChange={setDraft}
            />
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Text variant="heading" as="h2">
                    {t("editor.sections")}
                  </Text>
                  <Badge variant="secondary">{draft.sections.length}</Badge>
                </span>
                {draft.sections.length > 0 && addMenu}
              </div>
              {draft.sections.length === 0 ? (
                <Empty
                  icon={<Rows size={48} className="text-kumo-inactive" />}
                  title={t("editor.noSections")}
                  description={t("editor.noSectionsDescription")}
                  contents={addMenu}
                />
              ) : (
                draft.sections.map((s, i) => {
                  const KindIcon = KIND_ICON[s.kind];
                  return (
                    <SectionCard
                      key={s.id}
                      as="h3"
                      title={kindLabel(s.kind)}
                      icon={<KindIcon size={16} />}
                      actions={
                        <>
                          <span className="hidden sm:inline-flex">
                            <InlineCopyText>{s.id}</InlineCopyText>
                          </span>
                          <span className="flex items-center gap-1">
                            {iconButton(
                              t("editor.moveUp"),
                              <ArrowUp />,
                              () => move(i, -1),
                              i === 0,
                            )}
                            {iconButton(
                              t("editor.moveDown"),
                              <ArrowDown />,
                              () => move(i, 1),
                              i === draft.sections.length - 1,
                            )}
                            {iconButton(t("editor.remove"), <Trash />, () => setRemoveIndex(i))}
                          </span>
                        </>
                      }
                    >
                      <SectionForm
                        section={s}
                        onChange={(next) => updateSection(i, next)}
                        media={{
                          siteId,
                          defaultLocale: site.data?.defaultLocale ?? draft.locale,
                          host,
                        }}
                        readOnly={readOnlyReason !== undefined || locked}
                      />
                    </SectionCard>
                  );
                })
              )}
            </div>
          </fieldset>
        }
        aside={
          <>
            <ScheduleAside
              siteId={siteId}
              nodeId={draft.id}
              kind="page"
              availability={draft.availability}
              onChange={(availability) =>
                setDraft(setOptional(draft, "availability", availability))
              }
              saveError={save.error}
              disabled={readOnlyReason !== undefined || locked}
            />
            <ReadersCard siteId={siteId} node={query.data ?? draft} kind="page" />
            <UsedInMenusCard siteId={siteId} kind="page" id={draft.id} />
            <DetailsCard
              rows={[
                {
                  label: t("editor.id"),
                  value: <InlineCopyText>{draft.id}</InlineCopyText>,
                },
                {
                  label: t("editor.locale"),
                  value: <Text as="span">{draft.locale}</Text>,
                },
                {
                  label: t("editor.revision"),
                  value: <Text as="span">{draft.rev}</Text>,
                },
                {
                  label: t("editor.updatedAt"),
                  value: <RelativeTime iso={draft.updatedAt} size="base" />,
                },
              ]}
            />
            <DangerZoneCard
              title={t("editor.deletePageTitle")}
              description={t("editor.deletePageHint")}
              actionLabel={t("editor.deletePage")}
              onAction={() => setDeleteOpen(true)}
              disabledReason={readOnlyReason}
            />
          </>
        }
      />
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
      <ConfirmDialog
        open={toRemove !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoveIndex(undefined);
        }}
        title={t("editor.removeSectionTitle")}
        description={t("editor.removeSectionDescription", {
          kind: toRemove ? kindLabel(toRemove.kind) : "",
        })}
        confirmLabel={t("editor.remove")}
        onConfirm={() => {
          if (removeIndex !== undefined)
            setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== removeIndex) });
          setRemoveIndex(undefined);
        }}
      />
      <DeleteResource
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        resourceType={t("editor.page")}
        resourceName={draft.path}
        notice={<MenuDeleteNotice refs={menuRefs.data} kind="page" />}
        isDeleting={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(draft);
        }}
      />
    </PageLayout>
  );
}

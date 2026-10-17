import { Grid, Input, LayerCard, PageLayout, SectionCard, SkeletonLine, Text } from "@cloudhal/ui";
import { useParams } from "@tanstack/react-router";
import { FocusSaveContext } from "../components/BodyEditor.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DraftEditorPreview } from "../components/DraftPreview.tsx";
import { EditorLayout } from "../components/EditorLayout.tsx";
import { isScheduleError, ScheduleLock } from "../components/EditorSchedule.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ViewOnlyBanner } from "../components/Gating.tsx";
import { PageEditorActions } from "../components/page-editor/PageEditorActions.tsx";
import { PageEditorAside } from "../components/page-editor/PageEditorAside.tsx";
import { PageEditorDialogs } from "../components/page-editor/PageEditorDialogs.tsx";
import { SectionList } from "../components/page-editor/SectionList.tsx";
import { FIELD_ROW } from "../components/page-editor/sections.ts";
import { usePageEditor } from "../components/page-editor/usePageEditor.ts";
import { PageSeoCard } from "../components/Seo.tsx";
import { Status } from "../components/Status.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { hasErrors, validateSeo } from "../lib/seo.ts";

export function PageEditorPage() {
  const t = useT();
  const { siteId, pageId } = useParams({ from: "/sites/$siteId/pages/$pageId" });
  const ed = usePageEditor(siteId, pageId);
  const { draft, setDraft, save, readOnlyReason, locked, dirty, query } = ed;
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
    ed.setShowErrors(true);
    ed.toast.error(t("seo.fixErrors"));
    document.getElementById("seo")?.scrollIntoView?.({ block: "center" });
    return false;
  };
  const readOnly = readOnlyReason !== undefined || locked;

  return (
    <FocusSaveContext.Provider
      value={{
        dirty,
        saving: save.isPending,
        disabled: readOnly,
        onSave: () => {
          if (valid()) save.mutate(draft);
        },
      }}
    >
      <PageLayout
        crumbs={
          <SiteCrumbs
            siteId={siteId}
            trail={[pagesCrumb, { label: draft.title }]}
            copy={draft.id}
          />
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
          <PageEditorActions ed={ed} draft={draft} siteId={siteId} pageId={pageId} valid={valid} />
        }
      >
        <ErrorBanner
          error={
            (isScheduleError(save.error) ? undefined : save.error) ??
            ed.remove.error ??
            ed.duplicate.error
          }
        />
        <ViewOnlyBanner reason={readOnlyReason} />
        <ScheduleLock siteId={siteId} nodeId={draft.id} dirty={dirty} onLockChange={ed.setLocked} />
        <EditorLayout
          previewVisible={ed.previewVisible}
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
              disabled={readOnly}
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
                siteName={ed.site.data?.name ?? ""}
                host={ed.host}
                errors={seoErrors}
                showErrors={ed.showErrors}
                onChange={setDraft}
              />
              <SectionList ed={ed} draft={draft} siteId={siteId} readOnly={readOnly} />
            </fieldset>
          }
          aside={<PageEditorAside ed={ed} draft={draft} siteId={siteId} />}
        />
        <PageEditorDialogs ed={ed} draft={draft} />
      </PageLayout>
    </FocusSaveContext.Provider>
  );
}

/** The page editor's header actions: preview, View live, Build live, status, schedule and Save. */
import type { Page, PublishStatus } from "@cloudhal/core-contracts";
import { Button, DropdownMenu, LinkButton, Tooltip } from "@cloudhal/ui";
import { Copy, Lightning, Trash } from "@phosphor-icons/react";
import { useT } from "../../i18n/index.tsx";
import { PreviewToggle } from "../EditorLayout.tsx";
import { ScheduleAction } from "../EditorSchedule.tsx";
import { ViewLiveButton } from "../LiveAddress.tsx";
import { StatusActions } from "../StatusActions.tsx";
import type { PageEditorState } from "./usePageEditor.ts";

export function PageEditorActions({
  ed,
  draft,
  siteId,
  pageId,
  valid,
}: {
  ed: PageEditorState;
  draft: Page;
  siteId: string;
  pageId: string;
  /** Checks the SEO fields first; false (and the errors shown) when they need fixing. */
  valid: () => boolean;
}) {
  const t = useT();
  const { save, readOnlyReason, lockedReason, locked, dirty, setPublishOpen } = ed;
  return (
    <>
      <PreviewToggle visible={ed.previewVisible} onChange={ed.setPreviewVisible} />
      <ViewLiveButton siteId={siteId} item={draft} />
      <Tooltip content={t("editor.buildLiveHint")}>
        <LinkButton
          href={`/sites/${siteId}/pages/${pageId}/build`}
          variant="secondary"
          icon={Lightning}
          data-testid="build-live"
        >
          {t("editor.buildLive")}
        </LinkButton>
      </Tooltip>
      <StatusActions
        status={draft.status}
        directPublish
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
              <DropdownMenu.Item icon={Copy} onClick={() => ed.duplicate.mutate(draft)}>
                {t("editor.duplicate")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                icon={Trash}
                variant="danger"
                onClick={() => ed.setDeleteOpen(true)}
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
  );
}

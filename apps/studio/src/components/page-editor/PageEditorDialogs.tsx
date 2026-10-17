/** The page editor's dialogs: publish approval, removing a section, deleting the page. */
import type { Page } from "@cloudhal/core-contracts";
import { ApprovalDialog, DeleteResource } from "@cloudhal/ui";
import { useT } from "../../i18n/index.tsx";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { deleteResourceProps } from "../deleteLabels.ts";
import { MenuDeleteNotice } from "../Menus.tsx";
import type { PageEditorState } from "./usePageEditor.ts";

export function PageEditorDialogs({ ed, draft }: { ed: PageEditorState; draft: Page }) {
  const t = useT();
  const { save, remove, removeIndex, setRemoveIndex, setDraft } = ed;
  const toRemove = removeIndex === undefined ? undefined : draft.sections[removeIndex];
  return (
    <>
      <ApprovalDialog
        open={ed.publishOpen}
        onOpenChange={ed.setPublishOpen}
        title={t("editor.publishPageTitle")}
        confirmLabel={t("common.publish")}
        cancelLabel={t("common.cancel")}
        busy={save.isPending}
        onConfirm={async () => {
          await save.mutateAsync({ ...draft, status: "published" });
          ed.setPublishOpen(false);
        }}
      />
      <ConfirmDialog
        open={toRemove !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoveIndex(undefined);
        }}
        title={t("editor.removeSectionTitle")}
        description={t("editor.removeSectionDescription", {
          kind: toRemove ? t(`editor.sectionKinds.${toRemove.kind}`) : "",
        })}
        confirmLabel={t("editor.remove")}
        onConfirm={() => {
          if (removeIndex !== undefined)
            setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== removeIndex) });
          setRemoveIndex(undefined);
        }}
      />
      <DeleteResource
        open={ed.deleteOpen}
        onOpenChange={ed.setDeleteOpen}
        {...deleteResourceProps(t, t("editor.page"))}
        resourceName={draft.path}
        notice={<MenuDeleteNotice refs={ed.menuRefs.data} kind="page" />}
        isDeleting={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(draft);
        }}
      />
    </>
  );
}

/** The page editor's side column: schedule, readers, menus, details and the danger zone. */
import type { Page } from "@cloudhal/core-contracts";
import { InlineCopyText, Text } from "@cloudhal/ui";
import { useT } from "../../i18n/index.tsx";
import { setOptional } from "../../lib/util.ts";
import { DangerZoneCard, DetailsCard } from "../EditorLayout.tsx";
import { ScheduleAside } from "../EditorSchedule.tsx";
import { UsedInMenusCard } from "../Menus.tsx";
import { ReadersCard } from "../Readers.tsx";
import { RelativeTime } from "../RelativeTime.tsx";
import { TranslationsCard } from "../Translations.tsx";
import type { PageEditorState } from "./usePageEditor.ts";

export function PageEditorAside({
  ed,
  draft,
  siteId,
}: {
  ed: PageEditorState;
  draft: Page;
  siteId: string;
}) {
  const t = useT();
  const { readOnlyReason, locked } = ed;
  return (
    <>
      <ScheduleAside
        siteId={siteId}
        nodeId={draft.id}
        kind="page"
        availability={draft.availability}
        onChange={(availability) => ed.setDraft(setOptional(draft, "availability", availability))}
        saveError={ed.save.error}
        disabled={readOnlyReason !== undefined || locked}
      />
      <ReadersCard siteId={siteId} node={ed.query.data ?? draft} kind="page" />
      <UsedInMenusCard siteId={siteId} kind="page" id={draft.id} />
      <TranslationsCard siteId={siteId} node={ed.query.data ?? draft} dirty={ed.dirty} />
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
        onAction={() => ed.setDeleteOpen(true)}
        disabledReason={readOnlyReason}
      />
    </>
  );
}

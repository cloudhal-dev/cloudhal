/** The page editor's data: the page and site, the draft, locks and gates, and its mutations. */
import type { Page } from "@cloudhal/core-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useT } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { cleanSeo } from "../../lib/seo.ts";
import { primaryHostname } from "../../lib/site-settings.ts";
import { isDirty } from "../../lib/util.ts";
import { useBlockTitle, useBlockTypes } from "../BlockSection.tsx";
import { usePreviewVisible } from "../EditorLayout.tsx";
import { useMenuReferences } from "../Menus.tsx";
import { useToast } from "../Toast.ts";
import { useSavedToast } from "../useLiveSite.ts";
import { useGate } from "../useMe.ts";
import { duplicateOf } from "./sections.ts";

export function usePageEditor(siteId: string, pageId: string) {
  const t = useT();
  const blockTypes = useBlockTypes(siteId);
  const blockTitle = useBlockTitle(blockTypes);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const savedToast = useSavedToast();
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
      savedToast(saved, query.data?.status);
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
  return {
    blockTypes,
    blockTitle,
    toast,
    query,
    site,
    host,
    draft,
    setDraft,
    showErrors,
    setShowErrors,
    publishOpen,
    setPublishOpen,
    deleteOpen,
    setDeleteOpen,
    menuRefs,
    removeIndex,
    setRemoveIndex,
    previewVisible,
    setPreviewVisible,
    locked,
    setLocked,
    dirty,
    readOnlyReason,
    lockedReason,
    save,
    duplicate,
    remove,
  };
}

export type PageEditorState = ReturnType<typeof usePageEditor>;

/**
 * Publishing and unpublishing one page outside its editor (RFC-0035): the Pages list's row items
 * and their approval, and the site Publish dialog's note about pages it leaves out.
 */
import type { Page } from "@cloudhal/core-contracts";
import { ApprovalDialog, Banner, DirectionalIcon, DropdownMenu } from "@cloudhal/ui";
import { ArrowCounterClockwise, ArrowRight, Info, RocketLaunch } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { useToast } from "./Toast.ts";

/** Pages a site publish leaves off the live site: drafts and pages in review. */
export function unpublishedPages(pages: readonly Page[]): Page[] {
  return pages.filter((p) => p.status === "draft" || p.status === "review");
}

/**
 * A page's status from the Pages list: `items(page)` are the row menu's Publish / Unpublish
 * entries (disabled with `reason` when the person may not change pages), `dialog` the approval
 * Publish opens. Unpublishing needs no approval, as in the editor.
 */
export function usePageStatusActions(siteId: string, reason: string | undefined) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [toPublish, setToPublish] = useState<Page | undefined>();
  const change = useMutation({
    mutationFn: (page: Page) => api.pages.update(page),
    onSuccess: async (saved) => {
      setToPublish(undefined);
      await qc.invalidateQueries({ queryKey: ["pages", siteId] });
      await qc.invalidateQueries({ queryKey: ["page", siteId, saved.id] });
      toast.success(
        saved.status === "published" ? t("pageStatus.published") : t("pageStatus.unpublished"),
      );
    },
    onError: (e) => toast.error(t("pageStatus.failed"), apiErrorText(t, e)),
  });
  const items = (page: Page) =>
    page.status === "published" ? (
      <DropdownMenu.Item
        icon={ArrowCounterClockwise}
        disabled={reason !== undefined || change.isPending}
        onClick={() => change.mutate({ ...page, status: "draft" })}
      >
        {t("editor.unpublish")}
      </DropdownMenu.Item>
    ) : page.status === "archived" ? null : (
      <DropdownMenu.Item
        icon={RocketLaunch}
        disabled={reason !== undefined}
        onClick={() => setToPublish(page)}
        data-testid="row-publish"
      >
        {t("common.publish")}
      </DropdownMenu.Item>
    );
  const dialog = (
    <ApprovalDialog
      open={toPublish !== undefined}
      onOpenChange={(open) => !open && setToPublish(undefined)}
      title={t("pageStatus.publishTitle", { title: toPublish?.title ?? "" })}
      description={t("editor.publishPageDescription")}
      confirmLabel={t("common.publish")}
      cancelLabel={t("common.cancel")}
      busy={change.isPending}
      onConfirm={async () => {
        if (toPublish) await change.mutateAsync({ ...toPublish, status: "published" });
      }}
    />
  );
  return { items, dialog };
}

/**
 * The site Publish dialog's note (RFC-0035): a publish takes each page as its own status says, so
 * drafts — new translations among them — stay off the live site. Reads the pages only while open.
 */
export function UnpublishedPagesNote({
  siteId,
  open,
  onNavigate,
}: {
  siteId: string;
  open: boolean;
  onNavigate: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: open,
  });
  const count = unpublishedPages(pages.data ?? []).length;
  if (count === 0) return null;
  return (
    <Banner
      variant="secondary"
      size="sm"
      icon={<Info />}
      title={t("pageStatus.leftOut", { count })}
      description={t("pageStatus.leftOutDescription")}
      action={
        <Banner.Action
          variant="secondary"
          icon={<DirectionalIcon icon={ArrowRight} />}
          onClick={() => {
            onNavigate();
            void navigate({ to: "/sites/$siteId/pages", params: { siteId } });
          }}
        >
          {t("pageStatus.review")}
        </Banner.Action>
      }
      data-testid="unpublished-pages"
    />
  );
}

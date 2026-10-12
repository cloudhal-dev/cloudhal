import { ApprovalDialog, Button, ButtonGroup, DropdownMenu } from "@cloudhal/ui";
import {
  CalendarDots,
  Camera,
  CaretDown,
  PaperPlaneTilt,
  RocketLaunch,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { usePublishMode, usePublishSite } from "./Publish.tsx";
import { useToast } from "./Toast.ts";

/**
 * The site surface's Publish split button (top bar, every site screen): Publish → `ApprovalDialog`
 * → snapshot + publish; the menu takes a snapshot without publishing (DESIGN.md §1, §2d). It follows
 * the person's role (§2s): an Author whose changes include others' work sends "Request publish"
 * (the server files a request an Editor approves, 202); a Contributor sees Publish disabled with
 * the reason, since an Editor publishes their work.
 */
export function SitePublish({ siteId }: { siteId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { mode, reason } = usePublishMode(siteId);
  const publish = usePublishSite(siteId, { onDone: () => setOpen(false) });
  const snapshot = useMutation({
    mutationFn: () => api.snapshots.create(siteId, { label: t("snapshots.fromStudio") }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      toast.success(t("snapshots.created"));
    },
    onError: (e) => toast.error(t("snapshots.failed"), e instanceof Error ? e.message : String(e)),
  });
  const request = mode === "request";
  return (
    <>
      <ButtonGroup aria-label={t("site.publish")}>
        <Button
          variant="primary"
          size="sm"
          icon={request ? <PaperPlaneTilt /> : <RocketLaunch />}
          onClick={() => setOpen(true)}
          loading={publish.isPending || snapshot.isPending}
          disabled={mode === "none"}
          title={reason}
          data-publish-mode={mode}
        >
          {request ? t("publishing.request") : t("site.publish")}
        </Button>
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="primary"
                size="sm"
                shape="square"
                aria-label={t("common.more")}
                icon={<CaretDown />}
              />
            }
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={Camera} onClick={() => snapshot.mutate()}>
              {t("commands.createSnapshot")}
            </DropdownMenu.Item>
            {/* RFC-0008 §15.1: "Schedule…" opens the calendar's lazily loaded dialog. */}
            <DropdownMenu.Item
              icon={CalendarDots}
              onClick={() =>
                void navigate({
                  to: "/sites/$siteId/schedules",
                  params: { siteId },
                  search: { new: "publish" },
                })
              }
            >
              {t("commands.newSchedule")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </ButtonGroup>
      <ApprovalDialog
        open={open}
        onOpenChange={setOpen}
        title={request ? t("publishing.requestTitle") : t("snapshots.publishTitle")}
        description={request ? t("publishing.requestDescription") : t("site.publishDescription")}
        confirmLabel={request ? t("publishing.sendRequest") : t("common.publish")}
        cancelLabel={t("common.cancel")}
        busy={publish.isPending}
        onConfirm={() => publish.mutate({ label: t("snapshots.publishedFromStudio") })}
      />
    </>
  );
}

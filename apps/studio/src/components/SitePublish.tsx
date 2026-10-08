import { ApprovalDialog, Button, ButtonGroup, DropdownMenu } from "@cloudhal/ui";
import { Camera, CaretDown, RocketLaunch } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { useToast } from "./Toast.ts";

/**
 * The site surface's Publish split button (top bar, every site screen): Publish → `ApprovalDialog`
 * → snapshot + publish; the menu takes a snapshot without publishing (DESIGN.md §1, §2d).
 */
export function SitePublish({ siteId }: { siteId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const snapshot = useMutation({
    mutationFn: (publish: boolean) =>
      api.snapshots.create(siteId, {
        label: publish ? t("snapshots.publishedFromStudio") : t("snapshots.fromStudio"),
        publish,
      }),
    onSuccess: async (_r, publish) => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      setOpen(false);
      toast.success(publish ? t("snapshots.publishedSnapshot") : t("snapshots.created"));
    },
    onError: (e) => toast.error(t("snapshots.failed"), e instanceof Error ? e.message : String(e)),
  });
  return (
    <>
      <ButtonGroup aria-label={t("site.publish")}>
        <Button
          variant="primary"
          size="sm"
          icon={<RocketLaunch />}
          onClick={() => setOpen(true)}
          loading={snapshot.isPending}
        >
          {t("site.publish")}
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
            <DropdownMenu.Item icon={Camera} onClick={() => snapshot.mutate(false)}>
              {t("commands.createSnapshot")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </ButtonGroup>
      <ApprovalDialog
        open={open}
        onOpenChange={setOpen}
        title={t("snapshots.publishTitle")}
        description={t("site.publishDescription")}
        confirmLabel={t("common.publish")}
        cancelLabel={t("common.cancel")}
        busy={snapshot.isPending}
        onConfirm={() => snapshot.mutate(true)}
      />
    </>
  );
}

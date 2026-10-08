import {
  ApprovalDialog,
  Breadcrumbs,
  Button,
  ButtonGroup,
  DropdownMenu,
  PageHeader,
} from "@cloudhal/ui";
import { Camera, CaretDown, House, RocketLaunch } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Content } from "../components/AppFrame.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { useToast } from "../components/Toast.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

const TABS = ["overview", "pages", "articles", "snapshots", "activity", "settings"] as const;

/** Site-level header with tabs (DESIGN.md §2b); the tab routes render in the outlet. */
export function SiteTabsLayout() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const [publishOpen, setPublishOpen] = useState(false);
  const base = `/sites/${siteId}`;
  // Approvals live under the Activity tab (segmented "Activity | Approvals" inside it).
  const current = pathname.startsWith(`${base}/approvals`)
    ? "activity"
    : (TABS.find((tab) => tab !== "overview" && pathname.startsWith(`${base}/${tab}`)) ??
      "overview");

  const snapshot = useMutation({
    mutationFn: (publish: boolean) =>
      api.snapshots.create(siteId, {
        label: publish ? t("snapshots.publishedFromStudio") : t("snapshots.fromStudio"),
        publish,
      }),
    onSuccess: async (_r, publish) => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      setPublishOpen(false);
      toast.success(publish ? t("snapshots.publishedSnapshot") : t("snapshots.created"));
    },
    onError: (e) => toast.error(t("snapshots.failed"), e instanceof Error ? e.message : String(e)),
  });

  return (
    <Content>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs>
            <Breadcrumbs.Link href="/sites" icon={<House size={16} />}>
              {t("sites.title")}
            </Breadcrumbs.Link>
            <Breadcrumbs.Separator />
            <Breadcrumbs.Current loading={site.isPending}>{site.data?.name}</Breadcrumbs.Current>
            <Breadcrumbs.Clipboard text={siteId} />
          </Breadcrumbs>
        }
        title={site.data?.name ?? "…"}
        description={
          site.data
            ? t("site.description", { slug: site.data.slug, locale: site.data.defaultLocale })
            : undefined
        }
        tabs={TABS.map((tab) => ({ value: tab, label: t(`site.tabs.${tab}`) }))}
        tab={current}
        onValueChange={(v) => navigate({ to: v === "overview" ? base : `${base}/${v}` })}
      >
        <ButtonGroup aria-label={t("site.publish")}>
          <Button
            variant="primary"
            icon={<RocketLaunch />}
            onClick={() => setPublishOpen(true)}
            loading={snapshot.isPending}
          >
            {t("site.publish")}
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={<Button variant="primary" shape="square" aria-label={t("common.more")} />}
            >
              <CaretDown />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item icon={Camera} onClick={() => snapshot.mutate(false)}>
                {t("commands.createSnapshot")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </ButtonGroup>
      </PageHeader>
      <ErrorBanner error={site.error} />
      <Outlet />
      <ApprovalDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("snapshots.publishTitle")}
        description={t("site.publishDescription")}
        confirmLabel={t("common.publish")}
        cancelLabel={t("common.cancel")}
        busy={snapshot.isPending}
        onConfirm={() => snapshot.mutate(true)}
      />
    </Content>
  );
}

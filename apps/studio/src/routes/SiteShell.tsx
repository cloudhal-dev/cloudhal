import { DropdownMenu, Sidebar, SidebarSwitcher } from "@cloudhal/ui";
import {
  Article,
  CalendarDots,
  Camera,
  ChartLine,
  ChatsCircle,
  ClockCounterClockwise,
  FileText,
  GearSix,
  Globe,
  HandPalm,
  House,
  Images,
  Robot,
  Signpost,
  SquaresFour,
  Tag,
  TreeStructure,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { AppFrame } from "../components/AppFrame.tsx";
import { SitePublish } from "../components/SitePublish.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { useCan } from "../components/useMe.ts";
import { useNotifications } from "../components/useNotifications.ts";
import { usePendingApprovals } from "../components/usePendingApprovals.ts";
import { useSitePalette } from "../components/useSitePalette.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { pendingCommentsCount } from "../lib/comments-shell.ts";

/** Site surface: sidebar scoped to one site, with the site switcher in the header. */
export function SiteShell() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
  });
  // Polls while the site surface is open; drives the sidebar badge (and the overview banner).
  const approvals = usePendingApprovals(siteId);
  const pendingApprovals = approvals.data?.length ?? 0;
  // Proposed terms wait for a person (RFC-0002 §8): their count rides on the sidebar item.
  const taxonomy = useTaxonomyData(siteId);
  const proposedTerms = taxonomy.items.filter((i) => i.term.status === "proposed").length;
  // Reader comments (RFC-0007 §14): on deployments that have them, for people who may read them;
  // the pending count rides on the bell's digest (own articles' count for Authors).
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const canReadComments = useCan("comments.read");
  const comments = instance.data?.features.comments?.available === true && canReadComments;
  const notifications = useNotifications();
  const pendingComments = pendingCommentsCount(notifications.data?.items, siteId);
  // Releases needing someone (RFC-0008 §15.1): conflict, missed, failed, approval due — from the
  // bell's own poll, so the badge costs no request of its own.
  const scheduleAttention = (notifications.data?.items ?? []).filter(
    (i) =>
      "releaseId" in i &&
      i.siteId === siteId &&
      (i.kind === "schedule-conflict" ||
        i.kind === "schedule-missed" ||
        i.kind === "schedule-failed" ||
        i.kind === "schedule-approval-due"),
  ).length;
  const base = `/sites/${siteId}`;
  const is = (path: string, exact = false) =>
    exact ? pathname === path : pathname.startsWith(path);

  // The palette: the site's commands and content search; Publish opens the top bar's confirmation.
  const palette = useSitePalette({
    siteId,
    defaultLocale: site.data?.defaultLocale,
    comments,
  });

  return (
    <AppFrame
      actions={
        <SitePublish
          siteId={siteId}
          open={palette.publishOpen}
          onOpenChange={palette.setPublishOpen}
        />
      }
      search={palette.search}
      loading={site.isPending}
      switcher={
        <SidebarSwitcher
          ariaLabel={t("nav.switchSite")}
          current={{ id: siteId, name: site.data?.name ?? "…", icon: Globe }}
          items={(sites.data ?? []).map((s) => ({ id: s.id, name: s.name, icon: Globe }))}
          onSelect={(item) => navigate({ to: "/sites/$siteId", params: { siteId: item.id } })}
          extra={
            <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
              {t("nav.allSites")}
            </DropdownMenu.Item>
          }
        />
      }
      nav={
        <>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.overview")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={House}
                href={base}
                active={is(base, true)}
                tooltip={t("nav.home")}
              >
                {t("nav.home")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={ChartLine}
                href={`${base}/analytics`}
                active={is(`${base}/analytics`)}
                tooltip={t("nav.analytics")}
              >
                {t("nav.analytics")}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.content")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={FileText}
                href={`${base}/pages`}
                active={is(`${base}/pages`)}
                tooltip={t("nav.pages")}
              >
                {t("nav.pages")}
                <Sidebar.MenuBadge>{pages.data?.length ?? 0}</Sidebar.MenuBadge>
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Article}
                href={`${base}/articles`}
                active={is(`${base}/articles`)}
                tooltip={t("nav.articles")}
              >
                {t("nav.articles")}
                <Sidebar.MenuBadge>{entries.data?.length ?? 0}</Sidebar.MenuBadge>
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Tag}
                href={`${base}/taxonomy`}
                active={is(`${base}/taxonomy`)}
                tooltip={t("nav.taxonomy")}
              >
                {t("nav.taxonomy")}
                {proposedTerms > 0 && <Sidebar.MenuBadge>{proposedTerms}</Sidebar.MenuBadge>}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Images}
                href={`${base}/media`}
                active={is(`${base}/media`)}
                tooltip={t("nav.media")}
              >
                {t("nav.media")}
              </Sidebar.MenuButton>
              {comments && (
                <Sidebar.MenuButton
                  icon={ChatsCircle}
                  href={`${base}/comments`}
                  active={is(`${base}/comments`) || is(`${base}/commenters`)}
                  tooltip={t("nav.comments")}
                >
                  {t("nav.comments")}
                  {pendingComments > 0 && <Sidebar.MenuBadge>{pendingComments}</Sidebar.MenuBadge>}
                </Sidebar.MenuButton>
              )}
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.history")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={Camera}
                href={`${base}/snapshots`}
                active={is(`${base}/snapshots`)}
                tooltip={t("nav.snapshots")}
              >
                {t("nav.snapshots")}
                <Sidebar.MenuBadge>{snapshots.data?.length ?? 0}</Sidebar.MenuBadge>
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={ClockCounterClockwise}
                href={`${base}/activity`}
                active={is(`${base}/activity`)}
                tooltip={t("nav.activity")}
              >
                {t("nav.activity")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={HandPalm}
                href={`${base}/approvals`}
                active={is(`${base}/approvals`)}
                tooltip={t("nav.approvals")}
              >
                {t("nav.approvals")}
                {pendingApprovals > 0 && <Sidebar.MenuBadge>{pendingApprovals}</Sidebar.MenuBadge>}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.automation")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <Sidebar.Collapsible defaultOpen>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton icon={Robot} tooltip={t("nav.agents")}>
                        {t("nav.agents")}
                        <Sidebar.MenuChevron />
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton href="/agents">
                        {t("nav.agentKeys")}
                      </Sidebar.MenuSubButton>
                      <Sidebar.MenuSubButton href="/agents/skills">
                        {t("nav.agentSkills")}
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>
              </Sidebar.MenuItem>
              <Sidebar.MenuButton
                icon={CalendarDots}
                href={`${base}/schedules`}
                active={is(`${base}/schedules`)}
                tooltip={t("nav.schedules")}
              >
                {t("nav.schedules")}
                {scheduleAttention > 0 && (
                  <Sidebar.MenuBadge>{scheduleAttention}</Sidebar.MenuBadge>
                )}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.settings")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={GearSix}
                href={`${base}/settings`}
                active={is(`${base}/settings`)}
                tooltip={t("nav.siteSettings")}
              >
                {t("nav.siteSettings")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={TreeStructure}
                href={`${base}/navigation`}
                active={is(`${base}/navigation`)}
                tooltip={t("nav.navigation")}
              >
                {t("nav.navigation")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Signpost}
                href={`${base}/redirects`}
                active={is(`${base}/redirects`)}
                tooltip={t("nav.redirects")}
              >
                {t("nav.redirects")}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
        </>
      }
      commands={palette.commands}
    >
      <Outlet />
    </AppFrame>
  );
}

import { DropdownMenu, Sidebar, SidebarSwitcher } from "@cloudhal/ui";
import {
  Article,
  CalendarDots,
  Camera,
  ClockCounterClockwise,
  FileText,
  GearSix,
  Globe,
  HandPalm,
  House,
  Robot,
  Signpost,
  SquaresFour,
  Tag,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { AppFrame, type PaletteCommand } from "../components/AppFrame.tsx";
import { SitePublish } from "../components/SitePublish.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
import { usePendingApprovals } from "../components/usePendingApprovals.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

/** Site surface: sidebar scoped to one site, with the site switcher in the header. */
export function SiteShell() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
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
  const base = `/sites/${siteId}`;
  const is = (path: string, exact = false) =>
    exact ? pathname === path : pathname.startsWith(path);

  const createArticle = useMutation({
    mutationFn: () =>
      api.entries.create(siteId, {
        collection: "posts",
        slug: `untitled-${Date.now().toString(36)}`,
        locale: site.data?.defaultLocale ?? "en",
        status: "draft",
        title: t("articles.untitled"),
        body: { format: "markdown", value: "" },
        fields: {},
        tags: [],
      }),
    onSuccess: async (entry) => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate({
        to: "/sites/$siteId/articles/$entryId",
        params: { siteId, entryId: entry.id },
      });
    },
  });
  const snapshot = useMutation({
    mutationFn: (publish: boolean) =>
      api.snapshots.create(siteId, {
        label: publish ? t("snapshots.publishedFromStudio") : t("snapshots.fromStudio"),
        publish,
      }),
    onSuccess: async (_r, publish) => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
      toast.success(publish ? t("snapshots.published") : t("snapshots.created"));
    },
    onError: (e) => toast.error(t("snapshots.failed"), e instanceof Error ? e.message : String(e)),
  });

  const commands: PaletteCommand[] = [
    {
      id: "overview",
      label: t("commands.goOverview"),
      run: () => navigate({ to: "/sites/$siteId", params: { siteId } }),
    },
    {
      id: "pages",
      label: t("nav.pages"),
      run: () => navigate({ to: "/sites/$siteId/pages", params: { siteId } }),
    },
    {
      id: "articles",
      label: t("commands.goArticles"),
      run: () => navigate({ to: "/sites/$siteId/articles", params: { siteId } }),
    },
    {
      id: "taxonomy",
      label: t("commands.goTaxonomy"),
      run: () => navigate({ to: "/sites/$siteId/taxonomy", params: { siteId } }),
    },
    {
      id: "redirects",
      label: t("commands.goRedirects"),
      run: () => navigate({ to: "/sites/$siteId/redirects", params: { siteId } }),
    },
    {
      id: "snapshots",
      label: t("commands.goSnapshots"),
      run: () => navigate({ to: "/sites/$siteId/snapshots", params: { siteId } }),
    },
    {
      id: "activity",
      label: t("commands.goActivity"),
      run: () => navigate({ to: "/sites/$siteId/activity", params: { siteId } }),
    },
    {
      id: "approvals",
      label: t("commands.goApprovals"),
      run: () => navigate({ to: "/sites/$siteId/approvals", params: { siteId } }),
    },
    {
      id: "settings",
      label: t("commands.goSiteSettings"),
      run: () => navigate({ to: "/sites/$siteId/settings", params: { siteId } }),
    },
    { id: "agents", label: t("commands.goAgents"), run: () => navigate({ to: "/agents" }) },
    {
      id: "skills",
      label: t("commands.goSkills"),
      run: () => navigate({ to: "/agents/skills" }),
    },
    { id: "account", label: t("commands.goAccount"), run: () => navigate({ to: "/account" }) },
    { id: "new-article", label: t("commands.newArticle"), run: () => createArticle.mutate() },
    { id: "snapshot", label: t("commands.createSnapshot"), run: () => snapshot.mutate(false) },
    { id: "publish", label: t("commands.publishSite"), run: () => snapshot.mutate(true) },
    { id: "all-sites", label: t("nav.allSites"), run: () => navigate({ to: "/sites" }) },
  ];

  return (
    <AppFrame
      actions={<SitePublish siteId={siteId} />}
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
              <Sidebar.MenuButton icon={CalendarDots} tooltip={t("nav.schedules")} disabled>
                {t("nav.schedules")}
                <Sidebar.MenuBadge>{t("nav.soon")}</Sidebar.MenuBadge>
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
      commands={commands}
    >
      <Outlet />
    </AppFrame>
  );
}

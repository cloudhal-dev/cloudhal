import { DropdownMenu, Sidebar, Text } from "@cloudhal/ui";
import {
  Article,
  Camera,
  CaretUpDown,
  FileText,
  Globe,
  House,
  Robot,
  SquaresFour,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { AppFrame, type PaletteCommand } from "../components/AppFrame.tsx";
import { useToast } from "../components/Toast.ts";
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
      id: "snapshots",
      label: t("commands.goSnapshots"),
      run: () => navigate({ to: "/sites/$siteId/snapshots", params: { siteId } }),
    },
    { id: "new-article", label: t("commands.newArticle"), run: () => createArticle.mutate() },
    { id: "snapshot", label: t("commands.createSnapshot"), run: () => snapshot.mutate(false) },
    { id: "publish", label: t("commands.publishSite"), run: () => snapshot.mutate(true) },
    { id: "all-sites", label: t("nav.allSites"), run: () => navigate({ to: "/sites" }) },
  ];

  return (
    <AppFrame
      title={site.data?.name ?? "…"}
      switcher={
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={<Sidebar.MenuButton icon={Globe} tooltip={t("nav.switchSite")} />}
          >
            <span className="grid min-w-0 text-left">
              <Text variant="secondary" size="xs" as="span">
                {t("nav.sites")}
              </Text>
              <Text bold truncate as="span" data-testid="site-name">
                {site.data?.name ?? "…"}
              </Text>
            </span>
            <CaretUpDown className="ml-auto size-4 shrink-0 text-kumo-subtle" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" className="w-(--anchor-width)">
            {sites.data?.map((s) => (
              <DropdownMenu.Item
                key={s.id}
                icon={Globe}
                selected={s.id === siteId}
                onClick={() => navigate({ to: "/sites/$siteId", params: { siteId: s.id } })}
              >
                {s.name}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
              {t("nav.allSites")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
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
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Article}
                href={`${base}/articles`}
                active={is(`${base}/articles`)}
                tooltip={t("nav.articles")}
              >
                {t("nav.articles")}
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
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.automation")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={Robot} tooltip={t("nav.soon")}>
                {t("nav.agents")}
                <Sidebar.MenuBadge>{t("nav.soon")}</Sidebar.MenuBadge>
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

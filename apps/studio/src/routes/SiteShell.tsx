import { Button, CommandPalette, DropdownMenu, Sidebar, Text } from "@cloudhal/ui";
import {
  Article,
  Camera,
  Command,
  House,
  SignOut,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { useToast } from "../components/Toast.ts";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { authClient } from "../lib/auth.ts";

interface PaletteCommand {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

export function SiteShell() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const base = `/sites/${siteId}`;
  const commands: PaletteCommand[] = [
    {
      id: "overview",
      label: t("commands.goOverview"),
      run: () => navigate({ to: "/sites/$siteId", params: { siteId } }),
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
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const isActive = (path: string, exact = false) =>
    exact ? pathname === path : pathname.startsWith(path);

  return (
    <Sidebar.Provider defaultOpen collapsible="icon" className="min-h-screen">
      <Sidebar>
        <Sidebar.Header>
          <div className="flex items-center gap-2 px-2 py-1">
            <SquaresFour size={20} className="shrink-0 text-kumo-brand" />
            <div className="grid min-w-0">
              <Text variant="secondary" size="xs" as="span">
                {t("app.name")}
              </Text>
              <Text bold truncate as="span" data-testid="site-name">
                {site.data?.name ?? "…"}
              </Text>
            </div>
          </div>
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.site")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={House}
                href={base}
                active={isActive(base, true)}
                tooltip={t("nav.overview")}
              >
                {t("nav.overview")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Article}
                href={`${base}/articles`}
                active={isActive(`${base}/articles`)}
                tooltip={t("nav.articles")}
              >
                {t("nav.articles")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={Camera}
                href={`${base}/snapshots`}
                active={isActive(`${base}/snapshots`)}
                tooltip={t("nav.snapshots")}
              >
                {t("nav.snapshots")}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={Command} onClick={() => setOpen(true)} tooltip="⌘K">
                {t("nav.commands")}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton icon={SquaresFour} href="/sites" tooltip={t("nav.allSites")}>
                {t("nav.allSites")}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer>
          <div className="grid gap-2 px-2 py-1">
            <LanguageSwitch size="xs" />
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<UserCircle />}
                    className="justify-start"
                  />
                }
              >
                <span className="truncate">{me.data?.actor.name ?? t("nav.account")}</span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  icon={SignOut}
                  onClick={async () => {
                    await authClient.signOut();
                    await navigate({ to: "/login" });
                  }}
                >
                  {t("common.signOut")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </Sidebar.Footer>
        <Sidebar.Rail />
      </Sidebar>
      <main className="min-w-0 flex-1 bg-kumo-canvas">
        <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <CommandPalette.Root
        open={open}
        onOpenChange={setOpen}
        items={filtered}
        value={query}
        onValueChange={setQuery}
        itemToStringValue={(c: PaletteCommand) => c.label}
        onSelect={(c: PaletteCommand) => {
          setOpen(false);
          setQuery("");
          void c.run();
        }}
      >
        <CommandPalette.Input placeholder={t("commands.placeholder")} />
        <CommandPalette.List>
          {filtered.map((c) => (
            <CommandPalette.Item key={c.id} value={c}>
              {c.label}
            </CommandPalette.Item>
          ))}
          <CommandPalette.Empty>{t("commands.empty")}</CommandPalette.Empty>
        </CommandPalette.List>
      </CommandPalette.Root>
    </Sidebar.Provider>
  );
}
